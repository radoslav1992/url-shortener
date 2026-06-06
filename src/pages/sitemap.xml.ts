import type { APIRoute } from 'astro';

export const prerender = false;

// Only the public marketing/utility pages belong in the sitemap —
// short links and stats results are intentionally excluded.
const ROUTES = ['', 'stats', 'about', 'privacy', 'terms'];

export const GET: APIRoute = ({ locals, url }) => {
  const base =
    locals.runtime?.env?.PUBLIC_SITE_URL || import.meta.env.PUBLIC_SITE_URL || url.origin;
  const origin = base.replace(/\/$/, '');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.map(
  (r) => `  <url>\n    <loc>${origin}/${r}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`,
).join('\n')}
</urlset>`;

  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
