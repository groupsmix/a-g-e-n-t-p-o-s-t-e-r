import { describe, it, expect } from 'vitest'
import {
  canonicalJSON,
  computePayloadHash,
  verifyApprovedPayload,
  bindApprovalToPayload,
  isGatedAction,
  isMoneyAction,
  newIdempotencyKey,
} from './approval-binding'

describe('approval binding: action classification', () => {
  it('gates send.client (the freelance-critical action)', () => {
    expect(isGatedAction('send.client')).toBe(true)
  })

  it('gates publish.* and delete.durable', () => {
    for (const a of ['publish.gumroad', 'publish.shopify', 'publish.social', 'publish.blog', 'delete.durable']) {
      expect(isGatedAction(a)).toBe(true)
    }
  })

  it('gates and flags spend.* as money actions', () => {
    expect(isGatedAction('spend.ads')).toBe(true)
    expect(isMoneyAction('spend.ads')).toBe(true)
    expect(isMoneyAction('send.client')).toBe(false)
  })

  it('does NOT gate internal actions', () => {
    for (const a of ['draft.create', 'research.web', 'browser.read', 'log.write', 'propose.idea']) {
      expect(isGatedAction(a)).toBe(false)
    }
  })
})

describe('approval binding: canonical JSON + hash', () => {
  it('produces the same hash regardless of object key order', async () => {
    const a = { title: 'Logo pack', client: 'acme', price: 250 }
    const b = { price: 250, client: 'acme', title: 'Logo pack' }
    expect(canonicalJSON(a)).toBe(canonicalJSON(b))
    expect(await computePayloadHash(a)).toBe(await computePayloadHash(b))
  })

  it('sorts nested object keys but preserves array order', async () => {
    const a = { items: [{ b: 1, a: 2 }, { d: 3, c: 4 }], z: 1 }
    const b = { z: 1, items: [{ a: 2, b: 1 }, { c: 4, d: 3 }] }
    expect(await computePayloadHash(a)).toBe(await computePayloadHash(b))
    // array reordered -> different payload -> different hash
    const reordered = { z: 1, items: [{ c: 4, d: 3 }, { a: 2, b: 1 }] }
    expect(await computePayloadHash(a)).not.toBe(await computePayloadHash(reordered))
  })

  it('different payloads produce different hashes', async () => {
    const draftA = { deliverable: 'final-logo-v3.zip', recipient: 'client@acme.com' }
    const draftB = { deliverable: 'final-logo-v3.zip', recipient: 'attacker@evil.com' }
    expect(await computePayloadHash(draftA)).not.toBe(await computePayloadHash(draftB))
  })

  it('emits a 64-char hex sha256', async () => {
    expect(await computePayloadHash({ x: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('approval binding: verify before execute', () => {
  it('approves dispatch when the payload matches the approved snapshot', async () => {
    const payload = { action: 'send.client', deliverable: 'logo.zip', to: 'client@acme.com' }
    const { payload_hash } = await bindApprovalToPayload(payload)
    const check = await verifyApprovedPayload({ approvedHash: payload_hash, executedAt: null, payloadToExecute: payload })
    expect(check.ok).toBe(true)
  })

  it('BLOCKS the approve-A / send-B swap (hash_mismatch)', async () => {
    const approved = { action: 'send.client', deliverable: 'logo.zip', to: 'client@acme.com' }
    const swapped = { action: 'send.client', deliverable: 'logo.zip', to: 'attacker@evil.com' }
    const { payload_hash } = await bindApprovalToPayload(approved)
    const check = await verifyApprovedPayload({ approvedHash: payload_hash, executedAt: null, payloadToExecute: swapped })
    expect(check).toEqual({ ok: false, reason: 'hash_mismatch' })
  })

  it('refuses to execute a gated action with no binding', async () => {
    const check = await verifyApprovedPayload({ approvedHash: null, executedAt: null, payloadToExecute: { x: 1 } })
    expect(check).toEqual({ ok: false, reason: 'no_binding' })
  })

  it('is idempotent: a once-executed approval cannot run again', async () => {
    const payload = { action: 'send.client', deliverable: 'logo.zip' }
    const { payload_hash } = await bindApprovalToPayload(payload)
    const check = await verifyApprovedPayload({
      approvedHash: payload_hash,
      executedAt: '2026-06-19T05:00:00.000Z',
      payloadToExecute: payload,
    })
    expect(check).toEqual({ ok: false, reason: 'already_executed' })
  })
})

describe('approval binding: key generation', () => {
  it('mints unique idempotency keys', () => {
    const keys = new Set(Array.from({ length: 100 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(100)
  })

  it('bindApprovalToPayload returns a consistent snapshot + hash', async () => {
    const payload = { b: 2, a: 1 }
    const bound = await bindApprovalToPayload(payload)
    expect(bound.action_payload).toBe(canonicalJSON(payload))
    expect(bound.payload_hash).toBe(await computePayloadHash(payload))
    expect(bound.idempotency_key).toMatch(/[0-9a-f-]{36}/)
  })
})
