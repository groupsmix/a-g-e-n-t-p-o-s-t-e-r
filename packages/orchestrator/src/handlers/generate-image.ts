/**
 * Image Generation Agent handler — registered for AgentTaskType 'generate-image'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 6 (TASK-604).
 */
import { defineStub } from './_stub.js'

export const generateImageHandler = defineStub({
  type: 'generate-image',
  name: 'Image Generation Agent',
  description: 'Replicate / FAL / OpenAI image gen with prompt enhancement.',
  phase: 'Phase 6 (TASK-604)',
})
