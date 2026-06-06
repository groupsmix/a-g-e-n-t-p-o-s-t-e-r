/**
 * Video Factory handler — registered for AgentTaskType 'generate-video'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 6 (TASK-602).
 */
import { defineStub } from './_stub.js'

export const generateVideoHandler = defineStub({
  type: 'generate-video',
  name: 'Video Factory',
  description: 'Remotion-based video generation with TTS + B-roll.',
  phase: 'Phase 6 (TASK-602)',
})
