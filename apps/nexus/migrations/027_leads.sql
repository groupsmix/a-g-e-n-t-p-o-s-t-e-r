-- 027_leads.sql — TASK-800.
--
-- CRM-lite table the lead scraper persists scored leads into.
-- Fingerprint is the primary key so re-runs dedupe naturally.

CREATE TABLE IF NOT EXISTS leads (
  fingerprint       TEXT PRIMARY KEY,
  source            TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  author            TEXT NOT NULL,
  author_bio        TEXT,
  text              TEXT NOT NULL,
  url               TEXT NOT NULL,
  posted_at         TEXT NOT NULL,
  matched_terms     TEXT NOT NULL,
  extra             TEXT,
  score_total       INTEGER NOT NULL,
  score_intent      TEXT NOT NULL,
  score_components  TEXT NOT NULL,
  suggested_reply   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_intent_score
  ON leads (score_intent, score_total DESC);

CREATE INDEX IF NOT EXISTS idx_leads_source
  ON leads (source, posted_at DESC);
