-- ============================================================
-- NEXUS Database Migration 018: Blog Posts (SEO Blog Engine)
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_posts (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  title            TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,
  content          TEXT NOT NULL DEFAULT '',
  meta_description TEXT,
  keywords         TEXT,
  product_id       TEXT REFERENCES products(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'draft',
  published_at     TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_product ON blog_posts(product_id);
