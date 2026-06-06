/**
 * Analyse Agent handler — registered for AgentTaskType 'analyse'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 4 (TASK-402).
 */
import { defineStub } from './_stub.js'

export const analyseHandler = defineStub({
  type: 'analyse',
  name: 'Analyse Agent',
  description: 'General-purpose analysis dispatcher (analytics, sentiment, comparison).',
  phase: 'Phase 4 (TASK-402)',
})
