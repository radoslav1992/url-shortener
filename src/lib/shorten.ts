// Helpers for generating short codes and validating/normalising URLs.

// Unambiguous alphabet (no 0/O/1/l/I) to keep codes easy to read aloud.
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

/** Generate a random short code of the given length. */
export function generateCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

// Reserved paths that must never be used as a short code.
const RESERVED = new Set([
  'api',
  'stats',
  'about',
  'privacy',
  'terms',
  'report',
  'admin',
  'favicon.svg',
  'robots.txt',
  'sitemap.xml',
  '_astro',
]);

/** A custom alias is only allowed if it matches this and isn't reserved. */
const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code) && !RESERVED.has(code.toLowerCase());
}

export function isReserved(code: string): boolean {
  return RESERVED.has(code.toLowerCase());
}

/**
 * Validate and normalise a destination URL.
 * Returns the normalised URL string, or null if it is not an acceptable
 * public http(s) URL.
 */
export function normalizeUrl(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;

  // Allow users to paste "example.com" without a scheme.
  if (!/^https?:\/\//i.test(raw)) {
    raw = 'https://' + raw;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  // Must have a dotted hostname (reject "localhost", IP-less hosts, etc.).
  const host = parsed.hostname;
  if (!host || (!host.includes('.') && host !== 'localhost')) {
    return null;
  }

  // Block obvious internal / loopback targets to avoid SSRF-style abuse.
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null;
  }

  if (raw.length > 2048) return null;

  return parsed.toString();
}

// Known URL-shortener / redirector hosts. Blocking these prevents "chaining"
// (shortening a short link) which is a common way to launder malicious URLs
// past scanners and hide the real destination.
const SHORTENER_HOSTS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'rebrand.ly',
  'cutt.ly',
  'shorturl.at',
  't.ly',
  'rb.gy',
  'tiny.cc',
  'bl.ink',
  'lnkd.in',
  'shorte.st',
  'adf.ly',
  'tinyurl.app',
  'short.io',
  'snip.ly',
]);

/**
 * Screen an already-normalised destination URL for abuse vectors that don't
 * require a network call: chaining through other shorteners, and pointing back
 * at our own domain (redirect loops). Returns an error string, or null if OK.
 */
export function screenDestination(normalizedUrl: string, selfHost?: string | null): string | null {
  let host: string;
  try {
    host = new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'Invalid destination URL.';
  }

  if (selfHost) {
    const self = selfHost.toLowerCase().replace(/^www\./, '');
    if (host === self) {
      return 'You can’t shorten a link that points back to this site.';
    }
  }

  if (SHORTENER_HOSTS.has(host)) {
    return 'Links to other URL shorteners aren’t allowed. Use the original URL.';
  }

  return null;
}
