/**
 * Vercel project create + deploy. We rely on a pre-built Next.js
 * template repo (configured via TEMPLATE_REPO env) — site-factory
 * just creates a new project pointing at it with the right Cosmic
 * env vars wired in.
 */

import type { SiteDeployClient } from '../types.js'

export interface VercelSiteConfig {
  token: string
  teamId?: string
  /** GitHub repo to clone as the Next.js template (must already exist). */
  templateRepo: string
  /** Env vars passed to the project at create time. */
  cosmicEnv?: { bucketSlug: string; readKey: string }
  baseUrl?: string
  fetch?: typeof fetch
}

interface VercelProjectResponse {
  id?: string
  name?: string
  alias?: Array<{ domain?: string }>
  error?: { message?: string }
}

export function createVercelSiteDeployer(config: VercelSiteConfig): SiteDeployClient {
  const base = (config.baseUrl ?? 'https://api.vercel.com').replace(/\/$/, '')
  const f = config.fetch ?? fetch
  return {
    async deploy({ bucket }) {
      const envVars = config.cosmicEnv
        ? [
            { key: 'COSMIC_BUCKET_SLUG', value: config.cosmicEnv.bucketSlug, target: ['production'], type: 'plain' as const },
            { key: 'COSMIC_READ_KEY', value: config.cosmicEnv.readKey, target: ['production'], type: 'encrypted' as const },
          ]
        : []
      const body = {
        name: bucket.slug,
        gitRepository: { repo: config.templateRepo, type: 'github' },
        framework: 'nextjs',
        environmentVariables: envVars,
      }
      const url = `${base}/v10/projects${config.teamId ? `?teamId=${config.teamId}` : ''}`
      const res = await f(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as VercelProjectResponse
      if (!res.ok || data.error) {
        return {
          ok: false,
          provider: 'vercel',
          error: data.error?.message ?? `HTTP ${res.status}`,
        }
      }
      const domain = data.alias?.[0]?.domain ?? `${bucket.slug}.vercel.app`
      return {
        ok: true,
        provider: 'vercel',
        url: `https://${domain}`,
      }
    },
  }
}
