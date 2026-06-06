/**
 * Smoke tests for the identity layer's prompt assembly.
 * Storage-backed pieces (journal, now, persona) get their integration
 * coverage in the route wiring PR, against an actual D1 binding.
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SOUL,
  StaticSoulLoader,
  CachedSoulLoader,
  assembleSystemPrompt,
} from './soul.js'

describe('DEFAULT_SOUL', () => {
  it('starts with the NEXUS identity sentence', () => {
    expect(DEFAULT_SOUL.startsWith('You are NEXUS')).toBe(true)
  })

  it('forbids em-dashes in its own text', () => {
    expect(DEFAULT_SOUL).not.toMatch(/\u2014/)
  })
})

describe('CachedSoulLoader', () => {
  it('only calls the inner loader once', async () => {
    let calls = 0
    const inner = {
      async load() {
        calls += 1
        return 'soul-text'
      },
    }
    const c = new CachedSoulLoader(inner)
    await c.load()
    await c.load()
    await c.load()
    expect(calls).toBe(1)
  })

  it('refetches after invalidate', async () => {
    let calls = 0
    const inner = {
      async load() {
        calls += 1
        return `v${calls}`
      },
    }
    const c = new CachedSoulLoader(inner)
    expect(await c.load()).toBe('v1')
    c.invalidate()
    expect(await c.load()).toBe('v2')
  })
})

describe('assembleSystemPrompt', () => {
  it('emits just the soul when nothing else is provided', () => {
    expect(assembleSystemPrompt({ soul: 'I am NEXUS.' })).toBe('I am NEXUS.')
  })

  it('includes the NOW block when set', () => {
    const out = assembleSystemPrompt({
      soul: 'soul.',
      now: 'shipping the brain layer today',
    })
    expect(out).toContain('# Current focus')
    expect(out).toContain('shipping the brain layer today')
  })

  it('renders persona traits as a bulleted list', () => {
    const out = assembleSystemPrompt({
      soul: 'soul.',
      persona: ['never em-dash', 'always cite sources'],
    })
    expect(out).toContain('# Persona traits')
    expect(out).toContain('- never em-dash')
    expect(out).toContain('- always cite sources')
  })

  it('renders memory snippets as a bulleted list', () => {
    const out = assembleSystemPrompt({
      soul: 'soul.',
      memories: ['owner is in Casablanca', 'prefers terse replies'],
    })
    expect(out).toContain('# Relevant context')
    expect(out).toContain('- owner is in Casablanca')
  })

  it('blocks render in a stable order: soul, now, persona, memories', () => {
    const out = assembleSystemPrompt({
      soul: 'SOUL',
      now: 'NOW',
      persona: ['P1'],
      memories: ['M1'],
    })
    const soulIdx = out.indexOf('SOUL')
    const nowIdx = out.indexOf('NOW')
    const personaIdx = out.indexOf('P1')
    const memoryIdx = out.indexOf('M1')
    expect(soulIdx).toBeLessThan(nowIdx)
    expect(nowIdx).toBeLessThan(personaIdx)
    expect(personaIdx).toBeLessThan(memoryIdx)
  })
})

describe('StaticSoulLoader', () => {
  it('returns the text it was constructed with', async () => {
    const l = new StaticSoulLoader('hello')
    expect(await l.load()).toBe('hello')
  })
})
