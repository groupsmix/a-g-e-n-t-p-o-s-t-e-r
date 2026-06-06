/**
 * Barrel export for all built-in handlers.  External code (registry,
 * tests, custom configurations) imports through here so the file
 * layout under ./handlers can change without rippling.
 */
export { researchHandler } from './research.js'
export { writeHandler } from './write.js'
export { buildAppHandler } from './build-app.js'
export { buildSiteHandler } from './build-site.js'
export { publishHandler } from './publish.js'
export { analyseHandler } from './analyse.js'
export { generateVideoHandler } from './generate-video.js'
export { generateImageHandler } from './generate-image.js'
export { leadScrapeHandler } from './lead-scrape.js'
export { emailCampaignHandler } from './email-campaign.js'
export { financialAnalysisHandler } from './financial-analysis.js'
export { brandMonitorHandler } from './brand-monitor.js'
export { autonomeRunHandler } from './autonome-run.js'
export { memoryConsolidateHandler } from './memory-consolidate.js'

export { defineStub } from './_stub.js'
export type { DefineStubInput } from './_stub.js'
