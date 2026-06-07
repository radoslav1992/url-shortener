import type { APIRoute } from 'astro';
import { createLink, checkRateLimit } from '../../lib/db';
import { normalizeUrl, isValidCode, isReserved, screenDestination } from '../../lib/shorten';
import { verifyTurnstile } from '../../lib/turnstile';
import { checkUrlSafety } from '../../lib/safebrowsing';

export const prerender = false;

// Max short links a single IP may create per hour.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env = locals.runtime?.env;
  const db = env?.DB;
  if (!db) return json({ error: 'Database is not configured.' }, 500);

  const ip =
    request.headers.get('cf-connecting-ip') ||
    (typeof clientAddress === 'string' ? clientAddress : null) ||
    'unknown';

  let body: { url?: string; alias?: string; turnstileToken?: string };
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = {
        url: String(form.get('url') ?? ''),
        alias: String(form.get('alias') ?? ''),
        turnstileToken: String(form.get('cf-turnstile-response') ?? ''),
      };
    }
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  // 1. Bot protection — verify Turnstile (skipped if no secret configured).
  const turnstile = await verifyTurnstile(body.turnstileToken, env?.TURNSTILE_SECRET_KEY, ip);
  if (!turnstile.success) {
    return json({ error: 'Bot check failed. Please refresh and try again.' }, 403);
  }

  // 2. Rate limit per IP.
  const rl = await checkRateLimit(db, `create:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return json(
      { error: 'You’re creating links too quickly. Please try again later.' },
      429,
    );
  }

  // 3. Validate + normalise the URL.
  const url = normalizeUrl(body.url ?? '');
  if (!url) {
    return json({ error: 'Please enter a valid http(s) URL.' }, 400);
  }

  // 4. Screen for chaining / self-loops (no network needed).
  const selfHost = (() => {
    try {
      return new URL(env?.PUBLIC_SITE_URL || request.url).hostname;
    } catch {
      return null;
    }
  })();
  const screenError = screenDestination(url, selfHost);
  if (screenError) {
    return json({ error: screenError }, 400);
  }

  // 5. Malware / phishing scan via Google Safe Browsing (skipped if no key).
  const safety = await checkUrlSafety(url, env?.SAFE_BROWSING_API_KEY);
  if (!safety.safe) {
    return json(
      { error: 'This URL was flagged as unsafe and can’t be shortened.' },
      422,
    );
  }

  // 6. Validate custom alias.
  let alias = (body.alias ?? '').trim();
  if (alias) {
    if (isReserved(alias)) {
      return json({ error: 'That alias is reserved, please pick another.' }, 400);
    }
    if (!isValidCode(alias)) {
      return json(
        { error: 'Alias must be 3–32 letters, numbers, hyphens or underscores.' },
        400,
      );
    }
  }

  // 7. Create.
  const result = await createLink(db, url, alias || undefined, ip);
  if (!result.ok) {
    return json({ error: result.error }, 409);
  }

  const origin = env?.PUBLIC_SITE_URL || new URL(request.url).origin;
  const shortUrl = new URL('/' + result.code, origin).toString();

  return json({ code: result.code, shortUrl, url });
};
