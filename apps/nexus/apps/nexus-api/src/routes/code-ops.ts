/**
 * /api/code-ops — Codebase Operations
 *
 * Read, create, modify, delete files and generate commits/PRs via GitHub API.
 * All destructive operations are logged to safety_audit_log.
 *
 *   GET    /api/code-ops/:repoId/files            list directory
 *   GET    /api/code-ops/:repoId/files/*path      read file content
 *   PUT    /api/code-ops/:repoId/files/*path      create or update file
 *   DELETE /api/code-ops/:repoId/files/*path      delete file
 *   GET    /api/code-ops/:repoId/pulls            list pull requests
 *   POST   /api/code-ops/:repoId/pulls            create pull request
 *   GET    /api/code-ops/:repoId/branches         list branches
 *   POST   /api/code-ops/:repoId/branches         create branch
 */

import { Hono } from 'hono'
import type { Env } from '../env'

export const codeOpsRoutes = new Hono<{ Bindings: Env }>()

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getGithubToken(env: Env): Promise<string | null> {
  try {
    const row = await env.DB
      .prepare("SELECT value FROM settings WHERE key = 'github_token' LIMIT 1")
      .first<{ value: string }>()
    if (row?.value) return row.value
  } catch { /* ignore */ }
  try { return await env.CONFIG.get('secret:GITHUB_TOKEN') } catch { return null }
}

async function getRepo(env: Env, repoId: string) {
  return env.DB
    .prepare('SELECT * FROM repo_projects WHERE id = ? LIMIT 1')
    .first<{ id: string; owner: string; name: string; branch: string }>(repoId)
}

async function ghFetch(path: string, token: string | null, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> ?? {}),
  }
  return fetch(`https://api.github.com${path}`, { ...opts, headers })
}

