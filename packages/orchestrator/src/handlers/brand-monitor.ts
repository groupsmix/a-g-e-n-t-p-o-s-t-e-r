/**
 * Brand Monitor Agent handler — registered for AgentTaskType 'brand-monitor'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 4 (TASK-402).
 */
import { defineStub } from './_stub.js'

export const brandMonitorHandler = defineStub({
  type: 'brand-monitor',
  name: 'Brand Monitor Agent',
  description: 'Reddit / X / YT / News / HN mention monitor with sentiment.',
  phase: 'Phase 4 (TASK-402)',
})
