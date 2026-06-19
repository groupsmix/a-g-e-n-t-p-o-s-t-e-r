'use client'

import { useState } from 'react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'money' | 'performance' | 'experiments' | 'audience'

const TABS: { id: Tab; label: string }[] = [
  { id: 'money',       label: 'Money' },
  { id: 'performance', label: 'Performance' },
  { id: 'experiments', label: 'Experiments' },
  { id: 'audience',    label: 'Audience' },
]

// ─── Tab content stubs ─────────────────────────────────────────────────────────
// These are Phase 1 stubs — wired to real data in Phase 5 (Growth/Brain
// analytics tied back into agent decisions). Structure is intentionally
// minimal so the tabs render and compile; fill data in once D1 revenue/
// analytics rows are populated.

function MoneyTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <section>
        <h2 className="text-sm font-semibold mb-3">Revenue (7 days)</h2>
        <div className="rounded-xl border bg-card p-5 flex flex-col gap-1">
          <span className="text-3xl font-bold">—</span>
          <span className="text-xs text-muted-foreground">Connect a revenue source in Settings → Connections</span>
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold mb-3">Budget</h2>
        <div className="rounded-xl border bg-card p-5 flex flex-col gap-1">
          <span className="text-3xl font-bold">—</span>
          <span className="text-xs text-muted-foreground">Set a daily cap in Settings → Automation rules</span>
        </div>
      </section>
    </div>
  )
}

function PerformanceTab() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold mb-2">Analytics</h2>
      <p className="text-sm text-muted-foreground">
        Platform analytics will appear here once the Discovery Agent begins collecting them (Phase 5).
      </p>
    </div>
  )
}

function ExperimentsTab() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold mb-2">A/B Tests</h2>
      <p className="text-sm text-muted-foreground">
        No active experiments. Tests are created by the Job Agent when a brief includes a test variant.
      </p>
    </div>
  )
}

function AudienceTab() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold mb-2">Audience</h2>
      <p className="text-sm text-muted-foreground">
        Email lists, leads, and campaign funnel data will appear here once platforms are connected
        in Settings → Connections.
      </p>
    </div>
  )
}

const TAB_CONTENT: Record<Tab, React.ReactNode> = {
  money:       <MoneyTab />,
  performance: <PerformanceTab />,
  experiments: <ExperimentsTab />,
  audience:    <AudienceTab />,
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function GrowthPage() {
  const [tab, setTab] = useState<Tab>('money')

  return (
    <>
      <PageHeader title="Growth" subtitle="Revenue, analytics, experiments, and audience." />

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
