'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, Circle, Clock, Loader2,
  Play, RefreshCw, RotateCcw, Trash2, X, ChevronDown, ChevronRight,
  Zap, Package, TrendingUp, Star, Upload, Megaphone, DollarSign, Brain,
} from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { api } from '@/lib/api'
import type { Job, QueueStats, JobStatus } from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

const JOB_ICONS: Record<string, React.ReactNode> = {
  research_job:          <TrendingUp  className="h-3.5 w-3.5" />,
  score_idea_job:        <Star        className="h-3.5 w-3.5" />,
  build_product_job:     <Package     className="h-3.5 w-3.5" />,
  quality_check_job:     <CheckCircle2 className="h-3.5 w-3.5" />,
  publish_job:           <Upload      className="h-3.5 w-3.5" />,
  marketing_job:         <Megaphone   className="h-3.5 w-3.5" />,
  revenue_sync_job:      <DollarSign  className="h-3.5 w-3.5" />,
  winner_analysis_job:   <Brain       className="h-3.5 w-3.5" />,
  graveyard_analysis_job:<Trash2      className="h-3.5 w-3.5" />,
}

const JOB_LABELS: Record<string, string> = {
  research_job:          'Research',
  score_idea_job:        'Score Idea',
  build_product_job:     'Build Product',
  quality_check_job:     'Quality Check',
  publish_job:           'Publish',
  marketing_job:         'Marketing',
  revenue_sync_job:      'Revenue Sync',
  winner_analysis_job:   'Winner Analysis',
  graveyard_analysis_job:'Graveyard Analysis',
}

const STATUS_STYLES: Record<JobStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/10 text-blue-400',
  done:    'bg-emerald-500/10 text-emerald-400',
  failed:  'bg-amber-500/10 text-amber-400',
  dead:    'bg-destructive/10 text-destructive',
}

const STATUS_ICONS: Record<JobStatus, React.ReactNode> = {
  pending: <Clock        className="h-3 w-3" />,
  running: <Loader2      className="h-3 w-3 animate-spin" />,
  done:    <CheckCircle2 className="h-3 w-3" />,
  failed:  <AlertTriangle className="h-3 w-3" />,
  dead:    <X            className="h-3 w-3" />,
}

// ── Page ───────────────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '',       label: 'All' },
  { value: 'pending',label: 'Pending' },
  { value: 'running',label: 'Running' },
  { value: 'done',   label: 'Done' },
  { value: 'failed', label: 'Failed' },
  { value: 'dead',   label: 'Dead letter' },
]

