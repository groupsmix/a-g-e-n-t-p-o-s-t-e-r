-- Email list builder: subscribers + campaigns
CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT DEFAULT 'manual',
  subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  product_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TEXT,
  open_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
