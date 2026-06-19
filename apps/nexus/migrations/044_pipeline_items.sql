-- ============================================================
-- Migration 044: pipeline_items — NEXUS canonical pipeline table
-- ============================================================
-- One table, one object type. Notes, freelance jobs, products,
-- POD designs, and blog posts are all PipelineItems differentiated
-- by `type`. No separate tables or routes per content type.
-- See NEXUS Architecture spec §5 (Data Model).
--
-- Approval requests already live in approval_requests (migration 037).
-- Agent runs already live in agent_runs (migration 022).
-- This table is the human-visible Pipeline board.
-- ============================================================

CREATE TABLE IF NOT EXISTS pipeline_items (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- What kind of item this is — determines which tools the agent reaches for
  type            TEXT NOT NULL DEFAULT 'note'
                    CHECK (type IN ('note', 'job', 'product', 'pod', 'blog')),

  -- Where on the board this card lives
  stage           TEXT NOT NULL DEFAULT 'idea'
                    CHECK (stage IN ('idea', 'draft', 'review', 'scheduled', 'published')),

  title           TEXT NOT NULL,
  content         TEXT,                    -- draft body / brief text

  -- Job-specific fields (nullable for other types)
  deliverable_type  TEXT                   -- writing | code | design | research
                    CHECK (deliverable_type IN ('writing', 'code', 'design', 'research') OR deliverable_type IS NULL),
  client_ref        TEXT,                  -- reference to a client contact
  client_notes      TEXT,                  -- tone, constraints, "don't mention X"
  brief_attachment_ref TEXT,               -- R2 key for an attached file
  deadline          TEXT,                  -- ISO 8601 datetime

  -- Who created this item (agent ID or "user")
  created_by      TEXT NOT NULL DEFAULT 'user',

  -- Discovery Agent: track which signal spawned an idea-stage item
  source_signal_id TEXT REFERENCES signals(id) ON DELETE SET NULL,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pipeline_items_stage    ON pipeline_items(stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_type     ON pipeline_items(type);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_created  ON pipeline_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_signal   ON pipeline_items(source_signal_id) WHERE source_signal_id IS NOT NULL;

-- Auto-update updated_at on any row change
CREATE TRIGGER IF NOT EXISTS pipeline_items_updated_at
  AFTER UPDATE ON pipeline_items
  BEGIN
    UPDATE pipeline_items SET updated_at = datetime('now') WHERE id = NEW.id;
  END;
