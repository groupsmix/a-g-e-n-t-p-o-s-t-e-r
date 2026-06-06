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

async function main(): Promise<void> {
  console.log('🔍 NEXUS pre-flight check')

  // 1. Env validation
  console.log('\n1/2 Validating environment variables…')
  try {
    const { validateEnv } = await import('../packages/config/src/env.js')
    validateEnv()
    console.log('   ✓ Environment OK')
  } catch (err) {
    // validateEnv() calls process.exit(1) internally on failure
    console.error('   ✗ Environment validation failed')
    if (err instanceof Error) console.error('  ', err.message)
    process.exit(1)
  }

  if (skipNetwork) {
    console.log('\n   (skipping network checks — --env-only mode)')
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
