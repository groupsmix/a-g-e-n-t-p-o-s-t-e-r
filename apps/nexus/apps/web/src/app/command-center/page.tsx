'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Activity, AlertCircle, CheckCircle2, Circle, Clock, Filter,
  Loader2, Play, PlusCircle, RefreshCw, RotateCcw, ShieldCheck,
  Slash, Terminal, X, XCircle, ChevronDown, ChevronRight, Zap,
  MessageSquare, Box, AlertTriangle,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/shell/AppShell'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'needs_me' | 'archived'
type TaskType = string

interface AgentTask {
  id: string
  type: TaskType
  status: TaskStatus
  payload: Record<string, unknown> | null
  result: unknown | null
  error: string | null
  estimated_cost_usd: number | null
  actual_cost_usd: number | null
  model_used: string | null
  input_tokens: number | null
  output_tokens: number | null
  agent_id: string | null
  origin: string
  parent_task_id: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
}

interface ApprovalRequest {
  id: string
  task_id: string
  action_type: string
  description: string
  risk_level: string
  status: string
  created_at: string
}

interface TaskEvent {
  id: string
  task_id: string
  event_type: string
  message: string
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ReactNode; pill: string }> = {
  queued:    { label: 'Queued',    icon: <Circle className="h-3.5 w-3.5 text-zinc-400" />,       pill: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  running:   { label: 'Running',   icon: <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />, pill: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  done:      { label: 'Done',      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />, pill: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed:    { label: 'Failed',    icon: <XCircle className="h-3.5 w-3.5 text-rose-400" />,       pill: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  cancelled: { label: 'Cancelled', icon: <Slash className="h-3.5 w-3.5 text-zinc-500" />,        pill: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
  needs_me:  { label: 'Needs Me',  icon: <AlertCircle className="h-3.5 w-3.5 text-amber-400 animate-pulse" />, pill: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  archived:  { label: 'Archived',  icon: <Box className="h-3.5 w-3.5 text-zinc-600" />,          pill: 'bg-zinc-700/30 text-zinc-500 border-zinc-600/20' },
}

const TASK_TYPES = [
  'research', 'write', 'build-app', 'build-site', 'publish',
  'analyse', 'generate-video', 'generate-image', 'lead-scrape',
  'email-campaign', 'financial-analysis', 'brand-monitor',
  'autonome-run', 'memory-consolidate',
] as const

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: TaskStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold uppercase', cfg.pill)}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function CostBadge({ usd }: { usd: number | null | undefined }) {
  if (!usd) return null
  return (
    <span className="text-[10px] text-muted-foreground font-mono">
      ${usd.toFixed(4)}
    </span>
  )
}

function TaskRow({
  task,
  selected,
  onClick,
}: {
  task: AgentTask
  selected: boolean
  onClick: () => void
}) {
  const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.queued
  return (
    <tr
      onClick={onClick}
      className={cn(
        'cursor-pointer border-b border-border transition-colors text-sm',
        selected ? 'bg-primary/5' : 'hover:bg-muted/20',
      )}
    >
      <td className="px-4 py-2.5 w-6">{cfg.icon}</td>
      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground w-28 truncate">{task.id.slice(0, 12)}…</td>
      <td className="px-3 py-2.5">
        <span className="font-medium text-foreground text-xs">{task.type}</span>
        {task.agent_id && (
          <span className="ml-2 text-[10px] text-muted-foreground">by {task.agent_id}</span>
        )}
      </td>
      <td className="px-3 py-2.5 hidden md:table-cell">
        <StatusPill status={task.status} />
      </td>
      <td className="px-3 py-2.5 text-[10px] text-muted-foreground hidden lg:table-cell whitespace-nowrap">
        {task.origin}
      </td>
      <td className="px-3 py-2.5 hidden lg:table-cell">
        <CostBadge usd={task.actual_cost_usd ?? task.estimated_cost_usd} />
      </td>
      <td className="px-3 py-2.5 text-[10px] text-muted-foreground whitespace-nowrap text-right">
        {timeAgo(task.created_at)}
      </td>
      <td className="px-4 py-2.5">
        <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', selected && 'rotate-90')} />
      </td>
    </tr>
  )
}

function TaskDetail({
  task,
  onClose,
}: {
  task: AgentTask
  onClose: () => void
}) {
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'events' | 'payload' | 'result'>('events')

  useEffect(() => {
    setLoading(true)
    api.getTaskEvents(task.id)
      .then((r) => setEvents(r.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [task.id])

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {STATUS_CONFIG[task.status]?.icon}
          <h3 className="font-semibold text-sm">{task.type}</h3>
          <StatusPill status={task.status} />
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Meta row */}
      <div className="border-b border-border px-5 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
        <span><span className="text-zinc-500 uppercase text-[9px] mr-1">ID</span><code className="font-mono">{task.id}</code></span>
        <span><span className="text-zinc-500 uppercase text-[9px] mr-1">Origin</span>{task.origin}</span>
        {task.agent_id && <span><span className="text-zinc-500 uppercase text-[9px] mr-1">Agent</span>{task.agent_id}</span>}
        {task.model_used && <span><span className="text-zinc-500 uppercase text-[9px] mr-1">Model</span>{task.model_used}</span>}
        {task.duration_ms != null && (
          <span><span className="text-zinc-500 uppercase text-[9px] mr-1">Duration</span>{(task.duration_ms / 1000).toFixed(1)}s</span>
        )}
        {(task.actual_cost_usd != null || task.estimated_cost_usd != null) && (
          <span><span className="text-zinc-500 uppercase text-[9px] mr-1">Cost</span>${(task.actual_cost_usd ?? task.estimated_cost_usd ?? 0).toFixed(4)}</span>
        )}
        <span className="ml-auto">{timeAgo(task.created_at)}</span>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-5 flex gap-0">
        {(['events', 'payload', 'result'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-colors -mb-px',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="p-5 max-h-80 overflow-y-auto">
        {activeTab === 'events' && (
          loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-muted/30" />)}
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events recorded yet.</p>
          ) : (
            <ol className="relative border-l border-border pl-5 ml-2 space-y-4">
              {events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[23px] top-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background border border-border">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                      {ev.event_type}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(ev.created_at)}</span>
                  </div>
                  {ev.message && (
                    <p className="mt-1 text-xs text-foreground leading-relaxed">{ev.message}</p>
                  )}
                </li>
              ))}
            </ol>
          )
        )}
        {activeTab === 'payload' && (
          <pre className="text-[10px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {task.payload ? JSON.stringify(task.payload, null, 2) : 'No payload'}
          </pre>
        )}
        {activeTab === 'result' && (
          task.error ? (
            <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 text-xs text-rose-400">
              {task.error}
            </div>
          ) : task.result ? (
            <pre className="text-[10px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {JSON.stringify(task.result, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">No result yet.</p>
          )
        )}
      </div>
    </div>
  )
}

function ApprovalCard({
  approval,
  onDone,
}: {
  approval: ApprovalRequest
  onDone: () => void
}) {
  const [feedback, setFeedback] = useState('')
  const [acting, setAct] = useState<'approve' | 'reject' | 'changes' | null>(null)

  const act = async (action: 'approve' | 'reject' | 'changes') => {
    setAct(action)
    try {
      if (action === 'approve') await api.approveRequest(approval.id, feedback || undefined)
      else if (action === 'reject') await api.rejectRequest(approval.id, feedback || undefined)
      else await api.requestChanges(approval.id, feedback || 'Changes requested.')
      onDone()
    } catch (err) {
      console.error(err)
    } finally {
      setAct(null)
    }
  }

  const riskColor = {
    low: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
    medium: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
    high: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
  }[approval.risk_level] ?? 'text-zinc-400 border-zinc-500/20 bg-zinc-500/5'

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <div>
            <div className="font-semibold text-sm text-foreground">{approval.action_type}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{approval.task_id.slice(0, 12)}…</div>
          </div>
        </div>
        <span className={cn('text-[10px] border px-2 py-0.5 rounded uppercase font-semibold', riskColor)}>
          {approval.risk_level} risk
        </span>
      </div>

      {approval.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{approval.description}</p>
      )}

      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={2}
        placeholder="Optional feedback..."
        className="w-full text-xs bg-muted/30 border border-border rounded-lg p-2 resize-none outline-none focus:border-primary/50 transition-colors"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => act('approve')}
          disabled={!!acting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {acting === 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Approve
        </button>
        <button
          onClick={() => act('changes')}
          disabled={!!acting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {acting === 'changes' ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
          Request Changes
        </button>
        <button
          onClick={() => act('reject')}
          disabled={!!acting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rose-700 hover:bg-rose-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {acting === 'reject' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
          Reject
        </button>
        <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(approval.created_at)}</span>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [selected, setSelected] = useState<AgentTask | null>(null)

  const [loadingTasks, setLoadingTasks] = useState(true)
  const [loadingApprovals, setLoadingApprovals] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // New task modal
  const [showNew, setShowNew] = useState(false)
  const [newType, setNewType] = useState<typeof TASK_TYPES[number]>('research')
  const [newPayload, setNewPayload] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // SSE live tail
  const sseRef = useRef<EventSource | null>(null)

  const fetchAll = useCallback(async (quiet = false) => {
    if (!quiet) { setLoadingTasks(true); setLoadingApprovals(true) }
    else setRefreshing(true)
    try {
      const [tasksRes, approvalsRes] = await Promise.all([
        api.getTasks(statusFilter === 'all' ? undefined : statusFilter, typeFilter === 'all' ? undefined : typeFilter),
        api.getApprovals(),
      ])
      setTasks(tasksRes.tasks ?? [])
      setApprovals(approvalsRes.approvals ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingTasks(false)
      setLoadingApprovals(false)
      setRefreshing(false)
    }
  }, [statusFilter, typeFilter])

  useEffect(() => { fetchAll() }, [fetchAll])

  // SSE: subscribe to live task updates
  useEffect(() => {
    if (sseRef.current) sseRef.current.close()
    // The SSE endpoint just pushes updates, we merge them into our state
    // (gracefully degrades if the connection fails)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null
      const url = new URL(`${process.env.NEXT_PUBLIC_API_BASE ?? ''}/api/tasks/stream`)
      if (token) url.searchParams.set('token', token)
      const es = new EventSource(url.toString())
      sseRef.current = es
      es.addEventListener('task', (ev) => {
        try {
          const updated: AgentTask = JSON.parse((ev as MessageEvent).data)
          setTasks((prev) => {
            const idx = prev.findIndex((t) => t.id === updated.id)
            if (idx === -1) return [updated, ...prev]
            const next = [...prev]
            next[idx] = updated
            return next
          })
          // If viewing the updated task, refresh it
          setSelected((prev) => prev?.id === updated.id ? updated : prev)
        } catch { /* ignore */ }
      })
      es.onerror = () => { es.close(); sseRef.current = null }
    } catch { /* SSE not available */ }
    return () => { sseRef.current?.close(); sseRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateTask = async () => {
    setCreateError('')
    let payload: Record<string, unknown> = {}
    if (newPayload.trim()) {
      try { payload = JSON.parse(newPayload) } catch {
        setCreateError('Payload must be valid JSON')
        return
      }
    }
    setCreating(true)
    try {
      await api.createTask({ type: newType, payload, origin: 'dashboard' })
      setShowNew(false)
      setNewPayload('')
      await fetchAll(true)
    } catch (err: any) {
      setCreateError(err.message ?? 'Failed to create task')
    } finally {
      setCreating(false)
    }
  }

  // Stats derived from task list
  const stats = {
    running: tasks.filter((t) => t.status === 'running').length,
    queued: tasks.filter((t) => t.status === 'queued').length,
    needs_me: tasks.filter((t) => t.status === 'needs_me').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (typeFilter !== 'all' && t.type !== typeFilter) return false
    return true
  })

  return (
    <div className="flex-1">
      <PageHeader
        title="Command Center"
        subtitle="Live task board, approval queue, and agent control plane for all running and scheduled operations."
      />

      <PageBody className="max-w-7xl mx-auto space-y-6">

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {([
            { label: 'Running',  count: stats.running,  color: 'text-blue-400',    bg: 'bg-blue-500/5 border-blue-500/20' },
            { label: 'Queued',   count: stats.queued,   color: 'text-zinc-400',    bg: 'bg-zinc-500/5 border-zinc-500/20' },
            { label: 'Needs Me', count: stats.needs_me, color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30' },
            { label: 'Failed',   count: stats.failed,   color: 'text-rose-400',    bg: 'bg-rose-500/5 border-rose-500/20' },
            { label: 'Done',     count: stats.done,     color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/20' },
          ] as const).map((s) => (
            <button
              key={s.label}
              onClick={() => setStatusFilter(s.label.toLowerCase().replace(' ', '_') as TaskStatus)}
              className={cn(
                'rounded-xl border p-4 text-left transition-all hover:opacity-90',
                s.bg,
                statusFilter === s.label.toLowerCase().replace(' ', '_') && 'ring-1 ring-offset-1 ring-offset-background',
              )}
            >
              <div className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.count}</div>
              <div className="text-[10px] uppercase font-semibold text-muted-foreground mt-1">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Approval queue */}
        {loadingApprovals ? null : approvals.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <h2 className="font-semibold text-sm">Pending Approvals</h2>
              <span className="ml-1 text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5 font-semibold">
                {approvals.length}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {approvals.map((a) => (
                <ApprovalCard
                  key={a.id}
                  approval={a}
                  onDone={() => fetchAll(true)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Main task board */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Toolbar */}
          <div className="border-b border-border px-5 py-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Task Board</h2>
              <span className="text-[10px] text-muted-foreground">({filteredTasks.length})</span>
              {stats.running > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-blue-400 animate-pulse">
                  <Activity className="h-3 w-3" />{stats.running} live
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status filter */}
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="pl-7 pr-3 py-1.5 text-xs bg-muted/40 border border-border rounded-lg outline-none focus:border-primary/50 appearance-none"
                >
                  <option value="all">All status</option>
                  {Object.keys(STATUS_CONFIG).map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s as TaskStatus].label}</option>
                  ))}
                </select>
                <Filter className="absolute left-2 top-2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
              {/* Type filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-muted/40 border border-border rounded-lg outline-none focus:border-primary/50"
              >
                <option value="all">All types</option>
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                onClick={() => fetchAll(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                Refresh
              </button>
              <button
                onClick={() => setShowNew(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                New Task
              </button>
            </div>
          </div>

          {/* New task inline form */}
          {showNew && (
            <div className="border-b border-border px-5 py-4 bg-muted/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Dispatch New Task</span>
                </div>
                <button onClick={() => { setShowNew(false); setCreateError('') }} className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as typeof newType)}
                  className="px-3 py-2 text-xs bg-muted/40 border border-border rounded-lg outline-none focus:border-primary/50 flex-shrink-0"
                >
                  {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <textarea
                  value={newPayload}
                  onChange={(e) => setNewPayload(e.target.value)}
                  rows={2}
                  placeholder={'{"key": "value"} — optional JSON payload'}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-muted/40 border border-border rounded-lg outline-none focus:border-primary/50 resize-none"
                />
              </div>
              {createError && (
                <p className="text-xs text-rose-400 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />{createError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateTask}
                  disabled={creating}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Dispatch
                </button>
                <button
                  onClick={() => { setShowNew(false); setCreateError('') }}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:bg-muted/50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {loadingTasks ? (
            <div className="p-5 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-muted/30" />
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-10 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No tasks match the current filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2.5 w-6" />
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">ID</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Type / Agent</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold hidden md:table-cell">Status</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold hidden lg:table-cell">Origin</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold hidden lg:table-cell">Cost</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-right">When</th>
                    <th className="px-4 py-2.5 w-6" />
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selected?.id === task.id}
                      onClick={() => setSelected((prev) => prev?.id === task.id ? null : task)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <TaskDetail task={selected} onClose={() => setSelected(null)} />
        )}
      </PageBody>
    </div>
  )
}
