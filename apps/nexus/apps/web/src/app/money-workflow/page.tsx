'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Brain, Package, ShieldCheck, Upload, Megaphone,
  DollarSign, RefreshCw, Loader2, ArrowRight, Zap, AlertTriangle,
  CheckCircle2, Circle, PlayCircle, ChevronRight, Activity,
  ShieldOff, BarChart3,
} from 'lucide-react'
import { api, API_BASE } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// ── Types ──────────────────────────────────────────────────────────────────

interface PipelineSummary {
  meta: {
    autopilot_enabled:  boolean
    kill_switch_active: boolean
  }
  stages: {
    trends:       { new: number; acted: number; total: number }
    opportunities:{ new: number; scored: number; approved: number; rejected: number; total: number }
    building:     { running: number; built_today: number }
    review:       { pending: number; approved: number; rejected: number }
    publish:      { ready: number; published: number; failed: number }
    marketing:    { packaged: number; missing: number }
    revenue:      { total_products: number }
    learning:     { patterns_discovered: number; last_sync: string | null }
  }
  spend_today_usd: number
  total_products:  number
}

interface RevenueSnap {
  total_revenue?: number
  total_sales?:   number
  configured?:    boolean
}

// ── Health helpers ─────────────────────────────────────────────────────────

type Health = 'good' | 'warn' | 'idle' | 'blocked'

function trendHealth(s: PipelineSummary['stages']['trends']): Health {
  if (s.new > 5) return 'good'
  if (s.total > 0) return 'warn'
  return 'idle'
}
function oppHealth(s: PipelineSummary['stages']['opportunities']): Health {
  if (s.new > 0 || s.scored > 0) return 'good'
  if (s.total > 0) return 'warn'
  return 'idle'
}
function buildHealth(s: PipelineSummary['stages']['building']): Health {
  if (s.running > 0) return 'good'
  if (s.built_today > 0) return 'good'
  return 'idle'
}
function reviewHealth(s: PipelineSummary['stages']['review']): Health {
  if (s.pending > 3) return 'warn'
  if (s.pending > 0) return 'good'
  return 'idle'
}
function publishHealth(s: PipelineSummary['stages']['publish']): Health {
  if (s.failed > 0) return 'blocked'
  if (s.ready > 0) return 'warn'   // products waiting to publish
  if (s.published > 0) return 'good'
  return 'idle'
}
function marketingHealth(s: PipelineSummary['stages']['marketing']): Health {
  if (s.missing > 0) return 'warn'
  if (s.packaged > 0) return 'good'
  return 'idle'
}
function revenueHealth(rev: RevenueSnap | null): Health {
  if (!rev?.configured) return 'idle'
  if ((rev.total_revenue ?? 0) > 0) return 'good'
  return 'warn'
}
function learningHealth(s: PipelineSummary['stages']['learning']): Health {
  if (s.patterns_discovered > 10) return 'good'
  if (s.patterns_discovered > 0) return 'warn'
  return 'idle'
}

