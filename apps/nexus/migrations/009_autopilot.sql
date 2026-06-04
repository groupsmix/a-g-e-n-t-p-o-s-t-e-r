-- Autopilot "money engine": the CEO loops research → build → (list) on its
-- own when turned ON. This log records every autonomous action so the
-- dashboard can show the pipeline + what's been built.

CREATE TABLE IF NOT EXISTS autopilot_log (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,            -- 'research' | 'build' | 'publish' | 'skip' | 'error'
  product_id  TEXT,
  niche       TEXT,
  domain_slug TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autopilot_created ON autopilot_log(created_at);
