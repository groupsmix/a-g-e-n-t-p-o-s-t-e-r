/**
 * Stage 3 — codegen.  For every scaffolded file with `needsCodegen: true`,
 * ask the LLM to rewrite the file body to match the spec + the page purpose.
 *
 * We batch one file at a time (rather than asking for the whole tree in
 * one shot) so partial failures degrade gracefully — a failed call leaves
 * the placeholder in place and the build stage flags it.
 *
 * If no LLM client is provided, the function returns the input app untouched
 * (placeholders stay), making the pipeline trivially testable.
 */

import type { LLMClient, ScaffoldedApp, ScaffoldedFile } from '../types.js'

const SYSTEM_PROMPT = `You are a senior TypeScript engineer writing production-grade code.
You will be given:
  - the AppSpec JSON
  - one source file with a PLACEHOLDER marker
Reply with ONLY the new file contents (no markdown fences, no commentary).
Keep imports minimal, prefer standard library, no dead code.`

export interface CodegenUsage {
  inputTokens: number
  outputTokens: number
  filesGenerated: number
}

export async function codegen(
  app: ScaffoldedApp,
  llm?: LLMClient,
): Promise<{ app: ScaffoldedApp; usage: CodegenUsage }> {
  const usage: CodegenUsage = { inputTokens: 0, outputTokens: 0, filesGenerated: 0 }
  if (!llm) return { app, usage }

  const next: ScaffoldedFile[] = []
  for (const file of app.files) {
    if (!file.needsCodegen) {
      next.push(file)
      continue
    }
    try {
      const res = await llm.complete({
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `AppSpec:\n${JSON.stringify(app.spec, null, 2)}\n\nFile path: ${file.path}\n\nCurrent placeholder:\n${file.content}`,
          },
        ],
        maxTokens: 1500,
        temperature: 0.3,
      })
      const content = stripFences(res.content).trim() || file.content
      next.push({ ...file, content, needsCodegen: false })
      usage.inputTokens += res.inputTokens ?? 0
      usage.outputTokens += res.outputTokens ?? 0
      usage.filesGenerated += 1
    } catch {
      // leave placeholder; build stage will flag it
      next.push(file)
    }
  }
  return { app: { ...app, files: next }, usage }
}

function stripFences(s: string): string {
  // remove leading/trailing ```lang ... ``` if present
  const m = s.match(/^```[\w-]*\n([\s\S]*?)```\s*$/m)
  return m?.[1] ?? s
}
