import { describe, it, expect, vi } from 'vitest'
import type { Env } from '../env'
import {
  raiseApproval,
  executeApprovedAction,
  type Dispatcher,
} from './approval-egress'

// ── Minimal D1 mock, in the style of routes/control-plane.test.ts ───────────
// Supports exactly the queries approval-egress issues: INSERT/SELECT/UPDATE on
// approval_requests, UPDATE agent_tasks, INSERT task_events. UPDATEs return a
// realistic { meta: { changes } } so the atomic "claim" path is exercised.
interface ApprovalRow {
  id: string
  task_id: string
  action_type: string
  status: string
  action_payload: string | null
  payload_hash: string | null
  idempotency_key: string | null
  estimated_cost_usd: number | null
  executed_at: string | null
}
function makeDb(initial: { approvals?: ApprovalRow[]; tasks?: { id: string; status: string }[] } = {}) {
  const state = {
    approvals: initial.approvals ?? [],
    tasks: initial.tasks ?? [],
    events: [] as { task_id: string; event_type: string; message: string }[],
  }
  const db = {
    prepare(sql: string) {
      let binds: unknown[] = []
      const stmt = {
        bind(...args: unknown[]) {
          binds = args
          return stmt
        },
        async first<T = unknown>() {
          if (sql.includes('FROM approval_requests')) {
            return (state.approvals.find((a) => a.id === binds[0]) ?? null) as T
          }
          return null as T
        },
        async run() {
          if (sql.includes('INSERT INTO approval_requests')) {
            const [id, task_id, action_type, risk_level, action_payload, payload_hash, idempotency_key, estimated_cost_usd, created_at] = binds as string[]
            void risk_level; void created_at
            state.approvals.push({
              id, task_id, action_type, status: 'pending',
              action_payload, payload_hash, idempotency_key,
              estimated_cost_usd: (estimated_cost_usd as unknown as number) ?? null,
              executed_at: null,
            })
            return { success: true, meta: { changes: 1 } }
          }
          if (sql.includes('UPDATE approval_requests SET executed_at')) {
            // atomic claim: only when executed_at IS NULL
            const row = state.approvals.find((a) => a.id === binds[1])
            if (row && row.executed_at == null) {
              row.executed_at = binds[0] as string
              return { success: true, meta: { changes: 1 } }
            }
            return { success: true, meta: { changes: 0 } }
          }
          if (sql.includes('UPDATE agent_tasks')) {
            const task = state.tasks.find((t) => t.id === binds[binds.length - 1])
            // raiseApproval uses a literal `SET status = 'needs_me'` (no bind);
            // the approve route uses a parameterized `SET status = ?`.
            if (task) task.status = sql.includes("SET status = 'needs_me'") ? 'needs_me' : String(binds[0])
            return { success: true, meta: { changes: task ? 1 : 0 } }
          }
          if (sql.includes('INSERT INTO task_events')) {
            state.events.push({ task_id: String(binds[1]), event_type: String(binds[2]), message: String(binds[3]) })
            return { success: true, meta: { changes: 1 } }
          }
          return { success: true, meta: { changes: 0 } }
        },
      }
      return stmt
    },
  }
  return { db: db as unknown as Env['DB'], state }
}
const envWith = (db: Env['DB']) => ({ DB: db }) as unknown as Env

describe('raiseApproval', () => {
  it('writes a payload-bound pending approval and parks the task', async () => {
    const { db, state } = makeDb({ tasks: [{ id: 'task-1', status: 'running' }] })
    const { approvalId } = await raiseApproval(envWith(db), {
      taskId: 'task-1',
      actionType: 'publish.gumroad',
      payload: { platformSlug: 'gumroad', title: 'Notion kit', price: 19 },
      summary: 'Publish Notion kit to Gumroad',
    })
    const row = state.approvals.find((a) => a.id === approvalId)!
    expect(row.status).toBe('pending')
    expect(row.payload_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.idempotency_key).toBeTruthy()
    expect(JSON.parse(row.action_payload!)).toMatchObject({ platformSlug: 'gumroad' })
    expect(state.tasks[0].status).toBe('needs_me') // parked
    expect(state.events.some((e) => e.event_type === 'approval_raised')).toBe(true)
  })

  it('refuses to raise an approval for a non-gated action', async () => {
    const { db } = makeDb()
    await expect(
      // @ts-expect-error intentionally passing a non-gated action
      raiseApproval(envWith(db), { taskId: 't', actionType: 'draft.create', payload: {} }),
    ).rejects.toThrow(/non-gated/)
  })
})

