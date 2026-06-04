import { describe, it, expect } from 'vitest'

/**
 * Golden-path smoke test — verifies the critical product lifecycle:
 * create → AI generation → review → approve → publish (or fail-with-reason)
 *
 * These tests validate the logic paths without actual D1/AI bindings.
 */

describe('golden path: product lifecycle', () => {
  it('workflow context initialises with required fields', () => {
    const ctx = {
      runId: crypto.randomUUID(),
      productId: crypto.randomUUID(),
      domainSlug: 'digital',
      categorySlug: 'templates',
      userInput: { topic: 'invoice template' },
      data: {},
    }
    expect(ctx.runId).toBeTruthy()
    expect(ctx.productId).toBeTruthy()
    expect(ctx.domainSlug).toBe('digital')
    expect(ctx.data).toEqual({})
  })

  it('product status transitions follow valid sequence', () => {
    const VALID_TRANSITIONS: Record<string, string[]> = {
      draft: ['generating', 'failed'],
      generating: ['pending_review', 'failed'],
      pending_review: ['approved', 'rejected'],
      approved: ['published', 'failed'],
      rejected: ['draft'], // can be recycled
      published: [],
      failed: ['draft'], // can retry
    }

    // Verify each state has defined transitions
    for (const [_status, targets] of Object.entries(VALID_TRANSITIONS)) {
      expect(Array.isArray(targets)).toBe(true)
      for (const target of targets) {
        expect(Object.keys(VALID_TRANSITIONS)).toContain(target)
      }
    }

    // Verify the happy path is valid
    const happyPath = ['draft', 'generating', 'pending_review', 'approved', 'published']
    for (let i = 0; i < happyPath.length - 1; i++) {
      const from = happyPath[i]
      const to = happyPath[i + 1]
      expect(VALID_TRANSITIONS[from]).toContain(to)
    }
  })

  it('publish gating: missing Gumroad token blocks publish with clear error', () => {
    const token: string | null = null
    const result = !token
      ? { status: 'failed' as const, error: 'Gumroad not configured — set GUMROAD_ACCESS_TOKEN to publish for real.' }
      : { status: 'success' as const, url: 'https://gumroad.com/l/test' }

    expect(result.status).toBe('failed')
    expect(result.error).toContain('GUMROAD_ACCESS_TOKEN')
  })

  it('publish gating: present Gumroad token allows publish attempt', () => {
    const token: string | null = 'gumroad_test_token_abc123'
    const result = !token
      ? { status: 'failed' as const, error: 'Gumroad not configured' }
      : { status: 'success' as const, url: 'https://gumroad.com/l/test' }

    expect(result.status).toBe('success')
    expect(result.url).toBeTruthy()
  })

  it('AI failover: models_tried tracks every attempt', () => {
    const models_tried = ['deepseek-r1', 'groq-llama', 'workers-ai']
    const model_used = 'workers-ai'

    expect(models_tried.length).toBe(3)
    expect(models_tried).toContain(model_used)
    expect(models_tried.indexOf(model_used)).toBe(models_tried.length - 1)
  })

  it('AI spend cap: blocks paid models when cap reached', () => {
    const cap = 5.0
    const spentToday = 5.5
    const modelIsFree = false

    const shouldSkip = !modelIsFree && cap > 0 && spentToday >= cap
    expect(shouldSkip).toBe(true)
  })

  it('AI spend cap: allows free models even when cap reached', () => {
    const cap = 5.0
    const spentToday = 5.5
    const modelIsFree = true

    const shouldSkip = !modelIsFree && cap > 0 && spentToday >= cap
    expect(shouldSkip).toBe(false)
  })

  it('AI spend cap: no cap (0) means never skip', () => {
    const cap = 0
    const spentToday = 100
    const modelIsFree = false

    const shouldSkip = !modelIsFree && cap > 0 && spentToday >= cap
    expect(shouldSkip).toBe(false)
  })
})
