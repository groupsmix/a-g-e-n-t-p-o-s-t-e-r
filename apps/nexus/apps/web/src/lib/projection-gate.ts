// ============================================================
// projection-gate.ts — T9
// ============================================================
// Single source of truth for "do we trust revenue projections yet?".
//
// The /api/autopilot/status endpoint already computes this server-side
// (est_revenue_locked + est_revenue_locked_reason — see BUG-P1-6 in
// routes/autopilot.ts). The UI used to consult it only on the autopilot
// page, while the per-product revenue_estimate_detail leaked the same
// fantasy on /review/:id and /products/:id.
//
// This hook fetches the gate once per session (with a 60-second cache),
// so any view that wants to show a projection can ask the same question
// and stay consistent. While the gate is loading we err on the side of
// hiding — better a missing number than a misleading one.
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { api } from './api'

export interface ProjectionGate {
  locked: boolean
  reason: string | null
  real_sales: number
  loaded: boolean
}

const CACHE_TTL_MS = 60_000
let cache: { value: ProjectionGate; at: number } | null = null
const subscribers: Array<(v: ProjectionGate) => void> = []

async function loadGate(): Promise<ProjectionGate> {
  try {
    const status = await api.getAutopilot()
    return {
      locked: !!status.est_revenue_locked || !status.est_revenue,
      reason: status.est_revenue_locked_reason ?? null,
      real_sales: status.real_sales ?? 0,
      loaded: true,
    }
  } catch {
    // Fail closed — if we can't confirm we've crossed the threshold,
    // assume we haven't.
    return { locked: true, reason: null, real_sales: 0, loaded: true }
  }
}

export function useProjectionGate(): ProjectionGate {
  const [state, setState] = useState<ProjectionGate>(() => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
    return { locked: true, reason: null, real_sales: 0, loaded: false }
  })

  useEffect(() => {
    let active = true
    const onUpdate = (v: ProjectionGate) => {
      if (active) setState(v)
    }
    subscribers.push(onUpdate)

    if (!cache || Date.now() - cache.at >= CACHE_TTL_MS) {
      loadGate().then((v) => {
        cache = { value: v, at: Date.now() }
        for (const s of subscribers) s(v)
      })
    } else if (!state.loaded) {
      // We picked up a fresh cache entry — flush it to the consumer.
      setState(cache.value)
    }

    return () => {
      active = false
      const i = subscribers.indexOf(onUpdate)
      if (i >= 0) subscribers.splice(i, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}
