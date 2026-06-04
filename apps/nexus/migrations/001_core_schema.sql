-- ============================================================
-- NEXUS Database Migration 001: Core Schema
-- ============================================================

CREATE TABLE IF NOT EXISTS domains (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  icon        TEXT,
  color       TEXT DEFAULT '#6366f1',
  sort_order  INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  domain_id   TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_categories_domain ON categories(domain_id);

CREATE TABLE IF NOT EXISTS platforms (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  url               TEXT,
  title_max_chars   INTEGER,
  description_max   INTEGER,
  tag_count         INTEGER,
  tag_max_chars     INTEGER,
  audience          TEXT,
  tone              TEXT,
  seo_style         TEXT,
  description_style TEXT,
  cta_style         TEXT,
  forbidden_words   TEXT,
  rules_json        TEXT,
  is_active         INTEGER DEFAULT 1,
  sort_order        INTEGER DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_channels (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name              TEXT NOT NULL,
  slug              TEXT UNIQUE NOT NULL,
  caption_max_chars INTEGER,
  hashtag_count     INTEGER,
  tone              TEXT,
  format            TEXT,
  content_types     TEXT,
  posting_mode      TEXT DEFAULT 'manual',
  is_active         INTEGER DEFAULT 1,
  sort_order        INTEGER DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  domain_id       TEXT NOT NULL REFERENCES domains(id),
  category_id     TEXT NOT NULL REFERENCES categories(id),
  name            TEXT,
  niche           TEXT,
  language        TEXT DEFAULT 'en',
  user_input      TEXT,
  status          TEXT DEFAULT 'draft',
  ai_score        REAL,
  revenue_estimate TEXT,
  winner_patterns  TEXT,
  graveyard_at    TEXT,
  graveyard_reason TEXT,
  resurface_at    TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_domain ON products(domain_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cf_workflow_id  TEXT,
  status          TEXT DEFAULT 'queued',
  current_step    TEXT,
  total_steps     INTEGER DEFAULT 0,
  error           TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_runs_product ON workflow_runs(product_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON workflow_runs(status);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  run_id          TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_name       TEXT NOT NULL,
  step_type       TEXT NOT NULL,
  step_order      INTEGER NOT NULL,
  status          TEXT DEFAULT 'waiting',
  ai_model_used   TEXT,
  ai_models_tried TEXT,
  input_data      TEXT,
  output_data     TEXT,
  tokens_used     INTEGER DEFAULT 0,
  cost_usd        REAL DEFAULT 0,
  started_at      TEXT,
  completed_at    TEXT,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_steps_run ON workflow_steps(run_id);

CREATE TABLE IF NOT EXISTS assets (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  step_id         TEXT,
  asset_type      TEXT NOT NULL,
  r2_key          TEXT,
  cf_image_id     TEXT,
  cdn_url         TEXT,
  filename        TEXT,
  mime_type       TEXT,
  file_size_bytes INTEGER,
  metadata        TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assets_product ON assets(product_id);

CREATE TABLE IF NOT EXISTS platform_variants (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform_id     TEXT NOT NULL REFERENCES platforms(id),
  title           TEXT,
  description     TEXT,
  tags            TEXT,
  price           REAL,
  currency        TEXT DEFAULT 'USD',
  additional_data TEXT,
  status          TEXT DEFAULT 'draft',
  published_at    TEXT,
  published_url   TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_variants_product ON platform_variants(product_id);

CREATE TABLE IF NOT EXISTS social_variants (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  channel_id      TEXT NOT NULL REFERENCES social_channels(id),
  content         TEXT NOT NULL,
  status          TEXT DEFAULT 'draft',
  scheduled_at    TEXT,
  published_at    TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  run_id          TEXT,
  version         INTEGER DEFAULT 1,
  ai_score        REAL,
  section_scores  TEXT,
  decision        TEXT,
  feedback        TEXT,
  revised_sections TEXT,
  reviewed_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

CREATE TABLE IF NOT EXISTS title_variants (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform_id     TEXT,
  variant_a       TEXT,
  variant_b       TEXT,
  variant_c       TEXT,
  selected        TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trend_alerts (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  domain_id       TEXT,
  trend_keyword   TEXT NOT NULL,
  trend_score     REAL,
  demand_window   TEXT,
  source          TEXT,
  suggested_niche TEXT,
  status          TEXT DEFAULT 'new',
  detected_at     TEXT DEFAULT (datetime('now')),
  dismissed_at    TEXT,
  workflow_id     TEXT
);

CREATE INDEX IF NOT EXISTS idx_trends_status ON trend_alerts(status);

CREATE TABLE IF NOT EXISTS winner_patterns (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  domain_id       TEXT,
  category_id     TEXT,
  pattern_type    TEXT NOT NULL,
  pattern_value   TEXT NOT NULL,
  confidence      REAL DEFAULT 0,
  sample_count    INTEGER DEFAULT 1,
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  layer           TEXT NOT NULL,
  target_id       TEXT,
  target_type     TEXT,
  name            TEXT NOT NULL,
  prompt_text     TEXT NOT NULL,
  version         INTEGER DEFAULT 1,
  is_active       INTEGER DEFAULT 1,
  auto_improved   INTEGER DEFAULT 0,
  improvement_log TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prompts_layer ON prompt_templates(layer);

CREATE TABLE IF NOT EXISTS ai_models (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  provider              TEXT NOT NULL,
  api_key_secret_name   TEXT NOT NULL,
  task_types            TEXT NOT NULL,
  rank                  INTEGER NOT NULL,
  status                TEXT DEFAULT 'checking',
  rate_limit_reset_at   TEXT,
  daily_limit_reset_at  TEXT,
  is_free_tier          INTEGER DEFAULT 1,
  max_tokens            INTEGER,
  supports_streaming    INTEGER DEFAULT 0,
  context_window        INTEGER,
  cost_per_1m_tokens    REAL DEFAULT 0,
  notes                 TEXT,
  last_used_at          TEXT,
  total_calls           INTEGER DEFAULT 0,
  total_failures        INTEGER DEFAULT 0,
  updated_at            TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  description     TEXT,
  updated_at      TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('social_posting_mode', 'manual', 'auto or manual'),
  ('default_language', 'en', 'default product language'),
  ('ceo_review_required', 'true', 'require CEO approval before publish'),
  ('auto_publish_after_approval', 'false', 'auto-publish on approval'),
  ('trend_radar_enabled', 'true', 'run daily trend scan'),
  ('trend_radar_hour', '6', 'hour to run trend scan (0-23 UTC)'),
  ('winner_tracking_enabled', 'true', 'track approval patterns'),
  ('graveyard_resurface_days', '30', 'days before resurface check'),
  ('revenue_estimate_enabled', 'true', 'show revenue estimates'),
  ('quality_passes', '3', 'number of auto quality passes'),
  ('title_variants_count', '3', 'A/B title variants to generate');
