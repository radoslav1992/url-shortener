import type { APIRoute } from 'astro';
import { createLink } from '../../lib/db';
import { normalizeUrl, isValidCode, isReserved } from '../../lib/shorten';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.runtime?.env?.DB;
  if (!db) return json({ error: 'Database is not configured.' }, 500);

  let body: { url?: string; alias?: string };
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = {
        url: String(form.get('url') ?? ''),
        alias: String(form.get('alias') ?? ''),
      };
    }
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const url = normalizeUrl(body.url ?? '');
  if (!url) {
    return json({ error: 'Please enter a valid http(s) URL.' }, 400);
  }

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

  const result = await createLink(db, url, alias || undefined);
  if (!result.ok) {
    return json({ error: result.error }, 409);
  }

  const origin =
    locals.runtime?.env?.PUBLIC_SITE_URL || new URL(request.url).origin;
  const shortUrl = new URL('/' + result.code, origin).toString();

  return json({ code: result.code, shortUrl, url });
};
