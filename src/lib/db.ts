// Data-access helpers around the Cloudflare D1 database.
import type { D1Database } from '@cloudflare/workers-types';
import { generateCode } from './shorten';

export interface LinkRow {
  code: string;
  url: string;
  created_at: number;
  clicks: number;
}

export interface ClickRow {
  ts: number;
  referrer: string | null;
  country: string | null;
}

/** Look up a single link by its code. */
export async function getLink(db: D1Database, code: string): Promise<LinkRow | null> {
  const row = await db
    .prepare('SELECT code, url, created_at, clicks FROM links WHERE code = ?')
    .bind(code)
    .first<LinkRow>();
  return row ?? null;
}

/**
 * Insert a new link. If `code` is provided it is used as a custom alias
 * (fails if taken); otherwise a unique random code is generated.
 */
export async function createLink(
  db: D1Database,
  url: string,
  code?: string,
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const createdAt = Date.now();

  if (code) {
    const existing = await getLink(db, code);
    if (existing) {
      return { ok: false, error: 'That custom alias is already taken.' };
    }
    await db
      .prepare('INSERT INTO links (code, url, created_at, clicks) VALUES (?, ?, ?, 0)')
      .bind(code, url, createdAt)
      .run();
    return { ok: true, code };
  }

  // Retry on the (extremely unlikely) random-collision case.
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateCode(6 + Math.floor(attempt / 2));
    try {
      await db
        .prepare('INSERT INTO links (code, url, created_at, clicks) VALUES (?, ?, ?, 0)')
        .bind(candidate, url, createdAt)
        .run();
      return { ok: true, code: candidate };
    } catch (err) {
      // UNIQUE constraint violation -> try again with a new code.
      if (String(err).includes('UNIQUE')) continue;
      throw err;
    }
  }
  return { ok: false, error: 'Could not generate a unique code, please retry.' };
}

/**
 * Record a click: increments the denormalised counter and appends a row to
 * the clicks table for analytics. Runs as a batch so both succeed together.
 */
export async function recordClick(
  db: D1Database,
  code: string,
  meta: { referrer?: string | null; country?: string | null },
): Promise<void> {
  const ts = Date.now();
  await db.batch([
    db.prepare('UPDATE links SET clicks = clicks + 1 WHERE code = ?').bind(code),
    db
      .prepare('INSERT INTO clicks (code, ts, referrer, country) VALUES (?, ?, ?, ?)')
      .bind(code, ts, meta.referrer ?? null, meta.country ?? null),
  ]);
}

export interface LinkStats {
  link: LinkRow;
  total: number;
  last7Days: { date: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  topCountries: { country: string; count: number }[];
}

/** Aggregate analytics for the stats page / API. */
export async function getStats(db: D1Database, code: string): Promise<LinkStats | null> {
  const link = await getLink(db, code);
  if (!link) return null;

  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const [daily, referrers, countries] = await Promise.all([
    db
      .prepare(
        `SELECT date(ts / 1000, 'unixepoch') AS date, COUNT(*) AS count
         FROM clicks WHERE code = ? AND ts >= ?
         GROUP BY date ORDER BY date ASC`,
      )
      .bind(code, since)
      .all<{ date: string; count: number }>(),
    db
      .prepare(
        `SELECT COALESCE(NULLIF(referrer, ''), 'Direct') AS referrer, COUNT(*) AS count
         FROM clicks WHERE code = ?
         GROUP BY referrer ORDER BY count DESC LIMIT 8`,
      )
      .bind(code)
      .all<{ referrer: string; count: number }>(),
    db
      .prepare(
        `SELECT COALESCE(NULLIF(country, ''), 'Unknown') AS country, COUNT(*) AS count
         FROM clicks WHERE code = ?
         GROUP BY country ORDER BY count DESC LIMIT 8`,
      )
      .bind(code)
      .all<{ country: string; count: number }>(),
  ]);

  return {
    link,
    total: link.clicks,
    last7Days: fillMissingDays(daily.results ?? []),
    topReferrers: referrers.results ?? [],
    topCountries: countries.results ?? [],
  };
}

/** Ensure each of the last 7 days is present, even with zero clicks. */
function fillMissingDays(rows: { date: string; count: number }[]): { date: string; count: number }[] {
  const map = new Map(rows.map((r) => [r.date, r.count]));
  const out: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) ?? 0 });
  }
  return out;
}
