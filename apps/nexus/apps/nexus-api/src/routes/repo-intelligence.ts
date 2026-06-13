/**
 * /api/repo-intel — Repository Intelligence
 *
 * Connects to GitHub repositories via the GitHub REST API to:
 *   - Track repositories and build project maps
 *   - Index codebases (file tree, architecture, dependencies)
 *   - Understand frameworks, APIs, DB schemas, deploy config
 *
 *   GET    /api/repo-intel/projects            list tracked repos
 *   POST   /api/repo-intel/projects            add a repo
 *   GET    /api/repo-intel/projects/:id        get repo + project map
 *   DELETE /api/repo-intel/projects/:id        untrack a repo
 *   POST   /api/repo-intel/projects/:id/analyze  trigger full analysis
 *   GET    /api/repo-intel/projects/:id/tree   get file tree
 *   GET    /api/repo-intel/projects/:id/commits get commit history
 */

import { Hono } from 'hono'
import type { Env } from '../env'

export const repoIntelRoutes = new Hono<{ Bindings: Env }>()

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getGithubToken(env: Env): Promise<string | null> {
  try {
    const row = await env.DB
      .prepare("SELECT value FROM settings WHERE key = 'github_token' LIMIT 1")
      .first<{ value: string }>()
    if (row?.value) return row.value
  } catch { /* ignore */ }
  try {
    const kv = await env.CONFIG.get('secret:GITHUB_TOKEN')
    if (kv) return kv
  } catch { /* ignore */ }
  return null
}

async function ghFetch(
  path: string,
  token: string | null,
  opts: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> ?? {}),
  }
  return fetch(`https://api.github.com${path}`, { ...opts, headers })
}

function parseRepoUrl(url: string): { owner: string; name: string } | null {
  const m = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
  if (!m) return null
  return { owner: m[1], name: m[2] }
}

async function buildProjectMap(owner: string, name: string, branch: string, token: string | null): Promise<object> {
  const map: Record<string, unknown> = { owner, name, branch, files: [], frameworks: [], dependencies: {}, architecture: '' }

  // Get file tree
  try {
    const treeRes = await ghFetch(`/repos/${owner}/${name}/git/trees/${branch}?recursive=1`, token)
    if (treeRes.ok) {
      const data = await treeRes.json() as { tree?: Array<{ path: string; type: string; size?: number }> }
      map.files = (data.tree ?? [])
        .filter(f => f.type === 'blob')
        .map(f => ({ path: f.path, size: f.size ?? 0 }))
        .slice(0, 500) // cap at 500 files
    }
  } catch { /* ignore */ }

  // Read key files for architecture detection
  const keyFiles = ['package.json', 'wrangler.toml', 'next.config.js', 'next.config.ts',
    'vite.config.ts', 'tsconfig.json', 'Dockerfile', '.github/workflows/ci.yml']
  const contents: Record<string, string> = {}

  for (const f of keyFiles) {
    try {
      const res = await ghFetch(`/repos/${owner}/${name}/contents/${f}?ref=${branch}`, token)
      if (res.ok) {
        const d = await res.json() as { content?: string }
        if (d.content) contents[f] = atob(d.content.replace(/\n/g, ''))
      }
    } catch { /* ignore */ }
  }
  map.key_files = contents

  // Detect frameworks/stack
  const frameworks: string[] = []
  const pkg = contents['package.json'] ? JSON.parse(contents['package.json']) : {}
  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  map.dependencies = allDeps

  if (allDeps['next']) frameworks.push('Next.js')
  if (allDeps['react']) frameworks.push('React')
  if (allDeps['hono']) frameworks.push('Hono')
  if (allDeps['express']) frameworks.push('Express')
  if (allDeps['drizzle-orm']) frameworks.push('Drizzle ORM')
  if (allDeps['prisma']) frameworks.push('Prisma')
  if (allDeps['@cloudflare/workers-types'] || contents['wrangler.toml']) frameworks.push('Cloudflare Workers')
  if (allDeps['turbo']) frameworks.push('Turborepo')
  if (allDeps['vitest']) frameworks.push('Vitest')
  if (contents['.github/workflows/ci.yml']) frameworks.push('GitHub Actions CI')
  map.frameworks = frameworks

  // Get repo metadata
  try {
    const metaRes = await ghFetch(`/repos/${owner}/${name}`, token)
    if (metaRes.ok) {
      const meta = await metaRes.json() as Record<string, unknown>
      map.metadata = {
        stars: meta.stargazers_count,
        language: meta.language,
        topics: meta.topics,
        license: (meta.license as { spdx_id?: string })?.spdx_id,
        default_branch: meta.default_branch,
        description: meta.description,
      }
    }
  } catch { /* ignore */ }

  return map
}

// ── GET /api/repo-intel/projects ─────────────────────────────────────────────
repoIntelRoutes.get('/projects', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT * FROM repo_projects ORDER BY created_at DESC')
    .all<Record<string, unknown>>()
  return c.json({ projects: rows.results ?? [], count: (rows.results ?? []).length })
})

