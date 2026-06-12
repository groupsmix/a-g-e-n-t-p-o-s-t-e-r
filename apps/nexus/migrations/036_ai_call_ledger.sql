-- ============================================================
-- Migration 036: AI Call Ledger
-- Purpose: Persist every nexus-api -> nexus-ai call for observability
-- Dependencies: existing workflow_runs table
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_calls (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  task_type TEXT NOT NULL,
  model_used TEXT,
  source TEXT,
  models_tried_json TEXT NOT NULL DEFAULT '[]',
  attempts_json TEXT NOT NULL DEFAULT '[]',
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  caller TEXT NOT NULL DEFAULT 'unknown',
  workflow_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_ai_calls_ts ON ai_calls(ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_task_type_ts ON ai_calls(task_type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_model_ts ON ai_calls(model_used, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_workflow_ts ON ai_calls(workflow_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_calls_ok_ts ON ai_calls(ok, ts DESC);
