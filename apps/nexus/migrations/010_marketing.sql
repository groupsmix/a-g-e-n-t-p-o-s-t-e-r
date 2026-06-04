-- Marketing team: an autonomous promotion crew that runs on the cron. For
-- each live product it writes channel-specific promo copy and posts it
-- through the connected channel (Ayrshare or a Zapier/Make webhook), so the
-- money loop becomes build -> list -> promote -> repeat. This log records
-- every promotion so the dashboard can show what was pushed and where.

CREATE TABLE IF NOT EXISTS marketing_log (
  id          TEXT PRIMARY KEY,
  product_id  TEXT,
  channel     TEXT,                     -- channel slug, or 'system' for cycle notes
  content     TEXT,                     -- the promo copy that was generated
  status      TEXT NOT NULL,            -- 'posted' | 'generated' | 'skipped' | 'failed'
  note        TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_created ON marketing_log(created_at);
CREATE INDEX IF NOT EXISTS idx_marketing_product ON marketing_log(product_id);
