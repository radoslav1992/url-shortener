import type { APIRoute } from 'astro';
import { reportLink, checkRateLimit } from '../../lib/db';

export const prerender = false;

// Limit reports per IP so the reporting system can't itself be abused.
const REPORT_LIMIT = 10;
const REPORT_WINDOW_MS = 60 * 60 * 1000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const db = locals.runtime?.env?.DB;
  if (!db) return json({ error: 'Database is not configured.' }, 500);

  const ip =
    request.headers.get('cf-connecting-ip') ||
    (typeof clientAddress === 'string' ? clientAddress : null) ||
    'unknown';

  let body: { code?: string; reason?: string };
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = { code: String(form.get('code') ?? ''), reason: String(form.get('reason') ?? '') };
    }
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const code = (body.code ?? '').trim();
  if (!code) return json({ error: 'Missing link code.' }, 400);

  const rl = await checkRateLimit(db, `report:${ip}`, REPORT_LIMIT, REPORT_WINDOW_MS);
  if (!rl.allowed) {
    return json({ error: 'Too many reports. Please try again later.' }, 429);
  }

  const result = await reportLink(db, code, body.reason ?? null, ip);
  if (!result.ok) {
    return json({ error: result.error }, 404);
  }

  return json({ ok: true, disabled: result.disabled });
};
