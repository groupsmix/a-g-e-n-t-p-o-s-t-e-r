/**
 * Retrieval stage. Fans out memory + past-task retrieval in parallel,
 * each behind its own soft timeout so a slow store can't stall the
 * agent. Errors degrade to empty arrays.
 */

import type {
  ContextConfig,
  MemoryRetriever,
  PastTask,
  PastTaskRetriever,
  RetrievedMemory,
} from '../types.js'
import type { AgentTaskType } from '@posteragent/types'

export interface RetrieveInput {
  query: string
  taskType: AgentTaskType
  memory?: MemoryRetriever
  pastTasks?: PastTaskRetriever
  config: ContextConfig
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}

export interface RetrieveOutput {
  memories: RetrievedMemory[]
  pastTasks: PastTask[]
}

export async function retrieveContext(
  input: RetrieveInput,
): Promise<RetrieveOutput> {
  const memoryPromise: Promise<RetrievedMemory[]> = input.memory
    ? withTimeout(
        input.memory.retrieve({
          query: input.query,
          maxResults: input.config.maxMemories,
          types: input.config.memoryTypes,
          signal: input.signal,
        }),
        input.config.retrieveTimeoutMs,
      ).catch((err: unknown) => {
        input.log?.warn('retrieve: memory failed', {
          error: (err as Error).message,
        })
        return []
      })
    : Promise.resolve([])

  const pastPromise: Promise<PastTask[]> = input.pastTasks
    ? withTimeout(
        input.pastTasks.retrieve({
          query: input.query,
          taskType: input.taskType,
          maxResults: input.config.maxPastTasks,
          signal: input.signal,
        }),
        input.config.retrieveTimeoutMs,
      ).catch((err: unknown) => {
        input.log?.warn('retrieve: past-tasks failed', {
          error: (err as Error).message,
        })
        return []
      })
    : Promise.resolve([])

  const [memories, pastTasks] = await Promise.all([memoryPromise, pastPromise])
  return {
    memories: memories.slice(0, input.config.maxMemories),
    pastTasks: pastTasks.slice(0, input.config.maxPastTasks),
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
