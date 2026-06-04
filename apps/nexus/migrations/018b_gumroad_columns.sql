-- ============================================================
-- NEXUS Database Migration 018: Gumroad Integration Columns
-- ============================================================
-- Adds gumroad_product_id and gumroad_url to products table
-- so we can track which products have been published to Gumroad.

ALTER TABLE products ADD COLUMN gumroad_product_id TEXT;
ALTER TABLE products ADD COLUMN gumroad_url TEXT;

CREATE INDEX IF NOT EXISTS idx_products_gumroad ON products(gumroad_product_id);
