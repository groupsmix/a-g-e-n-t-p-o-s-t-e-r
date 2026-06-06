/**
 * Tests for the command palette intent parser.
 *
 * Coverage target: at least one realistic phrase per AgentTaskType, plus
 * disambiguation regressions (e.g. "analyse finances" must NOT be the
 * generic analyse intent).
 */

import { describe, it, expect } from 'vitest'
import { parseIntent, parseIntents, SUPPORTED_TASK_TYPES } from './intent'
import type { AgentTaskType } from '@posteragent/types'

const CASES: Array<{
  query: string
  type: AgentTaskType
  route?: string
  payloadContains?: Record<string, unknown>
}> = [
  // research
  { query: 'research transformer architecture', type: 'research', route: '/research', payloadContains: { topic: 'transformer architecture' } },
  { query: 'investigate cosmic js pricing', type: 'research', payloadContains: { topic: 'cosmic js pricing' } },
  { query: 'find out about Llama 3 inference cost', type: 'research', payloadContains: { topic: 'Llama 3 inference cost' } },

  // write
  { query: 'write a blog post about edge runtimes', type: 'write', route: '/content', payloadContains: { brief: 'edge runtimes' } },
  { query: 'draft a thread on stoicism', type: 'write', payloadContains: { brief: 'stoicism' } },
  { query: 'write newsletter about agentic RAG', type: 'write', payloadContains: { brief: 'agentic RAG' } },

  // build-app
  { query: 'build an app for tracking habits', type: 'build-app', route: '/builder', payloadContains: { idea: 'tracking habits' } },
  { query: 'build app to summarise pdfs', type: 'build-app', payloadContains: { idea: 'summarise pdfs' } },
  { query: 'ship app voice journal', type: 'build-app', payloadContains: { idea: 'voice journal' } },

  // build-site
  { query: 'build a website for my newsletter', type: 'build-site', route: '/builder', payloadContains: { idea: 'my newsletter' } },
  { query: 'build landing page for the new course', type: 'build-site', payloadContains: { idea: 'the new course' } },
  { query: 'build site about AI tooling', type: 'build-site' },

  // publish
  { query: 'publish the latest video everywhere', type: 'publish', route: '/publisher' },
  { query: 'post to instagram', type: 'publish' },
  { query: 'tweet about the launch', type: 'publish' },

  // analyse (must avoid stealing financial-analysis cases)
  { query: 'analyse the latest video performance', type: 'analyse', route: '/analyse' },
  { query: 'audit my SEO setup', type: 'analyse' },
  { query: 'review last month engagement', type: 'analyse' },

  // generate-video
  { query: 'generate a video about black holes', type: 'generate-video', route: '/content', payloadContains: { topic: 'black holes' } },
  { query: 'make a tiktok about cold plunges', type: 'generate-video', payloadContains: { topic: 'cold plunges' } },
  { query: 'render a short reel of the demo', type: 'generate-video' },

  // generate-image
  { query: 'generate an image of a cyberpunk cat', type: 'generate-image', route: '/content', payloadContains: { prompt: 'a cyberpunk cat' } },
  { query: 'make a poster for the launch', type: 'generate-image', payloadContains: { prompt: 'the launch' } },
  { query: 'draw a thumbnail about productivity', type: 'generate-image' },

  // lead-scrape
  { query: 'find leads for indie SaaS founders', type: 'lead-scrape', route: '/leads', payloadContains: { query: 'indie SaaS founders' } },
  { query: 'scrape leads from r/saas', type: 'lead-scrape', payloadContains: { query: 'from r/saas' } },
  { query: 'prospect newsletter operators', type: 'lead-scrape', payloadContains: { query: 'newsletter operators' } },

  // email-campaign
  { query: 'email campaign for free trial users', type: 'email-campaign', route: '/leads', payloadContains: { brief: 'free trial users' } },
  { query: 'send cold email to YC founders', type: 'email-campaign', payloadContains: { brief: 'YC founders' } },
  { query: 'send newsletter about the new feature', type: 'email-campaign', payloadContains: { format: 'newsletter' } },

  // financial-analysis (specifically — must NOT be parsed as `analyse`)
  { query: 'analyse my finances', type: 'financial-analysis', route: '/revenue', payloadContains: { focus: 'overall' } },
  { query: 'review revenue', type: 'financial-analysis' },
  { query: 'show me my p&l', type: 'financial-analysis' },

  // brand-monitor
  { query: 'monitor mentions of nexus', type: 'brand-monitor', route: '/analyse', payloadContains: { brand: 'nexus' } },
  { query: 'track the brand posteragent', type: 'brand-monitor', payloadContains: { brand: 'posteragent' } },
  { query: 'mentions for my newsletter', type: 'brand-monitor' },

  // autonome-run
  { query: 'autonome', type: 'autonome-run', route: '/autonome' },
  { query: 'autonome go', type: 'autonome-run' },
  { query: 'autopilot tick', type: 'autonome-run' },
  { query: 'run the autonome', type: 'autonome-run' },

  // memory-consolidate
  { query: 'consolidate memory', type: 'memory-consolidate', route: '/brain' },
  { query: 'remember that we use pnpm 9.15.0 pinned via packageManager', type: 'memory-consolidate', payloadContains: { fact: 'we use pnpm 9.15.0 pinned via packageManager' } },
  { query: 'sweep my memory', type: 'memory-consolidate' },
]