export default function QueuePage() {
  const [jobs, setJobs]         = useState<Job[]>([])
  const [stats, setStats]       = useState<QueueStats | null>(null)
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [busy, setBusy]         = useState(false)
  const [filter, setFilter]     = useState('')
  const [stepFilter, setStepFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail]     = useState<{ job: Job; agent_output: { agent_name: string; output: string } | null } | null>(null)
  const [isDisabled, setIsDisabled] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsDisabled(false)
    setErrorMessage(null)
    try {
      const [jobsRes, statsRes] = await Promise.all([
        api.getQueueJobs({
          status: filter || undefined,
          step: stepFilter || undefined,
          limit: 100,
        }),
        api.getQueueStats(),
      ])
      setJobs(jobsRes.jobs)
      setTotal(jobsRes.total)
      setStats(statsRes.stats)
    } catch (err: any) {
      console.error(err)
      if (err.disabled || err.status === 404 || err.status === 501) {
        setIsDisabled(true)
      } else {
        setErrorMessage(err.message || 'Failed to load queue')
      }
    }
  }, [filter, stepFilter])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  async function runNext() {
    setBusy(true)
    try {
      await api.runNextJob()
      setTimeout(() => load(), 1200)
    } catch (err: any) {
      alert(err.message || 'Failed to run next job')
    } finally { setBusy(false) }
  }

  async function requeueAll() {
    setBusy(true)
    try {
      await api.requeueAllFailed()
      await load()
    } catch (err: any) {
      alert(err.message || 'Failed to requeue failed jobs')
    } finally { setBusy(false) }
  }

  async function requeueOne(jobId: string) {
    try {
      await api.requeueJob(jobId)
      await load()
    } catch (err: any) {
      alert(err.message || 'Failed to requeue job')
    }
  }

  async function cancelOne(jobId: string) {
    try {
      await api.cancelQueueJob(jobId)
      await load()
    } catch (err: any) {
      alert(err.message || 'Failed to cancel job')
    }
  }

  async function openDetail(jobId: string) {
    if (expanded === jobId) { setExpanded(null); setDetail(null); return }
    setExpanded(jobId)
    try {
      const res = await api.getQueueJob(jobId)
      setDetail(res)
    } catch { setDetail(null) }
  }

  if (isDisabled) {
    return (
      <>
        <PageHeader
          title={<span className="flex items-center gap-2"><Activity className="h-5 w-5" /> Job Queue</span>}
          subtitle="All automation jobs — pending, running, done, failed, dead letter."
        />
        <PageBody>
          <div className="rounded-xl border border-border bg-card p-6 text-center max-w-xl mx-auto my-12 space-y-4">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
            <h2 className="text-lg font-semibold">Job Queue is Unconfigured</h2>
            <p className="text-sm text-muted-foreground">
              The background job queue feature is currently disabled or setup is required in the backend.
            </p>
            <div className="pt-4 flex justify-center gap-3">
              <button onClick={() => { setLoading(true); load().finally(() => setLoading(false)) }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <RefreshCw className="h-4 w-4" />
                Retry connection
              </button>
            </div>
          </div>
        </PageBody>
      </>
    )
  }

  const deadFailed = (stats?.dead ?? 0) + (stats?.failed ?? 0)

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Activity className="h-5 w-5" /> Job Queue</span>}
        subtitle="All automation jobs — pending, running, done, failed, dead letter."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            {deadFailed > 0 && (
              <button onClick={requeueAll} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20 disabled:opacity-50">
                <RotateCcw className="h-3.5 w-3.5" /> Retry all failed ({deadFailed})
              </button>
            )}
            <button onClick={runNext} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run next
            </button>
          </div>
        }
      />

      <PageBody className="space-y-4">

        {/* ── Stats bar ───────────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-5 gap-2">
            {(['pending','running','done','failed','dead'] as JobStatus[]).map((s) => (
              <button key={s} onClick={() => setFilter(filter === s ? '' : s)}
                className={`rounded-xl border p-3 text-center transition-colors ${filter === s ? 'border-primary bg-primary/10' : 'border-border bg-card/50 hover:bg-muted/50'}`}>
                <div className="text-2xl font-bold tabular-nums">{stats[s] ?? 0}</div>
                <div className="text-[10px] text-muted-foreground capitalize mt-0.5">{s === 'dead' ? 'Dead letter' : s}</div>
              </button>
            ))}
          </div>
        )}

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === f.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {f.label}
            </button>
          ))}
          <select value={stepFilter} onChange={(e) => setStepFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1 text-xs focus:outline-none ml-auto">
            <option value="">All job types</option>
            {Object.entries(JOB_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {/* ── Job list ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
            <Circle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No jobs match this filter.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {jobs.map((job) => (
              <div key={job.job_id} className="rounded-xl border border-border bg-card/50 overflow-hidden">
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Step icon */}
                  <div className="text-muted-foreground shrink-0">
                    {JOB_ICONS[job.step_name] ?? <Activity className="h-3.5 w-3.5" />}
                  </div>

                  {/* Step name + product */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {JOB_LABELS[job.step_name] ?? job.step_name}
                      <span className="text-xs font-normal text-muted-foreground truncate">
                        {job.product_id ? `#${job.product_id.slice(0, 8)}` : job.opportunity_id ? `opp:${job.opportunity_id.slice(0, 8)}` : ''}
                      </span>
                    </div>
                    {job.last_error && (
                      <p className="text-xs text-destructive truncate mt-0.5">{job.last_error}</p>
                    )}
                  </div>

                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${STATUS_STYLES[job.status]}`}>
                    {STATUS_ICONS[job.status]} {job.status}
                  </span>

                  {/* Attempts */}
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {job.attempt_count}/{job.max_attempts}
                  </span>

                  {/* Time */}
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                    {new Date(job.created_at).toLocaleTimeString()}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {(job.status === 'failed' || job.status === 'dead') && (
                      <button onClick={() => requeueOne(job.job_id)} title="Retry"
                        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {job.status === 'pending' && (
                      <button onClick={() => cancelOne(job.job_id)} title="Cancel"
                        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => openDetail(job.job_id)}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
                      {expanded === job.job_id
                        ? <ChevronDown  className="h-3.5 w-3.5" />
                        : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded === job.job_id && detail && detail.job.job_id === job.job_id && (
                  <div className="border-t border-border bg-background px-4 py-3 space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
                      <span>Job ID</span>     <span className="font-mono text-foreground">{job.job_id}</span>
                      <span>Priority</span>   <span className="text-foreground">{job.priority}</span>
                      <span>Scheduled</span>  <span className="text-foreground">{new Date(job.scheduled_for).toLocaleString()}</span>
                      {job.started_at  && <><span>Started</span>  <span className="text-foreground">{new Date(job.started_at).toLocaleString()}</span></>}
                      {job.finished_at && <><span>Finished</span> <span className="text-foreground">{new Date(job.finished_at).toLocaleString()}</span></>}
                    </div>
                    {job.payload && job.payload !== '{}' && (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Input payload</summary>
                        <pre className="mt-1 rounded bg-muted p-2 overflow-x-auto text-[10px]">{JSON.stringify(JSON.parse(job.payload), null, 2)}</pre>
                      </details>
                    )}
                    {detail.agent_output && (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Agent output — {detail.agent_output.agent_name}
                        </summary>
                        <pre className="mt-1 rounded bg-muted p-2 overflow-x-auto text-[10px] max-h-64">
                          {JSON.stringify(JSON.parse(detail.agent_output.output), null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {total > jobs.length && (
          <p className="text-xs text-muted-foreground text-center">
            Showing {jobs.length} of {total} jobs.
          </p>
        )}
      </PageBody>
    </>
  )
}
