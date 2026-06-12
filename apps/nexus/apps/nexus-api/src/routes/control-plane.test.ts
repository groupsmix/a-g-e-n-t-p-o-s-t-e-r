import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { tasksRoutes } from './tasks'
import { approvalsRoutes } from './approvals'
import { processesRoutes } from './processes'
import { notificationsRoutes } from './notifications'

// A minimal Hono testing setup with a D1 database mock
function makeDb(initialState: {
  events?: any[]
  messages?: any[]
  approvals?: any[]
  artifacts?: any[]
  processes?: any[]
  notifications?: any[]
  tasks?: any[]
} = {}) {
  const state = {
    events: initialState.events ?? [],
    messages: initialState.messages ?? [],
    approvals: initialState.approvals ?? [],
    artifacts: initialState.artifacts ?? [],
    processes: initialState.processes ?? [],
    notifications: initialState.notifications ?? [],
    tasks: initialState.tasks ?? [],
  }

  return {
    prepare(sql: string) {
      let capturedBinds: unknown[] = []
      const stmt = {
        bind(...args: unknown[]) {
          capturedBinds = args
          return stmt
        },
        async all<T = unknown>() {
          if (sql.includes('FROM task_events')) {
            const taskId = capturedBinds[0]
            const results = state.events.filter((e) => e.task_id === taskId)
            return { results } as { results: T[] }
          }
          if (sql.includes('FROM agent_messages')) {
            const taskId = capturedBinds[0]
            const results = state.messages.filter((m) => m.task_id === taskId)
            return { results } as { results: T[] }
          }
          if (sql.includes('FROM artifacts')) {
            const taskId = capturedBinds[0]
            const results = state.artifacts.filter((a) => a.task_id === taskId)
            return { results } as { results: T[] }
          }
          if (sql.includes('FROM approval_requests')) {
            if (sql.includes('status = ?')) {
              const results = state.approvals.filter((a) => a.status === 'pending')
              return { results } as { results: T[] }
            }
            return { results: state.approvals } as { results: T[] }
          }
          if (sql.includes('FROM live_processes')) {
            return { results: state.processes } as { results: T[] }
          }
          if (sql.includes('FROM notifications')) {
            return { results: state.notifications } as { results: T[] }
          }
          return { results: [] } as { results: T[] }
        },
        async first<T = unknown>() {
          if (sql.includes('FROM approval_requests')) {
            const id = capturedBinds[0]
            const result = state.approvals.find((a) => a.id === id)
            return (result ?? null) as unknown as T
          }
          if (sql.includes('FROM agent_tasks')) {
            const id = capturedBinds[0]
            const result = state.tasks.find((t) => t.id === id)
            return (result ?? null) as unknown as T
          }
          return null
        },
        async run() {
          if (sql.includes('INSERT INTO agent_messages')) {
            const [id, taskId, sender, content, created_at] = capturedBinds
            state.messages.push({ id, task_id: taskId, sender, content, created_at })
            return { success: true, meta: { changes: 1 } }
          }
          if (sql.includes('INSERT INTO artifacts')) {
            const [id, taskId, kind, url, content, created_at] = capturedBinds
            state.artifacts.push({ id, task_id: taskId, kind, url, content, created_at })
            return { success: true, meta: { changes: 1 } }
          }
          if (sql.includes('INSERT INTO live_processes')) {
            const [id, taskId, name, status, created_at] = capturedBinds
            state.processes.push({ id, task_id: taskId, name, status, created_at })
            return { success: true, meta: { changes: 1 } }
          }
          if (sql.includes('UPDATE approval_requests')) {
            const [feedback, resolved_at, id] = capturedBinds
            const request = state.approvals.find((a) => a.id === id)
            if (request) {
              request.feedback = feedback
              request.resolved_at = resolved_at
              if (sql.includes("status = 'approved'")) {
                request.status = 'approved'
              } else if (sql.includes("status = 'rejected'")) {
                request.status = 'rejected'
              } else if (sql.includes("status = 'changes_requested'")) {
                request.status = 'changes_requested'
              }
              return { success: true, meta: { changes: 1 } }
            }
            return { success: true, meta: { changes: 0 } }
          }
          if (sql.includes('UPDATE agent_tasks')) {
            // approvals status update
            const [status, id] = capturedBinds
            const task = state.tasks.find((t) => t.id === id)
            if (task) {
              task.status = status
            }
            return { success: true, meta: { changes: 1 } }
          }
          if (sql.includes('UPDATE notifications')) {
            const id = capturedBinds[0]
            const notification = state.notifications.find((n) => n.id === id)
            if (notification) {
              notification.read = 1
              return { success: true, meta: { changes: 1 } }
            }
            return { success: true, meta: { changes: 0 } }
          }
          return { success: true, meta: { changes: 0 } }
        },
      }
      return stmt
    },
  }
}

