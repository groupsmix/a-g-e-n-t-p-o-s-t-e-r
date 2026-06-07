'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { api } from '@/lib/api'

interface Tile {
  label: string
  value: number
  icon: JSX.Element
  hint?: string
}

export function PublisherSummary(): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ['publisher', 'summary'],
    queryFn: () => api.publisher.summary(),
    refetchInterval: 30_000,
  })

  if (isLoading) return <SummarySkeleton />
  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Could not load publisher summary.
        </CardContent>
      </Card>
    )
  }

  if (data.source !== 'live') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publisher queue not initialised</CardTitle>
          <CardDescription>
            Run migration <code className="rounded bg-muted px-1 py-0.5">025_publish_jobs.sql</code>{' '}
            on the nexus D1 database, then enqueue your first job from the Writer agent.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const tiles: Tile[] = [
    {
      label: 'Scheduled',
      value: data.status_counts.scheduled,
      icon: <Clock className="h-4 w-4 text-muted-foreground" />,
      hint: `${data.upcoming} future`,
    },
    {
      label: 'Published 24h',
      value: data.done_24h,
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      hint: `${data.status_counts.done} all-time`,
    },
    {
      label: 'Failed 24h',
      value: data.failed_24h,
      icon: <XCircle className="h-4 w-4 text-rose-500" />,
      hint: `${data.status_counts.failed} all-time`,
    },
    {
      label: 'Platforms',
      value: new Set(data.by_platform.map((b) => b.platform)).size,
      icon: <Calendar className="h-4 w-4 text-muted-foreground" />,
      hint: data.by_platform
        .map((b) => `${b.platform}:${b.n}`)
        .slice(0, 3)
        .join('  '),
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t.label}</CardTitle>
            {t.icon}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{t.value}</div>
            {t.hint && <p className="text-xs text-muted-foreground mt-1">{t.hint}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SummarySkeleton(): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-7 w-16 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
