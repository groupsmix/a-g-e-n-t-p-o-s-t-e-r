/**
 * Autonome Mode handler — registered for AgentTaskType 'autonome-run'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 9 (TASK-900).
 */
import { defineStub } from './_stub.js'

export const autonomeRunHandler = defineStub({
  type: 'autonome-run',
  name: 'Autonome Mode',
  description: 'Full self-running loop — plan → queue → execute → learn.',
  phase: 'Phase 9 (TASK-900)',
})
