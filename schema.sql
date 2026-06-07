-- D1 schema for the URL shortener.
-- Run with: npm run db:init  (local)  or  npm run db:init:remote  (production)
-- All statements are idempotent and safe to re-run.

-- Stores every shortened link.
CREATE TABLE IF NOT EXISTS links (
  code        TEXT PRIMARY KEY,           -- short code, e.g. "ab3Xz"
  url         TEXT NOT NULL,              -- destination URL
  created_at  INTEGER NOT NULL,          -- unix epoch (ms)
  clicks      INTEGER NOT NULL DEFAULT 0, -- denormalised running total for fast reads
  active      INTEGER NOT NULL DEFAULT 1, -- 0 = disabled (abuse takedown)
  creator_ip  TEXT                        -- hashed/raw IP of creator, for abuse tracing
);

-- One row per click, used for time-series / referrer / country analytics.
CREATE TABLE IF NOT EXISTS clicks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  ts          INTEGER NOT NULL,          -- unix epoch (ms)
  referrer    TEXT,
  country     TEXT,
  FOREIGN KEY (code) REFERENCES links(code) ON DELETE CASCADE
);

-- Abuse reports submitted by visitors.
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  reason      TEXT,
  ts          INTEGER NOT NULL,
  reporter_ip TEXT
);

-- Fixed-window rate-limit counters (one row per ip+window bucket).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT PRIMARY KEY,         -- e.g. "create:1.2.3.4:480123"
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL          -- unix epoch (ms) of window start
);

CREATE INDEX IF NOT EXISTS idx_clicks_code ON clicks (code);
CREATE INDEX IF NOT EXISTS idx_clicks_code_ts ON clicks (code, ts);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links (created_at);
CREATE INDEX IF NOT EXISTS idx_reports_code ON reports (code);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- Migration helpers (for databases created before the abuse-prevention update).
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; run these manually once if your
-- links table predates the `active` / `creator_ip` columns and they error with
-- "duplicate column name" you can safely ignore that:
--   ALTER TABLE links ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
--   ALTER TABLE links ADD COLUMN creator_ip TEXT;
-- ---------------------------------------------------------------------------
