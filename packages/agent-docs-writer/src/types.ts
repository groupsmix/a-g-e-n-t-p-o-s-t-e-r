/**
 * Documentation Writer types (TASK-503).
 *
 * Generates README.md, API.md, ARCHITECTURE.md, and CONTRIBUTING.md
 * for any repo by inspecting a RepoSnapshot (file tree + key files
 * + package.json) and asking an LLM to write each document.
 */

export type DocKind = 'readme' | 'api' | 'architecture' | 'contributing'

export interface RepoFile {
  path: string
  /** raw file contents (text only — we skip binaries upstream) */
  content: string
}

export interface RepoSnapshot {
  /** Repo name / slug. */
  name: string
  /** Optional description (from package.json or user). */
  description?: string
  /** Resolved tree (paths only) for orientation. */
  files: string[]
  /** Hand-picked key files we include verbatim (package.json, entry, etc.). */
  keyFiles: RepoFile[]
  /** Detected language: 'ts'|'js'|'py'|'go'|... */
  language?: string
  /** Detected entry-point if known. */
  entry?: string
}

export interface GeneratedDoc {
  kind: DocKind
  path: string
  content: string
}

export interface DocsWriterReport {
  snapshot: RepoSnapshot
  docs: GeneratedDoc[]
  /** Kinds requested but not produced (LLM failure). */
  skipped: DocKind[]
}

// ── Clients ─────────────────────────────────────────────────────────────────

export interface LLMClient {
  complete(args: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    json?: boolean
  }): Promise<{ content: string; inputTokens?: number; outputTokens?: number }>
}

/**
 * Optional adapter to fetch a repo snapshot from a remote source
 * (GitHub, GitLab, local clone). The pipeline accepts a pre-built
 * snapshot too, so this is only needed for the convenience handler.
 */
export interface RepoFetcher {
  fetch(args: { repo: string; ref?: string }): Promise<RepoSnapshot>
}
