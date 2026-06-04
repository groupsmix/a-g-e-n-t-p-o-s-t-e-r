import { Hono } from 'hono'
import type { Env } from '../env'

export const keyRoutes = new Hono<{ Bindings: Env }>()

// The provider keys NEXUS knows how to use. `worker` decides where the key is
// needed: AI keys are forwarded to the nexus-ai worker, publishing keys stay on
// nexus-api. Everything is stored in KV as secret:<KEY>.
interface KeySpec {
  key: string
  label: string
  group: 'AI' | 'Publishing' | 'Social' | 'Email'
  help: string
  worker: 'ai' | 'api'
}

const KEY_SPECS: KeySpec[] = [
  { key: 'GROQ_API_KEY', label: 'Groq (free AI text — always-on baseline)', group: 'AI', worker: 'ai', help: 'https://console.groq.com/keys' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI / GPT (copy, headlines, QA)', group: 'AI', worker: 'ai', help: 'https://platform.openai.com/api-keys' },
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic / Claude (strategy, editing, CEO review)', group: 'AI', worker: 'ai', help: 'https://console.anthropic.com/settings/keys' },
  { key: 'GOOGLE_API_KEY', label: 'Google / Gemini (reasoning)', group: 'AI', worker: 'ai', help: 'https://aistudio.google.com/app/apikey' },
  { key: 'PERPLEXITY_API_KEY', label: 'Perplexity Sonar (web-grounded research)', group: 'AI', worker: 'ai', help: 'https://www.perplexity.ai/settings/api' },
  { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek (cheap reasoning + numeric)', group: 'AI', worker: 'ai', help: 'https://platform.deepseek.com/api_keys' },
  { key: 'MISTRAL_API_KEY', label: 'Mistral (fast text)', group: 'AI', worker: 'ai', help: 'https://console.mistral.ai/api-keys' },
  { key: 'FAL_KEY', label: 'fal.ai (optional FLUX Pro images)', group: 'AI', worker: 'ai', help: 'https://fal.ai/dashboard/keys' },
  { key: 'GUMROAD_ACCESS_TOKEN', label: 'Gumroad (free product listings)', group: 'Publishing', worker: 'api', help: 'https://app.gumroad.com/settings/advanced' },
  { key: 'SHOPIFY_STORE', label: 'Shopify store domain', group: 'Publishing', worker: 'api', help: 'my-store.myshopify.com' },
  { key: 'SHOPIFY_ADMIN_TOKEN', label: 'Shopify Admin API token', group: 'Publishing', worker: 'api', help: 'Store admin → Apps → Admin API token' },
  { key: 'PUBLISH_WEBHOOK_URL', label: 'Webhook (Zapier/Make — social + any platform)', group: 'Social', worker: 'api', help: 'Free Zapier/Make webhook URL' },
  { key: 'AYRSHARE_API_KEY', label: 'Ayrshare (optional, paid social)', group: 'Social', worker: 'api', help: 'https://app.ayrshare.com/api' },
  { key: 'RESEND_API_KEY', label: 'Resend (email delivery — free tier)', group: 'Email', worker: 'api', help: 'https://resend.com/api-keys' },
  { key: 'EMAIL_FROM', label: 'From address (verified Resend sender)', group: 'Email', worker: 'api', help: 'e.g. NEXUS <you@yourdomain.com> — defaults to onboarding@resend.dev' },
  { key: 'EMAIL_TO', label: 'Default delivery email (where schedules are sent)', group: 'Email', worker: 'api', help: 'Your inbox, e.g. you@gmail.com' },
]

function mask(v: string): string {
  if (v.length <= 4) return '••••'
  return `${'•'.repeat(Math.max(4, v.length - 4))}${v.slice(-4)}`
}

// GET /keys — list every known provider key with whether it's set (masked).
keyRoutes.get('/', async (c) => {
  const items = await Promise.all(
    KEY_SPECS.map(async (spec) => {
      let stored: string | null = null
      try {
        stored = await c.env.CONFIG.get(`secret:${spec.key}`)
      } catch {
        stored = null
      }
      const envVal = (c.env as unknown as Record<string, unknown>)[spec.key]
      const fromEnv = typeof envVal === 'string' && envVal.length > 0
      return {
        ...spec,
        configured: Boolean(stored) || fromEnv,
        masked: stored ? mask(stored) : fromEnv ? '•••• (worker secret)' : null,
      }
    })
  )
  return c.json({ keys: items })
})

// POST /keys — save one or more keys. Body: { keys: { KEY: value, ... } }.
// Empty string deletes a key. AI keys are also pushed to the nexus-ai worker.
keyRoutes.post('/', async (c) => {
  const body = await c.req.json<{ keys?: Record<string, string> }>()
  const incoming = body.keys || {}
  const known = new Map(KEY_SPECS.map((s) => [s.key, s]))
  const aiForward: Record<string, string> = {}
  let written = 0

  for (const [k, v] of Object.entries(incoming)) {
    const spec = known.get(k)
    if (!spec || typeof v !== 'string') continue
    const kvKey = `secret:${k}`
    if (v.trim().length === 0) {
      await c.env.CONFIG.delete(kvKey)
    } else {
      await c.env.CONFIG.put(kvKey, v.trim())
      written++
    }
    if (spec.worker === 'ai') aiForward[k] = v.trim()
  }

  // Forward AI provider keys to the nexus-ai worker so the AI runtime can use them.
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

  return c.json({ ok: true, written, ai_forwarded: aiForwarded })
})

// ---- AI cost meter + daily spend cap (proxied to the nexus-ai worker) ----

// GET /keys/spend — today's paid-model spend + the configured daily cap.
keyRoutes.get('/spend', async (c) => {
  try {
    const res = await c.env.AI_WORKER.fetch(new Request('https://nexus-ai/spend'))
    if (res.ok) return c.json(await res.json())
  } catch { /* fall through */ }
  return c.json({ today: 0, cap: 0, cap_reached: false })
})

// POST /keys/cap { cap_usd } — set the daily spend cap (0 = unlimited).
keyRoutes.post('/cap', async (c) => {
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

// GET /keys/providers — per-provider ON/OFF state.
keyRoutes.get('/providers', async (c) => {
  try {
    const res = await c.env.AI_WORKER.fetch(new Request('https://nexus-ai/providers'))
    if (res.ok) return c.json(await res.json())
  } catch { /* fall through */ }
  return c.json({ providers: [] })
})

// POST /keys/providers/toggle { secretKey, off } — pause/resume a provider.
keyRoutes.post('/providers/toggle', async (c) => {
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
