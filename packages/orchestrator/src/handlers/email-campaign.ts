/**
 * Email Campaign Agent handler — registered for AgentTaskType 'email-campaign'.
 *
 * Currently a Phase 3 stub.  Real implementation lands in Phase 8 (TASK-801).
 */
import { defineStub } from './_stub.js'

export const emailCampaignHandler = defineStub({
  type: 'email-campaign',
  name: 'Email Campaign Agent',
  description: 'Sequence builder + send + track + auto-followup.',
  phase: 'Phase 8 (TASK-801)',
})
