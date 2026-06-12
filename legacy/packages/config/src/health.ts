/**
 * Service health check utility.
 *
 * Pings every external dependency at boot and returns a structured report.
 * Used by `pnpm dev` precheck and the `/api/health` endpoint.
 */

interface ServiceCheck {
  name: string
  category: 'ai' | 'cms' | 'storage' | 'social' | 'monetisation' | 'analytics' | 'infra'
  required: boolean
  check: () => Promise<HealthResult>
}

export interface HealthResult {
  name: string
  category: string
  required: boolean
  ok: boolean
  latencyMs?: number
  detail?: string
  skipReason?: string
}

export interface HealthReport {
  ok: boolean
  checkedAt: string
  totalMs: number
  passed: number
  failed: number
  skipped: number
  services: HealthResult[]
}

/** Wrap a fetch in a timeout. */
async function pingWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; latencyMs: number }> {
  const { timeoutMs = 5000, ...rest } = init
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const res = await fetch(url, { ...rest, signal: ac.signal })
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - t0 }
  } finally {
    clearTimeout(timer)
  }
}

const checks: ServiceCheck[] = [
  {
    name: 'anthropic',
    category: 'ai',
    required: true,
    check: async () => {
      const key = process.env['ANTHROPIC_API_KEY']
      if (!key) return missing('anthropic', 'ai', true)
      const { latencyMs, ok, status } = await pingWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
          timeoutMs: 8000,
        },
      )
      // 200 = working, 400 = key valid but request shape weird, 401 = bad key
      return {
        name: 'anthropic',
        category: 'ai',
        required: true,
        ok: status !== 401 && status !== 403,
        latencyMs,
        detail: `HTTP ${status}`,
      }
    },
  },
  {
    name: 'openai',
    category: 'ai',
    required: true,
    check: async () => {
      const key = process.env['OPENAI_API_KEY']
      if (!key) return missing('openai', 'ai', true)
      const { latencyMs, ok, status } = await pingWithTimeout(
        'https://api.openai.com/v1/models',
        { headers: { Authorization: `Bearer ${key}` }, timeoutMs: 5000 },
      )
      return { name: 'openai', category: 'ai', required: true, ok, latencyMs, detail: `HTTP ${status}` }
    },
  },
  {
    name: 'cosmic',
    category: 'cms',
    required: true,
    check: async () => {
      const slug = process.env['COSMIC_BUCKET_SLUG']
      const key = process.env['COSMIC_READ_KEY']
      if (!slug || !key) return missing('cosmic', 'cms', true)
      const { latencyMs, ok, status } = await pingWithTimeout(
        `https://api.cosmicjs.com/v3/buckets/${slug}?read_key=${key}`,
        { timeoutMs: 5000 },
      )
      return { name: 'cosmic', category: 'cms', required: true, ok, latencyMs, detail: `HTTP ${status}` }
    },
  },
  {
    name: 'replicate',
    category: 'ai',
    required: true,
    check: async () => {
      const key = process.env['REPLICATE_API_TOKEN']
      if (!key) return missing('replicate', 'ai', true)
      const { latencyMs, ok, status } = await pingWithTimeout('https://api.replicate.com/v1/account', {
        headers: { Authorization: `Token ${key}` },
        timeoutMs: 5000,
      })
      return { name: 'replicate', category: 'ai', required: true, ok, latencyMs, detail: `HTTP ${status}` }
    },
  },
  {
    name: 'elevenlabs',
    category: 'ai',
    required: false,
    check: async () => {
      const key = process.env['ELEVENLABS_API_KEY']
      if (!key) return missing('elevenlabs', 'ai', false)
      const { latencyMs, ok, status } = await pingWithTimeout(
        'https://api.elevenlabs.io/v1/user',
        { headers: { 'xi-api-key': key }, timeoutMs: 5000 },
      )
      return { name: 'elevenlabs', category: 'ai', required: false, ok, latencyMs, detail: `HTTP ${status}` }
    },
  },
  {
    name: 'fal',
    category: 'ai',
    required: false,
    check: async () => {
      const key = process.env['FAL_API_KEY']
      if (!key) return missing('fal', 'ai', false)
      return { name: 'fal', category: 'ai', required: false, ok: true, detail: 'key-present' }
    },
  },
  // Audit #10: Supabase + Vercel are required by the env schema but were
  // never health-checked, so a revoked key or paused project only surfaced
  // as a mid-pipeline crash. (D1/KV/R2 are Workers bindings — they are
  // probed by nexus-api's /health?deep=1 endpoint, not from Node.)
  {
    name: 'supabase',
    category: 'storage',
    required: true,
    check: async () => {
      const url = process.env['SUPABASE_URL']
      const key = process.env['SUPABASE_ANON_KEY']
      if (!url || !key) return missing('supabase', 'storage', true)
      const { latencyMs, ok, status } = await pingWithTimeout(
        `${url.replace(/\/$/, '')}/auth/v1/health`,
        { headers: { apikey: key }, timeoutMs: 5000 },
      )
      return { name: 'supabase', category: 'storage', required: true, ok, latencyMs, detail: `HTTP ${status}` }
    },
  },
  {
    name: 'vercel',
    category: 'infra',
    required: true,
    check: async () => {
      const token = process.env['VERCEL_TOKEN']
      if (!token) return missing('vercel', 'infra', true)
      const { latencyMs, ok, status } = await pingWithTimeout('https://api.vercel.com/v2/user', {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 5000,
      })
      return { name: 'vercel', category: 'infra', required: true, ok, latencyMs, detail: `HTTP ${status}` }
    },
  },
]

function missing(name: string, category: HealthResult['category'], required: boolean): HealthResult {
  return {
    name,
    category,
    required,
    ok: !required,
    skipReason: 'missing-env',
    detail: required ? 'required key missing' : 'optional key not set',
  }
}

/**
 * Run all configured health checks in parallel.
 */
export async function runHealthChecks(opts?: { onlyRequired?: boolean }): Promise<HealthReport> {
  const startedAt = Date.now()
  const active = opts?.onlyRequired ? checks.filter((c) => c.required) : checks
  const results = await Promise.all(
    active.map(async (c) => {
      try {
        return await c.check()
      } catch (err) {
        return {
          name: c.name,
          category: c.category,
          required: c.required,
          ok: !c.required,
          detail: err instanceof Error ? err.message : String(err),
        }
      }
    }),
  )

  const passed = results.filter((r) => r.ok && !r.skipReason).length
  const failed = results.filter((r) => !r.ok).length
  const skipped = results.filter((r) => r.skipReason).length

  return {
    ok: failed === 0,
    checkedAt: new Date().toISOString(),
    totalMs: Date.now() - startedAt,
    passed,
    failed,
    skipped,
    services: results,
  }
}

/**
 * Print a human-friendly health report and exit nonzero on failure.
 */
export async function printHealthReport(opts?: { onlyRequired?: boolean }): Promise<HealthReport> {
  const report = await runHealthChecks(opts)
  const icon = (r: HealthResult) => (r.skipReason ? '○' : r.ok ? '✓' : '✗')
  console.log(`\nHealth check — ${report.checkedAt}  (${report.totalMs}ms)`)
  for (const r of report.services) {
    const lat = r.latencyMs != null ? `${r.latencyMs}ms` : '   '
    console.log(`  ${icon(r)} [${r.category.padEnd(12)}] ${r.name.padEnd(14)} ${lat.padStart(7)}  ${r.detail ?? ''}`)
  }
  console.log(`\n${report.passed} passed · ${report.failed} failed · ${report.skipped} skipped\n`)
  return report
}
