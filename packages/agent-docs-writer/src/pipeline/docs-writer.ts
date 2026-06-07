/**
 * Top-level: optionally fetch repo → writeDocs.
 */

import type {
  DocKind,
  DocsWriterReport,
  LLMClient,
  RepoFetcher,
  RepoSnapshot,
} from '../types.js'
import { writeDocs } from './writer.js'

export interface DocsWriterDeps {
  llm?: LLMClient
  fetcher?: RepoFetcher
}

export interface RunDocsWriterInput {
  snapshot?: RepoSnapshot
  repo?: string
  ref?: string
  kinds?: DocKind[]
}

const DEFAULT_KINDS: DocKind[] = ['readme', 'api', 'architecture', 'contributing']

export async function runDocsWriter(
  input: RunDocsWriterInput,
  deps: DocsWriterDeps = {},
): Promise<DocsWriterReport> {
  let snapshot = input.snapshot
  if (!snapshot) {
    if (!input.repo) throw new Error('runDocsWriter requires either snapshot or repo')
    if (!deps.fetcher) throw new Error('runDocsWriter requires a fetcher when only repo is given')
    snapshot = await deps.fetcher.fetch({ repo: input.repo, ref: input.ref })
  }
  const kinds = input.kinds ?? DEFAULT_KINDS
  const { docs, skipped } = await writeDocs(snapshot, kinds, deps.llm)
  return { snapshot, docs, skipped }
}
