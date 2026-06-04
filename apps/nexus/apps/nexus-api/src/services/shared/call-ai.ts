import type { Env } from '../../env'
import type { AIRunTaskResponse } from '@nexus/types'

/**
 * Shared AI caller — single implementation used by workflow-engine,
 * deliverable, agent, manager, autopilot, schedules, and marketing.
 *
 * Sends a task to the nexus-ai service-binding worker with retry logic
 * and a hard client-side deadline so a hanging model doesn't stall the
 * caller forever.
 */
export async function callAI(
  env: Env,
  prompt: string,
  opts: {
    taskType?: string
    outputFormat?: 'text' | 'json'
    timeoutMs?: number
    retries?: number
  } = {},
): Promise<AIRunTaskResponse> {
  const taskType = opts.taskType ?? 'generate_long_form'
  const outputFormat = opts.outputFormat ?? 'json'
  const timeoutMs = opts.timeoutMs ?? 60000
  const retries = opts.retries ?? 3
  const deadlineMs = timeoutMs + 10000 // hard client-side cutoff

  let lastErr: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctl = new AbortController()
    try {
      const fetchP = (async () => {
        const req = new Request('https://nexus-ai/task', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskType, prompt, outputFormat, timeoutMs }),
          signal: ctl.signal,
        })
        const res = await env.AI_WORKER.fetch(req)
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText)
          throw new Error(`AI worker ${taskType} failed: ${res.status} ${text}`)
        }
        return (await res.json()) as AIRunTaskResponse
      })()
      const result = await Promise.race([
        fetchP,
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            ctl.abort()
            reject(new Error(`__deadline__ ${taskType}`))
          }, deadlineMs),
        ),
      ])
      return result
    } catch (err) {
      lastErr = err
      if (err instanceof Error && err.message.startsWith('__deadline__')) break
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * attempt))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * Simplified wrapper that returns just the output string. Used by routes
 * that don't need model metadata (agent, manager, marketing, schedules).
 */
export async function callAISimple(
  env: Env,
  prompt: string,
  opts: {
    taskType?: string
    outputFormat?: 'text' | 'json'
    timeoutMs?: number
    retries?: number
  } = {},
): Promise<string> {
  const res = await callAI(env, prompt, opts)
  return res.output ?? ''
}
