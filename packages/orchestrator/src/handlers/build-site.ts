/**
 * Site Factory Agent handler — registered for AgentTaskType 'build-site'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 5 (TASK-501).
 */
import { defineStub } from './_stub.js'

export const buildSiteHandler = defineStub({
  type: 'build-site',
  name: 'Site Factory Agent',
  description: 'CosmicJS bucket + seed content + Next.js deploy + weekly content cron.',
  phase: 'Phase 5 (TASK-501)',
})
