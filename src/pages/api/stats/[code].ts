import type { APIRoute } from 'astro';
import { getStats } from '../../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const db = locals.runtime?.env?.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database is not configured.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const code = params.code ?? '';
  try {
    const stats = await getStats(db, code);
    if (!stats) {
      return new Response(JSON.stringify({ error: 'No link found for that code.' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    console.error('stats failed:', err);
    return new Response(JSON.stringify({ error: 'Server error loading statistics.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