// ── POST /api/repo-intel/projects ────────────────────────────────────────────
repoIntelRoutes.post('/projects', async (c) => {
  let body: { url?: string; branch?: string } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }

  const { url, branch = 'main' } = body
  if (!url) return c.json({ error: 'url is required' }, 400)

  const parsed = parseRepoUrl(url)
  if (!parsed) return c.json({ error: 'not a valid GitHub repo URL' }, 400)

  const existing = await c.env.DB
    .prepare('SELECT id FROM repo_projects WHERE url = ? LIMIT 1')
    .bind(url).first<{ id: string }>()
  if (existing) return c.json({ error: 'repo already tracked', id: existing.id }, 409)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await c.env.DB
    .prepare('INSERT INTO repo_projects (id, url, owner, name, branch, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, url, parsed.owner, parsed.name, branch, 'active', now, now)
    .run()

  return c.json({ id, url, owner: parsed.owner, name: parsed.name, branch, status: 'active', created_at: now }, 201)
})

// ── GET /api/repo-intel/projects/:id ─────────────────────────────────────────
repoIntelRoutes.get('/projects/:id', async (c) => {
  const row = await c.env.DB
    .prepare('SELECT * FROM repo_projects WHERE id = ? LIMIT 1')
    .first<Record<string, unknown>>(c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.project_map) {
    try { row.project_map = JSON.parse(row.project_map as string) } catch { /* leave as string */ }
  }
  return c.json({ project: row })
})

// ── DELETE /api/repo-intel/projects/:id ──────────────────────────────────────
repoIntelRoutes.delete('/projects/:id', async (c) => {
  const { success } = await c.env.DB
    .prepare('DELETE FROM repo_projects WHERE id = ?')
    .bind(c.req.param('id'))
    .run()
  return c.json({ ok: success })
})

// ── POST /api/repo-intel/projects/:id/analyze ────────────────────────────────
repoIntelRoutes.post('/projects/:id/analyze', async (c) => {
  const row = await c.env.DB
    .prepare('SELECT * FROM repo_projects WHERE id = ? LIMIT 1')
    .first<{ id: string; owner: string; name: string; branch: string }>( c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)

  const token = await getGithubToken(c.env)
  const map = await buildProjectMap(row.owner, row.name, row.branch, token)
  const now = new Date().toISOString()

  await c.env.DB
    .prepare('UPDATE repo_projects SET project_map = ?, last_analyzed_at = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(map), now, now, row.id)
    .run()

  // Log operation
  await c.env.DB
    .prepare('INSERT INTO code_operations (id, repo_id, op_type, summary, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), row.id, 'analyze', `Full analysis: ${(map as { files?: unknown[] }).files?.length ?? 0} files indexed`, now)
    .run()

  return c.json({ ok: true, project_map: map, analyzed_at: now })
})

// ── GET /api/repo-intel/projects/:id/tree ────────────────────────────────────
repoIntelRoutes.get('/projects/:id/tree', async (c) => {
  const row = await c.env.DB
    .prepare('SELECT owner, name, branch FROM repo_projects WHERE id = ? LIMIT 1')
    .first<{ owner: string; name: string; branch: string }>(c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)

  const token = await getGithubToken(c.env)
  const res = await ghFetch(`/repos/${row.owner}/${row.name}/git/trees/${row.branch}?recursive=1`, token)
  if (!res.ok) return c.json({ error: 'GitHub API error', status: res.status }, 502)
  const data = await res.json() as { tree?: unknown[] }
  return c.json({ tree: data.tree ?? [] })
})

// ── GET /api/repo-intel/projects/:id/commits ─────────────────────────────────
repoIntelRoutes.get('/projects/:id/commits', async (c) => {
  const row = await c.env.DB
    .prepare('SELECT owner, name, branch FROM repo_projects WHERE id = ? LIMIT 1')
    .first<{ owner: string; name: string; branch: string }>(c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)

  const token = await getGithubToken(c.env)
  const per = c.req.query('per_page') ?? '20'
  const page = c.req.query('page') ?? '1'
  const res = await ghFetch(`/repos/${row.owner}/${row.name}/commits?sha=${row.branch}&per_page=${per}&page=${page}`, token)
  if (!res.ok) return c.json({ error: 'GitHub API error', status: res.status }, 502)
  const commits = await res.json()
  return c.json({ commits })
})

// ── GET /api/repo-intel/operations ───────────────────────────────────────────
repoIntelRoutes.get('/operations', async (c) => {
  const repoId = c.req.query('repo_id')
  const limit = parseInt(c.req.query('limit') ?? '50')
  const rows = repoId
    ? await c.env.DB.prepare('SELECT * FROM code_operations WHERE repo_id = ? ORDER BY created_at DESC LIMIT ?').bind(repoId, limit).all<Record<string, unknown>>()
    : await c.env.DB.prepare('SELECT * FROM code_operations ORDER BY created_at DESC LIMIT ?').bind(limit).all<Record<string, unknown>>()
  return c.json({ operations: rows.results ?? [] })
})
