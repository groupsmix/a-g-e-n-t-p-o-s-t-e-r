'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Radar, TrendingUp, Loader2, Search, Trash2, Plus,
  Zap, Target, ShieldCheck, Clock, DollarSign, Star,
  AlertTriangle, CheckCircle, Eye, ArrowRight, Filter,
  Briefcase, Package, Shirt, FileText, X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import type { OpportunityInfo, OpportunitySummary } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

const FORMAT_LABELS: Record<string, { label: string; icon: typeof Briefcase; color: string }> = {
  freelance: { label: 'Freelance', icon: Briefcase, color: 'text-blue-400' },
  digital_product: { label: 'Digital Product', icon: Package, color: 'text-purple-400' },
  pod: { label: 'Print on Demand', icon: Shirt, color: 'text-pink-400' },
  content: { label: 'Content', icon: FileText, color: 'text-green-400' },
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400',
  watchlist: 'bg-yellow-500/20 text-yellow-400',
  approved: 'bg-green-500/20 text-green-400',
  in_progress: 'bg-purple-500/20 text-purple-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  dismissed: 'bg-zinc-500/20 text-zinc-400',
}

const URGENCY_COLORS: Record<string, string> = {
  low: 'text-zinc-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  urgent: 'text-red-400',
}

const SCAN_PHASES = [
  'Collecting trend signals...',
  'Analyzing Google Trends & search data...',
  'Checking Etsy & marketplace trends...',
  'Evaluating competition gaps...',
  'Scoring opportunities (demand, urgency, ease)...',
  'Ranking & filtering top picks...',
] as const

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono">{value}/{max}</span>
    </div>
  )
}

