-- 035_leads_enrichment.sql — lead CRM enrichment fields.
--
-- Extend the intent-mining `leads` table with nullable contact / enrichment
-- columns so the same record can move from "interesting post" to
-- "actionable outreach target" without breaking the current scanner flow.

ALTER TABLE leads ADD COLUMN contact_email TEXT;
ALTER TABLE leads ADD COLUMN contact_name TEXT;
ALTER TABLE leads ADD COLUMN company_name TEXT;
ALTER TABLE leads ADD COLUMN company_domain TEXT;
ALTER TABLE leads ADD COLUMN source_type TEXT NOT NULL DEFAULT 'intent_post';
ALTER TABLE leads ADD COLUMN last_contacted_at TEXT;
ALTER TABLE leads ADD COLUMN contact_status TEXT NOT NULL DEFAULT 'unresearched';
ALTER TABLE leads ADD COLUMN enrichment_json TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_contact_status
  ON leads (contact_status, status, score_total DESC);

CREATE INDEX IF NOT EXISTS idx_leads_company_domain
  ON leads (company_domain);

CREATE INDEX IF NOT EXISTS idx_leads_contact_email
  ON leads (contact_email);
