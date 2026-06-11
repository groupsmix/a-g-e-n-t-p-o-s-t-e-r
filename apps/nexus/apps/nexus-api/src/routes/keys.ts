import { Hono } from 'hono'
import type { Env } from '../env'
import {
  encrypt,
  decryptOrPassthrough,
  isEncrypted,
  parseKek,
} from '../services/credentials/crypto'


// The provider keys NEXUS knows how to use. `worker` decides where the key is
// needed: AI keys are forwarded to the nexus-ai worker, publishing keys stay on
// nexus-api. Storage layer: encrypted with AES-256-GCM under env.KEK (or
// MASTER_KEY) and written to KV as `secret:<KEY>`. Legacy plaintext rows are
// transparently migrated on the next write.
interface KeySpec {
  key: string
  label: string
  group: 'AI' | 'Publishing' | 'Social' | 'Email'
  help: string
  worker: 'ai' | 'api'
}


const KEY_SPECS: KeySpec[] = [
  { key: 'GROQ_API_KEY', label: 'Groq (free AI text, always-on baseline)', group: 'AI', worker: 'ai', help: 'https://console.groq.com/keys' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI / GPT (copy, headlines, QA)', group: 'AI', worker: 'ai', help: 'https://platform.openai.com/api-keys' },
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic / Claude (strategy, editing, CEO review)', group: 'AI', worker: 'ai', help: 'https://console.anthropic.com/settings/keys' },
  { key: 'GOOGLE_API_KEY', label: 'Google / Gemini (reasoning)', group: 'AI', worker: 'ai', help: 'https://aistudio.google.com/app/apikey' },
  { key: 'PERPLEXITY_API_KEY', label: 'Perplexity Sonar (web-grounded research)', group: 'AI', worker: 'ai', help: 'https://www.perplexity.ai/settings/api' },
  { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek (cheap reasoning + numeric)', group: 'AI', worker: 'ai', help: 'https://platform.deepseek.com/api_keys' },
  { key: 'MISTRAL_API_KEY', label: 'Mistral (fast text)', group: 'AI', worker: 'ai', help: 'https://console.mistral.ai/api-keys' },
  { key: 'FAL_KEY', label: 'fal.ai (optional FLUX Pro images)', group: 'AI', worker: 'ai', help: 'https://fal.ai/dashboard/keys' },
  { key: 'GUMROAD_ACCESS_TOKEN', label: 'Gumroad (free product listings)', group: 'Publishing', worker: 'api', help: 'https://app.gumroad.com/settings/advanced' },
  { key: 'SHOPIFY_STORE', label: 'Shopify store domain', group: 'Publishing', worker: 'api', help: 'my-store.myshopify.com' },
  { key: 'SHOPIFY_ADMIN_TOKEN', label: 'Shopify Admin API token', group: 'Publishing', worker: 'api', help: 'Store admin -> Apps -> Admin API token' },
  { key: 'PUBLISH_WEBHOOK_URL', label: 'Webhook (Zapier/Make, social + any platform)', group: 'Social', worker: 'api', help: 'Free Zapier/Make webhook URL' },
  { key: 'AYRSHARE_API_KEY', label: 'Ayrshare (optional, paid social)', group: 'Social', worker: 'api', help: 'https://app.ayrshare.com/api' },
  { key: 'RESEND_API_KEY', label: 'Resend (email delivery, free tier)', group: 'Email', worker: 'api', help: 'https://resend.com/api-keys' },
  { key: 'EMAIL_FROM', label: 'From address (verified Resend sender)', group: 'Email', worker: 'api', help: 'e.g. NEXUS <you@yourdomain.com>, defaults to onboarding@resend.dev' },
  { key: 'EMAIL_TO', label: 'Default delivery email (where schedules are sent)', group: 'Email', worker: 'api', help: 'Your inbox, e.g. you@gmail.com' },
]


const KNOWN = new Map(KEY_SPECS.map((s) => [s.key, s]))


function mask(v: string): string {
  if (v.length <= 4) return '••••'
  return `${'•'.repeat(Math.max(4, v.length - 4))}${v.slice(-4)}`
}


// ─── KEK loading ──────────────────────────────────────────────────────────
//
// KEK is loaded from `env.KEK` (preferred) or `env.MASTER_KEY` (legacy). When
// neither is present we MUST refuse to write new ciphertext, otherwise we'd
// silently fall back to plaintext storage. We DO still allow reads of legacy
// plaintext rows so an unconfigured worker doesn't 500 every key list call.
function loadKek(env: Env): Uint8Array | null {
  const raw = (env as unknown as Record<string, unknown>)['KEK']
    ?? (env as unknown as Record<string, unknown>)['MASTER_KEY']
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    return parseKek(raw)
  } catch {
    return null
  }
}


/** Read+decrypt a single key from KV, or `null` when not set. */
async function readPlaintext(env: Env, key: string): Promise<string | null> {
  const stored = await env.CONFIG.get(`secret:${key}`).catch(() => null)
  if (!stored) return null
  const kek = loadKek(env)
  if (!kek) {
    // No KEK configured. If the row is plaintext, we can still return it.
    // If it's encrypted we have to fail closed (better than returning garbage).
    if (isEncrypted(stored)) return null
    return stored
  }
  try {
    return await decryptOrPassthrough(stored, kek)
  } catch {
    return null
  }
}


// ─── Per-provider testers ─────────────────────────────────────────────────
//
// Each tester returns { ok, status, message }. We deliberately use the
// cheapest available "list" endpoint per provider so a ping doesn't burn
// credits. A 200 means the key is valid; a 401/403 means it isn't.

type TestResult = { ok: boolean; status: string; message: string }

type Tester = (value: string, env: Env) => Promise<TestResult>


async function checkBearerGet(url: string, value: string): Promise<TestResult> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${value}` } })
  if (res.ok) return { ok: true, status: 'ok', message: `${res.status}` }
  return { ok: false, status: 'unauthorized', message: `${res.status} ${res.statusText}` }
}


const TESTERS: Record<string, Tester> = {
  GROQ_API_KEY: (v) => checkBearerGet('https://api.groq.com/openai/v1/models', v),
  OPENAI_API_KEY: (v) => checkBearerGet('https://api.openai.com/v1/models', v),
  ANTHROPIC_API_KEY: async (v) => {
    // Anthropic requires POST /v1/messages, but a GET to /v1/models returns
    // 200 with x-api-key auth (newer API).
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': v, 'anthropic-version': '2023-06-01' },
    })
    if (res.ok) return { ok: true, status: 'ok', message: `${res.status}` }
    return { ok: false, status: 'unauthorized', message: `${res.status} ${res.statusText}` }
  },
  GOOGLE_API_KEY: async (v) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(v)}`,
    )
    if (res.ok) return { ok: true, status: 'ok', message: `${res.status}` }
    return { ok: false, status: 'unauthorized', message: `${res.status} ${res.statusText}` }
  },
  PERPLEXITY_API_KEY: async (v) => {
    // Perplexity doesn't expose /models publicly — cheapest probe is a 1-token
    // /chat/completions call. We catch HTTP errors as failures.
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${v}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    })
    if (res.ok) return { ok: true, status: 'ok', message: `${res.status}` }
    return { ok: false, status: 'unauthorized', message: `${res.status} ${res.statusText}` }
  },
  DEEPSEEK_API_KEY: (v) => checkBearerGet('https://api.deepseek.com/models', v),
  MISTRAL_API_KEY: (v) => checkBearerGet('https://api.mistral.ai/v1/models', v),
  FAL_KEY: async (v) => {
    // fal.ai uses `Key <token>` auth scheme.
    const res = await fetch('https://queue.fal.run/health', {
      headers: { Authorization: `Key ${v}` },
    })
    if (res.ok) return { ok: true, status: 'ok', message: `${res.status}` }
    return { ok: false, status: 'unauthorized', message: `${res.status} ${res.statusText}` }
  },
  GUMROAD_ACCESS_TOKEN: async (v) => {
    // Audit #5: token moved from query string to Authorization header.
    const res = await fetch('https://api.gumroad.com/v2/user', {
      headers: { Authorization: `Bearer ${v}` },
    })
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { success?: boolean }
      if (body.success) return { ok: true, status: 'ok', message: `${res.status}` }
    }
    return { ok: false, status: 'unauthorized', message: `${res.status} ${res.statusText}` }
  },
  RESEND_API_KEY: (v) => checkBearerGet('https://api.resend.com/api-keys', v),
  AYRSHARE_API_KEY: async (v) => {
    const res = await fetch('https://app.ayrshare.com/api/user', {
      headers: { Authorization: `Bearer ${v}` },
    })
    if (res.ok) return { ok: true, status: 'ok', message: `${res.status}` }
    return { ok: false, status: 'unauthorized', message: `${res.status} ${res.statusText}` }
  },
  PUBLISH_WEBHOOK_URL: async (v) => {
    // Send a small ping payload. Treat any 2xx as healthy; the user's webhook
    // should be permissive about a ping shape.
    try {
      const res = await fetch(v, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ping: true, source: 'nexus-api/keys/test' }),
      })
      if (res.ok) return { ok: true, status: 'ok', message: `${res.status}` }
      return { ok: false, status: 'http_error', message: `${res.status} ${res.statusText}` }
    } catch (err) {
      return { ok: false, status: 'unreachable', message: err instanceof Error ? err.message : 'fetch failed' }
    }
  },
}

