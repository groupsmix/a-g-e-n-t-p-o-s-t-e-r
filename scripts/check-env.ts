#!/usr/bin/env tsx
/**
 * scripts/check-env.ts
 *
 * Pre-flight check run before `pnpm dev`. Validates:
 *   1. All required environment variables are present and well-formed
 *   2. Every required external service can be reached
 *
 * Exits 1 on any failure so turbo / CI can short-circuit.
 *
 * Usage:
 *   pnpm check-env                 # full check (env + services)
 *   pnpm check-env --env-only      # skip network pings
 *   pnpm check-env --skip-network  # alias
 */

import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

// Load .env if present
const envPath = resolve(process.cwd(), '.env')
if (existsSync(envPath)) {
  loadDotenv({ path: envPath })
}

const args = new Set(process.argv.slice(2))
const skipNetwork = args.has('--env-only') || args.has('--skip-network')

// Audit #8: --check-example fails when the env schema and .env.example
// drift apart, so new schema keys can't be added without documenting them.
const checkExample = args.has('--check-example')

// Strict mode fails on any missing key. Default is lenient: print a warning
// and continue, so a clean clone can boot the NEXUS Cloudflare stack
// (which lives in apps/nexus/ and does NOT use this env schema at all)
// without having to fill the legacy @repo/* secrets first.
//
// CI for the legacy stack passes --strict to enforce the full schema.
const strict = args.has('--strict')

async function checkExampleDrift(): Promise<void> {
  console.log('\n0/2 Checking schema ↔ .env.example drift…')
  const { envSchemaKeys } = await import('../packages/config/src/env.js')
  const examplePath = resolve(process.cwd(), '.env.example')
  if (!existsSync(examplePath)) {
    console.error('   ✗ .env.example not found')
    process.exit(1)
  }
  const { readFileSync } = await import('node:fs')
  const documented = new Set(
    readFileSync(examplePath, 'utf8')
      .split('\n')
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter((k): k is string => Boolean(k)),
  )
  const missing = envSchemaKeys.filter((k) => !documented.has(k))
  if (missing.length) {
    console.error(
      `   ✗ ${missing.length} schema key(s) missing from .env.example:`,
    )
    console.error('     ' + missing.join(', '))
    process.exit(1)
  }
  console.log(`   ✓ All ${envSchemaKeys.length} schema keys documented`)
}

async function main(): Promise<void> {
  console.log('🔍 NEXUS pre-flight check')

  if (checkExample) await checkExampleDrift()

  // 1. Env validation
  console.log('\n1/2 Validating environment variables…')
  const { tryValidateEnv } = await import('../packages/config/src/env.js')
  const result = tryValidateEnv()
  if (result.ok) {
    console.log('   ✓ Environment OK')
  } else if (strict) {
    console.error('   ✗ Environment validation failed (strict mode)')
    console.error('  ', result.fieldErrors)
    process.exit(1)
  } else {
    const missing = Object.entries(result.fieldErrors)
      .filter(([, errs]) => errs && errs.length)
      .map(([k]) => k)
    console.warn(
      `   ⚠ ${missing.length} legacy @repo/* env key(s) missing — continuing.`,
    )
    if (missing.length) console.warn('     missing:', missing.join(', '))
    console.warn(
      '     Set them before running daily-run / generate-site / stats-pull,',
    )
    console.warn(
      '     or re-run with --strict to fail the boot if any are missing.',
    )
  }

  if (skipNetwork) {
    console.log('\n   (skipping network checks — --env-only mode)')
    process.exit(0)
  }

  // If env validation downgraded to a warning, skip network checks too —
  // pinging services with missing keys would just produce noise.
  if (!result.ok) {
    console.log('\n   (skipping network checks — env was not fully validated)')
    process.exit(0)
  }

  // 2. Service health
  console.log('\n2/2 Pinging external services…')
  try {
    const { printHealthReport } = await import('../packages/config/src/health.js')
    const report = await printHealthReport({ onlyRequired: true })
    if (!report.ok) {
      console.error(`✗ ${report.failed} required service(s) unreachable.`)
      console.error('  Run `pnpm check-env --env-only` to skip network checks.')
      process.exit(1)
    }
    console.log('✓ All systems go.\n')
  } catch (err) {
    console.error('   ✗ Health check crashed:', err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unexpected error in check-env:', err)
  process.exit(1)
})
