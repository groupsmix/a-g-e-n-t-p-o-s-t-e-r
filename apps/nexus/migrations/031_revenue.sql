-- 031_revenue.sql — TASK-901.
--
-- revenue_events     all normalised earnings from every source. id is
--                    a stable FNV-1a so retries dedupe.
-- revenue_cursors    per-source ISO cursor used by the run loop.
-- gumroad_sales      legacy/compat view name — alias-ish; we keep it
--                    as its own table because TASK-900's
--                    D1ProgressSource already counts revenue from it
--                    (sum amount_usd_cents over window).

CREATE TABLE IF NOT EXISTS revenue_events (
  id                TEXT PRIMARY KEY,
  source            TEXT NOT NULL,
  external_id       TEXT NOT NULL,
  amount_usd_cents  INTEGER NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  product_id        TEXT,
  buyer_email       TEXT,
  description       TEXT,
  occurred_at       TEXT NOT NULL,
  platform          TEXT,
  content_id        TEXT,
  campaign          TEXT,
  referring_url     TEXT,
  raw_json          TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_revenue_occurred
  ON revenue_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_source_window
  ON revenue_events (source, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_platform_window
  ON revenue_events (platform, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_content
  ON revenue_events (content_id);

CREATE TABLE IF NOT EXISTS revenue_cursors (
  source      TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- gumroad_sales — separate physical table so the existing
-- D1ProgressSource (TASK-900) keeps working untouched. Populated by
-- the Gumroad webhook in addition to revenue_events.
CREATE TABLE IF NOT EXISTS gumroad_sales (
  id                TEXT PRIMARY KEY,
  sale_id           TEXT UNIQUE,
  product_id        TEXT,
  amount_usd_cents  INTEGER NOT NULL,
  buyer_email       TEXT,
  referrer          TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gumroad_sales_recent
  ON gumroad_sales (created_at DESC);
