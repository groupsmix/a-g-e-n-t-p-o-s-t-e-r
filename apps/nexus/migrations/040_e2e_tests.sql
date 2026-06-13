-- Migration 040: E2E Test Suites
CREATE TABLE IF NOT EXISTS e2e_test_suites (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  goal         TEXT NOT NULL,   -- plain-English goal fed to browser agent
  start_url    TEXT,
  tags         TEXT,            -- JSON array
  max_steps    INTEGER NOT NULL DEFAULT 15,
  enabled      INTEGER NOT NULL DEFAULT 1,
  last_run_at  TEXT,
  last_verdict TEXT,            -- pass | fail | error
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS e2e_test_runs (
  id          TEXT PRIMARY KEY,
  suite_id    TEXT NOT NULL REFERENCES e2e_test_suites(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'running'
              CHECK (status IN ('running','pass','fail','error','cancelled')),
  goal        TEXT NOT NULL,
  start_url   TEXT,
  total_steps INTEGER NOT NULL DEFAULT 0,
  answer      TEXT,
  error       TEXT,
  total_ms    INTEGER,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS e2e_test_run_steps (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES e2e_test_runs(id) ON DELETE CASCADE,
  step_index   INTEGER NOT NULL,
  event_type   TEXT NOT NULL,
  thought      TEXT,
  action_type  TEXT,
  page_title   TEXT,
  page_url     TEXT,
  message      TEXT,
  screenshot_url TEXT,
  error        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_e2e_runs_suite ON e2e_test_runs(suite_id);
CREATE INDEX IF NOT EXISTS idx_e2e_steps_run ON e2e_test_run_steps(run_id);
