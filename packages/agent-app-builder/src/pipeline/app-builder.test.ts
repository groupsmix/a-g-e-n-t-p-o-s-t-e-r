import { describe, it, expect } from 'vitest'
import { runAppBuilder } from './app-builder.js'

describe('runAppBuilder end-to-end (no LLM, dry-run)', () => {
  it('parses, scaffolds, dry-deploys', async () => {
    const report = await runAppBuilder({
      prompt: 'build a hono api with auth',
    })
    expect(report.spec.template).toBe('hono-api')
    expect(report.totalFiles).toBeGreaterThan(2)
    // placeholders remain (no LLM) → warnings but no errors → deploy runs
    expect(report.build.issues.every((i) => i.severity !== 'error')).toBe(true)
    expect(report.deploy.ok).toBe(true)
    expect(report.deploy.url).toContain('dry-run')
  })

  it('skipDeploy flag works', async () => {
    const report = await runAppBuilder({
      prompt: 'static landing page',
      skipDeploy: true,
    })
    expect(report.deploy.ok).toBe(false)
    expect(report.deploy.error).toBe('skipped')
  })
})
