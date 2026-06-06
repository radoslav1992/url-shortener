import type { APIRoute } from 'astro';
import { getLink, recordClick } from '../lib/db';
import { isReserved } from '../lib/shorten';

export const prerender = false;

// Root-level redirect handler: GET /:code -> 302 to the destination URL.
export const GET: APIRoute = async ({ params, request, locals }) => {
  const code = params.code ?? '';

  // Reserved paths are served by their own routes; never treat as a code.
  if (!code || isReserved(code)) {
    return new Response('Not found', { status: 404 });
  }

  const db = locals.runtime?.env?.DB;
  if (!db) return new Response('Database is not configured.', { status: 500 });

  const link = await getLink(db, code);
  if (!link) {
    // Send unknown codes to a friendly 404 page.
    return Response.redirect(new URL('/404', request.url).toString(), 302);
  }

  // Fire-and-forget analytics so the redirect stays fast.
  const referrer = request.headers.get('referer');
  const country =
    locals.runtime?.cf?.country ?? request.headers.get('cf-ipcountry') ?? null;

  const record = recordClick(db, code, {
    referrer: referrer ? safeHost(referrer) : null,
    country: typeof country === 'string' ? country : null,
  });

  if (locals.runtime?.ctx?.waitUntil) {
    locals.runtime.ctx.waitUntil(record);
  } else {
    await record;
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: link.url,
      // Don't let browsers/CDNs cache the redirect so click counts stay accurate.
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
};

/** Reduce a full referrer URL to its hostname for cleaner aggregation. */
function safeHost(referrer: string): string {
  try {
    return new URL(referrer).hostname || referrer;
  } catch {
    return referrer.slice(0, 255);
  }
}
