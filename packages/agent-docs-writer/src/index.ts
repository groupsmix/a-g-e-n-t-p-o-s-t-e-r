/**
 * @posteragent/agent-docs-writer
 *
 * TASK-503 — Documentation Writer.
 *
 *   import { runDocsWriter, createDocsWriterHandler } from '@posteragent/agent-docs-writer'
 *   import { createGitHubFetcher } from '@posteragent/agent-docs-writer/adapters'
 *
 *   const handler = createDocsWriterHandler({
 *     llm,
 *     fetcher: createGitHubFetcher({ token }),
 *   })
 */

export * from './pipeline/index.js'
export { createDocsWriterHandler } from './handler.js'
export type { DocsWriterPayload, DocsWriterHandlerOutcome } from './handler.js'
export type {
  DocKind,
  RepoFile,
  RepoSnapshot,
  GeneratedDoc,
  DocsWriterReport,
  LLMClient,
  RepoFetcher,
} from './types.js'
