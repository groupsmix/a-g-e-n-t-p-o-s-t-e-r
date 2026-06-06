/**
 * Top-level Site Factory pipeline.
 *
 *   planBucket → ensureBucket → generateSeedArticles → publishArticles
 *   → deploySite → buildCron → registerCron
 *
 * Returns a SiteFactoryReport. Each stage uses a no-op fallback when
 * its client isn't provided so the pipeline can run end-to-end in tests
 * without any external service.
 */

import type {
  CmsClient,
  LLMClient,
  SchedulerClient,
  SiteBrief,
  SiteDeployClient,
  SiteFactoryReport,
} from '../types.js'
import { planBucket } from './bucket-planner.js'
import { generateSeedArticles } from './seeder.js'
import { publishArticles } from './publisher.js'
import { buildCron, registerCron } from './cron.js'

export interface SiteFactoryDeps {
  llm?: LLMClient
  cms?: CmsClient
  deployer?: SiteDeployClient
  scheduler?: SchedulerClient
}

function memoryCms(): CmsClient {
  const store = new Map<string, unknown>()
  return {
    async ensureBucket(spec) {
      store.set(spec.slug, spec)
      return { slug: spec.slug }
    },
    async createArticle(_bucketSlug, article) {
      const id = `mem_${article.slug}`
      return { id, url: `https://mem.local/${article.slug}` }
    },
  }
}

function dryRunSiteDeployer(): SiteDeployClient {
  return {
    async deploy({ bucket }) {
      return { ok: true, url: `https://dry-run.local/${bucket.slug}`, provider: 'dry-run' }
    },
  }
}

export async function runSiteFactory(
  brief: SiteBrief,
  deps: SiteFactoryDeps = {},
): Promise<SiteFactoryReport> {
  const cms = deps.cms ?? memoryCms()
  const deployer = deps.deployer ?? dryRunSiteDeployer()

  const bucket = await planBucket(brief, deps.llm)
  await cms.ensureBucket(bucket)
  const { articles: seeds } = await generateSeedArticles(brief, deps.llm)
  const { published } = await publishArticles(cms, bucket.slug, seeds)
  const deploy = await deployer
    .deploy({ bucketSlug: bucket.slug, bucket })
    .catch((err: unknown) => ({
      ok: false,
      provider: 'dry-run' as const,
      error: err instanceof Error ? err.message : String(err),
    }))
  const cron = buildCron(brief, bucket)
  await registerCron(deps.scheduler, cron)

  return {
    brief,
    bucket,
    articles: published,
    deploy,
    cron,
  }
}
