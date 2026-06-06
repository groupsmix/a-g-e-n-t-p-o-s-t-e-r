/**
 * Brain data source — single interface, pluggable implementations.
 *
 *   • `demoSource`    → ships now, returns synthetic fixtures so the UI
 *                       is shippable before nexus-api routes land.
 *   • `nexusApiSource`→ TODO: HTTP calls into the nexus-api worker once
 *                       /api/brain endpoints exist (TASK-300).
 *
 * The route handlers in app/api/brain/* pick the source based on an
 * environment flag (BRAIN_SOURCE=demo | nexus).  Switching is one env
 * var and no UI changes.
 */

import type {
  BrainSummaryDTO,
  JournalEntryDTO,
  MemoryItemDTO,
  NowEntryDTO,
  PersonaDTO,
  SignalDTO,
} from './types'

export interface BrainSource {
  readonly name: string
  listMemories(opts?: {
    type?: MemoryItemDTO['type']
    query?: string
    limit?: number
  }): Promise<MemoryItemDTO[]>
  listJournal(opts?: {
    limit?: number
    sinceISO?: string
  }): Promise<JournalEntryDTO[]>
  getPersona(): Promise<PersonaDTO>
  getNow(scope?: string): Promise<NowEntryDTO | null>
  listSignals(opts?: { limit?: number }): Promise<SignalDTO[]>
  getSummary(): Promise<BrainSummaryDTO>
}

// ─── demo source ──────────────────────────────────────────────────────

const NOW_ISO = () => new Date().toISOString()
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

const DEMO_MEMORIES: MemoryItemDTO[] = [
  {
    id: 'mem_001',
    type: 'identity',
    content: 'Owner: solo founder based in Casablanca, ships pragmatic tools, hates corporate bloat.',
    tags: ['owner', 'voice'],
    source: 'SOUL.md',
    importance: 0.95,
    createdAt: ago(7 * 86_400_000),
    updatedAt: ago(2 * 86_400_000),
  },
  {
    id: 'mem_002',
    type: 'preference',
    content: 'Prefers terse, lowercase prompts. No em-dashes. Leads with the ask.',
    tags: ['voice', 'style'],
    source: 'observation',
    importance: 0.8,
    createdAt: ago(5 * 86_400_000),
    updatedAt: ago(5 * 86_400_000),
  },
  {
    id: 'mem_003',
    type: 'project',
    content: 'PosterAgent V2 ALL-IN-ONE Money Machine Dashboard — 11 phases, brain layer first.',
    tags: ['posteragent', 'roadmap'],
    source: 'POSTERAGENT_TASKS_V2.md',
    importance: 0.9,
    createdAt: ago(3 * 86_400_000),
    updatedAt: ago(1 * 86_400_000),
  },
  {
    id: 'mem_004',
    type: 'fact',
    content: 'Source: Tavily search API — https://api.tavily.com (cited in research run rsx-014)',
    tags: ['research', 'citation'],
    source: 'agent-research',
    importance: 0.6,
    createdAt: ago(86_400_000),
    updatedAt: ago(86_400_000),
  },
  {
    id: 'mem_005',
    type: 'event',
    content: 'Phase 2 brain layer (memory + identity + proactivity) merged to main.',
    tags: ['milestone'],
    source: 'journal',
    importance: 0.7,
    createdAt: ago(60 * 60_000),
    updatedAt: ago(60 * 60_000),
  },
]

const DEMO_JOURNAL: JournalEntryDTO[] = [
  {
    id: 'jrn_001',
    taskId: 'tsk_research_014',
    agentId: 'Researcher',
    summary: 'Surveyed Q3 2026 DeFi yields across 4 sub-questions; produced 9 citations.',
    outcome: 'success',
    learnings: [
      'Tavily advanced depth returns better snippets than basic.',
      'Sonnet 4.5 needs explicit "no preamble" to skip "Here is the answer" intros.',
    ],
    followUps: ['Queue a write task to turn this into a thread.'],
    consolidated: false,
    createdAt: ago(45 * 60_000),
  },
  {
    id: 'jrn_002',
    taskId: 'tsk_publish_021',
    agentId: 'Publisher',
    summary: 'Posted weekly digest to X — 1.4k impressions in first hour.',
    outcome: 'success',
    learnings: ['Tuesday 10am Casablanca time outperformed Sunday for tech threads.'],
    followUps: [],
    consolidated: true,
    createdAt: ago(3 * 60 * 60_000),
  },
  {
    id: 'jrn_003',
    taskId: 'tsk_research_012',
    agentId: 'Researcher',
    summary: 'Research on cold-email lead sourcing failed — Tavily rate limit at sub-question 3.',
    outcome: 'failed',
    learnings: ['Hit Tavily 429 on burst > 5 parallel — confirms bounded concurrency was right call.'],
    followUps: ['Lower default searchConcurrency from 4 to 3 for Tavily basic tier.'],
    consolidated: false,
    createdAt: ago(8 * 60 * 60_000),
  },
]

const DEMO_PERSONA: PersonaDTO = {
  name: 'NEXUS',
  emoji: '🧠',
  tagline: 'Single-owner money machine. Ships before it asks.',
  soul: `# Voice
Lowercase by default. Terse. No em-dashes.

# Working style
- Lead with the ask. Skip preamble.
- Have an opinion. Pick a path, say why.
- Resourceful before asking. Read first.

# What I do NOT do
- Send anything user-facing without explicit sign-off.
- Ask permission for reversible reads.
`,
  updatedAt: ago(6 * 60 * 60_000),
}

