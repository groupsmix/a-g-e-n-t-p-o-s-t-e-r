-- 034_leads_status.sql — TASK-801.
--
-- Add operator-action columns to the leads table (created in 027) so the
-- UI can mark a lead as dismissed / engaged / converted. Leaving the
-- defaults NULL preserves existing rows.

ALTER TABLE leads ADD COLUMN status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE leads ADD COLUMN engaged_at TEXT;
ALTER TABLE leads ADD COLUMN dismissed_at TEXT;
ALTER TABLE leads ADD COLUMN operator_note TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_status
  ON leads (status, score_total DESC);
