/**
 * App Builder Agent handler — registered for AgentTaskType 'build-app'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 5 (TASK-500).
 */
import { defineStub } from './_stub.js'

export const buildAppHandler = defineStub({
  type: 'build-app',
  name: 'App Builder Agent',
  description: 'Spec → Scaffold → Code → Test → Deploy to Vercel.',
  phase: 'Phase 5 (TASK-500)',
})
