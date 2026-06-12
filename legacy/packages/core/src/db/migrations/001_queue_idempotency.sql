-- Migration 001: Idempotency + locks for the legacy Supabase content queue
-- Backlog T-38: Adds run_id/batch_id/claim_token/claimed_at/attempt_count/
--   last_error/next_retry_at/idempotency_key to content_queue, and a unique
--   constraint on published_posts(content_queue_id, platform) to prevent
--   the same item being published twice to the same platform.
--
-- The NEXUS D1 agent_queue (migration 020) already has these columns.
-- This migration brings the legacy Supabase queue to parity.

-- ── 1. Extend content_queue ──────────────────────────────────────────────────

-- Identifies the workflow run that claimed this item.
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS run_id TEXT;

-- Identifies the batch within a run (a run may process multiple batches).
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS batch_id TEXT;

-- Unique token minted when a row is claimed. The claim UPDATE includes
-- `WHERE claim_token IS NULL` so concurrent runs cannot grab the same row.
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS claim_token TEXT;

-- Timestamp of the claim. Used by the janitor to detect stuck claims
-- (claimed but never completed within the timeout).
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Number of processing attempts. Incremented each time the item is claimed.
-- Distinct from the legacy retry_count column (kept for back-compat).
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

-- Most recent error message. Unlike the legacy `error` column, this is
-- cleared on success so a previously-failed item that succeeds doesn't
-- carry stale error text.
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Earliest time the item may be retried. NULL = immediately eligible.
-- Set when a transient failure schedules a future retry.
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- Prevents duplicate inserts of the same logical work item. The agent
-- computes this from (niche + topic + type + scheduled_at::date) or
-- provides an explicit key for one-off jobs.
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- ── 2. Indexes ───────────────────────────────────────────────────────────────

-- Unique idempotency key (partial: only non-null keys).
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_queue_idempotency
  ON content_queue(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Fast claim query: pending + scheduled_at <= now + no active claim.
CREATE INDEX IF NOT EXISTS idx_content_queue_claim
  ON content_queue(status, scheduled_at, niche)
  WHERE status = 'pending';

-- Stuck-claim janitor: find rows claimed > N minutes ago still in generating/publishing.
CREATE INDEX IF NOT EXISTS idx_content_queue_claimed_at
  ON content_queue(claimed_at)
  WHERE claimed_at IS NOT NULL AND status IN ('generating', 'publishing');

-- ── 3. Anti-duplicate-publish constraint ─────────────────────────────────────

-- Each queue item may be published at most once per platform. The partial
-- unique index only covers successful publishes so re-trying a failed publish
-- doesn't trip the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_published_posts_queue_platform
  ON published_posts(content_queue_id, platform)
  WHERE content_queue_id IS NOT NULL
    AND status IN ('published');

-- ── 4. Atomic claim helper (reference SQL) ──────────────────────────────────
--
-- The canonical claim query used by daily-run-workflow.ts:
--
--   UPDATE content_queue
--      SET status       = 'generating',
--          run_id       = $run_id,
--          batch_id     = $batch_id,
--          claim_token  = gen_random_uuid()::text,
--          claimed_at   = NOW(),
--          attempt_count = attempt_count + 1,
--          last_error   = NULL
--    WHERE status = 'pending'
--      AND scheduled_at <= NOW()
--      AND niche = ANY($niches)
--      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
--    RETURNING id, topic, niche, type, platform_targets, metadata;
--
-- The conditional WHERE guarantees each row is claimed by exactly one run.
-- Rows another run grabbed first drop out of the RETURNING set.
