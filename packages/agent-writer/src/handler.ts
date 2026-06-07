/**
 * Writer handler — task type 'write'.  Payload accepts a brief +
 * formats list; falls back to a sensible default if formats omitted.
 */

import type { LLMClient, WriterBrief, WriterFormat, WriterReport } from './types.js'
import { writeFormats } from './pipeline/writer.js'

export interface WriterPayload {
  brief: WriterBrief
  formats?: WriterFormat[]
}

export interface WriterHandlerOutcome {
  data: WriterReport
  summary: string
  memories: Array<{ kind: 'fact'; content: string; meta?: Record<string, unknown> }>
  nextActions: Array<{ type: string; reason: string; payload?: Record<string, unknown> }>
  usage: { inputTokens: number; outputTokens: number }
}

const DEFAULT_FORMATS: WriterFormat[] = ['blog', 'x-thread', 'linkedin']

export interface WriterHandlerDeps {
  llm?: LLMClient
}

export function createWriterHandler(deps: WriterHandlerDeps = {}) {
  return {
    type: 'write' as const,
    name: 'writer',
    description: 'Multi-format content writer. TASK-601.',
    async run(ctx: { payload: WriterPayload }): Promise<WriterHandlerOutcome> {
      const formats = ctx.payload.formats?.length ? ctx.payload.formats : DEFAULT_FORMATS
      const report = await writeFormats(ctx.payload.brief, formats, deps.llm)
      const summary =
        `Wrote ${report.drafts.length} drafts (${report.drafts.map((d) => d.format).join(', ')})` +
        (report.skipped.length ? `; skipped ${report.skipped.join(', ')}` : '')
      // every draft becomes a candidate publish job
      const nextActions: WriterHandlerOutcome['nextActions'] = report.drafts.map((d) => ({
        type: 'publish',
        reason: `publish ${d.format}`,
        payload: { format: d.format, title: d.title, parts: d.parts, meta: d.meta },
      }))
      return {
        data: report,
        summary,
        memories: [],
        nextActions,
        usage: report.usage,
      }
    },
  }
}
