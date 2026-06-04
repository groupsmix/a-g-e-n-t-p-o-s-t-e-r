-- ============================================================
-- NEXUS Database Migration 018: User Preferences
-- Stores sidebar order, theme, layout, and other per-user prefs.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  key         TEXT UNIQUE NOT NULL,
  value       TEXT NOT NULL DEFAULT '',
  updated_at  TEXT DEFAULT (datetime('now'))
);
