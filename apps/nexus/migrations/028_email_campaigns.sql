-- 028_email_campaigns.sql — TASK-801.
--
-- email_sends   one row per (tracking_id) — the canonical 'we shipped
--               this message' record. Resend / Postmark / Webhook
--               provider_id captured for support.
-- email_events  append-only event log: sent / open / click / bounce /
--               reply / unsubscribe. The campaign aggregator joins
--               via tracking_id back to email_sends.campaign_id.

CREATE TABLE IF NOT EXISTS email_sends (
  tracking_id   TEXT PRIMARY KEY,
  campaign_id   TEXT NOT NULL,
  step_id       TEXT NOT NULL,
  recipient     TEXT NOT NULL,
  provider      TEXT NOT NULL,
  provider_id   TEXT,
  ok            INTEGER NOT NULL,
  error         TEXT,
  sent_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_sends_campaign
  ON email_sends (campaign_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS email_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_id   TEXT NOT NULL,
  kind          TEXT NOT NULL,
  at            TEXT NOT NULL,
  meta          TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_events_tracking
  ON email_events (tracking_id, at);
CREATE INDEX IF NOT EXISTS idx_email_events_kind
  ON email_events (kind, at DESC);
