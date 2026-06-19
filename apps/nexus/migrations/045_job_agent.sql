-- ============================================================
-- Migration 045: Job Agent — pipeline_item link + approval fields
-- ============================================================
-- Extends approval_requests with two nullable columns so the NEXUS
-- Job Agent can link approvals directly to pipeline_items without
-- breaking the existing agent_tasks flow (task_id stays NOT NULL
-- on legacy rows; new rows set pipeline_item_id instead).
--
-- Also adds job_briefs — the canonical intake record for a freelance
-- brief attached to a pipeline_item of type 'job'. Keeping it
-- separate from pipeline_items lets us add structured fields
-- (deliverable_type, deadline, client_notes) without polluting
-- the core board item.
-- ============================================================

-- Link an approval to a NEXUS pipeline item (nullable — legacy rows use task_id only)
ALTER TABLE approval_requests ADD COLUMN pipeline_item_id TEXT REFERENCES pipeline_items(id) ON DELETE CASCADE;

-- Human-readable one-liner shown in the approval UI ("Draft ready for review: ...")
ALTER TABLE approval_requests ADD COLUMN summary TEXT;

-- Notes left by the reviewer on approve or reject
ALTER TABLE approval_requests ADD COLUMN reviewer_notes TEXT;

-- Fast lookup: all pending approvals for a pipeline item
CREATE INDEX IF NOT EXISTS idx_approval_requests_pipeline_item
  ON approval_requests(pipeline_item_id)
  WHERE pipeline_item_id IS NOT NULL;

-- ── job_briefs ──────────────────────────────────────────────────────────────
-- Structured brief for a job-type pipeline item.
-- Created by the user via the intake form; read by the Job Agent as its goal.
CREATE TABLE IF NOT EXISTS job_briefs (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  pipeline_item_id    TEXT NOT NULL REFERENCES pipeline_items(id) ON DELETE CASCADE,

  -- What the agent is producing
  deliverable_type    TEXT NOT NULL DEFAULT 'writing'
                        CHECK (deliverable_type IN ('writing', 'code', 'design', 'research')),

  -- The actual brief text (required — agent won't start without it)
  brief_text          TEXT NOT NULL,

  -- Optional structured fields
  client_name         TEXT,
  client_notes        TEXT,    -- tone, format constraints, "don't mention X"
  deadline            TEXT,    -- ISO 8601

  -- Attached file (R2 key) — optional
  attachment_ref      TEXT,

  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_briefs_pipeline_item
  ON job_briefs(pipeline_item_id);

-- ── job_deliverables ─────────────────────────────────────────────────────────
-- The actual output produced by the Job Agent.
-- Stored here so it survives agent run cleanup and can be re-downloaded.
CREATE TABLE IF NOT EXISTS job_deliverables (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  pipeline_item_id    TEXT NOT NULL REFERENCES pipeline_items(id) ON DELETE CASCADE,
  agent_run_id        TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,

  -- Content: either inline text or an R2 reference
  content_text        TEXT,
  content_ref         TEXT,    -- R2 key for file deliverables
  format              TEXT NOT NULL DEFAULT 'text'
                        CHECK (format IN ('text', 'markdown', 'code', 'pdf', 'zip')),

  -- Agent's own notes on what it produced
  agent_notes         TEXT,

  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_deliverables_pipeline_item
  ON job_deliverables(pipeline_item_id);
