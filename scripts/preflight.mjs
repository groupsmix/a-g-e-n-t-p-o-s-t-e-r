#!/usr/bin/env node
/**
 * scripts/preflight.mjs — Cold-Start Build Preflight (Task 7.3)
 *
 * Runs a gauntlet of checks before a production deploy or CI merge gate:
 *   1. Doctor checks (Node/pnpm version, node_modules, .env)
 *   2. Build all packages and apps in dependency order (via Turbo)
 *   3. Type-check all packages (tsc --noEmit)
 *   4. Run all tests (vitest run)
 *   5. Verify critical dist artifacts exist
 *
 * Usage:
 *   node scripts/preflight.mjs
 *   node scripts/preflight.mjs --skip-tests
 *   node scripts/preflight.mjs --skip-build
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = resolve(new URL('.', import.meta.url).pathname.slice(1)) // strip leading / on Windows
const REPO_ROOT = join(ROOT, '..')

// ── CLI flags ──────────────────────────────────────────────────────────────
const { values: flags } = parseArgs({
  options: {
    'skip-tests': { type: 'boolean', default: false },
    'skip-build': { type: 'boolean', default: false },
    'skip-lint': { type: 'boolean', default: false },
  },
})

let exitCode = 0
const results = []

function pass(label) {
  console.log(`  ✅ ${label}`)
  results.push({ label, ok: true })
}

function fail(label, detail = '') {
  console.error(`  ❌ ${label}${detail ? `: ${detail}` : ''}`)
  results.push({ label, ok: false, detail })
  exitCode = 1
}

function warn(label, detail = '') {
  console.warn(`  ⚠️  ${label}${detail ? `: ${detail}` : ''}`)
}

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: 'pipe', encoding: 'utf8', cwd: REPO_ROOT, ...opts })
    return { ok: true }
  } catch (e) {
    return { ok: false, stdout: e.stdout, stderr: e.stderr }
  }
}

// ── Step 1: Environment / Doctor ───────────────────────────────────────────
console.log('\n━━━ 1/6  Environment checks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

const nodeMajor = parseInt(process.version.slice(1), 10)
if (nodeMajor >= 20) {
  pass(`Node.js ${process.version}`)
} else {
  fail(`Node.js ${process.version}`, 'requires >= v20')
}

try {
  const pnpmVer = execSync('pnpm --version', { encoding: 'utf8' }).trim()
  const pnpmMajor = parseInt(pnpmVer.split('.')[0], 10)
  if (pnpmMajor >= 9) {
    pass(`pnpm ${pnpmVer}`)
  } else {
    fail(`pnpm ${pnpmVer}`, 'requires >= v9')
  }
} catch {
  fail('pnpm', 'not found in PATH')
}

if (existsSync(join(REPO_ROOT, 'node_modules'))) {
  pass('node_modules present')
} else {
  fail('node_modules', 'run `pnpm install` first')
}

if (existsSync(join(REPO_ROOT, '.env'))) {
  pass('.env file exists')
} else {
  warn('.env file not found', 'copy from .env.example and fill in secrets')
}

// ── Step 2: Build ──────────────────────────────────────────────────────────
if (!flags['skip-build']) {
  console.log('\n━━━ 2/6  Build (turbo build) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const build = run('pnpm turbo build --no-cache 2>&1')
  if (build.ok) {
    pass('turbo build')
  } else {
    fail('turbo build', 'see output above')
    // Print stderr so CI logs capture it
    if (build.stderr) process.stderr.write(build.stderr)
    if (build.stdout) process.stdout.write(build.stdout)
  }

  // Verify critical dist artifacts exist after build
  const criticalDists = [
    'packages/types/dist/index.js',
    'packages/types/dist/nexus/index.js',
    'packages/orchestrator/dist/index.js',
    'packages/agent-publisher/dist/index.js',
    'packages/agent-research/dist/index.js',
    'packages/memory/dist/index.js',
    'packages/identity/dist/index.js',
  ]
  for (const rel of criticalDists) {
    const abs = join(REPO_ROOT, rel)
    if (existsSync(abs)) {
      pass(`dist: ${rel}`)
    } else {
      fail(`dist: ${rel}`, 'file missing after build')
    }
  }
} else {
  console.log('\n━━━ 2/6  Build (SKIPPED via --skip-build) ━━━━━━━━━━━━━━━━━━━━')
}

// ── Step 3: Typecheck ─────────────────────────────────────────────────────
console.log('\n━━━ 3/6  Typecheck (turbo typecheck) ━━━━━━━━━━━━━━━━━━━━━━━━━━')
const tc = run('pnpm turbo typecheck 2>&1')
if (tc.ok) {
  pass('turbo typecheck')
} else {
  fail('turbo typecheck', 'TypeScript errors found')
  if (tc.stderr) process.stderr.write(tc.stderr)
  if (tc.stdout) process.stdout.write(tc.stdout)
}

// ── Step 4: Tests ─────────────────────────────────────────────────────────
if (!flags['skip-tests']) {
  console.log('\n━━━ 4/6  Tests (turbo test) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const tests = run('pnpm turbo test 2>&1')
  if (tests.ok) {
    pass('turbo test')
  } else {
    fail('turbo test', 'one or more test suites failed')
    if (tests.stderr) process.stderr.write(tests.stderr)
    if (tests.stdout) process.stdout.write(tests.stdout)
  }
} else {
  console.log('\n━━━ 4/6  Tests (SKIPPED via --skip-tests) ━━━━━━━━━━━━━━━━━━━━')
}

// ── Step 5: Lint ──────────────────────────────────────────────────────────
if (!flags['skip-lint']) {
  console.log('\n━━━ 5/6  Lint (turbo lint) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const lint = run('pnpm turbo lint 2>&1')
  if (lint.ok) {
    pass('turbo lint')
  } else {
    fail('turbo lint', 'lint errors found')
    if (lint.stderr) process.stderr.write(lint.stderr)
    if (lint.stdout) process.stdout.write(lint.stdout)
  }
} else {
  console.log('\n━━━ 5/6  Lint (SKIPPED via --skip-lint) ━━━━━━━━━━━━━━━━━━━━━━')
}

// ── Step 6: D1 Schema Smoke Test ──────────────────────────────────────────
console.log('\n━━━ 6/6  D1 Schema Smoke Test (scripts/check-d1-schema.ts) ━━')
const schemaCheck = run('pnpm tsx scripts/check-d1-schema.ts 2>&1')
if (schemaCheck.ok) {
  pass('d1 schema check')
} else {
  fail('d1 schema check', 'D1 schema smoke test failed')
  if (schemaCheck.stderr) process.stderr.write(schemaCheck.stderr)
  if (schemaCheck.stdout) process.stdout.write(schemaCheck.stdout)
}

// ── Summary ────────────────────────────────────────────────────────────────
const total = results.length
const passed = results.filter(r => r.ok).length
const failed_count = total - passed

console.log('\n══════════════════════════════════════════════════════════════════')
console.log(`  Preflight complete: ${passed}/${total} checks passed`)
if (failed_count > 0) {
  console.error(`  ${failed_count} check(s) FAILED — deploy blocked.`)
  results.filter(r => !r.ok).forEach(r => {
    console.error(`    • ${r.label}${r.detail ? ` — ${r.detail}` : ''}`)
  })
}
console.log('══════════════════════════════════════════════════════════════════\n')

process.exit(exitCode)
