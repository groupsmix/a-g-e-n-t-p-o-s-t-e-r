'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RotateCcw, Trash2, ExternalLink } from 'lucide-react'
import { api, type PublisherJob, type PublisherJobStatus } from '@/lib/api'

const STATUSES: { id: PublisherJobStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'done', label: 'Published' },
  { id: 'failed', label: 'Failed' },
]

const STATUS_VARIANT: Record<PublisherJobStatus, 'secondary' | 'success' | 'destructive'> = {
  scheduled: 'secondary',
  done: 'success',
  failed: 'destructive',
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function PublisherQueue(): JSX.Element {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<PublisherJobStatus | 'all'>('all')
  const { data, isLoading } = useQuery({
    queryKey: ['publisher', 'jobs', filter],
    queryFn: () =>
      api.publisher.jobs({
        status: filter === 'all' ? undefined : filter,
        limit: 50,
      }),
    refetchInterval: 30_000,
  })

  const retry = useMutation({
    mutationFn: (id: string) => api.publisher.retry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publisher'] })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.publisher.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publisher'] })
    },
  })

  const jobs = data?.jobs ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Queue</CardTitle>
          <CardDescription>Latest 50 jobs across all platforms</CardDescription>
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setFilter(s.id)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                filter === s.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No jobs match this filter.
          </div>
        ) : (
          <ul className="divide-y">
            {jobs.map((j) => (
              <JobRow
                key={j.idempotency_key}
                job={j}
                onRetry={() => retry.mutate(j.idempotency_key)}
                onRemove={() => remove.mutate(j.idempotency_key)}
                busy={retry.isPending || remove.isPending}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function JobRow({
  job,
  onRetry,
  onRemove,
  busy,
}: {
  job: PublisherJob
  onRetry: () => void
  onRemove: () => void
  busy: boolean
}): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[job.status]} className="text-[10px] uppercase">
            {job.status}
          </Badge>
          <span className="text-xs uppercase text-muted-foreground">{job.platform}</span>
          <span className="truncate font-medium">{job.title}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{job.parts_count} part{job.parts_count === 1 ? '' : 's'}</span>
          <span>{job.status === 'scheduled' ? `due ${fmt(job.publish_at)}` : `done ${fmt(job.completed_at)}`}</span>
          {job.error && <span className="text-rose-500 truncate" title={job.error}>{job.error}</span>}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted"
            title="Open post"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {job.status === 'failed' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  )
}
