'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Radar, Loader2, RefreshCw, ExternalLink, Check, X, Trash2, MessageSquare,
  Flame, Search, TrendingUp, Save, RotateCcw, Mail, Building2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

type Lead = Awaited<ReturnType<typeof api.getLeads>>['leads'][number]
type LeadStats = Awaited<ReturnType<typeof api.getLeadStats>>

const INTENT_TONE: Record<string, string> = {
  buying: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
  comparing: 'text-sky-500 bg-sky-500/10 border-sky-500/30',
  asking: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  frustrated: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
  other: 'text-muted-foreground bg-muted/30 border-border',
}

const SOURCE_LABEL: Record<string, string> = {
  reddit: 'r',
  hn: 'HN',
}

const STATUS_FILTER_OPTIONS = [
  { v: 'new', label: 'New' },
  { v: 'engaged', label: 'Engaged' },
  { v: 'contacted', label: 'Contacted' },
  { v: 'qualified', label: 'Qualified' },
  { v: 'dismissed', label: 'Dismissed' },
  { v: 'disqualified', label: 'Disqualified' },
  { v: 'all', label: 'All' },
] as const

const STATUS_OPTIONS = [
  { v: 'new', label: 'New' },
  { v: 'engaged', label: 'Engaged' },
  { v: 'contacted', label: 'Contacted' },
  { v: 'qualified', label: 'Qualified' },
  { v: 'dismissed', label: 'Dismissed' },
  { v: 'disqualified', label: 'Disqualified' },
] as const

const CONTACT_STATUS_OPTIONS = [
  { v: 'unresearched', label: 'Unresearched' },
  { v: 'researching', label: 'Researching' },
  { v: 'ready', label: 'Ready' },
  { v: 'contacted', label: 'Contacted' },
  { v: 'replied', label: 'Replied' },
  { v: 'qualified', label: 'Qualified' },
  { v: 'disqualified', label: 'Disqualified' },
] as const

function tsRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [stats, setStats] = useState<LeadStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTER_OPTIONS)[number]['v']>('new')
  const [intentFilter, setIntentFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [minScore, setMinScore] = useState<number>(0)

  const [showScan, setShowScan] = useState(false)
  const [terms, setTerms] = useState('')
  const [subreddits, setSubreddits] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)

  const [busyFp, setBusyFp] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([
        api.getLeads({
          status: statusFilter,
          intent: intentFilter || undefined,
          source: sourceFilter || undefined,
          min_score: minScore || undefined,
          limit: 100,
        }),
        api.getLeadStats(),
      ])
      setLeads(l.leads ?? [])
      setStats(s)
    } catch {
      setLeads([])
      setStats(null)
    }
  }, [statusFilter, intentFilter, sourceFilter, minScore])

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [refresh])

  async function handleScan() {
    const termList = terms.split(',').map((t) => t.trim()).filter(Boolean)
    if (termList.length === 0) {
      setScanResult('Add at least one search term first.')
      return
    }
    const subList = subreddits.split(',').map((s) => s.trim()).filter(Boolean)
    setScanning(true)
    setScanResult(null)
    try {
      const r = await api.scanLeads({
        terms: termList,
        subreddits: subList,
        limit: 25,
      })
      setScanResult(
        `Scanned ${r.scanned} posts · inserted ${r.inserted} new · ${r.skipped} dupes · ${r.filtered} off-topic` +
          (r.errors.length ? ` · ${r.errors.length} errors` : ''),
      )
      await refresh()
    } catch (err) {
      setScanResult(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function withBusy(fp: string, fn: () => Promise<unknown>) {
    setBusyFp(fp)
    try {
      await fn()
      await refresh()
    } finally {
      setBusyFp(null)
    }
  }

  function updateLeadDraft(fp: string, patch: Partial<Lead>) {
    setLeads((current) =>
      current.map((lead) => (lead.fingerprint === fp ? { ...lead, ...patch } : lead)),
    )
  }

  async function saveLead(fp: string) {
    const lead = leads.find((item) => item.fingerprint === fp)
    if (!lead) return
    await withBusy(fp, async () => {
      await api.updateLead(fp, {
        status: lead.status,
        operator_note: lead.operator_note ?? null,
        contact_email: lead.contact_email ?? null,
        contact_name: lead.contact_name ?? null,
        company_name: lead.company_name ?? null,
        company_domain: lead.company_domain ?? null,
        source_type: lead.source_type ?? null,
        contact_status: lead.contact_status,
      })
    })
  }

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries((stats?.byStatus ?? []).map((s) => [s.status, s.n])) as Record<string, number>
    return {
      new: byStatus.new ?? 0,
      engaged: byStatus.engaged ?? 0,
      dismissed: byStatus.dismissed ?? 0,
      top_score: stats?.top_score ?? 0,
    }
  }, [stats])

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Radar className="h-5 w-5 text-primary" /> Leads
          </span>
        }
        subtitle="Intent-mining radar across Reddit and HN. People asking the questions your products answer."
        actions={
          <>
            <button
              onClick={() => refresh()}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              onClick={() => setShowScan((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Search className="h-3.5 w-3.5" /> New scan
            </button>
          </>
        }
      />

      <PageBody className="space-y-5">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPI label="New" value={counts.new} tone="text-emerald-500" />
          <KPI label="Engaged" value={counts.engaged} tone="text-sky-500" />
          <KPI label="Dismissed" value={counts.dismissed} tone="text-muted-foreground" />
          <KPI label="Top score" value={counts.top_score} tone="text-amber-500" icon={<Flame className="h-3.5 w-3.5" />} />
        </div>

        {/* Scan form */}
        {showScan && (
          <div className="rounded-lg border bg-card/40 p-4 space-y-3">
            <div className="text-sm font-medium">Scan for new leads</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs space-y-1">
                <span className="text-muted-foreground">Search terms (comma-separated)</span>
                <input
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="e.g. notion alternative, second brain app"
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs space-y-1">
                <span className="text-muted-foreground">Subreddits (comma-separated, optional)</span>
                <input
                  value={subreddits}
                  onChange={(e) => setSubreddits(e.target.value)}
                  placeholder="e.g. productivity, notion"
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleScan}
                disabled={scanning}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                {scanning ? 'Scanning…' : 'Run scan'}
              </button>
              {scanResult && <span className="text-xs text-muted-foreground">{scanResult}</span>}
            </div>
            <p className="text-[11px] text-muted-foreground">
              HN is always queried. Reddit only if subreddits are listed. Scoring is heuristic
              (term match + buying/comparing/asking/frustrated signals); operators decide.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Tabs
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as typeof statusFilter)}
            options={STATUS_FILTER_OPTIONS as unknown as Array<{ v: typeof statusFilter; label: string }>}
          />
          <Select
            label="Intent"
            value={intentFilter}
            onChange={setIntentFilter}
            options={[
              { v: '', label: 'Any' },
              { v: 'buying', label: 'Buying' },
              { v: 'comparing', label: 'Comparing' },
              { v: 'asking', label: 'Asking' },
              { v: 'frustrated', label: 'Frustrated' },
              { v: 'other', label: 'Other' },
            ]}
          />
          <Select
            label="Source"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { v: '', label: 'Any' },
              { v: 'reddit', label: 'Reddit' },
              { v: 'hn', label: 'HN' },
            ]}
          />
          <label className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
            <span className="text-muted-foreground">Min score</span>
            <input
              type="number"
              min={0}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value) || 0)}
              className="w-14 bg-transparent text-right outline-none"
            />
          </label>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/10 p-12 text-center text-sm text-muted-foreground">
            No leads yet for this filter. Hit <span className="font-medium text-foreground">New scan</span> to find some.
          </div>
        ) : (
          <ul className="space-y-2">
            {leads.map((lead) => (
              <li key={lead.fingerprint} className="rounded-lg border bg-card/30 p-4 transition hover:bg-card/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-muted/40 px-1.5 py-0.5 font-mono">
                        {SOURCE_LABEL[lead.source] ?? lead.source}/{(lead.extra as { subreddit?: string } | null)?.subreddit ?? lead.source}
                      </span>
                      <span className="text-muted-foreground">u/{lead.author}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{tsRelative(lead.posted_at)}</span>
                      <span className={`ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${INTENT_TONE[lead.score_intent] ?? INTENT_TONE.other}`}>
                        {lead.score_intent}
                        <span className="font-mono">{lead.score_total}</span>
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed">{lead.text}</p>
                    {lead.matched_terms.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lead.matched_terms.map((t) => (
                          <span key={t} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {(lead.company_name || lead.company_domain || lead.contact_email) && (
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {lead.company_name && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {lead.company_name}
                          </span>
                        )}
                        {lead.company_domain && <span>{lead.company_domain}</span>}
                        {lead.contact_email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {lead.contact_email}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 rounded-lg border bg-background/50 p-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-xs space-y-1">
                    <span className="text-muted-foreground">Contact name</span>
                    <input
                      value={lead.contact_name ?? ''}
                      onChange={(e) => updateLeadDraft(lead.fingerprint, { contact_name: e.target.value || null })}
                      placeholder="Jane Doe"
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs space-y-1">
                    <span className="text-muted-foreground">Contact email</span>
                    <input
                      value={lead.contact_email ?? ''}
                      onChange={(e) => updateLeadDraft(lead.fingerprint, { contact_email: e.target.value || null })}
                      placeholder="jane@company.com"
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs space-y-1">
                    <span className="text-muted-foreground">Company</span>
                    <input
                      value={lead.company_name ?? ''}
                      onChange={(e) => updateLeadDraft(lead.fingerprint, { company_name: e.target.value || null })}
                      placeholder="Company name"
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs space-y-1">
                    <span className="text-muted-foreground">Domain</span>
                    <input
                      value={lead.company_domain ?? ''}
                      onChange={(e) => updateLeadDraft(lead.fingerprint, { company_domain: e.target.value || null })}
                      placeholder="company.com"
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs space-y-1">
                    <span className="text-muted-foreground">Lead status</span>
                    <select
                      value={lead.status}
                      onChange={(e) => updateLeadDraft(lead.fingerprint, { status: e.target.value })}
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.v} value={option.v}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs space-y-1">
                    <span className="text-muted-foreground">Contact status</span>
                    <select
                      value={lead.contact_status}
                      onChange={(e) => updateLeadDraft(lead.fingerprint, { contact_status: e.target.value })}
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm"
                    >
                      {CONTACT_STATUS_OPTIONS.map((option) => (
                        <option key={option.v} value={option.v}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs space-y-1 xl:col-span-2">
                    <span className="text-muted-foreground">Operator note</span>
                    <textarea
                      value={lead.operator_note ?? ''}
                      onChange={(e) => updateLeadDraft(lead.fingerprint, { operator_note: e.target.value || null })}
                      placeholder="What matters here, who to contact, next step..."
                      rows={2}
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={lead.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-muted/40"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                  {lead.status === 'new' && (
                    <>
                      <button
                        onClick={() => withBusy(lead.fingerprint, () => api.engageLead(lead.fingerprint))}
                        disabled={busyFp === lead.fingerprint}
                        className="inline-flex items-center gap-1 rounded-md border bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" /> Engaged
                      </button>
                      <button
                        onClick={() => withBusy(lead.fingerprint, () => api.dismissLead(lead.fingerprint))}
                        disabled={busyFp === lead.fingerprint}
                        className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" /> Dismiss
                      </button>
                    </>
                  )}
                  {(lead.status === 'new' || lead.status === 'engaged') && (
                    <button
                      onClick={() => withBusy(lead.fingerprint, () => api.contactLead(lead.fingerprint))}
                      disabled={busyFp === lead.fingerprint}
                      className="inline-flex items-center gap-1 rounded-md border bg-sky-500/10 px-2.5 py-1 text-xs text-sky-500 hover:bg-sky-500/20 disabled:opacity-50"
                    >
                      <MessageSquare className="h-3 w-3" /> Contacted
                    </button>
                  )}
                  {(lead.status === 'engaged' || lead.status === 'contacted') && (
                    <>
                      <button
                        onClick={() => withBusy(lead.fingerprint, () => api.qualifyLead(lead.fingerprint))}
                        disabled={busyFp === lead.fingerprint}
                        className="inline-flex items-center gap-1 rounded-md border bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" /> Qualify
                      </button>
                      <button
                        onClick={() => withBusy(lead.fingerprint, () => api.disqualifyLead(lead.fingerprint))}
                        disabled={busyFp === lead.fingerprint}
                        className="inline-flex items-center gap-1 rounded-md border bg-amber-500/10 px-2.5 py-1 text-xs text-amber-500 hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" /> Disqualify
                      </button>
                    </>
                  )}
                  {(lead.status === 'dismissed' || lead.status === 'disqualified') && (
                    <button
                      onClick={() => withBusy(lead.fingerprint, () => api.restoreLead(lead.fingerprint))}
                      disabled={busyFp === lead.fingerprint}
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" /> Restore
                    </button>
                  )}
                  {lead.status !== 'new' && (
                    <span className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
                      <MessageSquare className="h-3 w-3" /> {lead.status}
                    </span>
                  )}
                  <button
                    onClick={() => saveLead(lead.fingerprint)}
                    disabled={busyFp === lead.fingerprint}
                    className="inline-flex items-center gap-1 rounded-md border bg-primary/10 px-2.5 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
                  >
                    {busyFp === lead.fingerprint ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </button>
                  <div className="ml-auto" />
                  <button
                    onClick={() => withBusy(lead.fingerprint, () => api.deleteLead(lead.fingerprint))}
                    disabled={busyFp === lead.fingerprint}
                    className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  )
}

function KPI({ label, value, tone, icon }: { label: string; value: number; tone: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

function Tabs<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: Array<{ v: T; label: string }> }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border bg-background">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-2.5 py-1 transition ${value === o.v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/40'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Select({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: Array<{ v: string; label: string }> }) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v} className="bg-background">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