export const keyRoutes = new Hono<{ Bindings: Env }>()

// ─── GET / — list every known provider key with whether it's set (masked) ──
//
// We surface `source` per key so the dashboard can show the user where the
// active key actually comes from: 'kv' (saved via this UI), 'worker_secret'
// (set via `wrangler secret` on the Worker env), or null (truly not set).
// Previously the UI said "Not set" for any key without a KV row even when a
// worker secret was driving the engine — which is how an "engine running with
// 39 products at $0.00" can happen alongside a screen that claims no keys are
// configured. The aggregate `ai_configured_count` + `ai_provider_source` make
// that mismatch impossible.
  .get('/', async (c) => {
  const kek = loadKek(c.env)
  const items = await Promise.all(
    KEY_SPECS.map(async (spec) => {
      const stored = await c.env.CONFIG.get(`secret:${spec.key}`).catch(() => null)
      const envVal = (c.env as unknown as Record<string, unknown>)[spec.key]
      const fromEnv = typeof envVal === 'string' && envVal.length > 0

      // Decrypt (or passthrough legacy) just so we can mask the last 4 chars.
      // The plaintext NEVER leaves this handler — only its mask does.
      let plaintext: string | null = null
      if (stored) {
        if (kek) {
          plaintext = await decryptOrPassthrough(stored, kek).catch(() => null)
        } else if (!isEncrypted(stored)) {
          plaintext = stored
        }
      }

      const source: 'kv' | 'worker_secret' | null = stored
        ? 'kv'
        : fromEnv
          ? 'worker_secret'
          : null

      return {
        ...spec,
        configured: Boolean(stored) || fromEnv,
        source,
        masked: plaintext
          ? mask(plaintext)
          : stored
            ? '•••• (encrypted, no KEK)'
            : fromEnv
              ? '•••• (worker secret)'
              : null,
        encrypted: stored ? isEncrypted(stored) : false,
      }
    }),
  )

  const aiItems = items.filter((k) => k.group === 'AI')
  const aiConfigured = aiItems.filter((k) => k.configured)
  // The "active" source for AI generation is the first AI key the runtime
  // would actually pick up. KV beats worker secret because saving a key in
  // the UI writes to KV and is forwarded to the AI worker; if KV is empty we
  // fall back to whatever the AI worker has on its env.
  const aiKv = aiConfigured.find((k) => k.source === 'kv')
  const aiEnv = aiConfigured.find((k) => k.source === 'worker_secret')
  const aiActive = aiKv ?? aiEnv ?? null

  return c.json({
    keys: items,
    kek_configured: kek !== null,
    ai_configured_count: aiConfigured.length,
    ai_provider_source: aiActive
      ? { key: aiActive.key, label: aiActive.label, source: aiActive.source }
      : null,
  })
})


