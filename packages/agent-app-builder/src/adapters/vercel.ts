/**
 * Vercel deploy adapter.
 *
 * Uses the v13 deployments REST API. Sends every file as an inline
 * `data` payload (base64) so we don't need to upload blobs first; this
 * is fine for the small generated apps we build but caps at ~10 MB.
 *
 * Requires VERCEL_TOKEN.  If `teamId` is provided it's appended as a
 * query param.  Returns a DeployResult conforming to the pipeline shape.
 */

import type { DeployClient, DeployResult, ScaffoldedApp } from '../types.js'

export interface VercelAdapterConfig {
  token: string
  teamId?: string
  /** Override the API base for testing. */
  baseUrl?: string
  /** Override fetch for testing. */
  fetch?: typeof fetch
}

interface VercelDeployResponse {
  id?: string
  url?: string
  inspectorUrl?: string
  error?: { message?: string; code?: string }
}

function toBase64(s: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'utf8').toString('base64')
  // Worker / browser path
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  // eslint-disable-next-line no-undef
  return btoa(bin)
}

export function createVercelDeployer(config: VercelAdapterConfig): DeployClient {
  const base = (config.baseUrl ?? 'https://api.vercel.com').replace(/\/$/, '')
  const f = config.fetch ?? fetch
  return {
    async deploy(app: ScaffoldedApp): Promise<DeployResult> {
      const files = app.files.map((file) => ({
        file: file.path,
        data: toBase64(file.content),
        encoding: 'base64' as const,
      }))
      const body = {
        name: app.spec.name,
        files,
        projectSettings: {
          framework: app.spec.template === 'next-app' ? 'nextjs' : null,
        },
        target: 'production',
      }
      const url = `${base}/v13/deployments${config.teamId ? `?teamId=${config.teamId}` : ''}`
      const res = await f(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as VercelDeployResponse
      if (!res.ok || data.error) {
        return {
          ok: false,
          error: data.error?.message ?? `HTTP ${res.status}`,
          provider: 'vercel',
        }
      }
      return {
        ok: true,
        url: data.url ? `https://${data.url}` : undefined,
        inspectorUrl: data.inspectorUrl,
        provider: 'vercel',
      }
    },
  }
}
