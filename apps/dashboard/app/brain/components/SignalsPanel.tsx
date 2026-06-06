'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/utils'
import { AlertTriangle, Bell, Clock, RefreshCw, Sparkles } from 'lucide-react'
import type { SignalDTO } from '@/lib/brain/types'

interface SignalsResponse {
  source: string
  signals: SignalDTO[]
}

const KIND_ICON: Record<SignalDTO['kind'], JSX.Element> = {
  'follow-up': <Sparkles className="h-3.5 w-3.5" />,
  'now-stale': <Clock className="h-3.5 w-3.5" />,
  'task-stalled': <RefreshCw className="h-3.5 w-3.5" />,
  'task-failed-burst': <AlertTriangle className="h-3.5 w-3.5" />,
  'consolidation-due': <Sparkles className="h-3.5 w-3.5" />,
  idle: <Clock className="h-3.5 w-3.5" />,
}

const SEVERITY_VARIANT: Record<
  SignalDTO['severity'],
  'default' | 'secondary' | 'warning' | 'destructive'
> = {
  info: 'secondary',
  notice: 'default',
  warn: 'warning',
  urgent: 'destructive',
}

export function SignalsPanel(): JSX.Element {
  const { data, isLoading } = useQuery<SignalsResponse>({
    queryKey: ['brain', 'signals'],
    queryFn: async () => {
      const r = await fetch('/api/brain/signals?limit=10')
      if (!r.ok) throw new Error('signals fetch failed')
      return r.json()
    },
    refetchInterval: 30_000,
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Proactivity signals</CardTitle>
          </div>
          {data?.signals ? (
            <Badge variant="outline" className="text-[10px] uppercase">
              {data.signals.length}
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          What the proactivity engine wants you to know — ranked by score.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <SignalSkeleton />
        ) : (data?.signals ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">All calm. Nothing to surface right now.</p>
        ) : (
          (data?.signals ?? []).map((s) => (
            <div
              key={s.key}
              className="flex flex-col gap-1 rounded-md border bg-card/60 p-3 transition-colors hover:bg-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {KIND_ICON[s.kind]}
                  <span className="text-sm font-medium leading-tight">{s.title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant={SEVERITY_VARIANT[s.severity]} className="text-[10px] uppercase">
                    {s.severity}
                  </Badge>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {(s.score * 100).toFixed(0)}
                  </span>
                </div>
              </div>
              {s.detail ? (
                <p className="text-xs text-muted-foreground">{s.detail}</p>
              ) : null}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{s.kind}</span>
                <span>{timeAgo(s.observedAt)}</span>
              </div>
              {s.suggestion ? (
                <div className="mt-1 rounded-sm bg-muted/40 px-2 py-1 text-[11px]">
                  Suggested action: queue{' '}
                  <span className="font-mono">{s.suggestion.taskType}</span> — {s.suggestion.reason}
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function SignalSkeleton(): JSX.Element {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-md bg-muted/40" />
      ))}
    </div>
  )
}
