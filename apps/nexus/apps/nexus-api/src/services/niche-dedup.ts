// ============================================================
// Niche de-duplication and quality guards.
//
// Originally lived inside `routes/autopilot.ts`. We extracted it because
// the user kept seeing duplicate niches (`physical essentials`,
// `essentials`, two `Retro Gaming`s) even though autopilot already had a
// dedup check — because the OTHER paths that create products (manager,
// schedules, agent, trend-promote, workflow) had no dedup at all. This
// module is now the single shared check called by every product-insert
// entry point.
// ============================================================
import type { Env } from '../env'

// Fillers we strip before measuring token overlap. "essentials" and
// "premium" are NOT in here on purpose — they are the kind of cliché the
// user wants flagged by isGeneric instead.
const FILLER = new Set([
  'the', 'a', 'an', 'for', 'and', 'of', 'to', 'in', 'with', 'your',
  'my', 'digital', 'product', 'products',
])

export function nicheTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !FILLER.has(w)),
  )
}

// Two niches are duplicates when their significant-word Jaccard ≥ 0.6.
// We dropped the threshold-tunable signature to keep callers honest:
// every entry point should answer the same yes/no.
export function isNearDuplicate(candidate: string, existing: string[]): boolean {
  const a = nicheTokens(candidate)
  if (a.size === 0) return true // empty / all-filler → reject as duplicate-of-nothing
  for (const e of existing) {
    const b = nicheTokens(e)
    if (b.size === 0) continue
    let inter = 0
    for (const w of a) if (b.has(w)) inter++
    const union = new Set([...a, ...b]).size
    if (inter / union >= 0.6) return true
  }
  return false
}

// Reject the lazy/generic niches the user called out: "essentials",
// "physical essentials", "bundle", "stuff", etc. These are almost always
// LLM filler that produces near-identical products.
export function isGeneric(s: string): boolean {
  return (
    /\b(essentials|stuff|things|bundle|misc|general|various|premium)\b/i.test(s) ||
    nicheTokens(s).size < 2
  )
}

// Pull the niches that are "in play" — anything live, building, or
// awaiting review. Rejected + graveyard'd rows are intentionally excluded
// so a discarded run doesn't permanently block its own niche.
export async function fetchLiveNiches(env: Env, limit = 200): Promise<string[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT niche FROM products
        WHERE niche IS NOT NULL AND niche != ''
          AND graveyard_at IS NULL
          AND status IN ('draft','running','pending_review','in_revision','approved','published')
        ORDER BY created_at DESC LIMIT ?`,
    )
      .bind(limit)
      .all<{ niche: string }>()
    return (rows.results ?? []).map((r) => r.niche).filter(Boolean)
  } catch {
    return []
  }
}

// One-call guard for product-insert paths. Returns null when the niche
// is fine; otherwise returns a human-readable reason the caller can use
// to log + respond.
export async function checkNiche(
  env: Env,
  niche: string | null | undefined,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const n = (niche || '').trim()
  if (!n) return { ok: false, reason: 'niche is empty' }
  if (isGeneric(n)) return { ok: false, reason: `niche "${n}" is too generic (essentials/bundle/etc.)` }
  const live = await fetchLiveNiches(env)
  if (isNearDuplicate(n, live)) {
    return { ok: false, reason: `niche "${n}" duplicates an active product` }
  }
  return { ok: true }
}
