/**
 * Remotion renderer adapter.
 *
 * The agent process can't / shouldn't load Remotion directly — it's
 * heavy, GPU-flavoured, and headed.  Instead this adapter POSTs the
 * storyboard to a Remotion render worker (e.g. apps/remotion-renderer)
 * which executes `npx remotion render` and returns the video URL.
 *
 * Wire shape:
 *   POST {baseUrl}/render { storyboard }
 *   → { ok, videoPath?, videoBase64?, error?, durationSec? }
 */

import type { Renderer, RenderResult, Storyboard } from '../types.js'

export interface RemotionRendererConfig {
  baseUrl: string
  authToken?: string
  fetch?: typeof fetch
  /** Timeout in ms; default 5 min. */
  timeoutMs?: number
}

export function createRemotionRenderer(config: RemotionRendererConfig): Renderer {
  const f = config.fetch ?? fetch
  return {
    async render(storyboard: Storyboard): Promise<RenderResult> {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), config.timeoutMs ?? 300_000)
      try {
        const res = await f(`${config.baseUrl.replace(/\/$/, '')}/render`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'content-type': 'application/json',
            ...(config.authToken ? { authorization: `Bearer ${config.authToken}` } : {}),
          },
          body: JSON.stringify({ storyboard }),
        })
        const data = (await res.json().catch(() => ({}))) as Partial<RenderResult>
        if (!res.ok || !data.ok) {
          return { ok: false, error: data.error ?? `Renderer HTTP ${res.status}` }
        }
        return {
          ok: true,
          videoPath: data.videoPath,
          videoBase64: data.videoBase64,
          durationSec: data.durationSec ?? storyboard.durationSec,
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        clearTimeout(t)
      }
    },
  }
}
