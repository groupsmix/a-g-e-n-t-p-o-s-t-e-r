/**
 * Types for the App Builder pipeline (TASK-500).
 *
 * Lifecycle: parseSpec → scaffold → codegen → check → deploy.
 * Each stage takes the previous stage's output as input so the whole
 * pipeline is a `reduce` over typed shapes — easy to unit test.
 */

export type AppTemplate =
  | 'next-app'        // Next.js 14 app router + tailwind
  | 'hono-api'        // Cloudflare Worker + Hono
  | 'static-site'     // plain HTML/CSS/JS
  | 'react-spa'       // Vite + React SPA

export type AppFeature =
  | 'auth'
  | 'db'
  | 'payments'
  | 'email'
  | 'cron'
  | 'ai'
  | 'analytics'

export interface AppSpec {
  /** Short slug, used as the project name. */
  name: string
  /** One-line elevator pitch. */
  pitch: string
  /** Chosen template. */
  template: AppTemplate
  /** Logical pages or endpoints to scaffold. */
  pages: Array<{ path: string; purpose: string }>
  /** Optional toggled features. */
  features: AppFeature[]
  /** Free-form notes from the LLM planner for the codegen pass. */
  notes?: string
}

export interface ScaffoldedFile {
  path: string
  content: string
  /** If true, codegen will replace the placeholder; false = final. */
  needsCodegen?: boolean
}

export interface ScaffoldedApp {
  spec: AppSpec
  files: ScaffoldedFile[]
}

export interface BuildIssue {
  file: string
  line?: number
  message: string
  severity: 'error' | 'warning'
}

export interface BuildResult {
  app: ScaffoldedApp
  ok: boolean
  issues: BuildIssue[]
  /** seconds spent in the build stage */
  durationSec: number
}

export interface DeployResult {
  ok: boolean
  url?: string
  inspectorUrl?: string
  error?: string
  /** Provider name for the journal entry. */
  provider: 'vercel' | 'cloudflare-pages' | 'dry-run'
}

export interface AppBuilderReport {
  spec: AppSpec
  build: BuildResult
  deploy: DeployResult
  totalFiles: number
}

// ── Client interfaces (adapters implement these) ─────────────────────────────

export interface LLMClient {
  complete(args: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    json?: boolean
  }): Promise<{ content: string; inputTokens?: number; outputTokens?: number }>
}

export interface DeployClient {
  deploy(app: ScaffoldedApp): Promise<DeployResult>
}

export interface BuildCheckClient {
  /** Stub of TypeScript/eslint check. Returns any issues found. */
  check(files: ScaffoldedFile[]): Promise<BuildIssue[]>
}
