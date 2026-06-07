// Data-access helpers around the Cloudflare D1 database.
import type { D1Database } from '@cloudflare/workers-types';
import { generateCode } from './shorten';

export interface LinkRow {
  code: string;
  url: string;
  created_at: number;
  clicks: number;
  active: number;
  creator_ip: string | null;
}

export interface ClickRow {
  ts: number;
  referrer: string | null;
  country: string | null;
}

/** Look up a single link by its code. */
export async function getLink(db: D1Database, code: string): Promise<LinkRow | null> {
  const row = await db
    .prepare('SELECT code, url, created_at, clicks, active, creator_ip FROM links WHERE code = ?')
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
  creatorIp?: string | null,
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const createdAt = Date.now();
  const ip = creatorIp ?? null;
  const insert =
    'INSERT INTO links (code, url, created_at, clicks, active, creator_ip) VALUES (?, ?, ?, 0, 1, ?)';

  if (code) {
    const existing = await getLink(db, code);
    if (existing) {
      return { ok: false, error: 'That custom alias is already taken.' };
    }
    await db.prepare(insert).bind(code, url, createdAt, ip).run();
    return { ok: true, code };
  }

  // Retry on the (extremely unlikely) random-collision case.
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateCode(6 + Math.floor(attempt / 2));
    try {
      await db.prepare(insert).bind(candidate, url, createdAt, ip).run();
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
 * Fixed-window rate limiter backed by D1. Returns whether the action is
 * allowed and how many remain in the current window.
 */
export async function checkRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const bucket = `${key}:${windowStart}`;

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (bucket, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(bucket, windowStart)
    .first<{ count: number }>();

  const count = row?.count ?? 1;

  // Opportunistic cleanup of stale windows (cheap, keeps the table small).
  if (count === 1) {
    await db
      .prepare('DELETE FROM rate_limits WHERE window_start < ?')
      .bind(now - windowMs * 2)
      .run();
  }

  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

/** Number of times this many reports auto-disables a link. */
const AUTO_DISABLE_THRESHOLD = 5;

/**
 * Record an abuse report. Auto-disables the link once it crosses the report
 * threshold so malicious links are killed quickly without manual review.
 */
export async function reportLink(
  db: D1Database,
  code: string,
  reason: string | null,
  reporterIp: string | null,
): Promise<{ ok: true; disabled: boolean } | { ok: false; error: string }> {
  const link = await getLink(db, code);
  if (!link) return { ok: false, error: 'No link found for that code.' };

  await db
    .prepare('INSERT INTO reports (code, reason, ts, reporter_ip) VALUES (?, ?, ?, ?)')
    .bind(code, reason?.slice(0, 500) ?? null, Date.now(), reporterIp)
    .run();

  const countRow = await db
    .prepare('SELECT COUNT(*) AS n FROM reports WHERE code = ?')
    .bind(code)
    .first<{ n: number }>();

  let disabled = false;
  if ((countRow?.n ?? 0) >= AUTO_DISABLE_THRESHOLD && link.active === 1) {
    await setLinkActive(db, code, false);
    disabled = true;
  }
  return { ok: true, disabled };
}

/** Enable or disable (takedown) a link. */
export async function setLinkActive(
  db: D1Database,
  code: string,
  active: boolean,
): Promise<void> {
  await db
    .prepare('UPDATE links SET active = ? WHERE code = ?')
    .bind(active ? 1 : 0, code)
    .run();
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
