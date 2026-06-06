/**
 * Thin fetch wrapper around the nexus-api worker.
 * No tRPC for now — typed via @posteragent/types instead.
 */

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
    throw new ApiError(res.status, `${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }
  const ct = res.headers.get('content-type') ?? ''
  return (ct.includes('application/json') ? res.json() : res.text()) as Promise<T>
}

export const api = {
  /** GET /api/health — surface health-check status to the UI. */
  health: () => request<unknown>('/api/health'),

  /** GET /api/tasks?status=&limit= — list agent tasks. */
  listTasks: (params?: { status?: string; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.limit) q.set('limit', String(params.limit))
    return request<unknown>(`/api/tasks${q.toString() ? `?${q}` : ''}`)
  },

  /** SSE stream of task events. Returns the EventSource so caller can close it. */
  subscribeTasks: (onEvent: (e: MessageEvent) => void): EventSource => {
    const es = new EventSource(`${BASE}/api/tasks/stream`)
    es.onmessage = onEvent
    return es
  },
}

export { ApiError }
