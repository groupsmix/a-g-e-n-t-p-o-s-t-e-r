-- 030_autonome.sql — TASK-900.
--
-- goals          declarative targets the Autonome loop steers towards.
-- autonome_runs  append-only log of hourly ticks for the dashboard.

CREATE TABLE IF NOT EXISTS goals (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  metric    TEXT NOT NULL,
  target    REAL NOT NULL,
  period    TEXT NOT NULL,            -- 'day' | 'week' | 'month'
  tags      TEXT,                     -- JSON array of strings
  enabled   INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goals_enabled
  ON goals (enabled, metric);

CREATE TABLE IF NOT EXISTS autonome_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at  TEXT NOT NULL,
  result_json   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autonome_runs_recent
  ON autonome_runs (generated_at DESC);
