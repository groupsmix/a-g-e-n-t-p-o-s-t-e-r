// ============================================================
// Approval egress: raise-path + verified executor
// ============================================================
// This is the part that makes the approval gate *bite*. It has two halves:
//
//   raiseApproval()         — call this INSTEAD of dispatching a gated action.
//                             It snapshots the exact payload (hash + idempotency
//                             key via approval-binding), writes a bound
//                             approval_requests row, parks the task in
//                             'needs_me', and returns. Nothing external happens.
//
//   executeApprovedAction() — call this AFTER an operator approves. It dispatches
//                             the APPROVED SNAPSHOT (never live agent state),
//                             verifies the snapshot's integrity against the
//                             stored hash, and claims execution atomically so the
//                             action runs at most once.
//
// Why dispatch the snapshot rather than re-deriving: the existing approve flow
// re-queued the task and let the agent recompute what to send — which is exactly
// the approve-A / send-B hole. Executing the frozen snapshot closes it by
// construction.
//
// Safety stance: at-most-once. We claim (stamp executed_at WHERE executed_at IS
// NULL) BEFORE dispatch. If a dispatch fails, the approval is considered spent
// and a NEW approval is required to retry — deliberately conservative, because
// these are external/irreversible actions and a double-send is worse than a
// retry.

import type { Env } from '../env'
import {
  bindApprovalToPayload,
  verifyApprovedPayload,
  isGatedAction,
  type GatedAction,
} from './approval-binding'
import {
  publishToPlatform,
  postToSocial,
  type ListingPayload,
  type SocialPayload,
} from './publishers'

// Outcome shape shared with the real publisher adapters.
export interface DispatchOutcome {
  status: 'success' | 'failed'
  url?: string
  error?: string
}

export type Dispatcher = (payload: unknown, env: Env) => Promise<DispatchOutcome>

// Maps a gated action_type to the real adapter that performs it. The payload is
// the approved SNAPSHOT, parsed from approval_requests.action_payload.
//
// Only actions with a real adapter today are wired. An unmapped gated action
// (e.g. send.client, delete.durable, spend.*) returns `no_dispatcher` and is
// never executed — honest, and safe by default. Keyed by string because the
// executor looks up by the row's action_type (a string).
export const DISPATCH_REGISTRY: Record<string, Dispatcher> = {
  'publish.gumroad': (payload, env) => publishToPlatform(payload as ListingPayload, env),
  'publish.shopify': (payload, env) => publishToPlatform(payload as ListingPayload, env),
  'publish.social': (payload, env) => postToSocial(payload as SocialPayload, env),
  'publish.blog': (payload, env) => postToSocial(payload as SocialPayload, env),
}

function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 32)
}

async function logTaskEvent(env: Env, taskId: string, type: string, message: string): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO task_events (id, task_id, event_type, message, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(shortId(), taskId, type, message, new Date().toISOString())
      .run()
  } catch {
    /* event logging is best-effort; never block the gate on it */
  }
}

export interface RaiseApprovalInput {
  taskId: string
  actionType: GatedAction
  payload: unknown
  riskLevel?: 'low' | 'medium' | 'high'
  estimatedCostUsd?: number | null
  /** Human summary for the Home "needs your attention" row. */
  summary?: string
}

/**
 * Raise a payload-bound approval for a gated action and park the task. Returns
 * the new approval id. Throws if the action is not actually gated (a caller
 * must not route internal actions through the approval queue).
 */
export async function raiseApproval(env: Env, input: RaiseApprovalInput): Promise<{ approvalId: string }> {
  if (!isGatedAction(input.actionType)) {
    throw new Error(`raiseApproval called for non-gated action: ${input.actionType}`)
  }
  const bound = await bindApprovalToPayload(input.payload)
  const id = crypto.randomUUID().replace(/-/g, '')
  const now = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO approval_requests
       (id, task_id, action_type, risk_level, status, action_payload, payload_hash, idempotency_key, estimated_cost_usd, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.taskId,
      input.actionType,
      input.riskLevel ?? 'high',
      bound.action_payload,
      bound.payload_hash,
      bound.idempotency_key,
      input.estimatedCostUsd ?? null,
      now,
    )
    .run()

  // Park the task: an external action is pending the operator. Only a running/
  // queued task transitions, so this is a no-op for terminal tasks.
  await env.DB.prepare(
    `UPDATE agent_tasks SET status = 'needs_me', updated_at = ? WHERE id = ? AND status IN ('queued','running')`,
  )
    .bind(now, input.taskId)
    .run()

  await logTaskEvent(env, input.taskId, 'approval_raised', input.summary ?? `Approval required for ${input.actionType}`)
  return { approvalId: id }
}

export type ExecuteReason =
  | 'not_found'
  | 'not_approved'
  | 'no_binding'
  | 'hash_mismatch'
  | 'already_executed'
  | 'no_dispatcher'

export type ExecuteResult =
  | { executed: true; outcome: DispatchOutcome }
  | { executed: false; reason: ExecuteReason }

interface ApprovalRow {
  id: string
  task_id: string
  action_type: string
  status: string
  action_payload: string | null
  payload_hash: string | null
  executed_at: string | null
}

/**
 * Execute the approved snapshot for an approval, exactly once. Intended to be
 * called from the approve endpoint for payload-bound approvals.
 *
 * The `registry` is injectable for testing; production uses DISPATCH_REGISTRY.
 */
export async function executeApprovedAction(
  env: Env,
  approvalId: string,
  registry: Record<string, Dispatcher> = DISPATCH_REGISTRY,
): Promise<ExecuteResult> {
  const row = await env.DB.prepare(
    `SELECT id, task_id, action_type, status, action_payload, payload_hash, executed_at
       FROM approval_requests WHERE id = ?`,
  )
    .bind(approvalId)
    .first<ApprovalRow>()

  if (!row) return { executed: false, reason: 'not_found' }
  if (row.status !== 'approved') return { executed: false, reason: 'not_approved' }
  if (!row.payload_hash || !row.action_payload) return { executed: false, reason: 'no_binding' }
  if (row.executed_at) return { executed: false, reason: 'already_executed' }

  // Dispatch the SNAPSHOT — never live state.
  const payload = JSON.parse(row.action_payload)

  // Integrity: the stored snapshot must still hash to the approved value.
  const check = await verifyApprovedPayload({
    approvedHash: row.payload_hash,
    executedAt: row.executed_at,
    payloadToExecute: payload,
  })
  if (!check.ok) return { executed: false, reason: check.reason }

  const dispatch = registry[row.action_type]
  if (!dispatch) return { executed: false, reason: 'no_dispatcher' }

  // Claim execution atomically BEFORE dispatching, so a concurrent approve can't
  // double-send. If we didn't win the claim, someone else already executed it.
  const now = new Date().toISOString()
  const claim = await env.DB.prepare(
    `UPDATE approval_requests SET executed_at = ? WHERE id = ? AND executed_at IS NULL`,
  )
    .bind(now, approvalId)
    .run()
  if (!claim.meta || claim.meta.changes === 0) {
    return { executed: false, reason: 'already_executed' }
  }

  const outcome = await dispatch(payload, env)
  await logTaskEvent(
    env,
    row.task_id,
    outcome.status === 'success' ? 'action_executed' : 'action_failed',
    `${row.action_type}: ${outcome.status}${outcome.error ? ` — ${outcome.error}` : ''}${outcome.url ? ` (${outcome.url})` : ''}`,
  )
  return { executed: true, outcome }
}