const HEALTH_RING: Record<Health, string> = {
  good:    'ring-2 ring-emerald-500/60',
  warn:    'ring-2 ring-amber-500/60',
  blocked: 'ring-2 ring-destructive/60',
  idle:    'ring-1 ring-border',
}
const HEALTH_DOT: Record<Health, string> = {
  good:    'bg-emerald-500',
  warn:    'bg-amber-500',
  blocked: 'bg-destructive',
  idle:    'bg-muted-foreground/30',
}
const HEALTH_LABEL: Record<Health, string> = {
  good:    'Active',
  warn:    'Needs attention',
  blocked: 'Blocked',
  idle:    'Idle',
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function MoneyWorkflowPage() {
  const [summary, setSummary]   = useState<PipelineSummary | null>(null)
  const [revenue, setRevenue]   = useState<RevenueSnap | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    const [s, r] = await Promise.allSettled([
      fetch(`${API_BASE}/api/pipeline/summary`, {
        headers: { Authorization: `Bearer ${typeof window !== 'undefined' ? window.localStorage.getItem('nexus_token') ?? '' : ''}` },
      }).then((res) => res.json()),
      api.getRevenue().catch(() => null),
    ])
    if (s.status === 'fulfilled') setSummary(s.value as PipelineSummary)
    if (r.status === 'fulfilled') setRevenue(r.value as RevenueSnap)
    setLastUpdated(new Date())
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <>
        <PageHeader
          title={<span className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Money Workflow</span>}
          subtitle="Trend → Validate → Build → Quality Check → Publish → Market → Track → Improve"
        />
        <PageBody>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading pipeline…
          </div>
        </PageBody>
      </>
    )
  }

  const st = summary?.stages
  const meta = summary?.meta

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Money Workflow</span>}
        subtitle="Trend → Validate → Build → Quality Check → Publish → Market → Track → Improve"
        actions={
          <button onClick={refresh} disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <PageBody className="space-y-6">

        {/* ── Status bar ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {meta?.kill_switch_active ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 border border-destructive/30 px-3 py-1 text-destructive font-medium">
              <ShieldOff className="h-3.5 w-3.5" /> Kill switch ON — automation paused
            </span>
          ) : meta?.autopilot_enabled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-emerald-500 font-medium">
              <Zap className="h-3.5 w-3.5" /> Autopilot running
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted border border-border px-3 py-1 font-medium">
              <Circle className="h-3.5 w-3.5" /> Autopilot OFF
            </span>
          )}

          {summary && (
            <>
              <span>{summary.total_products} total products</span>
              <span>·</span>
              <span>${summary.spend_today_usd.toFixed(2)} estimated AI spend today</span>
            </>
          )}

          {lastUpdated && (
            <span className="ml-auto">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
        </div>

        {/* ── Pipeline flow ────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {st && <>
            <StageCard
              icon={<TrendingUp className="h-5 w-5" />}
              title="Trend Radar"
              description="Fresh ideas from trends, competitors, winners"
              health={trendHealth(st.trends)}
              metric={st.trends.new}
              metricLabel="new trends"
              secondaryMetric={st.trends.total > 0 ? `${st.trends.acted} acted on` : undefined}
              href="/trends"
              cta="Browse trends"
            />
            <StageCard
              icon={<Brain className="h-5 w-5" />}
              title="Opportunity Score"
              description="Each idea scored 0–100 for market fit"
              health={oppHealth(st.opportunities)}
              metric={st.opportunities.new + st.opportunities.scored}
              metricLabel="in queue"
              secondaryMetric={st.opportunities.approved > 0 ? `${st.opportunities.approved} approved` : undefined}
              href="/opportunities"
              cta="Score ideas"
            />
            <StageCard
              icon={<Package className="h-5 w-5" />}
              title="Product Builder"
              description="AI agent team builds the actual product"
              health={buildHealth(st.building)}
              metric={st.building.running}
              metricLabel="building now"
              secondaryMetric={st.building.built_today > 0 ? `${st.building.built_today} built today` : undefined}
              href="/autopilot"
              cta="View autopilot"
              highlight={st.building.running > 0}
            />
            <StageCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Quality Gate"
              description="Usefulness, originality, risk, title, description"
              health={reviewHealth(st.review)}
              metric={st.review.pending}
              metricLabel="awaiting review"
              secondaryMetric={st.review.approved > 0 ? `${st.review.approved} approved` : undefined}
              href="/review"
              cta="Review queue"
              urgent={st.review.pending > 0}
            />
            <StageCard
              icon={<Upload className="h-5 w-5" />}
              title="Publish"
              description="List on Gumroad, Shopify, and connected platforms"
              health={publishHealth(st.publish)}
              metric={st.publish.ready}
              metricLabel="ready to publish"
              secondaryMetric={`${st.publish.published} live`}
              href="/publish"
              cta="Publish center"
              urgent={st.publish.failed > 0}
              urgentLabel={st.publish.failed > 0 ? `${st.publish.failed} failed` : undefined}
            />
            <StageCard
              icon={<Megaphone className="h-5 w-5" />}
              title="Marketing"
              description="Posts, emails, SEO copy, Pinterest pins"
              health={marketingHealth(st.marketing)}
              metric={st.marketing.packaged}
              metricLabel="products packaged"
              secondaryMetric={st.marketing.missing > 0 ? `${st.marketing.missing} missing pack` : undefined}
              href="/marketing"
              cta="Marketing hub"
              urgent={st.marketing.missing > 0}
            />
            <StageCard
              icon={<DollarSign className="h-5 w-5" />}
              title="Revenue"
              description="Real sales synced from Gumroad and platforms"
              health={revenueHealth(revenue)}
              metric={revenue?.total_revenue != null ? revenue.total_revenue : null}
              metricLabel="total revenue"
              metricPrefix="$"
              secondaryMetric={revenue?.total_sales != null ? `${revenue.total_sales} sales` : 'Connect Gumroad →'}
              href="/revenue"
              cta="Revenue dashboard"
            />
            <StageCard
              icon={<Activity className="h-5 w-5" />}
              title="Learning Loop"
              description="Winners feed the next ideas automatically"
              health={learningHealth(st.learning)}
              metric={st.learning.patterns_discovered}
              metricLabel="patterns found"
              secondaryMetric={st.learning.last_sync ? `Last sync ${new Date(st.learning.last_sync).toLocaleDateString()}` : 'Not synced yet'}
              href="/learning"
              cta="View patterns"
            />
          </>}
        </div>

        {/* ── Quick actions ────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
          <h2 className="text-sm font-semibold">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <QuickLink href="/sleep-mode" icon={<Zap className="h-3.5 w-3.5" />} label="Sleep Mode settings" />
            <QuickLink href="/trends" icon={<TrendingUp className="h-3.5 w-3.5" />} label="Browse new trends" />
            <QuickLink href="/review" icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Review queue" />
            <QuickLink href="/publish" icon={<Upload className="h-3.5 w-3.5" />} label="Publish ready products" />
            <QuickLink href="/marketing" icon={<Megaphone className="h-3.5 w-3.5" />} label="Generate marketing packs" />
            <QuickLink href="/observability" icon={<Activity className="h-3.5 w-3.5" />} label="System health" />
          </div>
        </div>

        {/* ── Recommended starting settings banner ────────────────────── */}
        <RecommendedSettings />

      </PageBody>
    </>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StageCard({
  icon, title, description, health, metric, metricLabel, metricPrefix,
  secondaryMetric, href, cta, highlight, urgent, urgentLabel,
}: {
  icon:             React.ReactNode
  title:            string
  description:      string
  health:           Health
  metric:           number | null | undefined
  metricLabel:      string
  metricPrefix?:    string
  secondaryMetric?: string
  href:             string
  cta:              string
  highlight?:       boolean
  urgent?:          boolean
  urgentLabel?:     string
}) {
  return (
    <Link href={href}
      className={`group flex flex-col gap-3 rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm ${HEALTH_RING[health]}`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${health === 'good' ? 'bg-emerald-500/10 text-emerald-500' : health === 'blocked' ? 'bg-destructive/10 text-destructive' : health === 'warn' ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
          {icon}
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${health === 'good' ? 'text-emerald-500' : health === 'blocked' ? 'text-destructive' : health === 'warn' ? 'text-amber-500' : 'text-muted-foreground'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[health]}`} />
          {HEALTH_LABEL[health]}
        </span>
      </div>

      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>

      <div className="flex-1">
        {metric != null ? (
          <div className={`text-2xl font-bold tabular-nums ${highlight ? 'text-emerald-500' : urgent ? 'text-amber-500' : ''}`}>
            {metricPrefix}{typeof metric === 'number' ? metric.toLocaleString() : metric}
          </div>
        ) : (
          <div className="text-2xl font-bold text-muted-foreground">—</div>
        )}
        <div className="text-xs text-muted-foreground">{metricLabel}</div>
        {urgentLabel && (
          <div className="mt-1 text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {urgentLabel}
          </div>
        )}
        {secondaryMetric && !urgentLabel && (
          <div className="mt-1 text-xs text-muted-foreground/70">{secondaryMetric}</div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-2 mt-auto">
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{cta}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </Link>
  )
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
      {icon}{label}<ArrowRight className="h-3 w-3 text-muted-foreground" />
    </Link>
  )
}

function RecommendedSettings() {
  const [applied, setApplied] = useState(false)
  const [loading, setLoading] = useState(false)

  async function applyDefaults() {
    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('nexus_token') ?? '' : ''
      const apiBase = process.env.NEXT_PUBLIC_API_URL || ''
      await fetch(`${apiBase}/api/pipeline/seed-defaults`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      setApplied(true)
    } finally {
      setLoading(false)
    }
  }

  if (applied) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-500">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Starter settings applied — autopilot ON, auto-publish OFF, min score 8, max 1 product/night, $2 spend cap.
        <Link href="/sleep-mode" className="underline ml-auto shrink-0">Adjust →</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-500">
          <AlertTriangle className="h-4 w-4" /> First time? Apply recommended starter settings
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Autopilot ON · Auto-publish OFF · Min score 8 · 1 product/night · $2 spend cap. Safe for overnight runs.
        </p>
      </div>
      <button onClick={applyDefaults} disabled={loading}
        className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500/90 disabled:opacity-50 transition-colors">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
        Apply starter settings
      </button>
    </div>
  )
}
