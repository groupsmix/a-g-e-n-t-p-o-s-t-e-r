-- ============================================================
-- Migration 023: Agent Tasks (dashboard task feed)
-- ============================================================
-- Purpose:
--   Higher-level, user-facing task abstraction that the dashboard
--   tails via SSE.  One row per "do this work" intent.
--
--   This sits ABOVE (not in place of):
--     • automation_jobs (020) — low-level work queue with retry/idempotency
--     • agent_runs     (022) — per-LLM-call cost ledger
--
--   A single agent_task may fan out into many automation_jobs and many
--   agent_runs.  Cost rolls up here for the dashboard KPI strip; the
--   detailed ledger stays in agent_runs.
--
-- Type contract: packages/types/src/index.ts → AgentTask, AgentTaskType,
-- AgentTaskStatus.  Keep CHECK constraints in sync with the TS literals.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_tasks (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- ── Task contract ────────────────────────────────────────────────────────
  type            TEXT NOT NULL CHECK (type IN (
                    'research',
                    'write',
                    'build-app',
                    'build-site',
                    'publish',
                    'analyse',
                    'generate-video',
                    'generate-image',
                    'lead-scrape',
                    'email-campaign',
                    'financial-analysis',
                    'brand-monitor',
                    'autonome-run',
                    'memory-consolidate'
                  )),
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
                    'queued', 'running', 'done', 'failed', 'cancelled'
                  )),

  -- ── Payload + output (JSON blobs, parsed by the dashboard) ───────────────
  payload         TEXT NOT NULL DEFAULT '{}',   -- JSON input describing the work
  result          TEXT,                         -- JSON output (set when status = done)
  error           TEXT,                         -- error message (set when status = failed)

  -- ── Cost + token accounting ──────────────────────────────────────────────
  estimated_cost_usd  REAL,                     -- pre-flight estimate (NULL until estimated)
  actual_cost_usd     REAL,                     -- rolled up from agent_runs after completion
  model_used          TEXT,                     -- last model invoked (or "multi" for fan-outs)
  input_tokens        INTEGER,
  output_tokens       INTEGER,

  -- ── Provenance + ownership ───────────────────────────────────────────────
  agent_id        TEXT,                         -- e.g. 'trend-agent', 'poster-agent'
  origin          TEXT NOT NULL DEFAULT 'dashboard' CHECK (origin IN (
                    'dashboard', 'autopilot', 'schedule', 'webhook', 'api', 'cli'
                  )),
  parent_task_id  TEXT REFERENCES agent_tasks(id) ON DELETE SET NULL,

  -- ── Lifecycle timestamps ─────────────────────────────────────────────────
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  started_at      TEXT,                         -- set when status flips to running
  finished_at     TEXT,                         -- set when status flips to done/failed/cancelled
  duration_ms     INTEGER                       -- finished_at - started_at, materialised on close
);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- The dashboard reads this table via three primary access patterns:
--   1. Live tail of recent activity      → (created_at DESC)
--   2. Filter by status / type           → (status, created_at DESC) / (type, created_at DESC)
--   3. Resume / inspect a single task    → primary key
--   4. Parent → children traversal       → (parent_task_id)
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created     ON agent_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status      ON agent_tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_type        ON agent_tasks(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent       ON agent_tasks(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_parent      ON agent_tasks(parent_task_id);

-- ── updated_at trigger ─────────────────────────────────────────────────────
-- D1 / SQLite has no `ON UPDATE` clause, so we keep updated_at fresh via a
-- trigger.  Fires only when status / payload / result / error / cost fields
-- change so we do not thrash the row on every cosmetic write.
CREATE TRIGGER IF NOT EXISTS trg_agent_tasks_updated_at
AFTER UPDATE OF status, payload, result, error,
                actual_cost_usd, input_tokens, output_tokens,
                started_at, finished_at, duration_ms
ON agent_tasks
FOR EACH ROW
BEGIN
  UPDATE agent_tasks
     SET updated_at = datetime('now')
   WHERE id = NEW.id;
END;
