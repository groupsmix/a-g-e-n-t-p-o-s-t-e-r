'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  AlertTriangle, CheckCircle2, XCircle, Activity,
  DollarSign, RefreshCw,
} from 'lucide-react'
import { formatCost } from '@/lib/utils'

type ObsData = Awaited<ReturnType<typeof api.getObservability>>

export default function ObservabilityPage() {
  const [data, setData] = useState<ObsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.getObservability()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      </div>
    )
  }

  if (!data) return null

  const s = data.summary

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Observability</h1>
          <p className="text-sm text-muted-foreground">
            Failed AI calls, publish failures, workflow health
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          icon={<Activity className="h-4 w-4 text-blue-400" />}
          label="Recent Workflows"
          value={s.recent_workflows}
        />
        <Card
          icon={<CheckCircle2 className="h-4 w-4 text-green-400" />}
          label="Successful"
          value={s.success_workflows}
        />
        <Card
          icon={<XCircle className="h-4 w-4 text-red-400" />}
          label="Failed Workflows"
          value={s.failed_workflows}
          alert={s.failed_workflows > 0}
        />
        <Card
          icon={<DollarSign className="h-4 w-4 text-amber-400" />}
          label="AI Spend Today"
          /* T15: "$0.00" with workflows actually running today reads as
             "spend isn't tracked" — it isn't, the run was free. Use
             formatCost so we render "Free tier" in that case and keep
             the cap suffix for any non-zero spend. */
          value={(() => {
            const base = formatCost(s.ai_spend_today, s.recent_workflows)
            if (base === 'Free tier') return base
            return `${base}${s.ai_spend_cap > 0 ? ` / $${s.ai_spend_cap}` : ''}`
          })()}
          alert={s.ai_cap_reached}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card
          icon={<Activity className="h-4 w-4 text-cyan-400" />}
          label="Recent AI Calls"
          value={s.recent_ai_calls ?? 0}
        />
        <Card
          icon={<XCircle className="h-4 w-4 text-rose-400" />}
          label="Failed AI Calls"
          value={s.failed_ai_calls ?? 0}
          alert={(s.failed_ai_calls ?? 0) > 0}
        />
        <Card
          icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
          label="Offline AI Calls"
          value={s.offline_ai_calls ?? 0}
          alert={(s.offline_ai_calls ?? 0) > 0}
        />
      </div>

      {/* Product counts */}
      <Section title="Product Status Breakdown">
        <div className="flex flex-wrap gap-2">
          {Object.entries(s.product_counts).map(([status, count]) => (
            <div
              key={status}
              className="px-3 py-1.5 rounded-md bg-muted text-xs font-medium"
            >
              {status}: {count}
            </div>
          ))}
        </div>
      </Section>

      <Section title="AI Model Health" count={data.ai_model_health.length}>
        {data.ai_model_health.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI ledger rows yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-3">Model</th>
                  <th className="text-left py-2 pr-3">Calls</th>
                  <th className="text-left py-2 pr-3">Success</th>
                  <th className="text-left py-2 pr-3">Failed</th>
                  <th className="text-left py-2 pr-3">Avg Latency</th>
                  <th className="text-left py-2">Spend</th>
                </tr>
              </thead>
              <tbody>
                {data.ai_model_health.map((row) => (
                  <tr key={row.model_used ?? 'unknown'} className="border-b border-border/50">
                    <td className="py-2 pr-3 font-mono">{row.model_used ?? 'unknown'}</td>
                    <td className="py-2 pr-3">{row.total_calls}</td>
                    <td className="py-2 pr-3 text-green-400">{row.ok_calls}</td>
                    <td className="py-2 pr-3 text-red-400">{row.failed_calls}</td>
                    <td className="py-2 pr-3">{Math.round(row.avg_latency_ms ?? 0)} ms</td>
                    <td className="py-2">{formatCost(row.spend_usd ?? 0, row.total_calls ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Failed AI steps */}
      <Section
        title="Failed AI Steps"
        count={data.failed_steps.length}
        alert={data.failed_steps.length > 0}
      >
        {data.failed_steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failed steps</p>
        ) : (
          <div className="space-y-2">
            {data.failed_steps.map((step, i) => (
              <div
                key={`${step.run_id}-${step.step_name}-${i}`}
                className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-destructive">
                    {step.step_name}
                  </span>
                  <span className="text-muted-foreground">
                    {step.model_used ?? 'no model'}
                  </span>
                </div>
                {step.error && (
                  <p className="text-muted-foreground break-all">
                    {step.error.slice(0, 200)}
                  </p>
                )}
                <p className="text-muted-foreground/60">
                  Run: {step.run_id.slice(0, 8)}… | {step.started_at ?? ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Recent workflows */}
      <Section title="Recent Workflows" count={data.recent_workflows.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 pr-3">ID</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2 pr-3">Domain</th>
                <th className="text-left py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_workflows.map((w) => (
                <tr key={w.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-mono">{w.id.slice(0, 8)}…</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={w.status} />
                  </td>
                  <td className="py-2 pr-3">{w.domain_slug ?? '—'}</td>
                  <td className="py-2 text-muted-foreground">{w.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Publish results */}
      <Section title="Publish Results" count={data.publish_results.length}>
        {data.publish_results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published or failed products yet</p>
        ) : (
          <div className="space-y-2">
            {data.publish_results.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-xs"
              >
                <div>
                  <span className="font-medium">{p.title}</span>
                  <span className="ml-2 text-muted-foreground">{p.domain_slug ?? ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  {p.gumroad_url && (
                    <a
                      href={p.gumroad_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent AI Calls" count={data.recent_ai_calls.length}>
        {data.recent_ai_calls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI ledger rows yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-3">Time</th>
                  <th className="text-left py-2 pr-3">Task</th>
                  <th className="text-left py-2 pr-3">Model</th>
                  <th className="text-left py-2 pr-3">Caller</th>
                  <th className="text-left py-2 pr-3">Latency</th>
                  <th className="text-left py-2 pr-3">Cost</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_ai_calls.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-muted-foreground">{row.ts}</td>
                    <td className="py-2 pr-3">{row.task_type}</td>
                    <td className="py-2 pr-3 font-mono">{row.model_used ?? 'unknown'}</td>
                    <td className="py-2 pr-3">{row.caller}</td>
                    <td className="py-2 pr-3">{row.latency_ms} ms</td>
                    <td className="py-2 pr-3">{formatCost(row.cost_usd ?? 0, 1)}</td>
                    <td className="py-2">
                      <StatusBadge status={Number(row.ok) === 1 ? 'completed' : 'failed'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

function Card({
  icon,
  label,
  value,
  alert,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  alert?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        alert ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function Section({
  title,
  count,
  alert,
  children,
}: {
  title: string
  count?: number
  alert?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        {alert && <AlertTriangle className="h-4 w-4 text-destructive" />}
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground">({count})</span>
        )}
      </div>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-500/15 text-green-400',
    published: 'bg-green-500/15 text-green-400',
    failed: 'bg-red-500/15 text-red-400',
    running: 'bg-blue-500/15 text-blue-400',
    pending_review: 'bg-amber-500/15 text-amber-400',
    approved: 'bg-emerald-500/15 text-emerald-400',
    draft: 'bg-zinc-500/15 text-zinc-400',
  }
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
        colors[status] ?? 'bg-zinc-500/15 text-zinc-400'
      }`}
    >
      {status}
    </span>
  )
}
