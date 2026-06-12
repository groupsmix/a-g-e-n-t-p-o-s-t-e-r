/**
 * Worker-local agent registry — single source of truth for what
 * agent types exist on the nexus-api side, what they cost (broad
 * estimate), and whether a real handler is wired (vs. a stub).
 *
 * This mirrors @posteragent/orchestrator's AgentRegistry but stays
 * self-contained per the nested-workspace convention used elsewhere
 * in this worker (see `routes/tasks.ts` for the same rationale).
 *
 * Shapes are kept in lock-step with `@posteragent/types#AgentTaskType`
 * (the 14-member union enforced by the `agent_tasks` CHECK constraint
 * in migration 023).
 */

import type { Env } from '../env'

export const AGENT_TASK_TYPES = [
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
] as const

export type AgentTaskType = (typeof AGENT_TASK_TYPES)[number]

/** Implementation maturity — drives the status badge in the dashboard. */
export type AgentStatus = 'real_wired' | 'real_not_wired' | 'stub_by_design' | 'not_supported'

export interface AgentDescriptor {
  type: AgentTaskType
  /** Human-readable name surfaced in the command palette + registry UI. */
  name: string
  /** One-line capability description. */
  description: string
  /** Implementation status. */
  status: AgentStatus
  /** Rough cost band shown next to the agent in the dashboard. */
  costBand: 'free' | 'cheap' | 'mid' | 'high'
  /** Estimated USD spend per typical invocation (for KPI rollups). */
  estimatedCostUsd: number
  /** Tags used for filtering / grouping in the registry view. */
  tags: string[]
}

// ── Registry ──────────────────────────────────────────────────────────────

const REGISTRY: Record<AgentTaskType, Omit<AgentDescriptor, 'status'>> = {
  research: {
    type: 'research',
    name: 'Deep Researcher',
    description: 'Multi-sub-question web research with citations. Anthropic + Tavily.',
    costBand: 'mid',
    estimatedCostUsd: 0.18,
    tags: ['research', 'web'],
  },
  write: {
    type: 'write',
    name: 'Writer',
    description: 'Long-form content from a brief, voice-locked to SOUL.md.',
    costBand: 'cheap',
    estimatedCostUsd: 0.04,
    tags: ['content', 'longform'],
  },
  'build-app': {
    type: 'build-app',
    name: 'App Builder',
    description: 'Scaffolds a small app skeleton from a spec.',
    costBand: 'high',
    estimatedCostUsd: 0.6,
    tags: ['builder', 'code'],
  },
  'build-site': {
    type: 'build-site',
    name: 'Site Factory',
    description: 'Generates a multi-page marketing site from a brief.',
    costBand: 'mid',
    estimatedCostUsd: 0.25,
    tags: ['builder', 'site'],
  },
  publish: {
    type: 'publish',
    name: 'Publisher',
    description: 'Pushes drafted content to a target platform via its adapter.',
    costBand: 'free',
    estimatedCostUsd: 0,
    tags: ['publish', 'social'],
  },
  analyse: {
    type: 'analyse',
    name: 'Analyst',
    description: 'Summarises a corpus or signal stream into a one-pager.',
    costBand: 'cheap',
    estimatedCostUsd: 0.05,
    tags: ['analysis'],
  },
  'generate-video': {
    type: 'generate-video',
    name: 'Video Generator',
    description: 'Stitches a short video from a script via Remotion + a TTS voice.',
    costBand: 'high',
    estimatedCostUsd: 0.8,
    tags: ['content', 'video'],
  },
  'generate-image': {
    type: 'generate-image',
    name: 'Image Generator',
    description: 'Renders a single image from a prompt via FAL or Replicate.',
    costBand: 'cheap',
    estimatedCostUsd: 0.02,
    tags: ['content', 'image'],
  },
  'lead-scrape': {
    type: 'lead-scrape',
    name: 'Lead Scraper',
    description: 'Pulls a contact list from a public source against a query.',
    costBand: 'mid',
    estimatedCostUsd: 0.15,
    tags: ['leads', 'crm'],
  },
  'email-campaign': {
    type: 'email-campaign',
    name: 'Email Campaign',
    description: 'Drafts + schedules a multi-step email sequence to a list.',
    costBand: 'cheap',
    estimatedCostUsd: 0.08,
    tags: ['email', 'crm'],
  },
  'financial-analysis': {
    type: 'financial-analysis',
    name: 'Financial Analyst',
    description: 'Pulls KPIs across revenue sources into a single brief.',
    costBand: 'cheap',
    estimatedCostUsd: 0.06,
    tags: ['analysis', 'revenue'],
  },
  'brand-monitor': {
    type: 'brand-monitor',
    name: 'Brand Monitor',
    description: 'Scans mentions across platforms for sentiment + urgency.',
    costBand: 'cheap',
    estimatedCostUsd: 0.07,
    tags: ['analysis', 'brand'],
  },
  'autonome-run': {
    type: 'autonome-run',
    name: 'Autonome',
    description: 'Runs a scheduled multi-step goal until completion or budget.',
    costBand: 'high',
    estimatedCostUsd: 1.2,
    tags: ['autonome', 'scheduled'],
  },
  'memory-consolidate': {
    type: 'memory-consolidate',
    name: 'Memory Consolidator',
    description: 'Folds unconsolidated journal entries into long-term memories.',
    costBand: 'free',
    estimatedCostUsd: 0,
    tags: ['brain', 'maintenance'],
  },
}

