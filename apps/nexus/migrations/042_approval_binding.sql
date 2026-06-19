-- ============================================================
-- NEXUS Migration 042: Approval binding (snapshot + idempotency)
-- ============================================================
-- Closes the approve-A / execute-B hole in the existing approval flow
-- (migration 037). Today an approval flips status to 'approved' and re-queues
-- the task, which then RE-DERIVES what to execute — nothing binds the
-- approval to a specific payload, and nothing prevents double execution.
--
-- These columns are purely ADDITIVE and nullable, so existing rows and the
-- current approve/reject endpoints keep working unchanged. A payload-bound
-- approval sets action_payload + payload_hash at creation; the executor
-- recomputes the hash from the payload it is about to dispatch and refuses to
-- proceed unless it matches the approved snapshot. idempotency_key +
-- executed_at guarantee the approved action runs at most once.
--
-- The critical guarded action for the freelance-first system is 'send.client'
-- (a deliverable leaving to a real client); publish.* / spend.* / delete.*
-- are gated too. See docs/plans/approval-gate-spec.md.
-- ============================================================

-- Snapshot of the EXACT action to execute (canonical JSON string).
ALTER TABLE approval_requests ADD COLUMN action_payload TEXT;

-- sha256 hex of canonicalJSON(action_payload) — the binding key.
ALTER TABLE approval_requests ADD COLUMN payload_hash TEXT;

-- Guarantees execute-exactly-once across task re-queues / retries.
ALTER TABLE approval_requests ADD COLUMN idempotency_key TEXT;

-- Estimated external cost; used by the budget pre-check for spend.* actions.
ALTER TABLE approval_requests ADD COLUMN estimated_cost_usd REAL;

-- Set once the approved action has actually been dispatched (idempotency).
ALTER TABLE approval_requests ADD COLUMN executed_at TEXT;

-- One approval can execute at most once. Partial index: only bound approvals.
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_requests_idempotency
  ON approval_requests(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Fast lookup when verifying an inbound payload against its approval.
CREATE INDEX IF NOT EXISTS idx_approval_requests_payload_hash
  ON approval_requests(payload_hash)
  WHERE payload_hash IS NOT NULL;
