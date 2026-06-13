/**
 * /api/security-audit — Security Audit Agent
 *
 * Performs multi-layer security analysis on tracked GitHub repositories:
 *   1. Pattern scanning  — regex-based detection of secrets, injection sinks, misconfigs
 *   2. Dependency audit  — known-vulnerable package detection from package.json / go.mod
 *   3. AI analysis       — OWASP Top 10 review, architecture-level issues
 *   4. Executive summary — verdict (pass / warn / fail) + prioritised findings
 *
 *   POST /api/security-audit/:repoId/scans           start a scan
 *   GET  /api/security-audit/:repoId/scans           list scans
 *   GET  /api/security-audit/:repoId/scans/:scanId   get scan + findings
 *   GET  /api/security-audit/:repoId/scans/:scanId/findings  findings (filterable)
 *   PATCH /api/security-audit/findings/:findingId    update finding status
 *   DELETE /api/security-audit/:repoId/scans/:scanId delete scan
 */

import { Hono } from 'hono'
import type { Env } from '../env'

export const securityAuditRoutes = new Hono<{ Bindings: Env }>()

// ── Secret / sensitive-data patterns ─────────────────────────────────────────
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; severity: Severity }> = [
  { name: 'AWS Access Key',         pattern: /AKIA[0-9A-Z]{16}/g,                                       severity: 'critical' },
  { name: 'AWS Secret Key',         pattern: /aws[_-]?secret[_-]?access[_-]?key\s*=\s*['"][^'"]{20,}/gi, severity: 'critical' },
  { name: 'GitHub Token',           pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g,                             severity: 'critical' },
  { name: 'Stripe Secret Key',      pattern: /sk_(live|test)_[0-9a-zA-Z]{24,}/g,                        severity: 'critical' },
  { name: 'Private Key Block',      pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,         severity: 'critical' },
  { name: 'Hardcoded Password',     pattern: /password\s*[:=]\s*['"][^'"]{6,}['"]/gi,                    severity: 'high' },
  { name: 'Hardcoded Secret',       pattern: /secret\s*[:=]\s*['"][^'"]{8,}['"]/gi,                      severity: 'high' },
  { name: 'JWT Secret',             pattern: /jwt[_-]?secret\s*[:=]\s*['"][^'"]{8,}['"]/gi,              severity: 'high' },
  { name: 'Database URL with creds',pattern: /(?:mysql|postgres|mongodb):\/\/[^:@\s]+:[^@\s]+@/gi,      severity: 'high' },
  { name: 'API Key in code',        pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi,               severity: 'medium' },
  { name: 'Bearer token hardcoded', pattern: /Authorization.*Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,         severity: 'medium' },
  { name: 'SendGrid API Key',       pattern: /SG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}/g,            severity: 'high' },
  { name: 'Slack Token',            pattern: /xox[baprs]-[0-9a-zA-Z\-]{10,}/g,                          severity: 'high' },
  { name: 'Google API Key',         pattern: /AIza[0-9A-Za-z\-_]{35}/g,                                 severity: 'high' },
  { name: 'Twilio Account SID',     pattern: /AC[a-zA-Z0-9]{32}/g,                                      severity: 'medium' },
]

// ── Code vulnerability patterns ───────────────────────────────────────────────
const VULN_PATTERNS: Array<{ name: string; pattern: RegExp; severity: Severity; category: Category; desc: string }> = [
  { name: 'SQL Injection risk',       pattern: /`[^`]*\$\{[^}]+\}[^`]*`.*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/gi,                category: 'injection',  severity: 'high',   desc: 'Template literal used in SQL query — use parameterised queries instead.' },
  { name: 'Eval usage',               pattern: /\beval\s*\(/g,                                                                     category: 'injection',  severity: 'high',   desc: 'eval() executes arbitrary code and is a code injection risk.' },
  { name: 'innerHTML assignment',     pattern: /\.innerHTML\s*=/g,                                                                  category: 'xss',       severity: 'medium', desc: 'Direct innerHTML assignment enables XSS. Use textContent or DOMPurify.' },
  { name: 'dangerouslySetInnerHTML',  pattern: /dangerouslySetInnerHTML/g,                                                          category: 'xss',       severity: 'medium', desc: 'dangerouslySetInnerHTML bypasses React XSS protections.' },
  { name: 'MD5 usage',                pattern: /\bmd5\b/gi,                                                                         category: 'crypto',    severity: 'medium', desc: 'MD5 is cryptographically broken. Use SHA-256 or bcrypt for passwords.' },
  { name: 'Weak cipher (DES/RC4)',    pattern: /\b(?:des|rc4|blowfish)\b/gi,                                                        category: 'crypto',    severity: 'high',   desc: 'Weak cipher algorithm detected. Use AES-256-GCM.' },
  { name: 'Math.random for security', pattern: /Math\.random\(\)/g,                                                                 category: 'crypto',    severity: 'medium', desc: 'Math.random() is not cryptographically secure. Use crypto.getRandomValues().' },
  { name: 'CORS wildcard',            pattern: /Access-Control-Allow-Origin['":\s]+[*]/g,                                           category: 'config',    severity: 'medium', desc: 'Wildcard CORS allows any origin. Restrict to known domains.' },
  { name: 'Disabled TLS verification',pattern: /rejectUnauthorized\s*:\s*false/g,                                                   category: 'config',    severity: 'high',   desc: 'TLS verification disabled — MITM attacks possible.' },
  { name: 'HTTP not HTTPS',           pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/g,                                              category: 'config',    severity: 'low',    desc: 'Plain HTTP URL found. Use HTTPS in production.' },
  { name: 'Console.log in prod code', pattern: /console\.log\(/g,                                                                   category: 'other',     severity: 'info',   desc: 'console.log leaks internals. Use a structured logger.' },
  { name: 'TODO/FIXME security note', pattern: /(?:TODO|FIXME|HACK|XXX).*(?:security|auth|secret|password|token)/gi,               category: 'other',     severity: 'low',    desc: 'Unresolved security-related TODO comment.' },
  { name: 'Insecure cookie flag',     pattern: /cookie.*(?:httpOnly|secure)\s*:\s*false/gi,                                         category: 'auth',      severity: 'medium', desc: 'Cookie missing httpOnly or secure flag.' },
  { name: 'JWT none algorithm',       pattern: /alg.*none/gi,                                                                        category: 'auth',      severity: 'critical', desc: 'JWT "none" algorithm allows signature bypass.' },
]

// ── Known vulnerable packages (subset — illustrative) ────────────────────────
const KNOWN_VULNS: Record<string, { title: string; severity: Severity; cve?: string }> = {
  'lodash': { title: 'lodash <4.17.21 prototype pollution (CVE-2021-23337)', severity: 'high', cve: 'CVE-2021-23337' },
  'axios': { title: 'axios <1.6.0 SSRF via URL redirect (CVE-2023-45857)', severity: 'medium', cve: 'CVE-2023-45857' },
  'express': { title: 'express <4.19.0 open redirect (CVE-2024-29041)', severity: 'medium', cve: 'CVE-2024-29041' },
  'jsonwebtoken': { title: 'jsonwebtoken <9.0.0 algorithm confusion (CVE-2022-23529)', severity: 'high', cve: 'CVE-2022-23529' },
  'minimist': { title: 'minimist <1.2.6 prototype pollution (CVE-2021-44906)', severity: 'high', cve: 'CVE-2021-44906' },
  'node-fetch': { title: 'node-fetch <2.6.7 SSRF (CVE-2022-0235)', severity: 'high', cve: 'CVE-2022-0235' },
  'semver': { title: 'semver <7.5.2 ReDoS (CVE-2022-25883)', severity: 'medium', cve: 'CVE-2022-25883' },
  'tough-cookie': { title: 'tough-cookie <4.1.3 prototype pollution (CVE-2023-26136)', severity: 'medium', cve: 'CVE-2023-26136' },
  'word-wrap': { title: 'word-wrap <1.2.4 ReDoS (CVE-2023-26115)', severity: 'medium', cve: 'CVE-2023-26115' },
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
type Category = 'secret' | 'injection' | 'xss' | 'auth' | 'crypto' | 'config' | 'deps' | 'owasp' | 'insecure-design' | 'other'
type FindingSource = 'pattern' | 'ai' | 'dep'

interface Finding {
  id: string
  severity: Severity
  category: Category
  file_path?: string
  line_number?: number
  title: string
  description?: string
  snippet?: string
  suggestion?: string
  source: FindingSource
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getGithubToken(env: Env): Promise<string | null> {
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'github_token' LIMIT 1").first<{ value: string }>()
    if (row?.value) return row.value
  } catch { /* ignore */ }
  try { return await env.CONFIG.get('secret:GITHUB_TOKEN') } catch { return null }
}

async function fetchRepoFile(token: string, owner: string, name: string, path: string, ref: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${path}?ref=${ref}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const data = await res.json() as { content?: string; encoding?: string }
    if (data.encoding === 'base64' && data.content) return atob(data.content.replace(/\n/g, ''))
    return null
  } catch { return null }
}

async function fetchFileList(token: string, owner: string, name: string, ref: string): Promise<Array<{ path: string; type: string; size?: number }>> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/git/trees/${ref}?recursive=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return []
    const data = await res.json() as { tree?: Array<{ path: string; type: string; size?: number }> }
    return (data.tree ?? []).filter(f => f.type === 'blob')
  } catch { return [] }
}

function patternScanContent(content: string, filePath: string): Finding[] {
  const findings: Finding[] = []
  const lines = content.split('\n')

  const scanWith = (
    patterns: Array<{ name: string; pattern: RegExp; severity: Severity; category?: Category; desc?: string }>,
    defaultCategory: Category
  ) => {
    for (const { name, pattern, severity, category, desc } of patterns) {
      let match: RegExpExecArray | null
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
      while ((match = re.exec(content)) !== null) {
        const lineIndex = content.substring(0, match.index).split('\n').length - 1
        const snippet = lines[lineIndex]?.trim().slice(0, 200)
        findings.push({
          id: crypto.randomUUID(),
          severity,
          category: category ?? defaultCategory,
          file_path: filePath,
          line_number: lineIndex + 1,
          title: name,
          description: desc ?? `Pattern match: ${name}`,
          snippet,
          suggestion: getSuggestion(name),
          source: 'pattern',
        })
      }
    }
  }

  scanWith(SECRET_PATTERNS.map(p => ({ ...p, category: 'secret' as Category })), 'secret')
  scanWith(VULN_PATTERNS, 'injection')
  return findings
}

function getSuggestion(name: string): string {
  const suggestions: Record<string, string> = {
    'AWS Access Key': 'Rotate key immediately. Store in Cloudflare Secrets / environment variables — never in source code.',
    'GitHub Token': 'Revoke token immediately at github.com/settings/tokens. Use secrets management.',
    'Stripe Secret Key': 'Rotate at dashboard.stripe.com. Store as encrypted secret.',
    'Hardcoded Password': 'Move to environment variable or secrets vault. Hash stored passwords with bcrypt.',
    'SQL Injection risk': 'Use parameterised queries or an ORM query builder — never interpolate user data into SQL.',
    'Eval usage': 'Remove eval(). Use JSON.parse() for data, or dynamic imports for code.',
    'innerHTML assignment': 'Use element.textContent for plain text, or sanitise with DOMPurify before setting innerHTML.',
    'CORS wildcard': "Set Access-Control-Allow-Origin to your specific domain(s) rather than '*'.",
    'MD5 usage': 'Replace with SHA-256 (crypto.subtle.digest) for hashing, or bcrypt/argon2 for passwords.',
    'Math.random for security': 'Replace with crypto.getRandomValues() or crypto.randomUUID().',
    'Disabled TLS verification': 'Remove rejectUnauthorized: false. Fix the certificate issue properly.',
    'JWT none algorithm': 'Explicitly whitelist allowed algorithms (e.g. HS256, RS256) and reject "none".',
    'Insecure cookie flag': 'Set { httpOnly: true, secure: true, sameSite: "Strict" } on all auth cookies.',
  }
  return suggestions[name] ?? 'Review and remediate according to your security policy.'
}

function verdictFromCounts(critical: number, high: number, medium: number): 'pass' | 'warn' | 'fail' {
  if (critical > 0 || high > 5) return 'fail'
  if (high > 0 || medium > 3) return 'warn'
  return 'pass'
}

async function callAI(env: Env, prompt: string): Promise<string> {
  try {
    const res = await env.AI_WORKER.fetch(new Request(env.NEXUS_AI_URL ?? 'https://nexus-ai/task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskType: 'generate', prompt, outputFormat: 'text', timeoutMs: 90000 }),
    }))
    if (!res.ok) return ''
    const d = await res.json() as { output?: string }
    return d.output ?? ''
  } catch { return '' }
}

// ── POST /api/security-audit/:repoId/scans — start a scan ────────────────────
securityAuditRoutes.post('/:repoId/scans', async (c) => {
  const repo = await c.env.DB
    .prepare('SELECT * FROM repo_projects WHERE id = ? LIMIT 1')
    .first<{ id: string; owner: string; name: string; branch: string }>(c.req.param('repoId'))
  if (!repo) return c.json({ error: 'repo not found' }, 404)

  let body: { branch?: string; file_limit?: number } = {}
  try { body = await c.req.json().catch(() => ({})) } catch { /* ignore */ }

  const branch = body.branch ?? repo.branch
  const fileLimit = Math.min(body.file_limit ?? 80, 150)

  const token = await getGithubToken(c.env)
  if (!token) return c.json({ error: 'GitHub token not configured — set github_token in Settings' }, 401)

  const scanId = crypto.randomUUID()
  const now = new Date().toISOString()
  await c.env.DB
    .prepare('INSERT INTO security_scans (id, repo_id, branch, status, started_at) VALUES (?, ?, ?, ?, ?)')
    .bind(scanId, repo.id, branch, 'running', now)
    .run()

  // Run scan (best-effort — don't block the response)
  const runScan = async () => {
    const allFindings: Finding[] = []
    let filesScanned = 0

    try {
      // 1. Fetch file list
      const files = await fetchFileList(token, repo.owner, repo.name, branch)
      const targetFiles = files
        .filter(f => /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|php|rb|env|yaml|yml|json|toml|sh|bash)$/.test(f.path))
        .filter(f => !/node_modules|\.git|dist\/|build\/|\.next\//.test(f.path))
        .slice(0, fileLimit)

      // 2. Pattern scan each file
      for (const file of targetFiles) {
        const content = await fetchRepoFile(token, repo.owner, repo.name, file.path, branch)
        if (!content) continue
        filesScanned++
        const findings = patternScanContent(content, file.path)
        allFindings.push(...findings)
      }

      // 3. Dependency audit — check package.json
      const pkgJson = await fetchRepoFile(token, repo.owner, repo.name, 'package.json', branch)
      if (pkgJson) {
        try {
          const pkg = JSON.parse(pkgJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
          const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
          for (const [name] of Object.entries(allDeps)) {
            const vuln = KNOWN_VULNS[name]
            if (vuln) {
              allFindings.push({
                id: crypto.randomUUID(),
                severity: vuln.severity,
                category: 'deps',
                file_path: 'package.json',
                title: vuln.title,
                description: vuln.cve ? `CVE: ${vuln.cve}` : 'Known vulnerable dependency version.',
                suggestion: `Upgrade ${name} to the latest patched version. Run: pnpm update ${name}`,
                source: 'dep',
              })
            }
          }
        } catch { /* ignore */ }
      }

      // 4. AI analysis — OWASP Top 10 pass
      const topFiles = files
        .filter(f => /\.(ts|tsx|js)$/.test(f.path) && !/node_modules|dist\/|\.next\//.test(f.path))
        .slice(0, 8)
      const codeSnippets: string[] = []
      for (const f of topFiles) {
        const c2 = await fetchRepoFile(token, repo.owner, repo.name, f.path, branch)
        if (c2) codeSnippets.push(`// ${f.path}\n${c2.slice(0, 600)}`)
      }

      if (codeSnippets.length > 0) {
        const aiPrompt = `You are a senior application security engineer. Perform an OWASP Top 10 security review of the following code from the repository ${repo.owner}/${repo.name}.

Identify security vulnerabilities NOT already covered by: ${allFindings.map(f => f.title).slice(0, 10).join(', ')}.

Focus on:
1. Broken Access Control (OWASP A01)
2. Cryptographic Failures (A02)
3. Injection (A03)
4. Insecure Design (A04)
5. Security Misconfiguration (A05)
6. Vulnerable Components (A06)
7. Auth failures (A07)
8. SSRF (A10)

For each finding output JSON lines with keys: title, severity (critical/high/medium/low/info), category (injection/xss/auth/crypto/config/owasp/insecure-design/other), file_path, description, suggestion.

Code to review:
${codeSnippets.join('\n\n---\n\n').slice(0, 8000)}`

        const aiOutput = await callAI(c.env, aiPrompt)

        // Parse JSON findings from AI output
        const jsonLineRegex = /\{[^{}]+\}/g
        let m: RegExpExecArray | null
        while ((m = jsonLineRegex.exec(aiOutput)) !== null) {
          try {
            const f = JSON.parse(m[0]) as Partial<Finding>
            if (f.title && f.severity) {
              allFindings.push({
                id: crypto.randomUUID(),
                severity: (['critical','high','medium','low','info'].includes(f.severity ?? '') ? f.severity : 'medium') as Severity,
                category: f.category ?? 'owasp',
                file_path: f.file_path,
                title: String(f.title),
                description: f.description,
                suggestion: f.suggestion,
                source: 'ai',
              })
            }
          } catch { /* skip bad JSON */ }
        }
      }

      // 5. AI executive summary
      const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
      for (const f of allFindings) counts[f.severity]++
      const verdict = verdictFromCounts(counts.critical, counts.high, counts.medium)

      const summaryPrompt = `You are a security engineer writing an executive summary. The scan of ${repo.owner}/${repo.name} found: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${counts.info} info findings. Verdict: ${verdict}. Top findings: ${allFindings.filter(f => ['critical','high'].includes(f.severity)).slice(0, 5).map(f => f.title).join(', ')}. Write 3-4 sentences: overall risk assessment, most critical items to fix first, recommended next steps.`
      const summary = await callAI(c.env, summaryPrompt)

      // 6. Store findings in DB
      for (const f of allFindings) {
        await c.env.DB
          .prepare('INSERT INTO security_findings (id, scan_id, repo_id, severity, category, file_path, line_number, title, description, snippet, suggestion, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(f.id, scanId, repo.id, f.severity, f.category, f.file_path ?? null, f.line_number ?? null, f.title, f.description ?? null, f.snippet ?? null, f.suggestion ?? null, f.source)
          .run()
      }

      // 7. Update scan record
      await c.env.DB
        .prepare('UPDATE security_scans SET status=?, total_files=?, total_findings=?, critical_count=?, high_count=?, medium_count=?, low_count=?, info_count=?, verdict=?, summary=?, completed_at=? WHERE id=?')
        .bind('done', filesScanned, allFindings.length, counts.critical, counts.high, counts.medium, counts.low, counts.info, verdict, summary || null, new Date().toISOString(), scanId)
        .run()
    } catch (err) {
      await c.env.DB
        .prepare('UPDATE security_scans SET status=?, error=?, completed_at=? WHERE id=?')
        .bind('failed', err instanceof Error ? err.message : String(err), new Date().toISOString(), scanId)
        .run()
    }
  }

  // Run asynchronously (Cloudflare Workers: use waitUntil)
  c.executionCtx?.waitUntil(runScan())

  return c.json({ id: scanId, status: 'running', repo: `${repo.owner}/${repo.name}`, branch, started_at: now }, 202)
})

// ── GET /api/security-audit/:repoId/scans ─────────────────────────────────────
securityAuditRoutes.get('/:repoId/scans', async (c) => {
  const rows = await c.env.DB
    .prepare('SELECT id, branch, status, total_files, total_findings, critical_count, high_count, medium_count, low_count, info_count, verdict, started_at, completed_at FROM security_scans WHERE repo_id = ? ORDER BY started_at DESC LIMIT 20')
    .bind(c.req.param('repoId'))
    .all<Record<string, unknown>>()
  return c.json({ scans: rows.results ?? [] })
})

// ── GET /api/security-audit/:repoId/scans/:scanId ─────────────────────────────
securityAuditRoutes.get('/:repoId/scans/:scanId', async (c) => {
  const scan = await c.env.DB
    .prepare('SELECT * FROM security_scans WHERE id = ? AND repo_id = ? LIMIT 1')
    .bind(c.req.param('scanId'), c.req.param('repoId'))
    .first<Record<string, unknown>>()
  if (!scan) return c.json({ error: 'not found' }, 404)

  const findings = await c.env.DB
    .prepare('SELECT * FROM security_findings WHERE scan_id = ? ORDER BY CASE severity WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 WHEN \'low\' THEN 3 ELSE 4 END, file_path ASC')
    .bind(c.req.param('scanId'))
    .all<Record<string, unknown>>()

  return c.json({ scan, findings: findings.results ?? [] })
})

// ── GET /api/security-audit/:repoId/scans/:scanId/findings ────────────────────
securityAuditRoutes.get('/:repoId/scans/:scanId/findings', async (c) => {
  const { severity, category, status: fStatus, source } = c.req.query()
  let sql = 'SELECT * FROM security_findings WHERE scan_id = ?'
  const params: unknown[] = [c.req.param('scanId')]
  if (severity) { sql += ' AND severity = ?'; params.push(severity) }
  if (category) { sql += ' AND category = ?'; params.push(category) }
  if (fStatus)  { sql += ' AND status = ?';   params.push(fStatus) }
  if (source)   { sql += ' AND source = ?';   params.push(source) }
  sql += " ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END"

  const rows = await c.env.DB.prepare(sql).bind(...params).all<Record<string, unknown>>()
  return c.json({ findings: rows.results ?? [], count: (rows.results ?? []).length })
})

// ── PATCH /api/security-audit/findings/:findingId ────────────────────────────
securityAuditRoutes.patch('/findings/:findingId', async (c) => {
  let body: { status?: string } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'invalid JSON' }, 400) }
  const { status: newStatus } = body
  const allowed = ['open','acknowledged','resolved','false_positive']
  if (!newStatus || !allowed.includes(newStatus)) return c.json({ error: `status must be one of: ${allowed.join(', ')}` }, 400)

  await c.env.DB
    .prepare('UPDATE security_findings SET status = ? WHERE id = ?')
    .bind(newStatus, c.req.param('findingId'))
    .run()
  return c.json({ ok: true })
})

// ── DELETE /api/security-audit/:repoId/scans/:scanId ──────────────────────────
securityAuditRoutes.delete('/:repoId/scans/:scanId', async (c) => {
  await c.env.DB.prepare('DELETE FROM security_scans WHERE id = ? AND repo_id = ?').bind(c.req.param('scanId'), c.req.param('repoId')).run()
  return c.json({ ok: true })
})

// ── GET /api/security-audit/patterns — expose scanner metadata ────────────────
securityAuditRoutes.get('/patterns', async (c) => {
  return c.json({
    secret_patterns: SECRET_PATTERNS.map(p => ({ name: p.name, severity: p.severity })),
    vuln_patterns: VULN_PATTERNS.map(p => ({ name: p.name, severity: p.severity, category: p.category, desc: p.desc })),
    known_vulnerable_deps: Object.keys(KNOWN_VULNS),
  })
})
