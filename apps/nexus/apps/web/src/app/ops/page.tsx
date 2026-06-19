'use client'

import { useEffect, useState } from 'react'
import { Play, Pause, RefreshCw } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// ─── Types ─────────────────────────────────────────────────────────────────────

type AgentType   = 'job' | 'discovery' | 'qa'
type RunStatus   = 'running' | 'awaiting_approval' | 'done' | 'failed' | 'step_limit_reached'

interface AgentRun {
  id: string
  agent_type: AgentType
  status: RunStatus
  goal: string
  started_at: string
  finished_at?: string
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'control' | 'queue' | 'logs' | 'build'

const TABS: { id: Tab; label: string }[] = [
  { id: 'control', label: 'Control' },
  { id: 'queue',   label: 'Queue' },
  { id: 'logs',    label: 'Logs' },
  { id: 'build',   label: 'Build' },
]

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ''

// ─── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<RunStatus, string> = {
  running:           'bg-blue-500/10 text-blue-400',
  awaiting_approval: 'bg-amber-500/10 text-amber-400',
  done:              'bg-emerald-500/10 text-emerald-400',
  failed:            'bg-red-500/10 text-red-400',
  step_limit_reached:'bg-orange-500/10 text-orange-400',
}

function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_STYLE[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ─── Tab: Control ──────────────────────────────────────────────────────────────
// Shows live status of every agent — not just start/stop buttons.

function ControlTab() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    fetch(`${API_BASE}/api/agents/runs?limit=20`)
      .then((r) => r.ok ? r.json() as Promise<unknown> : Promise.resolve([]))
      .then((d) => setRuns(Array.isArray(d) ? (d as AgentRun[]) : ((d as Record<string, unknown>).runs as AgentRun[] ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const active = runs.filter((r) => r.status === 'running' || r.status === 'awaiting_approval')

  return (
    <div className="space-y-6">
      {/* Active agents */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Active agents</h2>
          <button onClick={load} className="text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : active.length === 0 ? (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            No agents running. Enable the Discovery Agent in Settings → Automation rules to start.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {active.map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium capitalize">{r.agent_type} agent</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{r.goal}</p>
                </div>
                <button
                  onClick={() => fetch(`${API_BASE}/api/agents/runs/${r.id}/stop`, { method: 'POST' }).then(load)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Stop
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Scheduled agents */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Scheduled agents</h2>
        <div className="rounded-xl border bg-card divide-y">
          {/* Discovery Agent — Phase 2 */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">Discovery agent</span>
              <span className="text-xs text-muted-foreground">Runs daily at 07:00 UTC · writes signals + pipeline ideas</span>
            </div>
            <button
              onClick={() =>
                fetch(`${API_BASE}/api/discovery/trigger`, { method: 'POST' }).then(load)
              }
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Play className="h-3 w-3" />
              Trigger now
            </button>
          </div>
          {/* QA Agent — Phase 4 */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">QA agent</span>
              <span className="text-xs text-muted-foreground">Runs daily · checks all enabled test suites</span>
            </div>
            <button
              onClick={() =>
                fetch(`${API_BASE}/api/qa/trigger`, { method: 'POST' }).then(load)
              }
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Play className="h-3 w-3" />
              Trigger now
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Tab: Queue ────────────────────────────────────────────────────────────────

function QueueTab() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/agents/runs?limit=50`)
      .then((r) => r.ok ? r.json() as Promise<unknown> : Promise.resolve([]))
      .then((d) => setRuns(Array.isArray(d) ? (d as AgentRun[]) : ((d as Record<string, unknown>).runs as AgentRun[] ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>

  if (!runs.length) return (
    <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
      No jobs in queue.
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      {runs.map((r) => (
        <div key={r.id} className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium capitalize">{r.agent_type}</span>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-sm text-muted-foreground truncate">{r.goal}</p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {new Date(r.started_at).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Logs ─────────────────────────────────────────────────────────────────

function LogsTab() {
  const [query, setQuery] = useState('')
  const [logs, setLogs] = useState<{ id: string; message: string; level: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/observability/logs?limit=100`)
      .then((r) => r.ok ? r.json() as Promise<unknown> : Promise.resolve([]))
      .then((d) => {
        type LogEntry = { id: string; message: string; level: string; created_at: string }
        setLogs(Array.isArray(d) ? (d as LogEntry[]) : ((d as Record<string, unknown>).logs as LogEntry[] ?? []))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = query.trim()
    ? logs.filter((l) => l.message.toLowerCase().includes(query.toLowerCase()))
    : logs

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search logs…"
        className="w-full max-w-sm rounded-lg border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
      />
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !filtered.length ? (
        <div className="text-sm text-muted-foreground">No logs found.</div>
      ) : (
        <div className="font-mono text-xs rounded-xl border bg-card divide-y max-h-[60vh] overflow-y-auto">
          {filtered.map((l) => (
            <div key={l.id} className="px-4 py-2 flex items-start gap-3">
              <span className="text-muted-foreground shrink-0">
                {new Date(l.created_at).toLocaleTimeString()}
              </span>
              <span
                className={
                  l.level === 'error'
                    ? 'text-red-400'
                    : l.level === 'warn'
                    ? 'text-amber-400'
                    : 'text-foreground'
                }
              >
                {l.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Build ────────────────────────────────────────────────────────────────

type QAResult = {
  id: string
  suite_name: string
  status: 'pass' | 'fail' | 'error' | 'running'
  total_steps: number
  error: string | null
  total_ms: number | null
  started_at: string
  completed_at: string | null
}

type QAStatus = {
  enabled: boolean
  total_suites: number
  passing: number
  failing: number
  last_run_at: string | null
}

function BuildTab() {
  const [qaStatus, setQAStatus] = useState<QAStatus | null>(null)
  const [results, setResults] = useState<QAResult[]>([])
  const [siteUrl, setSiteUrl] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [triggering, setTriggering] = useState(false)

  function load() {
    Promise.all([
      fetch(`${API_BASE}/api/qa/status`).then(r => r.ok ? r.json() as Promise<QAStatus> : null),
      fetch(`${API_BASE}/api/qa/results?limit=20`).then(r => r.ok ? r.json() as Promise<{ results: QAResult[] }> : null),
    ]).then(([status, res]) => {
      if (status) setQAStatus(status)
      if (res?.results) setResults(res.results)
    })
  }

  useEffect(() => { load() }, [])

  async function handleSeed() {
    if (!siteUrl.trim()) return
    setSeeding(true)
    await fetch(`${API_BASE}/api/qa/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_url: siteUrl.trim() }),
    })
    load()
    setSeeding(false)
  }

  async function handleTrigger() {
    setTriggering(true)
    await fetch(`${API_BASE}/api/qa/trigger`, { method: 'POST' })
    setTimeout(load, 2000)
    setTriggering(false)
  }

  const VERDICT_STYLE: Record<string, string> = {
    pass:    'bg-emerald-500/10 text-emerald-400',
    fail:    'bg-red-500/10 text-red-400',
    error:   'bg-orange-500/10 text-orange-400',
    running: 'bg-blue-500/10 text-blue-400',
  }

  return (
    <div className="space-y-6">
      {/* Stack info */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-mono text-muted-foreground">
          Stack: Cloudflare Workers · Pages · D1 · KV · R2 · Queues · Browser Rendering
        </p>
      </div>

      {/* QA summary */}
      {qaStatus && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card p-3 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Suites</span>
            <span className="text-xl font-bold">{qaStatus.total_suites}</span>
          </div>
          <div className="rounded-xl border bg-card p-3 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Passing</span>
            <span className="text-xl font-bold text-emerald-400">{qaStatus.passing}</span>
          </div>
          <div className="rounded-xl border bg-card p-3 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Failing</span>
            <span className="text-xl font-bold text-red-400">{qaStatus.failing}</span>
          </div>
        </div>
      )}

      {/* Setup: seed suites */}
      {qaStatus && qaStatus.total_suites === 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">Set up QA suites</h3>
          <p className="text-xs text-muted-foreground">
            Seed default health checks for all 5 pages (Home, Pipeline, Brain, Ops, Settings).
          </p>
          <div className="flex gap-2">
            <input
              value={siteUrl}
              onChange={e => setSiteUrl(e.target.value)}
              placeholder="https://your-dashboard.pages.dev"
              className="flex-1 text-sm bg-muted border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleSeed}
              disabled={!siteUrl.trim() || seeding}
              className="text-sm bg-primary text-primary-foreground rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {seeding ? 'Seeding…' : 'Seed'}
            </button>
          </div>
        </div>
      )}

      {/* Run button */}
      {qaStatus && qaStatus.total_suites > 0 && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent runs</h3>
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            <Play className="h-3 w-3" />
            {triggering ? 'Triggered…' : 'Run all suites'}
          </button>
        </div>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map(r => (
            <div key={r.id} className="rounded-xl border bg-card p-3 flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-sm font-medium truncate">{r.suite_name}</span>
                {r.error && <span className="text-xs text-red-400 truncate">{r.error}</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {r.total_ms && (
                  <span className="text-xs text-muted-foreground">{(r.total_ms / 1000).toFixed(1)}s</span>
                )}
                <span className={`text-xs rounded-full px-2 py-0.5 ${VERDICT_STYLE[r.status] ?? ''}`}>
                  {r.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {qaStatus && qaStatus.total_suites > 0 && results.length === 0 && (
        <div className="text-sm text-muted-foreground">No runs yet. Hit "Run all suites" to start.</div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const TAB_CONTENT: Record<Tab, React.ReactNode> = {
  control: <ControlTab />,
  queue:   <QueueTab />,
  logs:    <LogsTab />,
  build:   <BuildTab />,
}

export default function OpsPage() {
  const [tab, setTab] = useState<Tab>('control')

  return (
    <>
      <PageHeader
        title="Ops"
        subtitle="Live agent status, job queue, and logs."
      />

      <div className="border-b px-6 md:px-8 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <PageBody>{TAB_CONTENT[tab]}</PageBody>
    </>
  )
}
