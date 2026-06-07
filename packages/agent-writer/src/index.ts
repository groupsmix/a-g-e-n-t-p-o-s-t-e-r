/**
 * @posteragent/agent-writer
 *
 * TASK-601 — Writer Agent (multi-format).
 */

export * from './pipeline/index.js'
export { FORMATS } from './formats/index.js'
export type { FormatSpec } from './formats/index.js'
export { createWriterHandler } from './handler.js'
export type { WriterPayload, WriterHandlerOutcome, WriterHandlerDeps } from './handler.js'
export type {
  WriterFormat,
  WriterBrief,
  WriterDraft,
  WriterRequest,
  WriterReport,
  LLMClient,
} from './types.js'
