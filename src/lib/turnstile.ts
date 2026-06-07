// Cloudflare Turnstile server-side verification.
// Stops automated/bulk creation of short links by bots, which is where the
// overwhelming majority of shortener abuse comes from.
//
// Set up a free widget at https://dash.cloudflare.com → Turnstile, then:
//   - PUBLIC_TURNSTILE_SITE_KEY  (public, rendered in the form)  -> [vars]
//   - TURNSTILE_SECRET_KEY       (secret, used here)             -> wrangler secret
// If no secret is configured, verification is skipped (fail-open) for local dev.

const VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  token: string | undefined | null,
  secret: string | undefined,
  remoteIp?: string | null,
): Promise<{ success: boolean; skipped: boolean }> {
  if (!secret) {
    return { success: true, skipped: true };
  }
  if (!token) {
    return { success: false, skipped: false };
  }

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);

  try {
    const res = await fetch(VERIFY_ENDPOINT, { method: 'POST', body: form });
    const data = (await res.json()) as { success?: boolean };
    return { success: Boolean(data.success), skipped: false };
  } catch {
    // Network error verifying — fail CLOSED for bot protection (reject).
    return { success: false, skipped: false };
  }
}
