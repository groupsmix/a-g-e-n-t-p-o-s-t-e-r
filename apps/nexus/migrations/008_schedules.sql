-- Scheduler: recurring AI tasks (e.g. "every day write a blog post for site A")
-- and the deliveries they produce (an inbox you can read/download).

CREATE TABLE IF NOT EXISTS schedules (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  task_type     TEXT NOT NULL DEFAULT 'blog',   -- 'blog' | 'product'
  domain_slug   TEXT,
  category_slug TEXT,
  topic         TEXT,                            -- site/niche/topic, e.g. "site A"
  instructions  TEXT,                            -- style + project context
  frequency     TEXT NOT NULL DEFAULT 'daily',   -- 'daily' | 'weekly'
  active        INTEGER NOT NULL DEFAULT 1,
  last_run_at   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deliveries (
  id             TEXT PRIMARY KEY,
  schedule_id    TEXT,
  title          TEXT,
  body           TEXT,                           -- generated content (markdown)
  kind           TEXT NOT NULL DEFAULT 'blog',   -- 'blog' | 'product'
  product_id     TEXT,
  webhook_status TEXT,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(active);
CREATE INDEX IF NOT EXISTS idx_deliveries_created ON deliveries(created_at);
