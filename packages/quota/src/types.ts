/**
 * Rate-limit + quota contracts (TASK-1102).
 *
 * A QuotaPolicy is a declarative ceiling for a provider — N requests
 * per W milliseconds, optionally with a daily ceiling on top. Calls
 * acquire a token before making the upstream request:
 *
 *   const decision = await mgr.acquire('twitter', 'POST /tweets', 1)
 *   if (!decision.allowed) waitUntil(decision.retry_at)
 *
 * Token consumption is tracked per (provider, action) so distinct
 * endpoints don't share buckets unintentionally.
 *
 * The store keeps a small sliding window of recent timestamps plus
 * running daily counts; nothing fancier is needed for the typical
 * 50-500 req/min APIs we hit.
 */

export interface QuotaPolicy {
  provider: string
  /** Optional endpoint/action tag — '*' applies to all. */
  action?: string
  /** Limit per window (e.g. 50 requests). */
  limit: number
  /** Window length in milliseconds (e.g. 60_000 = per minute). */
  window_ms: number
  /** Optional rolling-24h ceiling that supersedes the sliding window. */
  daily_limit?: number
  /** When set, after a 429 we wait at least this many ms before retrying. */
  cooldown_ms?: number
}

export interface QuotaState {
  provider: string
  action: string
  /** Timestamps of recent requests within the active window. */
  recent_ms: number[]
  /** Rolling-24h count, reset when day rolls over (UTC). */
  daily_count: number
  daily_anchor_iso: string
  /** When set, no acquire is allowed until this ms timestamp. */
  cooldown_until_ms?: number
}

export interface AcquireDecision {
  allowed: boolean
  policy: QuotaPolicy
  remaining_in_window: number
  remaining_today?: number
  /** When !allowed, the earliest ms timestamp the caller can retry. */
  retry_at_ms?: number
  reason?: 'window' | 'daily' | 'cooldown'
}

export interface QuotaStore {
  loadPolicies(): Promise<QuotaPolicy[]>
  upsertPolicy(p: QuotaPolicy): Promise<void>
  getState(provider: string, action: string): Promise<QuotaState | null>
  saveState(state: QuotaState): Promise<void>
}
