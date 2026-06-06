'use client'

import type { AgentTask } from '@posteragent/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Bot,
  Search,
  Hammer,
  Film,
  Send,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { cn, formatUsd, timeAgo } from '@/lib/utils'

const TYPE_ICON: Partial<Record<AgentTask['type'], LucideIcon>> = {
  research: Search,
  write: Film,
  'build-app': Hammer,
  'build-site': Hammer,
  publish: Send,
  analyse: BarChart3,
  'generate-video': Film,
  'generate-image': Film,
  'lead-scrape': Search,
  'email-campaign': Send,
  'financial-analysis': BarChart3,
  'brand-monitor': BarChart3,
  'autonome-run': Bot,
  'memory-consolidate': Bot,
}

const STATUS_META = {
  queued: { icon: Clock, color: 'text-muted-foreground', variant: 'secondary' as const, label: 'Queued' },
  running: { icon: Loader2, color: 'text-primary animate-spin', variant: 'default' as const, label: 'Running' },
  done: { icon: CheckCircle2, color: 'text-success', variant: 'success' as const, label: 'Done' },
  failed: { icon: XCircle, color: 'text-destructive', variant: 'destructive' as const, label: 'Failed' },
  cancelled: { icon: XCircle, color: 'text-muted-foreground', variant: 'outline' as const, label: 'Cancelled' },
}

interface TaskCardProps {
  task: AgentTask
}

export function TaskCard({ task }: TaskCardProps): JSX.Element {
  const TypeIcon = TYPE_ICON[task.type] ?? Bot
  const status = STATUS_META[task.status]
  const StatusIcon = status.icon

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
          <TypeIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{task.type}</span>
            <Badge variant={status.variant} className="text-[10px]">
              <StatusIcon className={cn('mr-1 h-3 w-3', status.color)} />
              {status.label}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground">{timeAgo(task.createdAt)}</span>
          </div>
          {task.error && (
            <p className="mt-1 truncate text-xs text-destructive" title={task.error}>
              {task.error}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            {task.modelUsed && <span>· {task.modelUsed}</span>}
            {typeof task.durationMs === 'number' && <span>· {(task.durationMs / 1000).toFixed(1)}s</span>}
            {typeof task.actualCostUsd === 'number' && <span>· {formatUsd(task.actualCostUsd)}</span>}
            {task.agentId && <span>· {task.agentId}</span>}
          </div>
        </div>
      </div>
    </Card>
  )
}
