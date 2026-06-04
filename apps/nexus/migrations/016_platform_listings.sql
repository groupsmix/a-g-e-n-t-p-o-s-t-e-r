CREATE TABLE IF NOT EXISTS platform_listings (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_url TEXT,
  status TEXT DEFAULT 'pending',
  listed_at TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_platform_listings_product ON platform_listings(product_id);
CREATE INDEX IF NOT EXISTS idx_platform_listings_platform ON platform_listings(platform);
