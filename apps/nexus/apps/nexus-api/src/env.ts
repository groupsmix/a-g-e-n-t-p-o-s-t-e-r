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
}
