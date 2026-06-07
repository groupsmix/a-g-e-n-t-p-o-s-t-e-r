/**
 * money-machine-chain.ts
 *
 * One function, four orchestrator handler calls, chained:
 *
 *   research  (web + brain RAG)
 *      ↓ findings + narrative
 *   write     (multi-format content)
 *      ↓ pieces[] per format
 *   generate-image (optional poster per piece)
 *      ↓ image url
 *   publish   (to all target platforms with idempotency)
 *
 * Each call goes through `runAgentTask` so it gets BaseAgent (memory
 * retrieval + identity prompt + journal write + cost tracking). This
 * means every step contributes to the brain layer — what worked, what
 * failed, what to revisit — without the chain having to manage that
 * itself.
 *
 * Why an in-process chain instead of queue chaining? Three reasons:
 *   1. Latency — the chain finishes in one cron tick, not four.
 *   2. State passing — output of one stage feeds the next as in-memory
 *      JSON, no DB round-trip per hop.
 *   3. Atomicity — if any stage fails, the chain stops cleanly and the
 *      brain layer records the partial outcome.
 *
 * For the queue-chained version (good for long-running pipelines or
 * when you want manual approval gates between stages), see
 * `enqueueChainAsQueueDriven` at the bottom.
 */

import type { Env } from '../env'
import { createLogger } from '@nexus/logger'

import { runAgentTask } from '@posteragent/orchestrator'
import type { AgentTaskType } from '@posteragent/types'

import { getWiredRegistry } from './orchestrator-bridge'

const logger = createLogger({ service: 'money-machine-chain' })

// ─── Input / output shape ─────────────────────────────────────────────────

export interface MoneyMachineChainInput {
  /** What to research / write about. */
  topic: string
  /** Niche label used by the image prompt builder. */
  niche: string

  /** Output formats the writer should produce. */
  formats?: Array<'blog' | 'thread' | 'instagram' | 'linkedin' | 'newsletter' | 'tiktok' | 'youtube_script'>

  /** Target publish platforms. Empty = skip publish stage. */
  platforms?: Array<'x' | 'linkedin' | 'instagram' | 'tiktok' | 'youtube' | 'threads' | 'pinterest' | 'newsletter' | 'blog'>

  /** Generate a poster per piece? Default true. */
  withImage?: boolean

  /** Skip research and feed your own narrative straight to write. */
  skipResearch?: boolean
  ownNarrative?: string

  /** Schedule all published posts for a future time (ISO). */
  publishAt?: string

  /** Style hint for the writer. */
  style?: 'casual' | 'authoritative' | 'punchy'

  /** Free-form brand context appended to the writer's brief. */
  brandContext?: string
}

export interface MoneyMachineChainResult {
  chainId: string
  stages: {
    research?: StageOutcome
    write?: StageOutcome
    generateImage?: StageOutcome
    publish?: StageOutcome
  }
  status: 'completed' | 'partial' | 'failed'
  durationMs: number
}

interface StageOutcome {
  taskId: string
  status: 'done' | 'failed'
  data?: unknown
  error?: string
  costUsd?: number
}

// ─── Chain runner ─────────────────────────────────────────────────────────

