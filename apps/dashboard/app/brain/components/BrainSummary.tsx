'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Brain, BookOpenText, Bell, Sparkles, Target } from 'lucide-react'
import type { BrainSummaryDTO } from '@/lib/brain/types'

interface SummaryResponse {
  source: string
  summary: BrainSummaryDTO
}

export function BrainSummary(): JSX.Element {
  const { data, isLoading, error } = useQuery<SummaryResponse>({
    queryKey: ['brain', 'summary'],
    queryFn: async () => {
      const r = await fetch('/api/brain/summary')
      if (!r.ok) throw new Error('summary fetch failed')
      return r.json()
    },
    refetchInterval: 60_000,
  })

  if (isLoading) return <SummarySkeleton />
  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Could not load brain summary.
        </CardContent>
      </Card>
    )
  }

  const { summary } = data
  const nowExpiresHours = summary.now
    ? Math.max(0, Math.round(summary.now.expiresInMs / 3_600_000))
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-2xl">
            {summary.persona.emoji}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{summary.persona.name}</h2>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {data.source}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{summary.persona.tagline}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<Brain className="h-4 w-4" />}
          label="Memories"
          value={summary.memories.total.toString()}
          hint={Object.entries(summary.memories.byType)
            .map(([k, v]) => `${v} ${k}`)
            .join(' · ')}
        />
        <StatTile
          icon={<BookOpenText className="h-4 w-4" />}
          label="Journal (7d)"
          value={summary.journal.last7d.toString()}
          hint={`${summary.journal.unconsolidated} unconsolidated`}
        />
        <StatTile
          icon={<Bell className="h-4 w-4" />}
          label="Signals"
          value={summary.signals.total.toString()}
          hint={
            summary.signals.urgent > 0
              ? `${summary.signals.urgent} urgent`
              : 'all calm'
          }
          tone={summary.signals.urgent > 0 ? 'warn' : 'default'}
        />
        <StatTile
          icon={<Target className="h-4 w-4" />}
          label="NOW expires"
          value={
            nowExpiresHours == null
              ? '—'
              : nowExpiresHours <= 0
                ? 'expired'
                : `${nowExpiresHours}h`
          }
          hint={summary.now?.content ? truncate(summary.now.content, 60) : 'no focus set'}
          tone={nowExpiresHours != null && nowExpiresHours <= 0 ? 'warn' : 'default'}
        />
      </div>
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: JSX.Element
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'warn'
}): JSX.Element {
  return (
    <Card className={tone === 'warn' ? 'border-warning/40' : undefined}>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

function SummarySkeleton(): JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-7 w-14 animate-pulse rounded bg-muted" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export { Sparkles }
