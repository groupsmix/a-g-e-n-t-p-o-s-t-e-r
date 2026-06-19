'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Brain, TrendingUp, ShoppingBag, BarChart3, RefreshCw,
  Loader2, Zap, DollarSign, Hash, Tag, Target, AlertTriangle,
} from 'lucide-react'
import { api, type LearningStats, type LearningPatternRow } from '@/lib/api'
import { toast } from '@/lib/toast'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

const PATTERN_ICONS: Record<string, React.ReactNode> = {
  niche: <Target className="h-4 w-4 text-violet-500" />,
  price_range: <DollarSign className="h-4 w-4 text-emerald-500" />,
  title_structure: <Hash className="h-4 w-4 text-blue-500" />,
  top_tags: <Tag className="h-4 w-4 text-amber-500" />,
  tone: <Zap className="h-4 w-4 text-pink-500" />,
  cta_style: <Zap className="h-4 w-4 text-orange-500" />,
  buyer_persona: <Target className="h-4 w-4 text-cyan-500" />,
  description_length: <BarChart3 className="h-4 w-4 text-gray-500" />,
}

export default function LearningPage() {
  const [stats, setStats] = useState<LearningStats | null>(null)
  const [patterns, setPatterns] = useState<LearningPatternRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    Promise.all([
      api.getLearningStats(),
      api.getLearningPatterns(),
    ])
      .then(([s, p]) => {
        setStats(s)
        setPatterns(p.patterns)
      })
      .catch((err: unknown) => {
        // Inline error with a Retry button (BUG-203). The previous toast-only
        // approach left the user with a naked "Failed to load learning data"
        // banner and no way to recover except a full page reload.
        const msg = err instanceof Error ? err.message : 'Failed to load learning data'
        setLoadError(msg)
        setStats(null)
        setPatterns([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await api.syncLearning()
      load()
    } catch { toast.error('Sync failed') }
    setSyncing(false)
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      await api.analyzeLearning()
      load()
    } catch { toast.error('Analysis failed') }
    setAnalyzing(false)
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Brain className="h-6 w-6" /> Winner Learning Loop
          </span>
        }
        subtitle="The compounding revenue engine — learns what sells, feeds it back into product generation."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-sidebar-accent transition-colors disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync Now
            </button>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="inline-flex items-center gap-2 rounded-md bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Re-analyze
            </button>
          </div>
        }
      />
      <PageBody className="space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading learning data…
          </div>
        )}

        {/* T7: distinct error vs empty states.
            - Error: the request actually failed (network / auth / 5xx). Show
              the raw error and offer a Retry. Don't lecture the user about
              Gumroad sales — the load failure isn't about that.
            - Empty: the request succeeded but the loop has nothing to learn
              from yet (no stats, or zero sales synced and no patterns). Show
              an inviting CTA that actually moves them forward (Sync Now or
              connect Gumroad in Settings), not a Retry button that won't
              change anything. */}
        {!loading && loadError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive opacity-70" />
            <p className="mt-3 text-sm font-medium text-destructive">Couldn&apos;t load learning data</p>
            <p className="mt-1 text-xs text-muted-foreground break-all">{loadError}</p>
            <button
              onClick={() => load()}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-sidebar-accent transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        )}

        {!loading && !loadError && (() => {
          const noData =
            !stats ||
            ((stats.total_sales_synced ?? 0) === 0 &&
             (stats.patterns_extracted ?? 0) === 0 &&
             patterns.length === 0)
          if (!noData) return null
          return (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
              <Brain className="mx-auto h-8 w-8 text-primary opacity-80" />
              <p className="mt-3 text-sm font-medium">Loop is empty — feed it some sales</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                The Winner Learning Loop extracts patterns from sales you&apos;ve already
                made. Connect Gumroad, sync your sales, then re-analyze to see what&apos;s
                actually working.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gradient-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Sync Gumroad sales
                </button>
                <a
                  href="/settings/keys"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-sidebar-accent transition-colors"
                >
                  Connect Gumroad →
                </a>
              </div>
            </div>
          )
        })()}

        {!loading && !loadError && stats &&
         ((stats.total_sales_synced ?? 0) > 0 || (stats.patterns_extracted ?? 0) > 0 || patterns.length > 0) && (
          <>
            {/* Stat Cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                icon={<ShoppingBag className="h-5 w-5 text-primary" />}
                label="Sales synced"
                value={String(stats.total_sales_synced)}
              />
              <Stat
                icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
                label="Total revenue"
                value={`$${stats.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              />
              <Stat
                icon={<Brain className="h-5 w-5 text-violet-500" />}
                label="Patterns extracted"
                value={String(stats.patterns_extracted)}
              />
              <Stat
                icon={<TrendingUp className="h-5 w-5 text-amber-500" />}
                label="Last sync"
                value={stats.last_sync_at ? new Date(stats.last_sync_at).toLocaleDateString() : 'Never'}
                small
              />
            </div>

            {/* Revenue Trend */}
            {stats.improvement_trend.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-5 py-3 text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Revenue Trend
                </div>
                <div className="px-5 py-4">
                  <div className="flex items-end gap-2 h-32">
                    {stats.improvement_trend.map((t) => {
                      const max = Math.max(...stats.improvement_trend.map((x) => x.revenue), 1)
                      const height = Math.max(4, (t.revenue / max) * 100)
                      return (
                        <div key={t.period} className="flex-1 flex flex-col items-center gap-1">
                          <div className="text-[10px] text-muted-foreground">${t.revenue.toFixed(0)}</div>
                          <div
                            className="w-full rounded-t bg-gradient-primary"
                            style={{ height: `${height}%` }}
                          />
                          <div className="text-[10px] text-muted-foreground">{t.period}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Top 5 Winning Patterns */}
            {stats.top_patterns.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-5 py-3 text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4" /> Top Winning Patterns
                </div>
                <div className="divide-y divide-border">
                  {stats.top_patterns.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {PATTERN_ICONS[p.pattern_type] || <Zap className="h-4 w-4 text-muted-foreground" />}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{p.pattern_value}</div>
                          <div className="text-xs text-muted-foreground capitalize">{p.pattern_type.replace(/_/g, ' ')}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
                        <span>{p.times_sold ?? 0} sold</span>
                        <span className="text-emerald-500 font-medium">
                          ${(p.total_revenue ?? 0).toFixed(2)}
                        </span>
                        <ConfidenceBadge score={p.confidence_score ?? p.confidence ?? 0} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Patterns */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold flex items-center gap-2">
                <Brain className="h-4 w-4" /> All Patterns ({patterns.length})
              </div>
              {patterns.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No patterns yet. Sync sales and run analysis to extract winner patterns.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {patterns.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {PATTERN_ICONS[p.pattern_type] || <Zap className="h-4 w-4 text-muted-foreground" />}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{p.pattern_value}</div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {p.pattern_type.replace(/_/g, ' ')}
                            {p.source ? ` \u00b7 ${p.source}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">
                            {p.times_seen ?? 0} seen \u00b7 {p.times_sold ?? 0} sold
                          </div>
                          <div className="text-xs font-medium text-emerald-500">
                            ${(p.total_revenue ?? 0).toFixed(2)} revenue
                          </div>
                        </div>
                        <ConfidenceBadge score={p.confidence_score ?? p.confidence ?? 0} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </PageBody>
    </>
  )
}

function Stat({
  icon, label, value, small,
}: { icon: React.ReactNode; label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-gradient-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className={`mt-2 font-bold ${small ? 'text-base' : 'text-2xl'} tracking-tight`}>
        {value}
      </div>
    </div>
  )
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'text-emerald-500' : pct >= 40 ? 'text-amber-500' : 'text-muted-foreground'
  return (
    <span className={`text-xs font-medium ${color}`}>
      {pct}%
    </span>
  )
}
