/**
 * Deep Research Agent handler — registered for AgentTaskType 'research'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 4 (TASK-400).
 */
import { defineStub } from './_stub.js'

export const researchHandler = defineStub({
  type: 'research',
  name: 'Deep Research Agent',
  description: 'Planner → Search × N → Synthesis → Citation → Memory pipeline.',
  phase: 'Phase 4 (TASK-400)',
})