describe('executeApprovedAction', () => {
  async function seedApproved(actionType: string, payload: unknown) {
    const { db, state } = makeDb({ tasks: [{ id: 'task-1', status: 'needs_me' }] })
    // raise then approve (flip status) to get a realistic bound, approved row
    const { approvalId } = await raiseApproval(envWith(db), {
      taskId: 'task-1',
      actionType: actionType as never,
      payload,
    })
    state.approvals.find((a) => a.id === approvalId)!.status = 'approved'
    return { db, state, approvalId }
  }

  it('dispatches the approved snapshot exactly once and stamps executed_at', async () => {
    const { db, state, approvalId } = await seedApproved('publish.gumroad', { platformSlug: 'gumroad', title: 'X' })
    const dispatch: Dispatcher = vi.fn(async () => ({ status: 'success', url: 'https://gum.co/x' }))
    const res = await executeApprovedAction(envWith(db), approvalId, { 'publish.gumroad': dispatch })
    expect(res).toEqual({ executed: true, outcome: { status: 'success', url: 'https://gum.co/x' } })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(state.approvals.find((a) => a.id === approvalId)!.executed_at).toBeTruthy()
  })

  it('passes the SNAPSHOT (not live state) to the dispatcher', async () => {
    const snapshot = { platformSlug: 'gumroad', title: 'Frozen', price: 42 }
    const { db, approvalId } = await seedApproved('publish.gumroad', snapshot)
    let received: unknown
    const dispatch: Dispatcher = vi.fn(async (p) => { received = p; return { status: 'success' } })
    await executeApprovedAction(envWith(db), approvalId, { 'publish.gumroad': dispatch })
    expect(received).toMatchObject({ platformSlug: 'gumroad', title: 'Frozen', price: 42 })
  })

  it('does not dispatch twice on a double-approve (idempotent claim)', async () => {
    const { db, approvalId } = await seedApproved('publish.gumroad', { platformSlug: 'gumroad' })
    const dispatch: Dispatcher = vi.fn(async () => ({ status: 'success' }))
    const reg = { 'publish.gumroad': dispatch }
    const a = await executeApprovedAction(envWith(db), approvalId, reg)
    const b = await executeApprovedAction(envWith(db), approvalId, reg)
    expect(a.executed).toBe(true)
    expect(b).toEqual({ executed: false, reason: 'already_executed' })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('blocks a tampered snapshot (hash_mismatch) and never dispatches', async () => {
    const { db, state, approvalId } = await seedApproved('publish.gumroad', { platformSlug: 'gumroad', title: 'real' })
    // tamper with the stored snapshot AFTER approval, leaving the hash intact
    const row = state.approvals.find((a) => a.id === approvalId)!
    row.action_payload = JSON.stringify({ platformSlug: 'gumroad', title: 'TAMPERED' })
    const dispatch: Dispatcher = vi.fn(async () => ({ status: 'success' }))
    const res = await executeApprovedAction(envWith(db), approvalId, { 'publish.gumroad': dispatch })
    expect(res).toEqual({ executed: false, reason: 'hash_mismatch' })
    expect(dispatch).not.toHaveBeenCalled()
    expect(row.executed_at).toBeNull() // not claimed
  })

  it('will not execute an unapproved (still pending) approval', async () => {
    const { db, state } = makeDb({ tasks: [{ id: 'task-1', status: 'needs_me' }] })
    const { approvalId } = await raiseApproval(envWith(db), { taskId: 'task-1', actionType: 'publish.gumroad', payload: { platformSlug: 'gumroad' } })
    void state
    const dispatch: Dispatcher = vi.fn(async () => ({ status: 'success' }))
    const res = await executeApprovedAction(envWith(db), approvalId, { 'publish.gumroad': dispatch })
    expect(res).toEqual({ executed: false, reason: 'not_approved' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('returns no_dispatcher for a gated action with no adapter wired (e.g. send.client)', async () => {
    const { db, approvalId } = await seedApproved('send.client', { deliverable: 'logo.zip', to: 'client@acme.com' })
    const res = await executeApprovedAction(envWith(db), approvalId, {}) // empty registry
    expect(res).toEqual({ executed: false, reason: 'no_dispatcher' })
  })

  it('returns not_found for an unknown approval id', async () => {
    const { db } = makeDb()
    const res = await executeApprovedAction(envWith(db), 'nope')
    expect(res).toEqual({ executed: false, reason: 'not_found' })
  })
})
