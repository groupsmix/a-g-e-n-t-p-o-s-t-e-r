-- Migration 002: Dead-letter queues for the legacy Supabase pipeline
-- Backlog T-39: Creates content_queue_failures, publisher_failures, and
--   workflow_failures tables. These capture items that exhausted all retries
--   so an operator can inspect, requeue, or dismiss them — instead of losing
--   them to the void after a status='failed' update.
--
-- Design notes:
--   - All error/response fields are TEXT (never JSONB blobs from upstream
--     APIs that might contain tokens). Callers MUST redact before writing.
--   - `request_id` ties back to the nexus-api error-handler correlation id
--     so you can grep the logs.
--   - `next_action` is an operator-set enum: 'retry', 'dismiss', 'escalate'.

-- ── 1. content_queue_failures ────────────────────────────────────────────────
-- Rows here are content_queue items that exhausted every retry. The original
-- row stays in content_queue (status='failed') for FK integrity; a copy of
-- the failure metadata lands here for human triage.

CREATE TABLE IF NOT EXISTS content_queue_failures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_queue_id UUID NOT NULL REFERENCES content_queue(id) ON DELETE CASCADE,
  niche           TEXT NOT NULL,
  type            TEXT NOT NULL,          -- poster / video_short / etc.
  topic           TEXT NOT NULL,
  platform_targets TEXT[] NOT NULL DEFAULT '{}',
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,                   -- redacted
  last_response   TEXT,                   -- redacted upstream body (truncated to 4KB)
  request_id      TEXT,                   -- nexus-api correlation id
  run_id          TEXT,
  batch_id        TEXT,
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_action     TEXT DEFAULT 'retry'
                    CHECK (next_action IN ('retry', 'dismiss', 'escalate')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_cq_failures_queue  ON content_queue_failures(content_queue_id);
CREATE INDEX IF NOT EXISTS idx_cq_failures_action ON content_queue_failures(next_action)
  WHERE resolved_at IS NULL;

-- ── 2. publisher_failures ────────────────────────────────────────────────────
-- Per-platform publish failures. One row per publish attempt that couldn't
-- be retried inline (401, 403, policy rejection) or that exhausted retries.

CREATE TABLE IF NOT EXISTS publisher_failures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_queue_id UUID REFERENCES content_queue(id),
  platform        TEXT NOT NULL,          -- tiktok / instagram_feed / etc.
  category        TEXT,                   -- media_upload / auth / rate_limit / policy / unknown
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  http_status     INTEGER,
  error_message   TEXT,                   -- redacted
  response_body   TEXT,                   -- redacted, truncated
  request_id      TEXT,
  media_url       TEXT,                   -- the asset URL that failed (no tokens)
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_action     TEXT DEFAULT 'retry'
                    CHECK (next_action IN ('retry', 'dismiss', 'escalate')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_pub_failures_queue    ON publisher_failures(content_queue_id);
CREATE INDEX IF NOT EXISTS idx_pub_failures_platform ON publisher_failures(platform, failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pub_failures_action   ON publisher_failures(next_action)
  WHERE resolved_at IS NULL;

-- ── 3. workflow_failures ─────────────────────────────────────────────────────
-- Workflow-level failures (step threw, agent errored, engine crashed).
-- Distinct from per-item failures above — this is the "the whole batch
-- blew up" table.

CREATE TABLE IF NOT EXISTS workflow_failures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     TEXT NOT NULL,          -- 'daily-run' / 'video-generation' / etc.
  step_name       TEXT NOT NULL,          -- 'fetch-all-trends' / 'fill-queue' / etc.
  run_id          TEXT,
  batch_id        TEXT,
  error_message   TEXT,                   -- redacted
  stack_trace     TEXT,                   -- redacted, truncated
  request_id      TEXT,
  items_affected  INTEGER DEFAULT 0,
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_action     TEXT DEFAULT 'retry'
                    CHECK (next_action IN ('retry', 'dismiss', 'escalate')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_wf_failures_workflow ON workflow_failures(workflow_id, failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_failures_action   ON workflow_failures(next_action)
  WHERE resolved_at IS NULL;
