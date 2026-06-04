-- ============================================================
-- NEXUS Migration 014: Winner Learning Loop
-- Adds sales tracking table and extends winner_patterns for
-- revenue-driven pattern extraction.
-- ============================================================

-- Sales synced from Gumroad (or other platforms in the future).
CREATE TABLE IF NOT EXISTS sales (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  external_id     TEXT,
  source          TEXT NOT NULL DEFAULT 'gumroad',
  product_name    TEXT,
  product_id      TEXT,
  quantity        INTEGER DEFAULT 1,
  revenue_cents   INTEGER DEFAULT 0,
  currency        TEXT DEFAULT 'USD',
  sale_date       TEXT,
  synced_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_source ON sales(source);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_external ON sales(external_id);

-- Extend winner_patterns with revenue-driven fields.
-- These columns already exist on the production D1 database (added in an
-- earlier out-of-band deploy), so re-applying the ALTER statements fails
-- with "duplicate column name". SQLite has no ADD COLUMN IF NOT EXISTS, so
-- the column additions are kept here only as documentation.
--
-- Original statements (now commented):
--   ALTER TABLE winner_patterns ADD COLUMN times_seen INTEGER DEFAULT 0;
--   ALTER TABLE winner_patterns ADD COLUMN times_sold INTEGER DEFAULT 0;
--   ALTER TABLE winner_patterns ADD COLUMN total_revenue REAL DEFAULT 0;
--   ALTER TABLE winner_patterns ADD COLUMN confidence_score REAL DEFAULT 0;
--   ALTER TABLE winner_patterns ADD COLUMN last_seen_at TEXT;
--   ALTER TABLE winner_patterns ADD COLUMN source TEXT DEFAULT 'approval';

-- Learning loop sync metadata (when we last synced, etc.)
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('learning_loop_enabled', 'true', 'Enable the winner learning loop'),
  ('learning_last_sync_at', '', 'Last time sales were synced from Gumroad'),
  ('learning_last_analysis_at', '', 'Last time pattern extraction ran');