describe('parseIntent', () => {
  describe.each(CASES)('"$query" → $type', ({ query, type, route, payloadContains }) => {
    const intent = parseIntent(query)

    it('returns an intent', () => {
      expect(intent).not.toBeNull()
    })

    it(`maps to ${type}`, () => {
      expect(intent?.type).toBe(type)
    })

    if (route) {
      it(`routes to ${route}`, () => {
        expect(intent?.route).toBe(route)
      })
    }

    if (payloadContains) {
      it('payload contains the right fields', () => {
        for (const [key, value] of Object.entries(payloadContains)) {
          expect(intent?.payload[key]).toBe(value)
        }
      })
    }

    it('score is in [0, 1]', () => {
      expect(intent?.score).toBeGreaterThan(0)
      expect(intent?.score).toBeLessThanOrEqual(1)
    })
  })
})

describe('parseIntent — disambiguation', () => {
  it('"analyse finances" routes to financial-analysis, not generic analyse', () => {
    expect(parseIntent('analyse my finances')?.type).toBe('financial-analysis')
  })

  it('"analyse the latest video" stays as generic analyse', () => {
    expect(parseIntent('analyse the latest video')?.type).toBe('analyse')
  })

  it('"build an app" stays as build-app even with site-like words later', () => {
    expect(parseIntent('build an app for landing page editing')?.type).toBe('build-app')
  })

  it('"build a website" routes to build-site', () => {
    expect(parseIntent('build a website for my coaching biz')?.type).toBe('build-site')
  })
})

describe('parseIntent — edge cases', () => {
  it('returns null for empty input', () => {
    expect(parseIntent('')).toBeNull()
    expect(parseIntent('   ')).toBeNull()
  })

  it('returns null for unrelated input', () => {
    expect(parseIntent('hello there general kenobi')).toBeNull()
    expect(parseIntent('asdfghjkl')).toBeNull()
  })

  it('returns null when verb has no object', () => {
    expect(parseIntent('research')).toBeNull()
    expect(parseIntent('write')).toBeNull()
    expect(parseIntent('publish')).toBeNull()
  })

  it('autonome works WITHOUT an object (the run itself is the action)', () => {
    expect(parseIntent('autonome')?.type).toBe('autonome-run')
    expect(parseIntent('autopilot')?.type).toBe('autonome-run')
  })

  it('consolidate memory works WITHOUT an object', () => {
    expect(parseIntent('consolidate memory')?.type).toBe('memory-consolidate')
  })

  it('is case-insensitive on the verb', () => {
    expect(parseIntent('RESEARCH transformers')?.type).toBe('research')
    expect(parseIntent('Write a blog about agents')?.type).toBe('write')
  })

  it('clips long labels to keep the palette compact', () => {
    const long = 'a'.repeat(200)
    const intent = parseIntent(`research ${long}`)
    expect(intent?.label.length).toBeLessThanOrEqual(60)
  })
})

describe('parseIntents — multi-candidate', () => {
  it('returns hits sorted by score descending', () => {
    const hits = parseIntents('research transformer architecture')
    expect(hits.length).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score)
    }
  })

  it('returns [] for empty / unmatched input', () => {
    expect(parseIntents('')).toEqual([])
    expect(parseIntents('xyz')).toEqual([])
  })
})

describe('coverage — all AgentTaskType values', () => {
  it('every task type has at least one passing test case', () => {
    const coveredByTests = new Set(CASES.map((c) => c.type))
    const uncovered: string[] = []
    for (const type of SUPPORTED_TASK_TYPES) {
      if (!coveredByTests.has(type)) uncovered.push(type)
    }
    expect(uncovered).toEqual([])
  })
})
