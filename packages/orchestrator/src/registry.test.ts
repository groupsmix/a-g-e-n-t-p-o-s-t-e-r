import { describe, it, expect } from 'vitest'
import type { AgentTaskType } from '@posteragent/types'
import { AgentRegistry, defaultRegistry } from './registry.js'
import { defineStub } from './handlers/_stub.js'
import type { AgentContext, AgentHandler } from './types.js'

describe('AgentRegistry', () => {
  it('registers and looks up by type', () => {
    const r = new AgentRegistry()
    const h = defineStub({
      type: 'research',
      name: 'X',
      description: 'd',
      phase: 'P',
    })
    r.register(h)
    expect(r.get('research')?.name).toBe('X')
    expect(r.has('research')).toBe(true)
    expect(r.has('write')).toBe(false)
  })

  it('throws on duplicate register, allows override', () => {
    const r = new AgentRegistry()
    const a = defineStub({
      type: 'research',
      name: 'A',
      description: 'a',
      phase: 'P',
    })
    const b = defineStub({
      type: 'research',
      name: 'B',
      description: 'b',
      phase: 'P',
    })
    r.register(a)
    expect(() => r.register(b)).toThrow(/already registered/)
    r.override(b)
    expect(r.get('research')?.name).toBe('B')
  })

  it('describe() returns capabilities shape', () => {
    const r = new AgentRegistry()
    r.register(
      defineStub({
        type: 'publish',
        name: 'Pub',
        description: 'Publishes things.',
        phase: 'P7',
      }),
    )
    const out = r.describe()
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      type: 'publish',
      name: 'Pub',
      description: 'Publishes things.',
    })
  })
})

describe('defaultRegistry', () => {
  it('registers every AgentTaskType in the type union', () => {
    const r = defaultRegistry()
    // This is the exhaustiveness check — every type in the union must
    // be present.  If a new AgentTaskType is added without a handler,
    // either the registry import will fail or this assertion will.
    const required: AgentTaskType[] = [
      'research',
      'write',
      'build-app',
      'build-site',
      'publish',
      'analyse',
      'generate-video',
      'generate-image',
      'lead-scrape',
      'email-campaign',
      'financial-analysis',
      'brand-monitor',
      'autonome-run',
      'memory-consolidate',
    ]
    for (const t of required) {
      expect(r.has(t)).toBe(true)
    }
    expect(r.types()).toHaveLength(required.length)
  })

  it('every handler returns a stub outcome without throwing', async () => {
    const r = defaultRegistry()
    for (const handler of r.describe()) {
      const h = r.get(handler.type)!
      const fakeCtx: AgentContext = {
        task: {
          id: 't1',
          type: handler.type,
          payload: {},
          status: 'running',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        systemPrompt: 'soul',
        memories: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db: {} as any,
        log: silentLogger,
        signal: new AbortController().signal,
      }
      const outcome = await h.run(fakeCtx)
      expect(outcome.summary).toBeTypeOf('string')
      expect(outcome.summary.length).toBeGreaterThan(0)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((outcome.data as any)?.stub).toBe(true)
    }
  })
})

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('handler type discipline', () => {
  it('every built-in handler exposes type+name+description+run', () => {
    const r = defaultRegistry()
    for (const t of r.types()) {
      const h = r.get(t)! as AgentHandler
      expect(h.type).toBe(t)
      expect(typeof h.name).toBe('string')
      expect(typeof h.description).toBe('string')
      expect(typeof h.run).toBe('function')
    }
  })
})
