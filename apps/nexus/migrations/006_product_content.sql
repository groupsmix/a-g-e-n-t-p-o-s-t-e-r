-- ============================================================
-- Migration 006: Product content columns for the CEO review screen
-- ============================================================
-- The Review UI needs a canonical `description` / `tags` / `price` /
-- `currency` that lives on the product itself (not on a specific platform
-- variant), so inline edits in the review screen can update the "master"
-- content and then be propagated to variants. Added idempotently.

ALTER TABLE products ADD COLUMN description TEXT;
ALTER TABLE products ADD COLUMN tags TEXT;             -- CSV, e.g. "a,b,c"
ALTER TABLE products ADD COLUMN price REAL;
ALTER TABLE products ADD COLUMN currency TEXT DEFAULT 'USD';
