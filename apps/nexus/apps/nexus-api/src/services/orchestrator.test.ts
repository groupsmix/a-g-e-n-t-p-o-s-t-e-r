import { describe, it, expect } from 'vitest'
import {
  RunError,
  inflateTask,
  validateRunBody,
} from './orchestrator-bridge'
import {
  defaultStubHandler,
  type AgentTaskRow,
} from './orchestrator-stub.legacy'

/**
 * Pure-logic tests for the orchestrator service.  D1-touching paths
 * (runAgentTask, persistOutcome) are exercised in an integration
 * smoke test against `wrangler dev` — not in this file.
 */
describe('validateRunBody', () => {
  it('accepts taskId form', () => {
    const args = validateRunBody({ taskId: 'abc123' })
    expect(args.taskId).toBe('abc123')
    expect(args.force).toBe(false)
  })

  it('accepts taskId with force', () => {
    const args = validateRunBody({ taskId: 'abc123', force: true })
    expect(args.force).toBe(true)
  })

  it('accepts create{} form', () => {
    const args = validateRunBody({
      create: { type: 'research', payload: { question: 'why' } },
    })
    expect(args.create?.type).toBe('research')
    expect(args.create?.payload).toEqual({ question: 'why' })
    expect(args.create?.origin).toBe('api')
  })

  it('accepts top-level shorthand', () => {
    const args = validateRunBody({ type: 'write', payload: { topic: 'x' } })
    expect(args.create?.type).toBe('write')
    expect(args.create?.payload).toEqual({ topic: 'x' })
  })

  it('rejects invalid type', () => {
    expect(() => validateRunBody({ type: 'invalid' })).toThrow(RunError)
    expect(() => validateRunBody({ create: { type: 'invalid' } })).toThrow(
      RunError,
    )
  })

  it('rejects empty body', () => {
    expect(() => validateRunBody({})).toThrow(RunError)
    expect(() => validateRunBody(null)).toThrow(RunError)
    expect(() => validateRunBody('string')).toThrow(RunError)
  })

  it('RunError carries an HTTP status', () => {
    try {
      validateRunBody({ type: 'nope' })
    } catch (err) {
      expect(err).toBeInstanceOf(RunError)
      expect((err as RunError).status).toBe(400)
    }
  })
})

describe('defaultStubHandler', () => {
  it('returns done with stub:true', async () => {
    const handler = defaultStubHandler('write')
    const outcome = await handler({
      taskId: 'tsk_1',
      type: 'write',
      payload: { topic: 'cats' },
      db: null as unknown as never,
    })
    expect(outcome.status).toBe('done')
    expect(outcome.result?.stub).toBe(true)
    expect(outcome.result?.type).toBe('write')
    expect(outcome.cost?.actualUsd).toBe(0)
    expect(outcome.cost?.modelUsed).toBe('stub')
  })

  it('echoes the payload', async () => {
    const handler = defaultStubHandler('analyse')
    const outcome = await handler({
      taskId: 'tsk_2',
      type: 'analyse',
      payload: { foo: 'bar' },
      db: null as unknown as never,
    })
    expect(outcome.result?.echoedPayload).toEqual({ foo: 'bar' })
  })
})

describe('inflateTask', () => {
  it('parses JSON columns', () => {
    const row: AgentTaskRow = {
      id: '1',
      type: 'research',
      status: 'done',
      payload: '{"q":"x"}',
      result: '{"a":1}',
      error: null,
      estimated_cost_usd: 0.1,
      actual_cost_usd: 0.09,
      model_used: 'claude-sonnet-4.5',
      input_tokens: 100,
      output_tokens: 200,
      agent_id: null,
      origin: 'api',
      parent_task_id: null,
      created_at: '2026-06-06',
      updated_at: '2026-06-06',
      started_at: '2026-06-06',
      finished_at: '2026-06-06',
      duration_ms: 1500,
    }
    const inflated = inflateTask(row) as { payload: unknown; result: unknown }
    expect(inflated.payload).toEqual({ q: 'x' })
    expect(inflated.result).toEqual({ a: 1 })
  })

  it('survives corrupt JSON', () => {
    const row = {
      id: '1',
      type: 'research',
      status: 'done',
      payload: 'not json',
      result: null,
      error: null,
      estimated_cost_usd: null,
      actual_cost_usd: null,
      model_used: null,
      input_tokens: null,
      output_tokens: null,
      agent_id: null,
      origin: 'api',
      parent_task_id: null,
      created_at: '2026-06-06',
      updated_at: '2026-06-06',
      started_at: null,
      finished_at: null,
      duration_ms: null,
    } as AgentTaskRow
    const inflated = inflateTask(row) as { payload: unknown; result: unknown }
    expect(inflated.payload).toBe('not json')
    expect(inflated.result).toBeNull()
  })
})
