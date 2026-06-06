/**
 * Lead Scraper handler — registered for AgentTaskType 'lead-scrape'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 8 (TASK-800).
 */
import { defineStub } from './_stub.js'

export const leadScrapeHandler = defineStub({
  type: 'lead-scrape',
  name: 'Lead Scraper',
  description: 'Scrape + enrich + dedupe leads from configured sources.',
  phase: 'Phase 8 (TASK-800)',
})
