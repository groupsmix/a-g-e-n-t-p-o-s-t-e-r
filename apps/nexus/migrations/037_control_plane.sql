-- ============================================================
-- Migration 037: Control Plane Schema & Task Status Update
-- ============================================================

PRAGMA foreign_keys=OFF;

-- 1. Rebuild agent_tasks to support 'needs_me' and 'archived' in the status CHECK constraint
CREATE TABLE agent_tasks_new (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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
                    'queued', 'running', 'done', 'failed', 'cancelled', 'needs_me', 'archived'
                  )),
  payload         TEXT NOT NULL DEFAULT '{}',
  result          TEXT,
  error           TEXT,
  estimated_cost_usd  REAL,
  actual_cost_usd     REAL,
  model_used          TEXT,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  agent_id        TEXT,
  origin          TEXT NOT NULL DEFAULT 'dashboard' CHECK (origin IN (
                    'dashboard', 'autopilot', 'schedule', 'webhook', 'api', 'cli'
                  )),
  parent_task_id  TEXT REFERENCES agent_tasks_new(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  started_at      TEXT,
  finished_at     TEXT,
  duration_ms     INTEGER
);

-- Copy existing data to the new table
INSERT INTO agent_tasks_new (
  id, type, status, payload, result, error, estimated_cost_usd, actual_cost_usd,
  model_used, input_tokens, output_tokens, agent_id, origin, parent_task_id,
  created_at, updated_at, started_at, finished_at, duration_ms
)
SELECT
  id, type, status, payload, result, error, estimated_cost_usd, actual_cost_usd,
  model_used, input_tokens, output_tokens, agent_id, origin, parent_task_id,
  created_at, updated_at, started_at, finished_at, duration_ms
FROM agent_tasks;

-- Drop old table and rename new one
DROP TABLE agent_tasks;
ALTER TABLE agent_tasks_new RENAME TO agent_tasks;

PRAGMA foreign_keys=ON;

-- Recreate indexes and triggers
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created     ON agent_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status      ON agent_tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_type        ON agent_tasks(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent       ON agent_tasks(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_parent      ON agent_tasks(parent_task_id);

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

-- 2. Create control-plane tables

-- Task events table
CREATE TABLE IF NOT EXISTS task_events (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id         TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  message         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at ASC);

-- Agent messages table
CREATE TABLE IF NOT EXISTS agent_messages (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id         TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  sender          TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_task ON agent_messages(task_id, created_at ASC);

-- Approval requests table
CREATE TABLE IF NOT EXISTS approval_requests (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id         TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL,
  risk_level      TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at     TEXT,
  feedback        TEXT
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_task ON approval_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);

-- Artifacts table
CREATE TABLE IF NOT EXISTS artifacts (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id         TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  url             TEXT,
  content         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);

-- Live processes table
CREATE TABLE IF NOT EXISTS live_processes (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id         TEXT REFERENCES agent_tasks(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_live_processes_status ON live_processes(status);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  read            INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read, created_at DESC);
