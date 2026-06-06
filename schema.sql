-- D1 schema for the URL shortener.
-- Run with: npm run db:init  (local)  or  npm run db:init:remote  (production)

-- Stores every shortened link.
CREATE TABLE IF NOT EXISTS links (
  code        TEXT PRIMARY KEY,           -- short code, e.g. "ab3Xz"
  url         TEXT NOT NULL,              -- destination URL
  created_at  INTEGER NOT NULL,          -- unix epoch (ms)
  clicks      INTEGER NOT NULL DEFAULT 0  -- denormalised running total for fast reads
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

CREATE INDEX IF NOT EXISTS idx_clicks_code ON clicks (code);
CREATE INDEX IF NOT EXISTS idx_clicks_code_ts ON clicks (code, ts);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links (created_at);
