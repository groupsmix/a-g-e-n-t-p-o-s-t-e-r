'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Send, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { EmptyState } from '@/components/shared/EmptyState'

type Summary = {
  source: 'live' | 'unconfigured'
  pending: number
  in_progress: number
  succeeded: number
  failed: number
  next_run_at?: string
  note?: string
}
type Job = {
  id: string
  platform: string
  status: string
  scheduled_for?: string
  attempts?: number
  last_error?: string
  payload_kind?: string
}

const FILTERS = ['all', 'pending', 'in_progress', 'succeeded', 'failed'] as const

export default function PublisherQueuePage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [filter, setFilter] = useState<typeof FILTERS[number]>('pending')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.getPublisherQueueSummary(),
      api.getPublisherQueueJobs(filter === 'all' ? undefined : filter),
    ])
      .then(([s, j]) => {
        if (cancelled) return
        setSummary(s)
        setJobs(j.jobs || [])
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [filter])

  const unconfigured = summary?.source === 'unconfigured'

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Send className="h-5 w-5" /> Publisher Queue</span>}
        subtitle="Scheduled multi-platform publishing jobs."
      />
      <PageBody className="space-y-6">
        {unconfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
            <p className="font-medium text-amber-500">Publisher queue not configured</p>
            <p className="mt-1 text-muted-foreground">
              Connect platforms in Settings, then schedule posts to populate the queue.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat icon={<Clock className="h-5 w-5 text-amber-500" />} label="Pending" value={summary ? String(summary.pending ?? 0) : (loading ? '…' : '0')} />
          <Stat icon={<Send className="h-5 w-5 text-primary" />} label="In progress" value={summary ? String(summary.in_progress ?? 0) : (loading ? '…' : '0')} />
          <Stat icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Succeeded" value={summary ? String(summary.succeeded ?? 0) : (loading ? '…' : '0')} />
          <Stat icon={<AlertCircle className="h-5 w-5 text-destructive" />} label="Failed" value={summary ? String(summary.failed ?? 0) : (loading ? '…' : '0')} />
        </div>

        <div className="flex items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${filter === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">Jobs ({jobs.length})</div>
          {jobs.length === 0 ? (
            loading ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : (
              <div className="px-5 py-4">
                <EmptyState
                  icon={<Send className="h-5 w-5" />}
                  title={filter === 'all' ? 'No publish jobs yet' : 'No jobs match this filter'}
                  description={
                    filter === 'all'
                      ? 'Approve and publish products to create scheduled platform jobs.'
                      : 'Try another queue filter or clear the filter to see all jobs.'
                  }
                  action={
                    filter === 'all' ? (
                      <Link
                        href="/review"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                      >
                        Go to Review Queue
                      </Link>
                    ) : (
                      <button
                        onClick={() => setFilter('all')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                      >
                        Clear filter
                      </button>
                    )
                  }
                />
              </div>
            )
          ) : (
            <div className="divide-y divide-border">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      <span className="capitalize">{j.platform}</span>
                      {j.payload_kind && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">{j.payload_kind}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {j.scheduled_for ? new Date(j.scheduled_for).toLocaleString() : 'unscheduled'}
                      {j.attempts != null && <span> · {j.attempts} attempt{j.attempts === 1 ? '' : 's'}</span>}
                      {j.last_error && <span className="ml-2 text-destructive">· {j.last_error}</span>}
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${statusClass(j.status)}`}>{j.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageBody>
    </>
  )
}

function statusClass(s: string): string {
  if (s === 'succeeded' || s === 'success') return 'bg-emerald-500/15 text-emerald-500'
  if (s === 'failed' || s === 'error') return 'bg-destructive/15 text-destructive'
  if (s === 'in_progress' || s === 'running') return 'bg-primary/15 text-primary'
  return 'bg-muted text-muted-foreground'
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}
