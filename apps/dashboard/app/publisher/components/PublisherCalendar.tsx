'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api, type PublisherJob } from '@/lib/api'

const PLATFORM_COLOUR: Record<string, string> = {
  x: 'bg-sky-500/15 text-sky-500',
  linkedin: 'bg-blue-700/15 text-blue-600',
  instagram: 'bg-pink-500/15 text-pink-500',
  tiktok: 'bg-fuchsia-500/15 text-fuchsia-500',
  youtube: 'bg-red-500/15 text-red-500',
  newsletter: 'bg-amber-500/15 text-amber-500',
  blog: 'bg-emerald-500/15 text-emerald-500',
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fmtHour(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function PublisherCalendar(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['publisher', 'calendar', 14],
    queryFn: () => api.publisher.calendar(14),
    refetchInterval: 60_000,
  })

  const grid = useMemo(() => {
    const days: { date: Date; key: string; jobs: PublisherJob[] }[] = []
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    for (let i = 0; i < 14; i++) {
      const d = new Date(start.getTime() + i * 86_400_000)
      days.push({ date: d, key: dayKey(d), jobs: [] })
    }
    if (data?.jobs) {
      const byKey = new Map(days.map((d) => [d.key, d.jobs]))
      for (const j of data.jobs) {
        if (!j.publish_at) continue
        const k = j.publish_at.slice(0, 10)
        byKey.get(k)?.push(j)
      }
    }
    return days
  }, [data])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">14-day calendar</CardTitle>
          <CardDescription>Scheduled posts across every platform</CardDescription>
        </div>
        <Badge variant="secondary" className="text-[10px] uppercase">
          {data?.jobs.length ?? 0} planned
        </Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-40 animate-pulse rounded bg-muted/30" />
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {grid.map(({ date, key, jobs }) => {
              const isToday = key === dayKey(new Date())
              return (
                <div
                  key={key}
                  className={`min-h-[110px] rounded-md border p-2 text-xs ${
                    isToday ? 'border-primary/40 bg-primary/5' : 'border-border/60'
                  }`}
                >
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="font-medium">
                      {date.toLocaleDateString([], { weekday: 'short' })}
                    </span>
                    <span className="text-muted-foreground">
                      {date.toLocaleDateString([], { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {jobs.slice(0, 4).map((j) => (
                      <div
                        key={j.idempotency_key}
                        className={`truncate rounded px-1.5 py-0.5 text-[10px] ${
                          PLATFORM_COLOUR[j.platform] ?? 'bg-muted text-foreground'
                        }`}
                        title={`${j.platform} · ${j.title}`}
                      >
                        <span className="font-mono">{fmtHour(j.publish_at!)}</span>{' '}
                        {j.title}
                      </div>
                    ))}
                    {jobs.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{jobs.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
