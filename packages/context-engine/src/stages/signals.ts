/**
 * Signals stage. Loads system signals via the registered provider,
 * or assembles a sane default with just `nowIso` set.
 */

import type {
  ContextConfig,
  SystemSignals,
  SystemSignalsProvider,
} from '../types.js'

export async function loadSignals(input: {
  provider?: SystemSignalsProvider
  config: ContextConfig
  signal?: AbortSignal
  log?: {
    info(msg: string, meta?: Record<string, unknown>): void
    warn(msg: string, meta?: Record<string, unknown>): void
  }
}): Promise<SystemSignals> {
  if (!input.provider) {
    return { nowIso: new Date().toISOString() }
  }
  try {
    const out = await Promise.race([
      input.provider.load({ signal: input.signal }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`signals timeout ${input.config.retrieveTimeoutMs}ms`)),
          input.config.retrieveTimeoutMs,
        ),
      ),
    ])
    // Always overwrite nowIso to the moment the engine ran, even if
    // the provider returns a stale snapshot.
    return { ...out, nowIso: new Date().toISOString() }
  } catch (err) {
    input.log?.warn('signals: load failed, using defaults', {
      error: (err as Error).message,
    })
    return { nowIso: new Date().toISOString() }
  }
}
