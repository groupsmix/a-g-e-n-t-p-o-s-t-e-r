import { describe, expect, it } from 'vitest'
import { mapAICallTraceRow } from './workflow'

describe('mapAICallTraceRow', () => {
  it('parses workflow ai call json fields into typed arrays', () => {
    const result = mapAICallTraceRow({
      id: 'call-1',
      ts: '2026-06-12T00:00:00.000Z',
      task_type: 'generate_content',
      model_used: 'deepseek-v3',
      source: 'model',
      models_tried_json: '["claude","deepseek-v3"]',
      attempts_json: '[{"model":"claude","provider":"anthropic","latencyMs":321,"status":"failed","errorClass":"RateLimitError"},{"model":"deepseek-v3","provider":"deepseek","latencyMs":654,"status":"success","tokensIn":50,"tokensOut":80}]',
      tokens_in: 50,
      tokens_out: 80,
      cost_usd: 0.123,
      latency_ms: 975,
      caller: 'workflow-engine',
      workflow_id: 'wf-1',
      ok: 1,
    })

    expect(result.models_tried).toEqual(['claude', 'deepseek-v3'])
    expect(result.attempts).toHaveLength(2)
    expect(result.ok).toBe(true)
    expect(result.caller).toBe('workflow-engine')
  })

  it('falls back safely on invalid json', () => {
    const result = mapAICallTraceRow({
      id: 'call-2',
      ts: '2026-06-12T00:00:00.000Z',
      task_type: 'generate_content',
      model_used: null,
      source: null,
      models_tried_json: '{bad json',
      attempts_json: 'null',
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      latency_ms: null,
      caller: null,
      workflow_id: null,
      ok: 0,
    })

    expect(result.models_tried).toEqual([])
    expect(result.attempts).toEqual([])
    expect(result.tokens_in).toBe(0)
    expect(result.caller).toBe('unknown')
    expect(result.ok).toBe(false)
  })
})
