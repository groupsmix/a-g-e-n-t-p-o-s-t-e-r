/**
 * Writer Agent handler — registered for AgentTaskType 'write'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 6 (TASK-601).
 */
import { defineStub } from './_stub.js'

export const writeHandler = defineStub({
  type: 'write',
  name: 'Writer Agent',
  description: 'Multi-format writing (article, post, email, ad copy) with brand voice injection.',
  phase: 'Phase 6 (TASK-601)',
})
