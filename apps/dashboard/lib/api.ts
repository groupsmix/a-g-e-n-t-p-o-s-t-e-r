/**
 * Thin fetch wrapper around the nexus-api worker.
 * No tRPC for now — typed via @posteragent/types instead.
 */

import type {
  AgentTask,
  AgentTaskStatus,
  AgentTaskType,
} from '@posteragent/types'

const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:8787'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : init.body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(
      res.status,
      `${res.status} ${res.statusText}${text ? `: ${text}` : ''}`,
    )
  }
  const ct = res.headers.get('content-type') ?? ''
  return (ct.includes('application/json') ? res.json() : res.text()) as Promise<T>
}

// ── Wire types (mirror routes/tasks.ts) ─────────────────────────────────────
// The worker returns rows with snake_case columns + inflated JSON for
// payload / result.  We keep the wire shape distinct from the canonical
// AgentTask interface so we can adapt either side without breaking the other.

export interface AgentTaskRow {
  id: string
  type: AgentTaskType
  status: AgentTaskStatus
  payload: Record<string, unknown> | null
  result: unknown
  error: string | null
  estimated_cost_usd: number | null
  actual_cost_usd: number | null
  model_used: string | null
  input_tokens: number | null
  output_tokens: number | null
  agent_id: string | null
  origin: 'dashboard' | 'autopilot' | 'schedule' | 'webhook' | 'api' | 'cli'
  parent_task_id: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
}

export interface CreateTaskInput {
  type: AgentTaskType
  payload?: Record<string, unknown>
  agent_id?: string
  origin?: AgentTaskRow['origin']
  parent_task_id?: string
  estimated_cost_usd?: number
}

export interface PatchTaskInput {
  status?: AgentTaskStatus
  result?: unknown
  error?: string
  actual_cost_usd?: number
  model_used?: string
  input_tokens?: number
  output_tokens?: number
}

interface TaskListResponse {
  tasks: AgentTaskRow[]
  count: number
}

interface TaskSingleResponse {
  task: AgentTaskRow | null
}

interface HealthResponse {
  status: 'ok'
  timestamp: string
  version: string
}

/** Convert a wire row into the canonical AgentTask interface from @posteragent/types. */
export function rowToTask(row: AgentTaskRow): AgentTask {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload ?? {},
    status: row.status,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    estimatedCostUsd: row.estimated_cost_usd ?? undefined,
    actualCostUsd: row.actual_cost_usd ?? undefined,
    modelUsed: row.model_used ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    agentId: row.agent_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export const api = {
  /** GET /api/health — surface health-check status to the UI. */
  health: () => request<HealthResponse>('/api/health'),

  /** GET /api/tasks?status=&type=&limit=&since= — list agent tasks. */
  listTasks: async (params?: {
    status?: AgentTaskStatus
    type?: AgentTaskType
    limit?: number
    since?: string
  }): Promise<AgentTask[]> => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.type) q.set('type', params.type)
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.since) q.set('since', params.since)
    const res = await request<TaskListResponse>(
      `/api/tasks${q.toString() ? `?${q}` : ''}`,
    )
    return res.tasks.map(rowToTask)
  },

  /** GET /api/tasks/:id — fetch one. */
  getTask: async (id: string): Promise<AgentTask | null> => {
    const res = await request<TaskSingleResponse>(`/api/tasks/${id}`)
    return res.task ? rowToTask(res.task) : null
  },

  /** POST /api/tasks — create a queued task. */
  createTask: async (input: CreateTaskInput): Promise<AgentTask | null> => {
    const res = await request<TaskSingleResponse>('/api/tasks', {
      method: 'POST',
      json: input,
    })
    return res.task ? rowToTask(res.task) : null
  },

  /** PATCH /api/tasks/:id — update status, result, error, or cost fields. */
  patchTask: async (id: string, patch: PatchTaskInput): Promise<AgentTask | null> => {
    const res = await request<TaskSingleResponse>(`/api/tasks/${id}`, {
      method: 'PATCH',
      json: patch,
    })
    return res.task ? rowToTask(res.task) : null
  },

  /**
   * SSE stream of task events.  Returns the EventSource so caller can close it.
   *
   * Event types emitted by the worker:
   *   - 'open'  → initial handshake with { cursor, intervalMs }
   *   - 'task'  → AgentTaskRow payload, last-event-id = updated_at
   *   - 'ping'  → heartbeat keepalive
   *   - 'close' → server cycled the connection (budget)
   *   - 'error' → tick-level error from the worker
   */
  subscribeTasks: (handlers: {
    onTask?: (task: AgentTask) => void
    onOpen?: (info: { cursor: string; intervalMs: number }) => void
    onPing?: (info: { at: string }) => void
    onClose?: (info: { reason: string }) => void
    onError?: (info: { message: string }) => void
  }): EventSource => {
    const es = new EventSource(`${BASE}/api/tasks/stream`)
    es.addEventListener('task', (e) => {
      try {
        const row = JSON.parse((e as MessageEvent).data) as AgentTaskRow
        handlers.onTask?.(rowToTask(row))
      } catch {
        /* swallow malformed frames */
      }
    })
    es.addEventListener('open', (e) => {
      try {
        handlers.onOpen?.(JSON.parse((e as MessageEvent).data))
      } catch { /* */ }
    })
    es.addEventListener('ping', (e) => {
      try {
        handlers.onPing?.(JSON.parse((e as MessageEvent).data))
      } catch { /* */ }
    })
    es.addEventListener('close', (e) => {
      try {
        handlers.onClose?.(JSON.parse((e as MessageEvent).data))
      } catch { /* */ }
    })
    es.addEventListener('error', (e) => {
      const data = (e as MessageEvent).data
      handlers.onError?.({
        message: typeof data === 'string' ? data : 'connection error',
      })
    })
    return es
  },
}

export { ApiError }