const DEMO_NOW: NowEntryDTO = {
  scope: 'global',
  content: 'Phase 4: ship Deep Research handler and wire it into the orchestrator at boot.',
  setBy: 'NEXUS',
  expiresAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
  updatedAt: ago(30 * 60_000),
  expiresInMs: 4 * 60 * 60_000,
}

const DEMO_SIGNALS: SignalDTO[] = [
  {
    key: 'task-failed-burst:research:demo',
    kind: 'task-failed-burst',
    severity: 'urgent',
    title: "3 failures of 'research' in the last hour",
    detail: 'Pause queuing more of this type and inspect logs — likely an upstream / config issue.',
    score: 0.95,
    sources: [{ kind: 'task', id: 'research' }],
    observedAt: NOW_ISO(),
  },
  {
    key: 'follow-up:jrn_001:0',
    kind: 'follow-up',
    severity: 'notice',
    title: 'Queue a write task to turn this into a thread.',
    detail: 'From Researcher (success): "Surveyed Q3 2026 DeFi yields…"',
    score: 0.85,
    sources: [{ kind: 'journal', id: 'jrn_001' }],
    observedAt: NOW_ISO(),
  },
  {
    key: 'follow-up:jrn_003:0',
    kind: 'follow-up',
    severity: 'warn',
    title: 'Lower default searchConcurrency from 4 to 3 for Tavily basic tier.',
    detail: 'From Researcher (failed): "Research on cold-email lead sourcing failed…"',
    score: 0.78,
    sources: [{ kind: 'journal', id: 'jrn_003' }],
    observedAt: NOW_ISO(),
  },
  {
    key: 'consolidation-due:global',
    kind: 'consolidation-due',
    severity: 'notice',
    title: '27 unconsolidated journal entries',
    detail: 'Memory consolidation hasnt run recently; long-term recall will drift if this keeps growing.',
    score: 0.7,
    sources: [{ kind: 'journal', id: 'jrn_001' }],
    suggestion: {
      taskType: 'memory-consolidate',
      payload: { reason: 'consolidation-due', count: 27 },
      reason: 'crossed threshold',
    },
    observedAt: NOW_ISO(),
  },
]

export const demoSource: BrainSource = {
  name: 'demo',
  async listMemories({ type, query, limit = 50 } = {}) {
    const q = query?.toLowerCase().trim()
    let rows = DEMO_MEMORIES
    if (type) rows = rows.filter((m) => m.type === type)
    if (q) rows = rows.filter((m) => m.content.toLowerCase().includes(q))
    return rows.slice(0, limit)
  },
  async listJournal({ limit = 50, sinceISO } = {}) {
    let rows = DEMO_JOURNAL
    if (sinceISO) rows = rows.filter((j) => j.createdAt >= sinceISO)
    return rows.slice(0, limit)
  },
  async getPersona() {
    return DEMO_PERSONA
  },
  async getNow() {
    return {
      ...DEMO_NOW,
      expiresInMs: new Date(DEMO_NOW.expiresAt).getTime() - Date.now(),
    }
  },
  async listSignals({ limit = 25 } = {}) {
    return DEMO_SIGNALS.slice(0, limit)
  },
  async getSummary() {
    const byType = DEMO_MEMORIES.reduce<Record<string, number>>((acc, m) => {
      acc[m.type] = (acc[m.type] ?? 0) + 1
      return acc
    }, {})
    return {
      memories: { total: DEMO_MEMORIES.length, byType },
      journal: {
        last7d: DEMO_JOURNAL.length,
        unconsolidated: DEMO_JOURNAL.filter((j) => !j.consolidated).length,
      },
      signals: {
        total: DEMO_SIGNALS.length,
        urgent: DEMO_SIGNALS.filter((s) => s.severity === 'urgent').length,
      },
      persona: {
        name: DEMO_PERSONA.name,
        emoji: DEMO_PERSONA.emoji,
        tagline: DEMO_PERSONA.tagline,
      },
      now: {
        scope: DEMO_NOW.scope,
        content: DEMO_NOW.content,
        expiresInMs: new Date(DEMO_NOW.expiresAt).getTime() - Date.now(),
      },
    }
  },
}

// ─── nexus-api source (stub) ─────────────────────────────────────────

/**
 * Production source.  Wires to /api/brain/* on the nexus-api worker
 * once TASK-300 lands those endpoints.  Until then, returns the demo
 * source so the dashboard isn't broken in environments that flip
 * BRAIN_SOURCE=nexus prematurely.
 */
export function nexusApiSource(_opts: {
  baseUrl: string
  fetch?: typeof fetch
}): BrainSource {
  // TODO(TASK-300): replace this passthrough with real HTTP calls.
  return { ...demoSource, name: 'nexus-api (passthrough → demo)' }
}

// ─── chooser ──────────────────────────────────────────────────────────

export function chooseBrainSource(
  env: Record<string, string | undefined> = process.env,
): BrainSource {
  const mode = (env.BRAIN_SOURCE ?? 'demo').toLowerCase()
  if (mode === 'nexus') {
    const baseUrl = env.NEXUS_API_BASE_URL ?? 'http://localhost:8787'
    return nexusApiSource({ baseUrl })
  }
  return demoSource
}
