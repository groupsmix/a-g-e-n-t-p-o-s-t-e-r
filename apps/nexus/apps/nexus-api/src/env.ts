import type { D1Database, KVNamespace, R2Bucket, Ai, Fetcher } from '@cloudflare/workers-types'
import type { BrowserWorker } from '@cloudflare/puppeteer'

// Environment bindings for Cloudflare Workers
export interface Env {
  // Main binding - D1 SQLite database
  DB: D1Database

  // KV namespace for config cache and rate limiting
  CONFIG: KVNamespace

  // R2 bucket for asset storage
  ASSETS: R2Bucket

  // Cloudflare Images / Workers AI binding
  IMAGES: Ai

  // Service binding to AI worker
  AI_WORKER: Fetcher

  // Service binding to this same worker — lets a long workflow run kick off a
  // fresh invocation (e.g. deliverable generation) with its own time budget.
  SELF?: Fetcher

  // Browser Rendering binding (headless Chromium — Workers Paid plan).
  // Optional so local/free environments without it still type-check and run.
  BROWSER?: BrowserWorker

  // Cloudflare Workflows binding
  PRODUCT_WORKFLOW: {
    create(options: { id?: string; params?: unknown }): Promise<{ id: string }>
    get(id: string): Promise<unknown>
  }

  // Secrets Store for API keys
  SECRETS: {
    get(key: string): Promise<string | null>
  }

  // Key-Encryption-Key for the credentials vault. 32 bytes encoded as 64-char
  // hex (preferred) or base64url. Set via `wrangler secret put KEK`. The vault
  // route refuses to write new entries when this isn't configured, but legacy
  // plaintext rows still read OK so an unconfigured worker still boots.
  KEK?: string

  // Legacy alias for KEK. Honoured by the credentials vault for back-compat.
  MASTER_KEY?: string

  // Cloudflare account ID for Images API
  CF_ACCOUNT_ID?: string

  // Cloudflare API token for Images API
  CF_API_TOKEN?: string

  // Hyperbeam API key for live browser sessions
  HYPERBEAM_API_KEY?: string

  // Gumroad access token for auto-publish
  GUMROAD_ACCESS_TOKEN?: string

  // URL for the Nexus AI service endpoint (configurable, defaults to https://nexus-ai/task)
  NEXUS_AI_URL?: string

  // Optional access-gate password provided as a worker secret. When set, the
  // dashboard/API gate is active IMMEDIATELY on a fresh deploy — there is no
  // "open until a password is written to KV" window (the previous gap). This
  // is the authoritative password when present; rotate it via
  // `wrangler secret put ACCESS_PASSWORD`. Leave unset to use the KV-based
  // bootstrap flow (set a password from the dashboard on first run).
  ACCESS_PASSWORD?: string

  // Static admin token for /api/money-machine/* (paid LLM + image + publish).
  // Required regardless of the dashboard access-gate state — these endpoints
  // burn money, so they must never be reachable without explicit auth.
  // Set via `wrangler secret put MONEY_MACHINE_TOKEN`. If unset, the routes
  // are disabled entirely (return 503) — fail closed.
  MONEY_MACHINE_TOKEN?: string

  // Comma-separated allow-list of origins for CORS on /api/*. Defaults to
  // wildcard only when unset (legacy behaviour for local dev). Set this in
  // production to the dashboard origin(s), e.g.
  //   "https://nexus-web-cl2.pages.dev,https://nexus.example.com".
  ALLOWED_ORIGINS?: string
}