// ─── POST / — save one or more keys ───────────────────────────────────────
//
// Body: { keys: { KEY: value, ... } }. Empty string deletes a key. AI keys are
// also pushed (in plaintext, over a service binding) to the nexus-ai worker so
// the AI runtime can use them.
  .post('/', async (c) => {
  const body = await c.req.json<{ keys?: Record<string, string> }>()
  const incoming = body.keys || {}
  const kek = loadKek(c.env)
  const aiForward: Record<string, string> = {}
  let written = 0
  const errors: string[] = []

  for (const [k, v] of Object.entries(incoming)) {
    const spec = KNOWN.get(k)
    if (!spec || typeof v !== 'string') continue
    const kvKey = `secret:${k}`
    const trimmed = v.trim()
    if (trimmed.length === 0) {
      await c.env.CONFIG.delete(kvKey)
      if (spec.worker === 'ai') aiForward[k] = ''
      continue
    }
    if (!kek) {
      errors.push(`${k}: refusing to write without KEK configured`)
      continue
    }
    try {
      const ciphertext = await encrypt(trimmed, kek)
      await c.env.CONFIG.put(kvKey, ciphertext)
      written++
    } catch (err) {
      errors.push(`${k}: ${err instanceof Error ? err.message : 'encrypt failed'}`)
      continue
    }
    if (spec.worker === 'ai') aiForward[k] = trimmed
  }

  // Forward AI provider keys to the nexus-ai worker.
  let aiForwarded = false
  if (Object.keys(aiForward).length > 0 && c.env.AI_WORKER) {
    try {
      const res = await c.env.AI_WORKER.fetch('https://nexus-ai/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: aiForward }),
      })
      aiForwarded = res.ok
    } catch {
      aiForwarded = false
    }
  }

  return c.json({
    ok: errors.length === 0,
    written,
    ai_forwarded: aiForwarded,
    errors: errors.length ? errors : undefined,
  })
})


