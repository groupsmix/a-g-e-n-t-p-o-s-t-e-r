// Live-action types used by the CEO chat assistant

export interface ActionStep {
  description: string
  status: 'pending' | 'running' | 'done' | 'error'
  screenshot?: string
  timestamp?: string
}

export interface ActionResult {
  success: boolean
  message: string
  action_type: string
  data?: Record<string, unknown>
  screenshots?: string[]
  steps?: ActionStep[]
}
