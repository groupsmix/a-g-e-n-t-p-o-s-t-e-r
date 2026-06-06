'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bot, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentStatusProps {
  name: string
  state: 'idle' | 'running' | 'error' | 'offline'
  lastRunAgo?: string
  description?: string
}

const STATE_META = {
  idle: { color: 'text-muted-foreground', label: 'Idle', variant: 'secondary' as const },
  running: { color: 'text-success', label: 'Running', variant: 'success' as const },
  error: { color: 'text-destructive', label: 'Error', variant: 'destructive' as const },
  offline: { color: 'text-muted-foreground', label: 'Offline', variant: 'outline' as const },
}

export function AgentStatus({ name, state, lastRunAgo, description }: AgentStatusProps): JSX.Element {
  const meta = STATE_META[state]
  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{name}</span>
            <Badge variant={meta.variant} className="text-[10px]">
              <Circle className={cn('mr-1 h-2 w-2 fill-current', meta.color)} />
              {meta.label}
            </Badge>
          </div>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
          {lastRunAgo && <p className="text-xs text-muted-foreground">Last run {lastRunAgo}</p>}
        </div>
      </div>
    </Card>
  )
}