function OpportunityCard({
  opp,
  onStatusChange,
  onDelete,
}: {
  opp: OpportunityInfo
  onStatusChange: (id: string, status: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const fmt = FORMAT_LABELS[opp.suggested_format] ?? FORMAT_LABELS.content
  const FormatIcon = fmt.icon

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[opp.status] ?? STATUS_COLORS.new}`}>
              {opp.status.replace('_', ' ')}
            </span>
            {opp.is_guess && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                <AlertTriangle className="h-3 w-3" /> AI Guess
              </span>
            )}
            {!opp.is_guess && opp.evidence.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                <CheckCircle className="h-3 w-3" /> Evidence
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold truncate">{opp.trend_name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{opp.product_idea}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={`text-2xl font-bold ${opp.total_score >= 80 ? 'text-green-400' : opp.total_score >= 70 ? 'text-yellow-400' : 'text-zinc-400'}`}>
            {opp.total_score}
          </div>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FormatIcon className={`h-3 w-3 ${fmt.color}`} />
          {fmt.label}
        </span>
        <span className="inline-flex items-center gap-1">
          <Target className="h-3 w-3" /> {opp.target_buyer}
        </span>
        <span className={`inline-flex items-center gap-1 ${URGENCY_COLORS[opp.urgency] ?? ''}`}>
          <Clock className="h-3 w-3" /> {opp.urgency}
        </span>
        {opp.niche && (
          <span className="inline-flex items-center gap-1">
            <Search className="h-3 w-3" /> {opp.niche}
          </span>
        )}
      </div>

      <button
        onClick={() => setExpanded((p) => !p)}
        className="mt-2 text-xs text-primary hover:underline"
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <div className="p-3 rounded bg-zinc-900/50 text-xs">
            <p className="font-medium mb-1">Why it sells:</p>
            <p className="text-muted-foreground">{opp.why_it_sells}</p>
          </div>

          <div className="space-y-1.5">
            <ScoreBar label="Demand Signal" value={opp.score_demand} max={20} />
            <ScoreBar label="Competition Gap" value={opp.score_competition_gap} max={15} />
            <ScoreBar label="Buyer Urgency" value={opp.score_buyer_urgency} max={15} />
            <ScoreBar label="Ease to Create" value={opp.score_ease} max={15} />
            <ScoreBar label="Monetization" value={opp.score_monetization} max={15} />
            <ScoreBar label="Trend Timing" value={opp.score_timing} max={10} />
            <ScoreBar label="Safety / IP" value={opp.score_safety} max={10} />
          </div>

          {opp.evidence.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Evidence:</p>
              <div className="space-y-1">
                {opp.evidence.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-zinc-900/50">
                    <Star className="h-3 w-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium text-primary">{ev.source}</span>
                      {ev.snippet && <span className="text-muted-foreground"> — {ev.snippet}</span>}
                      {ev.url && (
                        <a href={ev.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-400 hover:underline">↗</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {opp.source_signals.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {opp.source_signals.map((s) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{s}</span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            {opp.status === 'new' && (
              <>
                <button
                  onClick={() => onStatusChange(opp.id, 'watchlist')}
                  className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                >
                  <Eye className="h-3 w-3 inline mr-1" /> Watchlist
                </button>
                <button
                  onClick={() => onStatusChange(opp.id, 'approved')}
                  className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30"
                >
                  <CheckCircle className="h-3 w-3 inline mr-1" /> Approve
                </button>
              </>
            )}
            {opp.status === 'watchlist' && (
              <button
                onClick={() => onStatusChange(opp.id, 'approved')}
                className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30"
              >
                <CheckCircle className="h-3 w-3 inline mr-1" /> Approve & Start
              </button>
            )}
            {opp.status === 'approved' && (
              <button
                onClick={() => onStatusChange(opp.id, 'in_progress')}
                className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
              >
                <ArrowRight className="h-3 w-3 inline mr-1" /> Start Work
              </button>
            )}
            <button
              onClick={() => onStatusChange(opp.id, 'dismissed')}
              className="text-xs px-2 py-1 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700"
            >
              Dismiss
            </button>
            <button
              onClick={() => onDelete(opp.id)}
              className="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-500/20 ml-auto"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<OpportunityInfo[]>([])
  const [summary, setSummary] = useState<OpportunitySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanPhase, setScanPhase] = useState(0)
  const [nicheInput, setNicheInput] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterFormat, setFilterFormat] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    const params: { status?: string; format?: string; min_score?: number } = {}
    if (filterStatus) params.status = filterStatus
    if (filterFormat) params.format = filterFormat

    Promise.all([
      api.getOpportunities(params),
      api.getOpportunitySummary(),
    ])
      .then(([oppData, sumData]) => {
        setOpportunities(oppData.opportunities ?? [])
        setSummary(sumData)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load opportunities'
        setLoadError(msg)
        toast.error('Failed to load opportunities')
      })
      .finally(() => setLoading(false))
  }, [filterStatus, filterFormat])

  useEffect(() => { load() }, [load])

  const handleScan = async () => {
    setScanning(true)
    setScanPhase(0)
    const phaseTimer = setInterval(() => {
      setScanPhase((p) => Math.min(p + 1, SCAN_PHASES.length - 1))
    }, 2500)
    try {
      const result = await api.scanOpportunities(nicheInput || undefined)
      clearInterval(phaseTimer)
      setScanPhase(SCAN_PHASES.length - 1)
      if (result.scanned > 0) {
        toast.success(`Found ${result.scanned} new opportunities`)
        load()
      } else {
        toast.info('No new opportunities found — try a different niche')
      }
    } catch {
      clearInterval(phaseTimer)
      toast.error('Scan failed — check your connection and try again')
    }
    setScanning(false)
    setScanPhase(0)
  }

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.updateOpportunityStatus(id, status)
      setOpportunities((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status } : o))
      )
    } catch { toast.error('Failed to update status') }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteOpportunity(id)
      setOpportunities((prev) => prev.filter((o) => o.id !== id))
    } catch { toast.error('Failed to delete opportunity') }
  }

  const topOpps = summary?.top_opportunities ?? []

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Radar className="h-6 w-6" /> Opportunity Radar
          </span>
        }
        subtitle="AI-scored trend predictions across freelance, digital products, and POD. Real signals vs guesses clearly labeled."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((p) => !p)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-sidebar-accent transition-colors"
            >
              <Filter className="h-4 w-4" /> Filters
            </button>
          </div>
        }
      />
      <PageBody>
        {/* Scan bar */}
        <div className="rounded-lg border border-border bg-card p-4 mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={nicheInput}
                onChange={(e) => setNicheInput(e.target.value)}
                placeholder="Enter a niche (e.g. 'dentists')... or leave empty"
                className="w-full pl-9 pr-4 py-2 rounded-md border border-border bg-background text-sm focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 whitespace-nowrap"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {scanning ? 'Scanning...' : 'Scan for Opportunities'}
            </button>
          </div>
          {scanning && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${((scanPhase + 1) / SCAN_PHASES.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {scanPhase + 1}/{SCAN_PHASES.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {SCAN_PHASES[scanPhase]}
              </p>
            </div>
          )}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="rounded-lg border border-border bg-card p-4 mb-6 flex items-center gap-4 flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">All</option>
                <option value="new">New</option>
                <option value="watchlist">Watchlist</option>
                <option value="approved">Approved</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Format</label>
              <select
                value={filterFormat}
                onChange={(e) => setFilterFormat(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">All</option>
                <option value="freelance">Freelance</option>
                <option value="digital_product">Digital Product</option>
                <option value="pod">Print on Demand</option>
                <option value="content">Content</option>
              </select>
            </div>
            <button
              onClick={() => { setFilterStatus(''); setFilterFormat('') }}
              className="text-xs text-muted-foreground hover:text-foreground mt-4"
            >
              <X className="h-3 w-3 inline mr-1" /> Clear
            </button>
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Radar className="h-3 w-3" /> Total Tracked
              </div>
              <p className="text-xl font-bold">{summary.total}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3 w-3 text-green-400" /> Top Score
              </div>
              <p className="text-xl font-bold text-green-400">
                {topOpps.length > 0 ? topOpps[0].total_score : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <ShieldCheck className="h-3 w-3 text-blue-400" /> Actionable (70+)
              </div>
              <p className="text-xl font-bold text-blue-400">
                {opportunities.filter((o) => o.total_score >= 70 && o.status !== 'dismissed').length}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <DollarSign className="h-3 w-3 text-yellow-400" /> In Progress
              </div>
              <p className="text-xl font-bold text-yellow-400">
                {opportunities.filter((o) => o.status === 'in_progress').length}
              </p>
            </div>
          </div>
        )}

        {/* Top opportunities highlight */}
        {topOpps.length > 0 && !filterStatus && !filterFormat && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400" /> CEO Top Picks (Score 70+)
            </h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {topOpps.slice(0, 3).map((opp) => (
                <div key={opp.id} className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-yellow-400">{opp.total_score}/100</span>
                    <span className={`text-xs ${FORMAT_LABELS[opp.suggested_format]?.color ?? ''}`}>
                      {FORMAT_LABELS[opp.suggested_format]?.label ?? opp.suggested_format}
                    </span>
                  </div>
                  <p className="text-sm font-semibold truncate">{opp.trend_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{opp.product_idea}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {opp.is_guess ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">Guess</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Evidence-backed</span>
                    )}
                    <span className={`text-[10px] ${URGENCY_COLORS[opp.urgency]}`}>{opp.urgency} urgency</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All opportunities */}
        {loadError ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-destructive opacity-70" />
              <p className="text-sm font-medium text-destructive">Failed to load opportunities</p>
              <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
              <button
                onClick={() => load()}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-sidebar-accent transition-colors"
              >
                <Loader2 className="h-3 w-3" /> Retry
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading opportunities...
            </div>
          ) : opportunities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Radar className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No opportunities found. Run a scan to discover trends.</p>
            </div>
          ) : (
          <div className="space-y-3">
            {opportunities.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </PageBody>
    </>
  )
}