describe('control plane routes', () => {
  it('GET /api/tasks/:id/events returns events', async () => {
    const db = makeDb({
      events: [
        { id: 'ev1', task_id: 'task1', event_type: 'info', message: 'Task started', created_at: 'now' },
      ],
    })
    const app = new Hono()
    app.route('/api/tasks', tasksRoutes)
    const res = await app.request('/api/tasks/task1/events', {}, { DB: db } as never)
    expect(res.status).toBe(200)
    const data = await res.json<any>()
    expect(data.events).toHaveLength(1)
    expect(data.events[0].message).toBe('Task started')
  })

  it('GET and POST /api/tasks/:id/messages', async () => {
    const db = makeDb()
    const app = new Hono()
    app.route('/api/tasks', tasksRoutes)

    const postRes = await app.request('/api/tasks/task1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'assistant', content: 'hello world' }),
    }, { DB: db } as never)
    expect(postRes.status).toBe(201)

    const getRes = await app.request('/api/tasks/task1/messages', {}, { DB: db } as never)
    expect(getRes.status).toBe(200)
    const data = await getRes.json<any>()
    expect(data.messages).toHaveLength(1)
    expect(data.messages[0].content).toBe('hello world')
  })

  it('GET and POST /api/tasks/:id/artifacts', async () => {
    const db = makeDb()
    const app = new Hono()
    app.route('/api/tasks', tasksRoutes)

    const postRes = await app.request('/api/tasks/task1/artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'markdown_doc', url: 'https://r2/file.md', content: 'test' }),
    }, { DB: db } as never)
    expect(postRes.status).toBe(201)

    const getRes = await app.request('/api/tasks/task1/artifacts', {}, { DB: db } as never)
    expect(getRes.status).toBe(200)
    const data = await getRes.json<any>()
    expect(data.artifacts).toHaveLength(1)
    expect(data.artifacts[0].url).toBe('https://r2/file.md')
  })

  it('GET approvals pending', async () => {
    const db = makeDb({
      approvals: [
        { id: 'app1', task_id: 'task1', action_type: 'spend_money', risk_level: 'high', status: 'pending' },
      ],
    })
    const app = new Hono()
    app.route('/api/approvals', approvalsRoutes)
    const res = await app.request('/api/approvals', {}, { DB: db } as never)
    expect(res.status).toBe(200)
    const data = await res.json<any>()
    expect(data.approvals).toHaveLength(1)
  })

  it('POST /api/approvals/:id/approve', async () => {
    const db = makeDb({
      approvals: [
        { id: 'app1', task_id: 'task1', action_type: 'publish_content', risk_level: 'medium', status: 'pending' },
      ],
      tasks: [
        { id: 'task1', type: 'publish', status: 'needs_me' },
      ],
    })
    const app = new Hono()
    app.route('/api/approvals', approvalsRoutes)
    const res = await app.request('/api/approvals/app1/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: 'Looks good!' }),
    }, { DB: db } as never)
    expect(res.status).toBe(200)
    expect(db.prepare('FROM approval_requests').bind('app1').first()).resolves.toMatchObject({ status: 'approved' })
  })

  it('GET /api/processes and POST register', async () => {
    const db = makeDb()
    const app = new Hono()
    app.route('/api/processes', processesRoutes)

    const postRes = await app.request('/api/processes/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Remotion Render', status: 'running' }),
    }, { DB: db } as never)
    expect(postRes.status).toBe(201)

    const getRes = await app.request('/api/processes', {}, { DB: db } as never)
    expect(getRes.status).toBe(200)
    const data = await getRes.json<any>()
    expect(data.processes).toHaveLength(1)
    expect(data.processes[0].name).toBe('Remotion Render')
  })

  it('GET /api/notifications and POST read', async () => {
    const db = makeDb({
      notifications: [
        { id: 'notif1', type: 'task_failed', title: 'Task failed', message: 'Something went wrong', read: 0, created_at: 'now' }
      ]
    })
    const app = new Hono()
    app.route('/api/notifications', notificationsRoutes)

    const getRes = await app.request('/api/notifications', {}, { DB: db } as never)
    expect(getRes.status).toBe(200)
    const getJson = await getRes.json<any>()
    expect(getJson.notifications).toHaveLength(1)
    expect(getJson.notifications[0].read).toBe(false)

    const postRes = await app.request('/api/notifications/notif1/read', { method: 'POST' }, { DB: db } as never)
    expect(postRes.status).toBe(200)
  })
})