// ─── POST /test/:key — ping a provider with the stored key ────────────────
//
// Returns { ok, status, message, latency_ms } so the dashboard can show a
// per-integration health pill. Implementations live in `testers` below; for
// providers without a tester we return `not_implemented`.
  .post('/test/:key', async (c) => {
  const keyName = c.req.param('key')
  const spec = KNOWN.get(keyName)
  if (!spec) return c.json({ ok: false, message: 'unknown key' }, 404)
  const plaintext = await readPlaintext(c.env, keyName)
  // Fall back to worker secret env if KV isn't populated.
  const envFallback = (c.env as unknown as Record<string, unknown>)[keyName]
  const value =
    plaintext ??
    (typeof envFallback === 'string' && envFallback.length > 0 ? envFallback : null)
  if (!value) return c.json({ ok: false, message: 'key not configured' }, 400)

  const tester = TESTERS[keyName]
  if (!tester) {
    return c.json({
      ok: false,
      status: 'not_implemented',
      message: `ping for ${keyName} not implemented yet`,
    })
  }

  const t0 = Date.now()
  try {
    const result = await tester(value, c.env)
    return c.json({ ...result, latency_ms: Date.now() - t0 })
  } catch (err) {
    return c.json({
      ok: false,
      status: 'error',
      message: err instanceof Error ? err.message : 'ping failed',
      latency_ms: Date.now() - t0,
    })
  }
})


// ─── AI cost meter + daily spend cap (proxied to the nexus-ai worker) ─────

// GET /spend — today's paid-model spend + the configured daily cap.
  .get('/spend', async (c) => {
  try {
    const res = await c.env.AI_WORKER.fetch(new Request('https://nexus-ai/spend'))
    if (res.ok) return c.json(await res.json())
  } catch { /* fall through */ }
  return c.json({ today: 0, cap: 0, cap_reached: false })
})


// POST /cap { cap_usd } — set the daily spend cap (0 = unlimited).
  .post('/cap', async (c) => {
  const body = await c.req.json<{ cap_usd?: number }>()
  try {
    const res = await c.env.AI_WORKER.fetch('https://nexus-ai/cap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return c.json(await res.json(), res.ok ? 200 : 502)
  } catch {
    return c.json({ error: 'AI worker unreachable' }, 502)
  }
})


// GET /providers — per-provider ON/OFF state.
  .get('/providers', async (c) => {
  try {
    const res = await c.env.AI_WORKER.fetch(new Request('https://nexus-ai/providers'))
    if (res.ok) return c.json(await res.json())
  } catch { /* fall through */ }
  return c.json({ providers: [] })
})


// POST /providers/toggle { secretKey, off } — pause/resume a provider.
  .post('/providers/toggle', async (c) => {
  const body = await c.req.json<{ secretKey?: string; off?: boolean }>()
  try {
    const res = await c.env.AI_WORKER.fetch('https://nexus-ai/providers/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return c.json(await res.json(), res.ok ? 200 : 502)
  } catch {
    return c.json({ error: 'AI worker unreachable' }, 502)
  }
})
