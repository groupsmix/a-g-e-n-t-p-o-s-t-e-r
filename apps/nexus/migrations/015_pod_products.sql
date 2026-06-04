CREATE TABLE IF NOT EXISTS pod_products (
  id TEXT PRIMARY KEY,
  printify_product_id TEXT,
  shop_id TEXT,
  blueprint_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  niche TEXT,
  product_type TEXT NOT NULL,
  design_prompt TEXT,
  design_url TEXT,
  status TEXT DEFAULT 'draft',
  printify_url TEXT,
  price_cents INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pod_products_status ON pod_products(status);
CREATE INDEX IF NOT EXISTS idx_pod_products_niche ON pod_products(niche);
