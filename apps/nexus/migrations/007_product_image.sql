-- ============================================================
-- Migration 007: Product image + generation provenance
-- ============================================================
-- `image_url` stores the real AI-generated hero image (served from R2).
-- `generated_offline` records whether ANY workflow step fell back to the
-- deterministic offline generator (1) vs. used a real AI provider (0), so the
-- UI can clearly label draft vs. real content.

ALTER TABLE products ADD COLUMN image_url TEXT;
ALTER TABLE products ADD COLUMN generated_offline INTEGER DEFAULT 0;