async function logOperation(env: Env, repoId: string, opType: string, payload: object) {
  await env.DB
    .prepare('INSERT INTO code_operations (id, repo_id, op_type, payload, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), repoId, opType, JSON.stringify(payload), new Date().toISOString())
    .run()
    .catch(() => void 0)
}

async function safetyLog(env: Env, actionType: string, target: string, details: string) {
  await env.DB
    .prepare('INSERT INTO safety_audit_log (id, action_type, target, approved, details, created_at) VALUES (?, ?, ?, 1, ?, ?)')
    .bind(crypto.randomUUID(), actionType, target, details, new Date().toISOString())
    .run()
    .catch(() => void 0)
}

// ── GET /api/code-ops/:repoId/files — list directory ─────────────────────────
codeOpsRoutes.get('/:repoId/files', async (c) => {
  const repo = await getRepo(c.env, c.req.param('repoId'))
  if (!repo) return c.json({ error: 'repo not found' }, 404)

  const path = c.req.query('path') ?? ''
  const ref = c.req.query('ref') ?? repo.branch
  const token = await getGithubToken(c.env)
  const apiPath = `/repos/${repo.owner}/${repo.name}/contents/${path}?ref=${ref}`
  const res = await ghFetch(apiPath, token)
  if (!res.ok) return c.json({ error: 'GitHub API error', status: res.status }, 502)
  const data = await res.json()
  return c.json({ files: data, repo: { owner: repo.owner, name: repo.name } })
})

// ── GET /api/code-ops/:repoId/files/*path — read file ────────────────────────
codeOpsRoutes.get('/:repoId/files/*', async (c) => {
  const repo = await getRepo(c.env, c.req.param('repoId'))
  if (!repo) return c.json({ error: 'repo not found' }, 404)

  const filePath = c.req.param('*')
  const ref = c.req.query('ref') ?? repo.branch
  const token = await getGithubToken(c.env)
  const res = await ghFetch(`/repos/${repo.owner}/${repo.name}/contents/${filePath}?ref=${ref}`, token)
  if (!res.ok) return c.json({ error: 'GitHub API error', status: res.status }, 502)

  const data = await res.json() as { content?: string; encoding?: string; name?: string; sha?: string; size?: number }
  let content = ''
  if (data.content && data.encoding === 'base64') {
    content = atob(data.content.replace(/\n/g, ''))
  }

  await logOperation(c.env, repo.id, 'read', { path: filePath, ref })
  return c.json({ path: filePath, content, sha: data.sha, size: data.size })
})

// ── PUT /api/code-ops/:repoId/files/*path — create/update file ───────────────
codeOpsRoutes.put('/:repoId/files/*', async (c) => {
  const repo = await getRepo(c.env, c.req.param('repoId'))
  if (!repo) return c.json({ error: 'repo not found' }, 404)

  let body: { content?: string; message?: string; sha?: string; branch?: string } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const { content, message, sha, branch } = body
  if (!content) return c.json({ error: 'content is required' }, 400)

  const filePath = c.req.param('*')
  const token = await getGithubToken(c.env)
  if (!token) return c.json({ error: 'GitHub token not configured — set github_token in Settings' }, 401)

  const payload: Record<string, string> = {
    message: message ?? `chore: update ${filePath}`,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: branch ?? repo.branch,
  }
  if (sha) payload.sha = sha

  const res = await ghFetch(`/repos/${repo.owner}/${repo.name}/contents/${filePath}`, token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json()
    return c.json({ error: 'GitHub API error', details: err, status: res.status }, 502)
  }
  const data = await res.json() as { commit?: { sha?: string } }
  await logOperation(c.env, repo.id, sha ? 'update' : 'create', { path: filePath, commit: data.commit?.sha })
  await safetyLog(c.env, sha ? 'file_update' : 'file_create', filePath ?? '', `${message ?? 'agent update'} on ${repo.owner}/${repo.name}`)
  return c.json({ ok: true, commit_sha: data.commit?.sha, path: filePath })
})

// ── DELETE /api/code-ops/:repoId/files/*path — delete file ───────────────────
codeOpsRoutes.delete('/:repoId/files/*', async (c) => {
  const repo = await getRepo(c.env, c.req.param('repoId'))
  if (!repo) return c.json({ error: 'repo not found' }, 404)

  let body: { sha?: string; message?: string; branch?: string } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON — sha required' }, 400) }
  const { sha, message, branch } = body
  if (!sha) return c.json({ error: 'sha is required to delete a file' }, 400)

  const filePath = c.req.param('*')
  const token = await getGithubToken(c.env)
  if (!token) return c.json({ error: 'GitHub token not configured' }, 401)

  const res = await ghFetch(`/repos/${repo.owner}/${repo.name}/contents/${filePath}`, token, {
    method: 'DELETE',
    body: JSON.stringify({ message: message ?? `chore: remove ${filePath}`, sha, branch: branch ?? repo.branch }),
  })
  if (!res.ok) return c.json({ error: 'GitHub API error', status: res.status }, 502)
  await logOperation(c.env, repo.id, 'delete', { path: filePath })
  await safetyLog(c.env, 'file_delete', filePath ?? '', `Deleted from ${repo.owner}/${repo.name}`)
  return c.json({ ok: true, path: filePath })
})

// ── GET /api/code-ops/:repoId/branches ───────────────────────────────────────
codeOpsRoutes.get('/:repoId/branches', async (c) => {
  const repo = await getRepo(c.env, c.req.param('repoId'))
  if (!repo) return c.json({ error: 'repo not found' }, 404)
  const token = await getGithubToken(c.env)
  const res = await ghFetch(`/repos/${repo.owner}/${repo.name}/branches?per_page=50`, token)
  if (!res.ok) return c.json({ error: 'GitHub API error', status: res.status }, 502)
  return c.json({ branches: await res.json() })
})

// ── POST /api/code-ops/:repoId/branches — create branch ──────────────────────
codeOpsRoutes.post('/:repoId/branches', async (c) => {
  const repo = await getRepo(c.env, c.req.param('repoId'))
  if (!repo) return c.json({ error: 'repo not found' }, 404)
  let body: { name?: string; from?: string } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const { name, from = repo.branch } = body
  if (!name) return c.json({ error: 'name is required' }, 400)

  const token = await getGithubToken(c.env)
  if (!token) return c.json({ error: 'GitHub token not configured' }, 401)

  // Get base branch SHA
  const refRes = await ghFetch(`/repos/${repo.owner}/${repo.name}/git/ref/heads/${from}`, token)
  if (!refRes.ok) return c.json({ error: 'base branch not found', status: refRes.status }, 404)
  const refData = await refRes.json() as { object?: { sha?: string } }
  const sha = refData.object?.sha
  if (!sha) return c.json({ error: 'could not get base branch SHA' }, 500)

  const res = await ghFetch(`/repos/${repo.owner}/${repo.name}/git/refs`, token, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${name}`, sha }),
  })
  if (!res.ok) return c.json({ error: 'GitHub API error', status: res.status }, 502)
  await safetyLog(c.env, 'branch_create', name, `Branch from ${from} on ${repo.owner}/${repo.name}`)
  return c.json({ ok: true, branch: name, from, sha })
})

// ── GET /api/code-ops/:repoId/pulls — list pull requests ─────────────────────
codeOpsRoutes.get('/:repoId/pulls', async (c) => {
  const repo = await getRepo(c.env, c.req.param('repoId'))
  if (!repo) return c.json({ error: 'repo not found' }, 404)
  const token = await getGithubToken(c.env)
  const state = c.req.query('state') ?? 'open'
  const res = await ghFetch(`/repos/${repo.owner}/${repo.name}/pulls?state=${state}&per_page=30`, token)
  if (!res.ok) return c.json({ error: 'GitHub API error', status: res.status }, 502)
  return c.json({ pulls: await res.json() })
})

// ── POST /api/code-ops/:repoId/pulls — create pull request ───────────────────
codeOpsRoutes.post('/:repoId/pulls', async (c) => {
  const repo = await getRepo(c.env, c.req.param('repoId'))
  if (!repo) return c.json({ error: 'repo not found' }, 404)
  let body: { title?: string; body?: string; head?: string; base?: string } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const { title, body: prBody = '', head, base = repo.branch } = body
  if (!title || !head) return c.json({ error: 'title and head are required' }, 400)

  const token = await getGithubToken(c.env)
  if (!token) return c.json({ error: 'GitHub token not configured' }, 401)

  const res = await ghFetch(`/repos/${repo.owner}/${repo.name}/pulls`, token, {
    method: 'POST',
    body: JSON.stringify({ title, body: prBody, head, base }),
  })
  if (!res.ok) {
    const err = await res.json()
    return c.json({ error: 'GitHub API error', details: err, status: res.status }, 502)
  }
  const pr = await res.json() as { number?: number; html_url?: string }
  await logOperation(c.env, repo.id, 'pull_request', { title, head, base, pr_number: pr.number, pr_url: pr.html_url })
  await safetyLog(c.env, 'pull_request_create', title, `PR #${pr.number} on ${repo.owner}/${repo.name}`)
  return c.json({ ok: true, pr_number: pr.number, pr_url: pr.html_url })
})
