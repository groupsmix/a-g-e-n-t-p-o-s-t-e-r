-- 032_budget.sql — TASK-902.
--
-- budget_caps   declarative spend ceilings, keyed by (scope, match, period).
-- agent_usage   append-only per-call log used to compute spend_in().

CREATE TABLE IF NOT EXISTS budget_caps (
  scope        TEXT NOT NULL,
  match        TEXT,
  period       TEXT NOT NULL,
  limit_usd    REAL NOT NULL,
  warn_at      REAL,
  enabled      INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (scope, match, period)
);

CREATE TABLE IF NOT EXISTS agent_usage (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id         TEXT NOT NULL,
  task_type       TEXT NOT NULL,
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd        REAL NOT NULL DEFAULT 0,
  occurred_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_occurred ON agent_usage (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_model    ON agent_usage (model, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_task     ON agent_usage (task_type, occurred_at DESC);
