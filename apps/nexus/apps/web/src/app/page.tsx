'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, Package, ShieldCheck, DollarSign, Rocket,
  ArrowRight, Bot, ArrowUpRight, Activity, BarChart3, Zap, Clock,
  AlertCircle,
} from 'lucide-react'
import { api, API_BASE, type AutopilotStatus, type RevenueResponse, type Digest, type LearningStats, type Stats } from '@/lib/api'
import { PageBody } from '@/components/shell/AppShell'
import { SetupBanner } from '@/components/shared/SetupBanner'
import { formatCost } from '@/lib/utils'
import type { PipelineSummary } from '@posteragent/types/nexus/api-contract'

interface Counts { total: number; pending: number; approved: number; published: number }

// PipelineSummary is now in @posteragent/types — see packages/types/src/nexus/api-contract.ts

export default function HomePage() {
  // /api/stats is the single source for every count widget (T3). The other
  // fetches remain only for non-count details (best seller, spend cap,
  // autopilot toggle state, digest) and as graceful fallbacks if /api/stats
  // is briefly unavailable.
  const [stats, setStats] = useState<Stats | null>(null)
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null)
  const [auto, setAuto] = useState<AutopilotStatus | null>(null)
  const [spend, setSpend] = useState<{ today: number; cap: number } | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [summary, setSummary] = useState<PipelineSummary | null>(null)
  const [digest, setDigest] = useState<Digest | null>(null)
  const [learning, setLearning] = useState<LearningStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getStats().then(setStats).catch(() => setStats(null))
    api.getRevenue().then(setRevenue).catch(() => setRevenue(null))
    api.getAutopilot().then(setAuto).catch(() => setAuto(null))
    api.getSpend().then(setSpend).catch(() => setSpend(null))
    api.getDigestToday().then(setDigest).catch(() => setDigest(null))
    api.getLearningStats().then(setLearning).catch(() => setLearning(null))
    // BUG-P1-4: counts now come from /api/pipeline/summary so dashboard,
    // /money-workflow, and /review all read the SAME DB query. The old
    // path (getProducts({limit:200}) + client-side filter) was giving the
    // dashboard a different "pending review" number than the review queue
    // header because pending_review row usability was filtered client-side
    // only inside /review/page.tsx.
    fetch(`${API_BASE}/api/pipeline/summary`, { cache: 'no-store' })
      .then((r) => r.ok ? (r.json() as Promise<PipelineSummary>) : null)
      .then((s) => {
        if (!s) return
        setSummary(s)
        setCounts({
          total: s.total_products ?? 0,
          pending: s.stages.review.pending ?? 0,
          approved: s.stages.review.approved ?? 0,
          published: s.stages.publish.published ?? 0,
        })
      })
      .catch((err) => setError(err.message))
  }, [])

  // Count widgets read from /api/stats first; fall back to the per-feature
  // endpoints if stats hasn't loaded yet (or is unavailable).
  const totalRevenue = stats?.sales.total_revenue ?? revenue?.total_revenue ?? learning?.total_revenue ?? 0
  const totalSales = stats?.sales.total_sales ?? revenue?.total_sales ?? learning?.total_sales_synced ?? 0
  const patternsFound = stats?.learning.patterns ?? learning?.patterns_extracted ?? 0
  const autopilotBuilt = stats?.autopilot.built_total ?? auto?.products_built ?? 0
  const pendingReview = stats?.review.pending ?? counts?.pending ?? 0
  const productsTotal = stats?.products.total ?? counts?.total ?? 0
  const approvedCount = stats?.products.approved ?? counts?.approved ?? 0
  const publishedCount = stats?.products.published ?? counts?.published ?? 0
  const buildingNow = stats?.products.running ?? summary?.stages.building.running ?? 0
  const spendToday = stats?.spend_today_usd ?? spend?.today ?? 0

  return (
    <PageBody className="max-w-6xl mx-auto space-y-6 py-8">
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Setup checklist — auto-hides once password + Gumroad are set */}
      <SetupBanner />

      {/* Hero: greeting + primary metric */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {getGreeting()}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {getStatusLine(autopilotBuilt, pendingReview, totalSales)}
          </p>
        </div>
        <Link
          href="/ceo"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Bot className="h-4 w-4" /> Ask AI
        </Link>
      </div>

      {/* Revenue strip */}
      <div className="grid gap-4 sm:grid-cols-4">
        <MetricCard
          label="Revenue"
          value={`$${totalRevenue.toFixed(2)}`}
          icon={<DollarSign className="h-4 w-4" />}
          trend={totalRevenue > 0 ? 'up' : undefined}
          href="/revenue"
          accent
        />
        <MetricCard
          label="Sales"
          value={String(totalSales)}
          icon={<BarChart3 className="h-4 w-4" />}
          sub={revenue?.best_seller ? `Top: ${revenue.best_seller}` : undefined}
          href="/revenue"
        />
        <MetricCard
          label="Products"
          value={String(productsTotal)}
          icon={<Package className="h-4 w-4" />}
          // BUG-214: the totals didn't reconcile — users saw 38 total but
          // only Pending + Approved + Published = 14 in the pipeline tile,
          // with no explanation of the other 24. Show the full breakdown
          // so total = active + other adds up at a glance.
          sub={(() => {
            const active = pendingReview + approvedCount + publishedCount
            const other = Math.max(0, productsTotal - active)
            const parts = [`${publishedCount} live`, `${active} active`]
            if (other > 0) parts.push(`${other} archived/rejected`)
            return parts.join(' · ')
          })()}
          href="/products"
        />
        <MetricCard
          label="AI Spend"
          /* T15: when products have been built today on free models the
             spend stays at $0 — show "Free tier" instead of "$0.00" so
             operators don't read it as "spend tracking is broken". */
          value={formatCost(spendToday, autopilotBuilt || productsTotal)}
          icon={<Zap className="h-4 w-4" />}
          sub={spend && spend.cap > 0 ? `of $${spend.cap.toFixed(2)} cap` : 'No cap set'}
          href="/settings/keys"
        />
      </div>

      {/* Two-column: left = pipeline / right = AI status */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Pipeline status */}
        <div className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Pipeline
            </h2>
            <Link href="/products" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {/* BUG-P1-4: "Building Now" was missing from the dashboard,
                so users would see "13 active" here and "23 building now"
                on /money-workflow and think they disagreed. They were
                measuring different things — pipeline.summary's
                `running` count is the canonical "in-flight" number. */}
            <PipelineRow
              label="Building Now"
              count={buildingNow}
              icon={<Activity className="h-4 w-4 text-amber-500" />}
              href="/money-workflow"
              highlight={buildingNow > 0}
            />
            <PipelineRow
              label="Pending Review"
              count={pendingReview}
              icon={<ShieldCheck className="h-4 w-4" />}
              href="/review"
              highlight={pendingReview > 0}
            />
            <PipelineRow
              label="Approved (ready to publish)"
              count={approvedCount}
              icon={<Package className="h-4 w-4" />}
              href="/products"
            />
            <PipelineRow
              label="Published & Live"
              count={publishedCount}
              icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
              href="/products"
            />
            <PipelineRow
              label="Autopilot Built"
              count={autopilotBuilt}
              icon={<Rocket className="h-4 w-4" />}
              href="/autopilot"
            />
          </div>
        </div>

        {/* AI engine status */}
        <div className="lg:col-span-2 space-y-4">
          {/* Autopilot card */}
          <Link
            href="/autopilot"
            className="block rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Autopilot</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                auto?.enabled
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-muted text-muted-foreground'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${auto?.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
                {auto?.enabled ? 'Running' : 'Off'}
              </span>
            </div>
            {auto?.enabled && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-lg font-semibold tabular-nums">{auto.products_built}</div>
                  <div className="text-[11px] text-muted-foreground">built automatically</div>
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums">{auto.per_run}/run</div>
                  <div className="text-[11px] text-muted-foreground">products per cycle</div>
                </div>
              </div>
            )}
            {!auto?.enabled && (
              <p className="mt-2 text-xs text-muted-foreground">
                Enable to build products automatically while you sleep.
              </p>
            )}
          </Link>

          {/* Learning Loop card */}
          <Link
            href="/learning"
            className="block rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Learning Loop</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-lg font-semibold tabular-nums">{patternsFound}</div>
                <div className="text-[11px] text-muted-foreground">patterns found</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">{totalSales}</div>
                <div className="text-[11px] text-muted-foreground">sales analyzed</div>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Today's digest (compact) */}
      {digest && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Today
            </h2>
            <Link href="/digest" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              Full digest <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
            <DigestStat label="Built" value={digest.built_24h} />
            <DigestStat label="Published" value={digest.published} />
            <DigestStat label="Schedules" value={`${digest.schedules_succeeded}/${digest.schedules_ran}`} />
            <DigestStat label="Errors" value={digest.errors.length} alert={digest.errors.length > 0} />
          </div>
          {/* BUG-215: distinguish "schedule ran with no work" from "schedule ran
              and built N things" so an all-zero digest doesn't look like a
              successful day. */}
          {digest.schedules_ran > 0 && digest.built_24h === 0 && digest.published === 0 && digest.errors.length === 0 && (
            <div className="border-t border-border px-5 py-2 text-xs text-muted-foreground">
              Schedule ran with no work to queue — turn on more niches in <Link href="/autopilot" className="text-primary hover:underline">Autopilot</Link> if you expected output.
            </div>
          )}
        </div>
      )}

      {/* Recent autopilot activity */}
      {auto?.recent && auto.recent.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </h2>
            <Link href="/history" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {auto.recent.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-foreground truncate mr-4">{r.note}</span>
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  {formatRelativeTime(r.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageBody>
  )
}

function MetricCard({ label, value, icon, sub, trend, href, accent }: {
  label: string; value: string; icon: React.ReactNode; sub?: string
  trend?: 'up' | 'down'; href: string; accent?: boolean
}) {
  return (
    <Link
      href={href}
      className={`group min-w-0 rounded-xl border bg-card p-4 transition-colors ${
        accent ? 'border-primary/30 hover:border-primary/50' : 'border-border hover:border-primary/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </span>
        {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
        {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
      </div>
      <div className={`mt-3 truncate text-2xl font-semibold tabular-nums ${accent ? 'text-emerald-400' : ''}`}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub ?? label}</div>
    </Link>
  )
}

function PipelineRow({ label, count, icon, href, highlight }: {
  label: string; count: number; icon: React.ReactNode; href: string; highlight?: boolean
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
    >
      <span className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${
        highlight ? 'text-primary' : 'text-foreground'
      }`}>
        {count}
        {highlight && count > 0 && (
          <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
        )}
      </span>
    </Link>
  )
}

function DigestStat({ label, value, alert }: {
  label: string; value: number | string; alert?: boolean
}) {
  return (
    <div className="px-4 py-3.5 text-center">
      <div className={`text-lg font-semibold tabular-nums ${alert ? 'text-destructive' : ''}`}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getStatusLine(built: number, pending: number, sales: number): string {
  const parts: string[] = []
  if (built > 0) parts.push(`${built} products built by AI`)
  if (pending > 0) parts.push(`${pending} awaiting your review`)
  if (sales > 0) parts.push(`${sales} total sales`)
  if (parts.length === 0) return 'Your AI engine is ready. Start building products or enable Autopilot.'
  return parts.join(' · ')
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
