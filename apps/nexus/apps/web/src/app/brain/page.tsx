'use client'

import { useEffect, useState } from 'react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Signal {
  id: string
  source: string
  summary: string
  score: number
  created_at: string
}

interface Opportunity {
  id: string
  summary: string
  score: number
  signal_id?: string
  created_at: string
}

interface MemoryRecord {
  id: string
  type: 'preference' | 'fact' | 'outcome'
  content: string
  staleness_window_days: number
  created_at: string
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'signals' | 'opportunities' | 'learning'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',      label: 'Overview' },
  { id: 'signals',       label: 'Signals' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'learning',      label: 'Learning log' },
]

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ''

// ─── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold mb-1">Current state</h2>
        <p className="text-sm text-muted-foreground">
          The Brain page shows what the Discovery Agent knows and has learned. Enable the Discovery
          Agent in Ops → Control to start populating Signals and Opportunities.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold mb-1">Agent reasoning</h2>
        <p className="text-sm text-muted-foreground">
          Each discovery cycle will surface its key reasoning here — why it flagged a trend, what
          it skipped, what changed since last run.
        </p>
      </div>
    </div>
  )
}

// ─── Tab: Signals ──────────────────────────────────────────────────────────────

function SignalsTab() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/signals`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setSignals(Array.isArray(d) ? d : d.signals ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>

  if (!signals.length) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        No signals yet. The Discovery Agent writes here after each scan cycle.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {signals.map((s) => (
        <div key={s.id} className="rounded-xl border bg-card p-4 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{s.source}</span>
            <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
              score {s.score}
            </span>
          </div>
          <p className="text-sm">{s.summary}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Opportunities ────────────────────────────────────────────────────────

function OpportunitiesTab() {
  const [opps, setOpps] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/opportunities`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setOpps(Array.isArray(d) ? d : d.opportunities ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>

  if (!opps.length) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        No opportunities yet. These are ranked ideas generated from Signals — traceable back to the
        source that produced them.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {opps
        .sort((a, b) => b.score - a.score)
        .map((o) => (
          <div key={o.id} className="rounded-xl border bg-card p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                score {o.score}
              </span>
            </div>
            <p className="text-sm">{o.summary}</p>
          </div>
        ))}
    </div>
  )
}

// ─── Tab: Learning log ─────────────────────────────────────────────────────────

function LearningLogTab() {
  const [memory, setMemory] = useState<MemoryRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/api/memory`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setMemory(Array.isArray(d) ? d : d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function deleteRecord(id: string) {
    setMemory((prev) => prev.filter((m) => m.id !== id))
    await fetch(`${API_BASE}/api/memory/${id}`, { method: 'DELETE' })
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>

  if (!memory.length) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        No memory records yet. Agents write here after completed runs — preferences, facts, and
        outcomes that influence future decisions.
      </div>
    )
  }

  const TYPE_COLORS = {
    preference: 'bg-blue-500/10 text-blue-400',
    fact:       'bg-amber-500/10 text-amber-400',
    outcome:    'bg-emerald-500/10 text-emerald-400',
  }

  return (
    <div className="flex flex-col gap-3">
      {memory.map((m) => (
        <div key={m.id} className="rounded-xl border bg-card p-4 flex items-start justify-between gap-3 group">
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <span className={`text-xs rounded-full px-2 py-0.5 w-fit ${TYPE_COLORS[m.type]}`}>
              {m.type} · stale after {m.staleness_window_days}d
            </span>
            <p className="text-sm">{m.content}</p>
          </div>
          <button
            onClick={() => deleteRecord(m.id)}
            className="text-xs text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const TAB_CONTENT: Record<Tab, React.ReactNode> = {
  overview:      <OverviewTab />,
  signals:       <SignalsTab />,
  opportunities: <OpportunitiesTab />,
  learning:      <LearningLogTab />,
}

export default function BrainPage() {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <>
      <PageHeader
        title="Brain"
        subtitle="What the agents know, have learned, and are watching."
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