export async function runMoneyMachineChain(
  env: Env,
  input: MoneyMachineChainInput,
): Promise<MoneyMachineChainResult> {
  const chainId = crypto.randomUUID().replace(/-/g, '')
  const startedAt = Date.now()
  const registry = await getWiredRegistry(env)

  const stages: MoneyMachineChainResult['stages'] = {}
  let researchData: { narrative?: string; citations?: Array<{ url: string; title: string }>; findings?: unknown[] } | undefined

  // ── Stage 1: research ───────────────────────────────────────────────
  if (!input.skipResearch) {
    const taskId = await enqueueAndRun(env, registry, 'research', {
      query: input.topic,
    }, chainId)
    stages.research = taskId
    if (taskId.status === 'done') {
      researchData = (taskId.data as { narrative?: string; citations?: Array<{ url: string; title: string }> }) ?? undefined
    } else {
      logger.warn('chain: research failed, continuing without it', {
        chainId,
        error: taskId.error,
      })
    }
  } else if (input.ownNarrative) {
    researchData = { narrative: input.ownNarrative, citations: [] }
  }

  // ── Stage 2: write ──────────────────────────────────────────────────
  const writeOutcome = await enqueueAndRun(env, registry, 'write', {
    brief: input.brandContext
      ? `${input.topic}\n\nBrand context: ${input.brandContext}`
      : input.topic,
    formats: input.formats ?? ['blog', 'thread', 'instagram'],
    research: researchData,
    style: input.style ?? 'punchy',
  }, chainId)
  stages.write = writeOutcome

  if (writeOutcome.status !== 'done') {
    return finalize(chainId, stages, startedAt, 'failed')
  }

  const writeData = writeOutcome.data as { pieces?: Array<{ format: string; title: string; body?: string; parts?: string[] }> }
  const pieces = writeData.pieces ?? []
  if (pieces.length === 0) {
    return finalize(chainId, stages, startedAt, 'failed')
  }

  // ── Stage 3: generate-image (per piece, optional) ───────────────────
  let imageUrl: string | undefined
  if (input.withImage !== false) {
    const imgOutcome = await enqueueAndRun(env, registry, 'generate-image', {
      topic: pieces[0]?.title ?? input.topic,
      niche: input.niche,
      style: 'bold_typographic',
      aspectRatio: '1:1',
    }, chainId)
    stages.generateImage = imgOutcome
    if (imgOutcome.status === 'done') {
      const d = imgOutcome.data as { urls?: string[] }
      imageUrl = d.urls?.[0]
    }
  }

  // ── Stage 4: publish (per platform) ─────────────────────────────────
  if (input.platforms && input.platforms.length > 0) {
    const jobs = input.platforms.map((platform) => {
      const piece = pickPieceForPlatform(pieces, platform)
      return {
        platform,
        title: piece.title,
        parts: piece.parts ?? (piece.body ? [piece.body] : []),
        publishAt: input.publishAt,
        media: imageUrl ? { kind: 'image', url: imageUrl } : undefined,
        meta: { chainId },
      }
    })
    const pubOutcome = await enqueueAndRun(env, registry, 'publish', { jobs }, chainId)
    stages.publish = pubOutcome
  }

  const status: MoneyMachineChainResult['status'] =
    Object.values(stages).every((s) => s?.status === 'done')
      ? 'completed'
      : Object.values(stages).some((s) => s?.status === 'done')
        ? 'partial'
        : 'failed'

  return finalize(chainId, stages, startedAt, status)
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Enqueue an agent_tasks row and run it through the orchestrator
 * immediately. Returns the StageOutcome shape.
 */
async function enqueueAndRun(
  env: Env,
  registry: Awaited<ReturnType<typeof getWiredRegistry>>,
  type: AgentTaskType,
  payload: Record<string, unknown>,
  chainId: string,
): Promise<StageOutcome> {
  const id = crypto.randomUUID().replace(/-/g, '')
  const now = new Date().toISOString()
  await env.DB
    .prepare(
      `INSERT INTO agent_tasks
         (id, type, payload, status, agent_id, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, ?, ?)`,
    )
    .bind(
      id,
      type,
      JSON.stringify({ ...payload, chainId }),
      `chain:${chainId}`,
      now,
      now,
    )
    .run()

  try {
    const result = await runAgentTask(id, {
      db: env.DB as never,
      registry,
      log: logger as never,
    })
    return {
      taskId: id,
      status: result.status === 'done' ? 'done' : 'failed',
      data: result.data,
      error: result.error,
      costUsd: result.costUsd,
    }
  } catch (err) {
    return {
      taskId: id,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function pickPieceForPlatform(
  pieces: Array<{ format: string; title: string; body?: string; parts?: string[] }>,
  platform: string,
): { title: string; body?: string; parts?: string[] } {
  const preferred: Record<string, string> = {
    x: 'thread',
    linkedin: 'linkedin',
    instagram: 'instagram',
    threads: 'thread',
    tiktok: 'tiktok',
    youtube: 'youtube_script',
    newsletter: 'newsletter',
    blog: 'blog',
    pinterest: 'instagram',
  }
  const want = preferred[platform] ?? 'blog'
  return pieces.find((p) => p.format === want) ?? pieces[0]
}

function finalize(
  chainId: string,
  stages: MoneyMachineChainResult['stages'],
  startedAt: number,
  status: MoneyMachineChainResult['status'],
): MoneyMachineChainResult {
  return {
    chainId,
    stages,
    status,
    durationMs: Date.now() - startedAt,
  }
}

// ─── Queue-driven variant (for long pipelines / manual gates) ────────────

/**
 * Same chain, but each stage is queued as an independent agent_tasks
 * row with payload.chainPrev pointing at the previous task's id.
 *
 * The orchestrator's normal queue drainer picks them up one per tick.
 * Use this when:
 *   • the chain might exceed a single Worker invocation's wall-clock
 *   • you want a human approval gate between stages
 *   • the publish stage needs to wait for an external signal
 */
export async function enqueueChainAsQueueDriven(
  env: Env,
  input: MoneyMachineChainInput,
): Promise<{ chainId: string; firstTaskId: string }> {
  const chainId = crypto.randomUUID().replace(/-/g, '')
  const firstId = crypto.randomUUID().replace(/-/g, '')
  const now = new Date().toISOString()
  await env.DB
    .prepare(
      `INSERT INTO agent_tasks
         (id, type, payload, status, agent_id, created_at, updated_at)
       VALUES (?, 'research', ?, 'queued', ?, ?, ?)`,
    )
    .bind(
      firstId,
      JSON.stringify({ query: input.topic, chainId, chainConfig: input }),
      `chain:${chainId}`,
      now,
      now,
    )
    .run()
  return { chainId, firstTaskId: firstId }
}
