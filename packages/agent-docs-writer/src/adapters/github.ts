/**
 * GitHub repo fetcher.
 *
 * 1. GET the recursive tree for the default branch (or the requested ref).
 * 2. Pick up to N text key-files (README, package.json, src/index.*,
 *    tsconfig, the first 5 source files).
 * 3. Fetch their raw contents.
 *
 * Auth is optional — public repos work without it but burn into the
 * 60 req/h unauthenticated rate limit fast.
 */

import type { RepoFetcher, RepoFile, RepoSnapshot } from '../types.js'

export interface GitHubFetcherConfig {
  token?: string
  baseUrl?: string
  fetch?: typeof fetch
  /** cap on bytes pulled per file */
  maxFileBytes?: number
  /** cap on number of key files fetched */
  maxKeyFiles?: number
}

interface TreeResponse {
  tree?: Array<{ path?: string; type?: string; size?: number }>
  truncated?: boolean
}

interface RepoMetaResponse {
  default_branch?: string
  description?: string
  language?: string
}

const KEY_RX = [
  /^README(\.md)?$/i,
  /^package\.json$/,
  /^pyproject\.toml$/,
  /^Cargo\.toml$/,
  /^go\.mod$/,
  /^tsconfig\.json$/,
  /^src\/index\.(ts|js|tsx|jsx)$/,
]

export function createGitHubFetcher(config: GitHubFetcherConfig = {}): RepoFetcher {
  const base = (config.baseUrl ?? 'https://api.github.com').replace(/\/$/, '')
  const f = config.fetch ?? fetch
  const maxBytes = config.maxFileBytes ?? 8000
  const maxKey = config.maxKeyFiles ?? 8
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'posteragent-docs-writer',
  }
  if (config.token) headers.authorization = `Bearer ${config.token}`

  return {
    async fetch({ repo, ref }) {
      const [owner, name] = repo.split('/')
      if (!owner || !name) throw new Error(`bad repo "${repo}" (want "owner/name")`)
      const meta = (await (
        await f(`${base}/repos/${owner}/${name}`, { headers })
      ).json().catch(() => ({}))) as RepoMetaResponse
      const branch = ref ?? meta.default_branch ?? 'main'
      const treeRes = (await (
        await f(`${base}/repos/${owner}/${name}/git/trees/${branch}?recursive=1`, { headers })
      ).json().catch(() => ({}))) as TreeResponse
      const allFiles = (treeRes.tree ?? [])
        .filter((t) => t.type === 'blob' && typeof t.path === 'string')
        .map((t) => t.path!)

      // pick key files
      const keyPaths: string[] = []
      for (const rx of KEY_RX) {
        const hit = allFiles.find((p) => rx.test(p))
        if (hit && !keyPaths.includes(hit)) keyPaths.push(hit)
      }
      // add up to 5 extra source files for context
      for (const p of allFiles) {
        if (keyPaths.length >= maxKey) break
        if (/^src\/[^/]+\.(ts|tsx|js|jsx|py|go|rs)$/.test(p) && !keyPaths.includes(p)) {
          keyPaths.push(p)
        }
      }

      const keyFiles: RepoFile[] = []
      for (const path of keyPaths) {
        try {
          const r = await f(
            `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${path}`,
            { headers },
          )
          if (!r.ok) continue
          const txt = (await r.text()).slice(0, maxBytes)
          keyFiles.push({ path, content: txt })
        } catch {
          /* skip */
        }
      }

      const snap: RepoSnapshot = {
        name,
        description: meta.description,
        files: allFiles,
        keyFiles,
        language: meta.language?.toLowerCase(),
      }
      return snap
    },
  }
}
