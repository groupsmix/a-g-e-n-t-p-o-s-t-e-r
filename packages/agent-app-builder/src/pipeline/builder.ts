/**
 * Stage 4 — pre-deploy sanity check.  We don't actually run `tsc` (the
 * worker has no filesystem) but we run a set of lightweight static
 * checks that catch the most common codegen mistakes:
 *
 *   - placeholder still present (codegen failed or no LLM)
 *   - empty file
 *   - mismatched braces or parens (rough heuristic)
 *   - JSON parse error on .json files
 *   - obvious bad imports ("from 'foo';" but `foo` not in package.json)
 *
 * Each issue carries severity; deploy stage gates on `error`s only.
 */

import type {
  BuildCheckClient,
  BuildIssue,
  BuildResult,
  ScaffoldedApp,
  ScaffoldedFile,
} from '../types.js'

function balanced(s: string, open: string, close: string): boolean {
  let n = 0
  for (const c of s) {
    if (c === open) n++
    else if (c === close) n--
    if (n < 0) return false
  }
  return n === 0
}

export function defaultChecker(): BuildCheckClient {
  return {
    async check(files: ScaffoldedFile[]): Promise<BuildIssue[]> {
      const issues: BuildIssue[] = []
      let pkgDeps: Set<string> | null = null
      for (const f of files) {
        if (f.path === 'package.json') {
          try {
            const j = JSON.parse(f.content) as {
              dependencies?: Record<string, string>
              devDependencies?: Record<string, string>
            }
            pkgDeps = new Set([
              ...Object.keys(j.dependencies ?? {}),
              ...Object.keys(j.devDependencies ?? {}),
            ])
          } catch {
            issues.push({ file: f.path, message: 'invalid JSON', severity: 'error' })
          }
        }
      }
      for (const f of files) {
        if (!f.content.trim()) {
          issues.push({ file: f.path, message: 'empty file', severity: 'error' })
          continue
        }
        if (f.needsCodegen || /PLACEHOLDER/.test(f.content)) {
          issues.push({
            file: f.path,
            message: 'placeholder still present (codegen skipped or failed)',
            severity: 'warning',
          })
        }
        if (f.path.endsWith('.ts') || f.path.endsWith('.tsx')) {
          if (!balanced(f.content, '{', '}')) {
            issues.push({ file: f.path, message: 'unbalanced braces', severity: 'error' })
          }
          if (!balanced(f.content, '(', ')')) {
            issues.push({ file: f.path, message: 'unbalanced parens', severity: 'error' })
          }
          if (pkgDeps) {
            for (const m of f.content.matchAll(/from ['"]([^'".][^'"]*)['"]/g)) {
              const mod = m[1] ?? ''
              const root = mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0]
              if (root && !pkgDeps.has(root) && !root.startsWith('node:')) {
                issues.push({
                  file: f.path,
                  message: `import "${root}" not in dependencies`,
                  severity: 'warning',
                })
              }
            }
          }
        }
        if (f.path.endsWith('.json')) {
          try {
            JSON.parse(f.content)
          } catch {
            issues.push({ file: f.path, message: 'invalid JSON', severity: 'error' })
          }
        }
      }
      return issues
    },
  }
}

export async function buildAndCheck(
  app: ScaffoldedApp,
  checker: BuildCheckClient = defaultChecker(),
): Promise<BuildResult> {
  const start = Date.now()
  const issues = await checker.check(app.files)
  const ok = !issues.some((i) => i.severity === 'error')
  return { app, ok, issues, durationSec: (Date.now() - start) / 1000 }
}
