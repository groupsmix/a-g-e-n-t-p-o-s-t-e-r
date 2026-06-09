#!/usr/bin/env node
// T18 — durable "scrub secrets" guard.
//
// The repo is public, so a committed live credential is a real incident, not
// a style nit. "Make it private" is a one-time call the owner makes in GitHub
// settings; THIS is the part that keeps paying off: a CI gate that fails the
// build the instant a high-confidence secret lands in a tracked file.
//
// Scope: git-tracked text files only. Patterns are intentionally narrow —
// known live-credential shapes (provider key prefixes, private-key headers)
// rather than entropy heuristics — so it stays green on legitimate config and
// only screams on the real thing. Placeholders in *.example and lockfiles are
// skipped. Run locally with: `node scripts/check-secrets.mjs`.

import { execSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

const MAX_BYTES = 1_000_000 // skip anything over ~1MB (lockfiles, bundles)

// Files/paths we never scan: this script itself (it contains the patterns),
// env templates, and dependency lockfiles (integrity hashes look randomish).
const SELF = 'scripts/check-secrets.mjs'
const isExcluded = (p) =>
  p === SELF ||
  /(^|\/)\.env\.example$/.test(p) ||
  /\.example$/.test(p) ||
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn-lock\.yaml|yarn\.lock|bun\.lock(b)?)$/.test(p) ||
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp4|mp3|wasm|glb)$/i.test(p)

// High-confidence live-secret signatures.
const RULES = [
  { name: 'OpenAI API key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/ },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub PAT (classic)', re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: 'GitHub OAuth/refresh token', re: /\bgh[osru]_[A-Za-z0-9]{36}\b/ },
  { name: 'GitLab PAT', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Stripe live secret key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
]

let tracked = []
try {
  tracked = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
} catch (err) {
  console.error('check-secrets: could not list tracked files via git:', err.message)
  process.exit(2)
}

const findings = []
for (const file of tracked) {
  if (isExcluded(file)) continue
  let text
  try {
    if (statSync(file).size > MAX_BYTES) continue
    text = readFileSync(file, 'utf8')
  } catch {
    continue // unreadable/binary — skip
  }
  if (text.includes('\u0000')) continue // binary
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const rule of RULES) {
      if (rule.re.test(lines[i])) {
        findings.push({ file, line: i + 1, rule: rule.name })
      }
    }
  }
}

if (findings.length > 0) {
  console.error('\n\u274c Potential secret(s) committed to a tracked file:\n')
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  — ${f.rule}`)
  }
  console.error(
    '\nIf this is a real credential: rotate it now, then remove it from history.' +
      '\nIf it is a placeholder/example, move it to an *.example file or adjust scripts/check-secrets.mjs.\n',
  )
  process.exit(1)
}

console.log(`check-secrets: scanned ${tracked.length} tracked files, no secrets found.`)
