-- A/B Testing for product listings
CREATE TABLE IF NOT EXISTS ab_tests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  product_id TEXT NOT NULL,
  variant_a_title TEXT NOT NULL,
  variant_a_description TEXT NOT NULL,
  variant_b_title TEXT NOT NULL,
  variant_b_description TEXT NOT NULL,
  variant_a_views INTEGER NOT NULL DEFAULT 0,
  variant_b_views INTEGER NOT NULL DEFAULT 0,
  variant_a_conversions INTEGER NOT NULL DEFAULT 0,
  variant_b_conversions INTEGER NOT NULL DEFAULT 0,
  winner TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_product ON ab_tests(product_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);
