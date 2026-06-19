// ============================================================
// Approval binding (snapshot + idempotency)
// ============================================================
// Closes the approve-A / execute-B hole in the approval flow. An approval is
// bound to the EXACT action payload via a sha256 hash of its canonical JSON.
// Before an approved action is dispatched, the executor recomputes the hash
// from the payload it is about to send and refuses to proceed unless it
// matches the approved snapshot. An idempotency key + executed_at stamp
// guarantee the approved action executes at most once, even across task
// re-queues or retries.
//
// Pure + unit-testable: no DB, no env. Callers handle persistence/dispatch.
// Uses WebCrypto (crypto.subtle) — available in Cloudflare Workers and Node 22+.
//
// The critical guarded action for the freelance-first system is 'send.client'.
// See docs/plans/approval-gate-spec.md for the full design + acceptance tests.

/** Action types that are external / irreversible and MUST be gated. */
export const GATED_ACTIONS = [
  'send.client', // freelance: a deliverable leaves to a real client
  'publish.gumroad',
  'publish.shopify',
  'publish.social',
  'publish.blog',
  'delete.durable',
] as const

export type GatedAction = (typeof GATED_ACTIONS)[number]

/** spend.* actions are gated AND budget-checked before dispatch. */
export function isMoneyAction(actionType: string): boolean {
  return actionType.startsWith('spend.')
}

/** Whether an action requires a server-side approval before it can execute. */
export function isGatedAction(actionType: string): boolean {
  return (GATED_ACTIONS as readonly string[]).includes(actionType) || isMoneyAction(actionType)
}

/**
 * Deterministic JSON: object keys are sorted recursively so the hash is stable
 * regardless of property insertion order. Arrays keep their order (order is
 * semantically meaningful in a payload).
 */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue)
  if (v && typeof v === 'object') {
    const src = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src).sort()) out[k] = sortValue(src[k])
    return out
  }
  return v
}

/** sha256 hex of the canonical form of a payload. This is the binding key. */
export async function computePayloadHash(payload: unknown): Promise<string> {
  const data = new TextEncoder().encode(canonicalJSON(payload))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** A fresh idempotency key for a bound approval. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

export type BindingFailure = 'no_binding' | 'hash_mismatch' | 'already_executed'
export type BindingCheck = { ok: true } | { ok: false; reason: BindingFailure }

/**
 * Verify that the payload an executor is about to dispatch matches the approved
 * snapshot, and that the approval has not already executed.
 *
 *  - already_executed: idempotency — the approval already ran (executed_at set).
 *  - no_binding:       the approval row carries no payload_hash. Callers MUST
 *                      refuse to execute a gated action without a binding.
 *  - hash_mismatch:    the payload differs from what was approved (the A/B swap).
 */
export async function verifyApprovedPayload(args: {
  approvedHash: string | null | undefined
  executedAt: string | null | undefined
  payloadToExecute: unknown
}): Promise<BindingCheck> {
  if (args.executedAt) return { ok: false, reason: 'already_executed' }
  if (!args.approvedHash) return { ok: false, reason: 'no_binding' }
  const actual = await computePayloadHash(args.payloadToExecute)
  if (actual !== args.approvedHash) return { ok: false, reason: 'hash_mismatch' }
  return { ok: true }
}

/**
 * Build the columns for a payload-bound approval row. Call this when RAISING an
 * approval for a gated action (the point where an agent proposes something
 * external), then INSERT the returned fields into approval_requests.
 */
export async function bindApprovalToPayload(payload: unknown): Promise<{
  action_payload: string
  payload_hash: string
  idempotency_key: string
}> {
  return {
    action_payload: canonicalJSON(payload),
    payload_hash: await computePayloadHash(payload),
    idempotency_key: newIdempotencyKey(),
  }
}
