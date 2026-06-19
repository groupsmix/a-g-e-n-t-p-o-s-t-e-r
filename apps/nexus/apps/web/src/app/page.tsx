'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle, ChevronRight } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PipelineSummary {
  idea: number
  draft: number
  review: number
  scheduled: number
  published: number
}

interface ApprovalRequest {
  id: string
  pipeline_item_id: string
  summary: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

interface HomeData {
  revenue_7d: number | null
  pipeline: PipelineSummary
  pending_approvals: ApprovalRequest[]
  agent_actions_today: number
  brain_highlight: string | null
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ''

async function fetchHomeData(): Promise<HomeData> {
  const [pipelineRes, approvalsRes, revenueRes] = await Promise.allSettled([
    fetch(`${API_BASE}/api/pipeline/summary`).then((r) => r.ok ? r.json() as Promise<unknown> : Promise.resolve(null)),
    fetch(`${API_BASE}/api/approvals?status=pending`).then((r) => r.ok ? r.json() as Promise<unknown> : Promise.resolve(null)),
    fetch(`${API_BASE}/api/revenue/summary?days=7`).then((r) => r.ok ? r.json() as Promise<unknown> : Promise.resolve(null)),
  ])

  const pipelineRaw = pipelineRes.status === 'fulfilled' ? pipelineRes.value as Record<string, number> | null : null
  const pipeline: PipelineSummary = pipelineRaw
    ? { idea: pipelineRaw.idea ?? 0, draft: pipelineRaw.draft ?? 0, review: pipelineRaw.review ?? 0, scheduled: pipelineRaw.scheduled ?? 0, published: pipelineRaw.published ?? 0 }
    : { idea: 0, draft: 0, review: 0, scheduled: 0, published: 0 }

  const approvalsRaw = approvalsRes.status === 'fulfilled' ? approvalsRes.value as unknown : null
  const pendingApprovals: ApprovalRequest[] = approvalsRaw
    ? (Array.isArray(approvalsRaw) ? (approvalsRaw as ApprovalRequest[]) : ((approvalsRaw as Record<string, unknown>).items as ApprovalRequest[] ?? []))
    : []

  const revenueRaw = revenueRes.status === 'fulfilled' ? revenueRes.value as Record<string, unknown> | null : null
  const revenue = revenueRaw ? (revenueRaw.total as number ?? null) : null

  return {
    revenue_7d: revenue,
    pipeline,
    pending_approvals: pendingApprovals,
    agent_actions_today: 0,
    brain_highlight: null,
  }
}

async function resolveApproval(id: string, action: 'approved' | 'rejected', notes?: string) {
  return fetch(`${API_BASE}/api/approvals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: action, reviewer_notes: notes }),
  })
}

// ─── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)

  function load() {
    fetchHomeData()
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <>
        <PageHeader title="Home" />
        <PageBody>
          <div className="text-sm text-muted-foreground">Loading…</div>
        </PageBody>
      </>
    )
  }

  const d = data!

  const pipelineTotal =
    d.pipeline.idea + d.pipeline.draft + d.pipeline.review +
    d.pipeline.scheduled + d.pipeline.published

  return (
    <>
      <PageHeader title="Home" />

      <PageBody className="space-y-8">

        {/* Metric row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Revenue (7d)"
            value={d.revenue_7d != null ? `$${d.revenue_7d.toLocaleString()}` : '—'}
          />
          <MetricCard label="In pipeline" value={pipelineTotal} />
          <MetricCard label="Needs your attention" value={d.pending_approvals.length} />
          <MetricCard label="Agent actions today" value={d.agent_actions_today} />
        </div>

        {/* Needs your attention */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Needs your attention</h2>
            {d.pending_approvals.length > 3 && (
              <Link href="/pipeline" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>

          {d.pending_approvals.length === 0 ? (
            <div className="rounded-xl border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              All clear — nothing waiting on you.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {d.pending_approvals.slice(0, 5).map((a) => (
                <div key={a.id} className="rounded-xl border bg-card p-4 flex items-center justify-between gap-3">
                  <p className="text-sm flex-1 min-w-0 truncate">{a.summary}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => resolveApproval(a.id, 'rejected').then(load)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => resolveApproval(a.id, 'approved').then(load)}
                      className="text-xs bg-primary text-primary-foreground rounded px-3 py-1"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Brain highlight */}
        {d.brain_highlight && (
          <section>
            <h2 className="text-sm font-semibold mb-3">Brain highlight</h2>
            <div className="rounded-xl border bg-card p-4 text-sm">
              {d.brain_highlight}
              <Link href="/brain" className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Open Brain <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </section>
        )}

        {/* Pipeline snapshot */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Pipeline snapshot</h2>
            <Link href="/pipeline" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              Open board <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {(
              [
                { key: 'idea',      label: 'Idea' },
                { key: 'draft',     label: 'Draft' },
                { key: 'review',    label: 'Review' },
                { key: 'scheduled', label: 'Scheduled' },
                { key: 'published', label: 'Published' },
              ] as { key: keyof PipelineSummary; label: string }[]
            ).map(({ key, label }) => (
              <Link
                key={key}
                href={`/pipeline`}
                className="rounded-xl border bg-card p-3 flex flex-col gap-1 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xl font-bold">{d.pipeline[key]}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </Link>
            ))}
          </div>
        </section>

      </PageBody>
    </>
  )
}
