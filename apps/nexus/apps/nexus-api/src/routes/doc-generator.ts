/**
 * /api/doc-gen — Documentation Generator
 *
 * Auto-generates and maintains documentation using AI:
 *   README.md, ARCHITECTURE.md, API_DOCUMENTATION.md,
 *   TESTING_GUIDE.md, CHANGELOG.md, PROJECT_STRUCTURE.md
 *
 *   GET    /api/doc-gen/:repoId/generations        list generated docs
 *   POST   /api/doc-gen/:repoId/generate           generate a doc
 *   GET    /api/doc-gen/:repoId/generations/:genId get a generation
 *   DELETE /api/doc-gen/:repoId/generations/:genId delete
 *   POST   /api/doc-gen/:repoId/generations/:genId/commit  commit to repo
 */

import { Hono } from 'hono'
import type { Env } from '../env'

export const docGeneratorRoutes = new Hono<{ Bindings: Env }>()

const DOC_TYPES = ['readme', 'architecture', 'api', 'testing', 'changelog', 'project_structure', 'custom'] as const
type DocType = (typeof DOC_TYPES)[number]

const DOC_META: Record<DocType, { title: string; filename: string; prompt: string }> = {
  readme: {
    title: 'README.md',
    filename: 'README.md',
    prompt: 'Generate a comprehensive README.md for this repository. Include: project overview, features list, tech stack table, quick start instructions, environment variables, deployment steps, and contribution guidelines. Make it developer-friendly and well-structured with clear markdown.',
  },
  architecture: {
    title: 'ARCHITECTURE.md',
    filename: 'docs/ARCHITECTURE.md',
    prompt: 'Generate a detailed ARCHITECTURE.md document. Include: system overview, component diagram (ASCII or Mermaid), data flow description, key design decisions with rationale, scalability considerations, and dependency map.',
  },
  api: {
    title: 'API_DOCUMENTATION.md',
    filename: 'docs/API_DOCUMENTATION.md',
    prompt: 'Generate comprehensive API documentation. Include: base URL, authentication method, all endpoints grouped by resource (method, path, description, request body, response schema, example), error codes, and rate limits.',
  },
  testing: {
    title: 'TESTING_GUIDE.md',
    filename: 'docs/TESTING_GUIDE.md',
    prompt: 'Generate a TESTING_GUIDE.md. Include: test strategy overview, how to run tests locally, test structure explanation, how to write new tests, CI test pipeline description, coverage targets, and E2E testing approach.',
  },
  changelog: {
    title: 'CHANGELOG.md',
    filename: 'CHANGELOG.md',
    prompt: 'Generate a CHANGELOG.md following Keep a Changelog format (https://keepachangelog.com). Analyze commit history and file changes to produce categorized entries: Added, Changed, Fixed, Removed, Security. Start with [Unreleased] section.',
  },
  project_structure: {
    title: 'PROJECT_STRUCTURE.md',
    filename: 'PROJECT_STRUCTURE.md',
    prompt: 'Generate a PROJECT_STRUCTURE.md that maps every important directory and file with its purpose. Use a tree-style layout. Include package names, what each does, cross-references between packages, and which files are critical entry points.',
  },
  custom: {
    title: 'Custom Document',
    filename: 'docs/CUSTOM.md',
    prompt: '',
  },
}

async function getGithubToken(env: Env): Promise<string | null> {
  try {
    const row = await env.DB
      .prepare("SELECT value FROM settings WHERE key = 'github_token' LIMIT 1")
      .first<{ value: string }>()
    if (row?.value) return row.value
  } catch { /* ignore */ }
  try { return await env.CONFIG.get('secret:GITHUB_TOKEN') } catch { return null }
}

async function callAI(env: Env, prompt: string): Promise<string> {
  try {
    const res = await env.AI_WORKER.fetch(
      new Request(env.NEXUS_AI_URL ?? 'https://nexus-ai/task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          taskType: 'generate',
          prompt,
          outputFormat: 'text',
          timeoutMs: 90000,
        }),
      })
    )
    if (!res.ok) throw new Error(`AI worker HTTP ${res.status}`)
    const data = await res.json() as { output?: string }
    return data.output ?? ''
  } catch (err) {
    return `<!-- AI generation failed: ${err instanceof Error ? err.message : String(err)} -->`
  }
}

// ── GET /api/doc-gen/:repoId/generations ─────────────────────────────────────
docGeneratorRoutes.get('/:repoId/generations', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT id, doc_type, title, committed, commit_sha, generated_at FROM doc_generations WHERE repo_id = ? ORDER BY generated_at DESC')
    .bind(c.req.param('repoId'))
    .all<Record<string, unknown>>()
  return c.json({ generations: rows.results ?? [] })
})