/** Compute status of each handler dynamically based on available configuration */
export async function getAgentStatus(type: AgentTaskType, env?: Env): Promise<AgentStatus> {
  if (!env) {
    if (type === 'research' || type === 'memory-consolidate' || type === 'write' || type === 'autonome-run' || type === 'analyse' || type === 'financial-analysis') {
      return 'real_not_wired'
    }
    return 'stub_by_design'
  }

  switch (type) {
    case 'research': {
      const anthropicKey = env.SECRETS ? await env.SECRETS.get('ANTHROPIC_API_KEY').catch(() => null) : null
      const tavilyKey = env.SECRETS ? await env.SECRETS.get('TAVILY_API_KEY').catch(() => null) : null
      return (anthropicKey && tavilyKey) ? 'real_wired' : 'real_not_wired'
    }
    case 'write': {
      const anthropicKey = env.SECRETS ? await env.SECRETS.get('ANTHROPIC_API_KEY').catch(() => null) : null
      return anthropicKey ? 'real_wired' : 'real_not_wired'
    }
    case 'memory-consolidate':
    case 'autonome-run':
    case 'analyse': {
      // Memory consolidator, autonome tick, and platform analytics are native
      return 'real_wired'
    }
    case 'financial-analysis': {
      const amazonReportUrl = env.SECRETS ? await env.SECRETS.get('AMAZON_REPORT_URL').catch(() => null) : null
      const hasAdapter = env.GUMROAD_ACCESS_TOKEN || amazonReportUrl
      return hasAdapter ? 'real_wired' : 'real_not_wired'
    }
    default:
      return 'stub_by_design'
  }
}

/** Read-only access to the full descriptor map. */
export async function listAgents(env?: Env): Promise<AgentDescriptor[]> {
  const list: AgentDescriptor[] = []
  for (const t of AGENT_TASK_TYPES) {
    const desc = REGISTRY[t]
    const status = await getAgentStatus(t, env)
    list.push({ ...desc, status })
  }
  return list
}

export async function getAgent(type: string, env?: Env): Promise<AgentDescriptor | null> {
  if (!isAgentTaskType(type)) return null
  const desc = REGISTRY[type]
  const status = await getAgentStatus(type, env)
  return { ...desc, status }
}

export function isAgentTaskType(value: unknown): value is AgentTaskType {
  return (
    typeof value === 'string' &&
    (AGENT_TASK_TYPES as readonly string[]).includes(value)
  )
}

/** Quick group/filter helpers used by the registry route. */
export async function listAgentsByStatus(status: AgentStatus, env?: Env): Promise<AgentDescriptor[]> {
  const list = await listAgents(env)
  return list.filter((a) => a.status === status)
}

export async function listAgentsByTag(tag: string, env?: Env): Promise<AgentDescriptor[]> {
  const list = await listAgents(env)
  return list.filter((a) => a.tags.includes(tag))
}
