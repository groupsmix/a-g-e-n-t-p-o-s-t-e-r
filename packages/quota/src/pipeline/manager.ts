/**
 * QuotaManager — the runtime façade.
 *
 *   acquire(provider, action, cost?)  → AcquireDecision
 *   recordFailure(provider, action, retryAfterMs?)
 *   recordSuccess(provider, action)
 *
 * Sliding-window algorithm: keep request timestamps for the last
 * `window_ms`; if length < limit, allow and append. Daily limit is
 * a flat 24h counter anchored at UTC midnight. Cooldown is just a
 * hard "do not call before X" flag set by 429 responses.
 */

import type {
  AcquireDecision, QuotaPolicy, QuotaState, QuotaStore,
} from '../types'

function dayAnchor(now: Date): string {
  const d = new Date(now)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

function ensureState(provider: string, action: string, now: Date, existing?: QuotaState | null): QuotaState {
  if (!existing) {
    return { provider, action, recent_ms: [], daily_count: 0, daily_anchor_iso: dayAnchor(now) }
  }
  // Reset daily counter if day rolled.
  const anchor = dayAnchor(now)
  if (anchor !== existing.daily_anchor_iso) {
    return { ...existing, daily_count: 0, daily_anchor_iso: anchor }
  }
  return existing
}

function prune(state: QuotaState, now: Date, windowMs: number): QuotaState {
  const cutoff = now.getTime() - windowMs
  return { ...state, recent_ms: state.recent_ms.filter((t) => t > cutoff) }
}

function pickPolicy(policies: QuotaPolicy[], provider: string, action: string): QuotaPolicy | undefined {
  return policies.find((p) => p.provider === provider && p.action === action)
      ?? policies.find((p) => p.provider === provider && (!p.action || p.action === '*'))
}

export interface QuotaManagerInput {
  store: QuotaStore
  now?: () => Date
}

export class QuotaManager {
  constructor(private input: QuotaManagerInput) {}
  private now(): Date { return this.input.now?.() ?? new Date() }

  async acquire(provider: string, action = '*', cost = 1): Promise<AcquireDecision> {
    const policies = await this.input.store.loadPolicies()
    const policy = pickPolicy(policies, provider, action)
    const now = this.now()
    if (!policy) {
      return {
        allowed: true,
        policy: { provider, action, limit: Infinity, window_ms: 0 },
        remaining_in_window: Infinity,
      }
    }
    let state = ensureState(provider, action, now, await this.input.store.getState(provider, action))
    state = prune(state, now, policy.window_ms)
    // Cooldown.
    if (state.cooldown_until_ms && state.cooldown_until_ms > now.getTime()) {
      return {
        allowed: false, policy,
        remaining_in_window: Math.max(0, policy.limit - state.recent_ms.length),
        retry_at_ms: state.cooldown_until_ms,
        reason: 'cooldown',
      }
    }
    // Daily.
    if (policy.daily_limit && state.daily_count + cost > policy.daily_limit) {
      const nextAnchor = new Date(state.daily_anchor_iso)
      nextAnchor.setUTCDate(nextAnchor.getUTCDate() + 1)
      return {
        allowed: false, policy,
        remaining_in_window: Math.max(0, policy.limit - state.recent_ms.length),
        remaining_today: 0,
        retry_at_ms: nextAnchor.getTime(),
        reason: 'daily',
      }
    }
    // Sliding window.
    if (state.recent_ms.length + cost > policy.limit) {
      const oldest = state.recent_ms[0]!
      return {
        allowed: false, policy,
        remaining_in_window: 0,
        retry_at_ms: oldest + policy.window_ms,
        reason: 'window',
      }
    }
    // Allowed — record consumption.
    for (let i = 0; i < cost; i++) state.recent_ms.push(now.getTime())
    state.daily_count += cost
    await this.input.store.saveState(state)
    return {
      allowed: true, policy,
      remaining_in_window: Math.max(0, policy.limit - state.recent_ms.length),
      remaining_today: policy.daily_limit ? Math.max(0, policy.daily_limit - state.daily_count) : undefined,
    }
  }

  async recordFailure(provider: string, action = '*', retryAfterMs?: number): Promise<void> {
    const now = this.now()
    let state = ensureState(provider, action, now, await this.input.store.getState(provider, action))
    const policies = await this.input.store.loadPolicies()
    const policy = pickPolicy(policies, provider, action)
    const cooldown = retryAfterMs ?? policy?.cooldown_ms ?? 60_000
    state = { ...state, cooldown_until_ms: now.getTime() + cooldown }
    await this.input.store.saveState(state)
  }

  async recordSuccess(provider: string, action = '*'): Promise<void> {
    const now = this.now()
    const state = await this.input.store.getState(provider, action)
    if (!state || !state.cooldown_until_ms) return
    if (state.cooldown_until_ms <= now.getTime()) {
      await this.input.store.saveState({ ...state, cooldown_until_ms: undefined })
    }
  }
}