// ── POST /api/doc-gen/:repoId/generate ───────────────────────────────────────
docGeneratorRoutes.post('/:repoId/generate', async (c) => {
  const repo = await c.env.DB
    .prepare('SELECT * FROM repo_projects WHERE id = ? LIMIT 1')
    .first<{ id: string; owner: string; name: string; branch: string; project_map: string | null }>(c.req.param('repoId'))
  if (!repo) return c.json({ error: 'repo not found' }, 404)

  let body: { doc_type?: DocType; custom_prompt?: string; custom_title?: string; custom_filename?: string } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }

  const { doc_type = 'readme', custom_prompt, custom_title } = body
  if (!DOC_TYPES.includes(doc_type)) return c.json({ error: `invalid doc_type; use one of: ${DOC_TYPES.join(', ')}` }, 400)

  const meta = DOC_META[doc_type]
  const projectMap = repo.project_map ? JSON.parse(repo.project_map) : {}

  const contextBlock = `
## Repository Context
- **Repository:** ${repo.owner}/${repo.name} (branch: ${repo.branch})
- **Frameworks/Stack:** ${Array.isArray(projectMap.frameworks) ? projectMap.frameworks.join(', ') : 'unknown'}
- **Description:** ${projectMap.metadata?.description ?? 'N/A'}
- **Language:** ${projectMap.metadata?.language ?? 'TypeScript'}
- **File count:** ${Array.isArray(projectMap.files) ? projectMap.files.length : 'unknown'}
- **Key files detected:** ${Array.isArray(projectMap.files) ? (projectMap.files as Array<{path: string}>).slice(0, 20).map((f) => f.path).join(', ') : 'N/A'}

## Instruction
`

  const finalPrompt = contextBlock + (doc_type === 'custom' ? (custom_prompt ?? 'Generate a helpful document.') : meta.prompt)
  const content = await callAI(c.env, finalPrompt)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const title = doc_type === 'custom' ? (custom_title ?? 'Custom Document') : meta.title

  await c.env.DB
    .prepare('INSERT INTO doc_generations (id, repo_id, doc_type, title, content, committed, generated_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
    .bind(id, repo.id, doc_type, title, content, now)
    .run()

  return c.json({ id, doc_type, title, content, generated_at: now }, 201)
})

// ── GET /api/doc-gen/:repoId/generations/:genId ───────────────────────────────
docGeneratorRoutes.get('/:repoId/generations/:genId', async (c) => {
  const row = await c.env.DB
    .prepare('SELECT * FROM doc_generations WHERE id = ? AND repo_id = ? LIMIT 1')
    .bind(c.req.param('genId'), c.req.param('repoId'))
    .first<Record<string, unknown>>()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ generation: row })
})

// ── DELETE /api/doc-gen/:repoId/generations/:genId ────────────────────────────
docGeneratorRoutes.delete('/:repoId/generations/:genId', async (c) => {
  await c.env.DB
    .prepare('DELETE FROM doc_generations WHERE id = ? AND repo_id = ?')
    .bind(c.req.param('genId'), c.req.param('repoId'))
    .run()
  return c.json({ ok: true })
})

// ── POST /api/doc-gen/:repoId/generations/:genId/commit ───────────────────────
docGeneratorRoutes.post('/:repoId/generations/:genId/commit', async (c) => {
  const gen = await c.env.DB
    .prepare('SELECT * FROM doc_generations WHERE id = ? AND repo_id = ? LIMIT 1')
    .bind(c.req.param('genId'), c.req.param('repoId'))
    .first<{ id: string; repo_id: string; doc_type: DocType; title: string; content: string; committed: number }>()
  if (!gen) return c.json({ error: 'generation not found' }, 404)

  const repo = await c.env.DB
    .prepare('SELECT * FROM repo_projects WHERE id = ? LIMIT 1')
    .first<{ id: string; owner: string; name: string; branch: string }>(gen.repo_id)
  if (!repo) return c.json({ error: 'repo not found' }, 404)

  const token = await getGithubToken(c.env)
  if (!token) return c.json({ error: 'GitHub token not configured — set github_token in Settings' }, 401)

  let body: { branch?: string; message?: string; filename?: string } = {}
  try { body = await c.req.json().catch(() => ({})) } catch { /* ignore */ }

  const meta = DOC_META[gen.doc_type]
  const filename = body.filename ?? meta.filename
  const branch = body.branch ?? repo.branch
  const message = body.message ?? `docs: update ${filename} [agent-generated]`

  // Check if file exists (need SHA for update)
  const checkRes = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${filename}?ref=${branch}`,
    { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' } }
  )
  let existingSha: string | undefined
  if (checkRes.ok) {
    const existing = await checkRes.json() as { sha?: string }
    existingSha = existing.sha
  }

  const payload: Record<string, string> = {
    message,
    content: btoa(unescape(encodeURIComponent(gen.content))),
    branch,
  }
  if (existingSha) payload.sha = existingSha

  const putRes = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${filename}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )
  if (!putRes.ok) {
    const err = await putRes.json()
    return c.json({ error: 'GitHub commit failed', details: err }, 502)
  }
  const result = await putRes.json() as { commit?: { sha?: string } }
  const commitSha = result.commit?.sha ?? ''

  await c.env.DB
    .prepare('UPDATE doc_generations SET committed = 1, commit_sha = ? WHERE id = ?')
    .bind(commitSha, gen.id)
    .run()

  return c.json({ ok: true, commit_sha: commitSha, filename, branch })
})
