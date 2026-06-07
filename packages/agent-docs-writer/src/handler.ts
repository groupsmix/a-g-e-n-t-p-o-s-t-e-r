/**
 * Docs writer handler — registers on 'write' with payload.kind='docs'.
 */

import type { DocKind, DocsWriterReport, RepoSnapshot } from './types.js'
import { runDocsWriter, type DocsWriterDeps } from './pipeline/docs-writer.js'

export interface DocsWriterPayload {
  kind?: 'docs'
  snapshot?: RepoSnapshot
  repo?: string
  ref?: string
  kinds?: DocKind[]
}

export interface DocsWriterHandlerOutcome {
  data: DocsWriterReport
  summary: string
  memories: Array<{ kind: 'fact'; content: string; meta?: Record<string, unknown> }>
  nextActions: Array<{ type: string; reason: string; payload?: Record<string, unknown> }>
  usage: { inputTokens: number; outputTokens: number }
}

export function createDocsWriterHandler(deps: DocsWriterDeps) {
  return {
    type: 'write' as const,
    name: 'docs-writer',
    description: 'Auto-generate README/API/Architecture/CONTRIBUTING for any repo. TASK-503.',
    async run(ctx: { payload: DocsWriterPayload }): Promise<DocsWriterHandlerOutcome> {
      const report = await runDocsWriter(
        {
          snapshot: ctx.payload.snapshot,
          repo: ctx.payload.repo,
          ref: ctx.payload.ref,
          kinds: ctx.payload.kinds,
        },
        deps,
      )
      const produced = report.docs.map((d) => d.kind).join(', ')
      const summary = `Generated ${report.docs.length} docs (${produced}) for ${report.snapshot.name}` +
        (report.skipped.length ? `; skipped ${report.skipped.join(', ')}` : '')
      return {
        data: report,
        summary,
        memories: [],
        nextActions: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    },
  }
}
