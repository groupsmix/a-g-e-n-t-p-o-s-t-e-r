/**
 * @posteragent/agent-site-factory
 *
 * TASK-501 — Site Factory Agent.
 *
 *   import { runSiteFactory, createSiteFactoryHandler } from '@posteragent/agent-site-factory'
 *   import { createCosmicCms, createVercelSiteDeployer, createD1Scheduler } from '@posteragent/agent-site-factory/adapters'
 *
 *   const handler = createSiteFactoryHandler({
 *     llm,
 *     cms: createCosmicCms({ bucketSlug, writeKey }),
 *     deployer: createVercelSiteDeployer({ token, templateRepo: 'me/nextjs-cosmic-blog' }),
 *     scheduler: createD1Scheduler({ db }),
 *   })
 *   registry.register('build-site', handler)
 */

export * from './pipeline/index.js'
export { createSiteFactoryHandler } from './handler.js'
export type { SiteFactoryPayload, SiteFactoryHandlerOutcome } from './handler.js'
export type {
  SiteBrief,
  BucketSpec,
  SeedArticle,
  PublishedArticle,
  DeployedSite,
  CronSchedule,
  SiteFactoryReport,
  LLMClient,
  CmsClient,
  SiteDeployClient,
  SchedulerClient,
} from './types.js'
