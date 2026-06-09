'use client'

import { useEffect, useState } from 'react'
import { Wallet, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { formatCost } from '@/lib/utils'

type Cap = {
  id?: string
  scope: 'global' | 'task_type' | 'model'
  match?: string
  period: 'day' | 'week' | 'month'
  limit_usd: number
  warn_at?: number
  enabled?: number | boolean
}

type Summary = {
  source: 'live' | 'unconfigured'
  period: string
  total_usd: number
  total_runs: number
  by_model: Array<{ model: string; count: number; cost: number }>
  by_task: Array<{ task_type: string; count: number; cost: number }>
  note?: string
}

export default function BudgetPage() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week')
  const [caps, setCaps] = useState<Cap[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [unconfigured, setUnconfigured] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([api.getBudgetCaps(), api.getBudgetSummary(period)])
      .then(([c, s]) => {
        if (cancelled) return
        setCaps(c.caps || [])
        setSummary(s)
        setUnconfigured(c.source === 'unconfigured' || s.source === 'unconfigured')
      })
      .catch(() => setUnconfigured(true))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [period])

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Budget</span>}
        subtitle="LLM spend caps, usage, and pre-flight approval."
      />
      <PageBody className="space-y-6">
        <div className="flex items-center gap-2">
          {(['day', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${period === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
            >
              {p}
            </button>
          ))}
        </div>

        {unconfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
            <p className="font-medium text-amber-500 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Database not configured
            </p>
            <p className="mt-1 text-muted-foreground">
              The Budget tables aren&apos;t present on D1 yet. Run the latest migrations.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label={`Total spend (${period})`}
            value={(() => {
              if (!summary) return loading ? '…' : '$0.00'
              // T15: free-tier-aware label. formatCost returns "Free tier"
              // when spend is $0 but we actually did runs (Groq/Cloudflare
              // free models), which reads more honestly than a bare $0.00.
              return formatCost(summary.total_usd, summary.total_runs)
            })()}
          />
          <Stat label="Total runs" value={summary ? String(summary.total_runs ?? 0) : (loading ? '…' : '0')} />
          <Stat label="Active caps" value={loading ? '…' : String(caps.filter((c) => c.enabled).length)} />
        </div>

        <Section title={`Caps (${caps.length})`}>
          {caps.length === 0 ? (
            <Empty>No caps configured. Add caps to stop runaway LLM spend.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {caps.map((c, i) => (
                <div key={c.id ?? i} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {c.scope}{c.match ? ` · ${c.match}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ${c.limit_usd} / {c.period}
                      {c.warn_at != null && <span> · warn at {Math.round(c.warn_at * 100)}%</span>}
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${c.enabled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                    {c.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Spend by model`}>
          {!summary || (summary.by_model?.length ?? 0) === 0 ? (
            <Empty>No usage logged for this period.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {(summary.by_model ?? []).map((m) => (
                <div key={m.model} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.model}</div>
                    <div className="text-xs text-muted-foreground">{m.count} call{m.count === 1 ? '' : 's'}</div>
                  </div>
                  {/* T15: per-model spend reads "Free tier" when calls happened
                      but the model itself was free (Groq, CF Workers AI). */}
                  <div className="text-sm font-semibold text-emerald-500">{formatCost(m.cost, m.count)}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Spend by task`}>
          {!summary || (summary.by_task?.length ?? 0) === 0 ? (
            <Empty>No task-typed usage logged.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {(summary.by_task ?? []).map((t) => (
                <div key={t.task_type} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.task_type}</div>
                    <div className="text-xs text-muted-foreground">{t.count} call{t.count === 1 ? '' : 's'}</div>
                  </div>
                  {/* T15: same "Free tier" treatment for per-task-type spend. */}
                  <div className="text-sm font-semibold text-emerald-500">{formatCost(t.cost, t.count)}</div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </PageBody>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3 text-sm font-medium">{title}</div>
      {children}
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</div>
}
