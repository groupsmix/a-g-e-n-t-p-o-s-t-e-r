import { describe, it, expect } from 'vitest'
import { runSiteFactory } from './site-factory.js'

describe('runSiteFactory (no deps)', () => {
  it('uses in-memory CMS + dry-run deploy', async () => {
    const report = await runSiteFactory({ niche: 'AI for solopreneurs', seedCount: 3 })
    expect(report.bucket.slug).toBe('ai-for-solopreneurs')
    expect(report.articles).toHaveLength(3)
    expect(report.articles.every((a) => a.id.startsWith('mem_'))).toBe(true)
    expect(report.deploy.ok).toBe(true)
    expect(report.cron.expression).toBe('0 9 * * 1')
  })

  it('respects cadenceDays for cron', async () => {
    const report = await runSiteFactory({ niche: 'gardening', seedCount: 1, cadenceDays: 3 })
    expect(report.cron.expression).toContain('*/3')
  })

  it('survives a CMS that throws on one article', async () => {
    let i = 0
    const cms = {
      async ensureBucket(s: any) { return { slug: s.slug } },
      async createArticle(_b: string, a: any) {
        i += 1
        if (i === 2) throw new Error('quota')
        return { id: `cms_${a.slug}`, url: `https://cms.local/${a.slug}` }
      },
    }
    const report = await runSiteFactory(
      { niche: 'sourdough', seedCount: 4 },
      { cms },
    )
    expect(report.articles).toHaveLength(3)
  })
})
