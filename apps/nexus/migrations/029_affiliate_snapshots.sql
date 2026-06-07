-- 029_affiliate_snapshots.sql — TASK-802.
--
-- product_snapshots holds the daily metric history the affiliate
-- monitor diffs to detect price-drops, back-in-stock and rating jumps.
-- Dedupe by (product_id, captured_at).

CREATE TABLE IF NOT EXISTS product_snapshots (
  product_id   TEXT NOT NULL,
  captured_at  TEXT NOT NULL,
  price        REAL NOT NULL,
  currency     TEXT NOT NULL,
  in_stock     INTEGER NOT NULL,
  rating       REAL,
  review_count INTEGER,
  extra        TEXT,
  PRIMARY KEY (product_id, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_product_snapshots_recent
  ON product_snapshots (product_id, captured_at DESC);
