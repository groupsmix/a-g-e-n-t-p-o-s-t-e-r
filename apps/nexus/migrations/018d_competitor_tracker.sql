-- Competitor Tracker tables
CREATE TABLE IF NOT EXISTS tracked_competitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  niche TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS competitor_products (
  id TEXT PRIMARY KEY,
  competitor_id TEXT NOT NULL REFERENCES tracked_competitors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  price TEXT,
  description TEXT,
  url TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_competitor_products_competitor ON competitor_products(competitor_id);
