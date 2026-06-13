-- ============================================================
-- NEXUS Migration 041: Notes
-- Personal notepad — ideas and context the AI can reference.
-- ============================================================

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  title      TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  tags       TEXT DEFAULT '',
  pinned     INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned, updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
