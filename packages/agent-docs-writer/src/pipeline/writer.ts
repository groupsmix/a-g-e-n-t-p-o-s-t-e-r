/**
 * The four document prompts.  Each takes the RepoSnapshot and asks
 * the LLM for the body of a single .md file.  No LLM → deterministic
 * skeleton based on the snapshot, so the pipeline still produces
 * something useful (and is testable).
 */

import type { DocKind, GeneratedDoc, LLMClient, RepoSnapshot } from '../types.js'

const SYSTEM = `You write production-grade open-source documentation.
Output ONLY the markdown body of the requested document — no fences,
no commentary, no front-matter.`

interface DocSpec {
  kind: DocKind
  path: string
  ask: (s: RepoSnapshot) => string
  fallback: (s: RepoSnapshot) => string
}

function bulletTree(files: string[], limit = 25): string {
  return files.slice(0, limit).map((p) => `- ${p}`).join('\n') +
    (files.length > limit ? `\n- _… and ${files.length - limit} more_` : '')
}

const SPECS: DocSpec[] = [
  {
    kind: 'readme',
    path: 'README.md',
    ask: (s) => `Write a README for "${s.name}". Description: ${s.description ?? '(unknown)'}.\n` +
      `Language: ${s.language ?? 'unknown'}. Entry: ${s.entry ?? 'unknown'}.\n` +
      `Key files:\n${s.keyFiles.map((f) => `--- ${f.path} ---\n${f.content.slice(0, 1200)}`).join('\n\n')}\n\n` +
      `Sections: project title, one-liner, features, install, usage, config, license.`,
    fallback: (s) => `# ${s.name}\n\n${s.description ?? 'A TypeScript project.'}\n\n## Install\n\n\`\`\`\nnpm install\n\`\`\`\n\n## Usage\n\nTBD — see source for entry point.\n\n## License\n\nMIT.\n`,
  },
  {
    kind: 'api',
    path: 'API.md',
    ask: (s) => `Write API reference for "${s.name}" based on the exported symbols visible in these files:\n` +
      s.keyFiles.map((f) => `--- ${f.path} ---\n${f.content.slice(0, 2500)}`).join('\n\n') +
      `\n\nGroup by module. For each exported function/class, give: signature, one-line purpose, parameter table, return.`,
    fallback: (s) => `# API\n\n_Generated reference for ${s.name}._\n\nNo LLM available — populate from JSDoc.\n`,
  },
  {
    kind: 'architecture',
    path: 'ARCHITECTURE.md',
    ask: (s) => `Write ARCHITECTURE.md for "${s.name}".\nFile tree:\n${bulletTree(s.files, 60)}\n\n` +
      `Explain: top-level layout, module boundaries, data flow, key abstractions, ` +
      `extension points. Use 4–6 H2 sections + one mermaid diagram if helpful.`,
    fallback: (s) => `# Architecture\n\n${s.name} layout:\n\n${bulletTree(s.files)}\n`,
  },
  {
    kind: 'contributing',
    path: 'CONTRIBUTING.md',
    ask: (s) => `Write CONTRIBUTING.md for "${s.name}". Cover: dev setup, scripts, code style, ` +
      `commit conventions, PR checklist, how to add a new module. ` +
      `Language: ${s.language ?? 'unknown'}.`,
    fallback: () => `# Contributing\n\nClone, install, branch off main, open a PR. Use conventional commits.\n`,
  },
]

export async function writeDocs(
  snapshot: RepoSnapshot,
  kinds: DocKind[],
  llm?: LLMClient,
): Promise<{ docs: GeneratedDoc[]; skipped: DocKind[] }> {
  const docs: GeneratedDoc[] = []
  const skipped: DocKind[] = []
  for (const kind of kinds) {
    const spec = SPECS.find((s) => s.kind === kind)
    if (!spec) {
      skipped.push(kind)
      continue
    }
    if (!llm) {
      docs.push({ kind, path: spec.path, content: spec.fallback(snapshot) })
      continue
    }
    try {
      const res = await llm.complete({
        system: SYSTEM,
        messages: [{ role: 'user', content: spec.ask(snapshot) }],
        maxTokens: 2000,
        temperature: 0.3,
      })
      const content = res.content.trim()
      docs.push({
        kind,
        path: spec.path,
        content: content || spec.fallback(snapshot),
      })
    } catch {
      docs.push({ kind, path: spec.path, content: spec.fallback(snapshot) })
    }
  }
  return { docs, skipped }
}
