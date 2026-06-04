import { Hono } from 'hono'
import type { Env } from '../env'
import { TEAM_ROLES } from '../services/workflow-engine'

// ============================================================
// GET /team — the AI agent team line-up: each role, the model assigned to
// it (rank 1 from the failover registry), its fallback chain, and whether
// each model is configured. Shows that many specialized models work
// together (in parallel waves) rather than one model doing everything.
// ============================================================

export const teamRoutes = new Hono<{ Bindings: Env }>()

interface RegistryModel {
  id: string
  name: string
  provider: string
  rank: number
  isFree: boolean
  why: string
  configured: boolean
}

teamRoutes.get('/', async (c) => {
  let registry: Record<string, RegistryModel[]> = {}
  try {
    const res = await c.env.AI_WORKER.fetch(new Request('https://nexus-ai/registry'))
    if (res.ok) {
      const data = (await res.json()) as { registry?: Record<string, RegistryModel[]> }
      registry = data.registry || {}
    }
  } catch {
    // If the AI worker is unreachable we still return roles without models.
  }

  const FREE_FALLBACK: RegistryModel = {
    id: 'free-engine',
    name: 'Groq Llama 3.3 70B / Cloudflare Workers AI',
    provider: 'free-engine',
    rank: 99,
    isFree: true,
    why: 'Always-on free fallback so a role never stalls.',
    configured: true,
  }

  const roles = TEAM_ROLES.map((r) => {
    const models = registry[r.taskType] || []
    // The model that ACTUALLY runs: the highest-ranked configured provider,
    // otherwise the always-free engine. This stays honest about what's live.
    const primary = models.find((m) => m.configured) || FREE_FALLBACK
    return {
      role: r.role,
      step: r.step,
      wave: r.wave,
      taskType: r.taskType,
      primary: { name: primary.name, provider: primary.provider, isFree: primary.isFree, configured: primary.configured },
      fallbacks: models.map((m) => ({ name: m.name, provider: m.provider, isFree: m.isFree, configured: m.configured })),
      // Every role can always fall back to the free engine.
      free_safety_net: true,
    }
  })

  // Group by wave so the UI can show which roles run in parallel.
  const waves: { wave: number; parallel: boolean; roles: typeof roles }[] = []
  for (const r of roles) {
    let w = waves.find((x) => x.wave === r.wave)
    if (!w) { w = { wave: r.wave, parallel: false, roles: [] }; waves.push(w) }
    w.roles.push(r)
  }
  for (const w of waves) w.parallel = w.roles.length > 1
  waves.sort((a, b) => a.wave - b.wave)

  return c.json({ roles, waves })
})
