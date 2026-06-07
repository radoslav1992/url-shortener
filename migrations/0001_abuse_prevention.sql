-- Migration 0001: abuse prevention.
-- Run ONCE on a database that was created before the abuse-prevention update
-- (i.e. an existing `links` table without the `active` / `creator_ip` columns).
--
--   npm run db:migrate:remote     (production)
--   npm run db:migrate            (local)
--
-- New tables/indexes are idempotent. The two ALTER statements add columns to
-- the existing `links` table; SQLite has no "ADD COLUMN IF NOT EXISTS", so if
-- they fail with "duplicate column name" your database is already migrated and
-- you can safely ignore that error (run the two ALTERs individually if needed).

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  reason      TEXT,
  ts          INTEGER NOT NULL,
  reporter_ip TEXT
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_code ON reports (code);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

ALTER TABLE links ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE links ADD COLUMN creator_ip TEXT;
