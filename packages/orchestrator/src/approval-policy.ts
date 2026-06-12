import type { AgentTask } from '@posteragent/types'

export interface ApprovalDecision {
  requiresApproval: boolean
  riskLevel?: 'low' | 'medium' | 'high'
  actionType?: string
  reason?: string
}

/**
 * Checks if a task execution triggers any policies requiring manual approval.
 */
export function evaluateApprovalPolicy(task: AgentTask): ApprovalDecision {
  // 1. Publishing to external channels
  if (task.type === 'publish') {
    return {
      requiresApproval: true,
      riskLevel: 'high',
      actionType: 'publish_content',
      reason: 'Publishing content to external platforms requires approval.',
    }
  }

  // 2. Outbound email campaigns
  if (task.type === 'email-campaign') {
    return {
      requiresApproval: true,
      riskLevel: 'high',
      actionType: 'send_email',
      reason: 'Sending email campaign requires approval.',
    }
  }

  // 3. Deploying website/site changes
  if (task.type === 'build-site') {
    return {
      requiresApproval: true,
      riskLevel: 'medium',
      actionType: 'deploy_site',
      reason: 'Deploying site changes requires approval.',
    }
  }

  // 4. Budget check: Task cost exceeds threshold (e.g. $5.00)
  if (task.estimatedCostUsd !== undefined && task.estimatedCostUsd >= 5.0) {
    return {
      requiresApproval: true,
      riskLevel: 'medium',
      actionType: 'spend_money',
      reason: `Estimated cost of $${task.estimatedCostUsd.toFixed(2)} exceeds the $5.00 threshold.`,
    }
  }

  // Otherwise, no approval needed
  return {
    requiresApproval: false,
  }
}
