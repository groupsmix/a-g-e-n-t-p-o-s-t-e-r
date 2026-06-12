'use client'

import { useEffect, useState } from 'react'
import {
  Brain, BookOpenText, Bell, Sparkles, Target, Search, AlertCircle,
  CheckCircle2, XCircle, Slash, Edit2, Check, X, Loader2
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/shell/AppShell'
import { api, API_BASE, getToken } from '@/lib/api'
import { timeAgo } from '@/lib/utils'

interface MemoryItem {
  id: string
  type: 'identity' | 'preference' | 'project' | 'event' | 'fact'
  content: string
  tags: string[]
  source: string
  importance: number
  createdAt: string
  updatedAt: string
}

interface JournalEntry {
  id: string
  taskId: string
  agentId: string
  summary: string
  outcome: 'success' | 'failed' | 'partial' | 'cancelled'
  learnings: string[]
  followUps: string[]
  consolidated: boolean
  createdAt: string
}

interface Signal {
  key: string
  title: string
  detail: string
  severity: 'info' | 'notice' | 'warn' | 'urgent'
  score: number
  observedAt: string
  kind: string
  suggestion?: {
    taskType: string
    reason: string
  }
}

interface BrainSummary {
  memories: {
    total: number
    byType: Record<string, number>
  }
  journal: {
    last7d: number
    unconsolidated: number
  }
  signals: {
    total: number
    urgent: number
  }
  persona: {
    name: string
    emoji: string
    tagline: string
  }
  now: {
    scope: string
    content: string
    expiresInMs: number
    expiresAt: string
    updatedAt: string
  } | null
}

const FILTERS: Array<{ id: 'all' | MemoryItem['type']; label: string }> = [
  { id: 'all', label: 'all' },
  { id: 'identity', label: 'identity' },
  { id: 'preference', label: 'preferences' },
  { id: 'project', label: 'projects' },
  { id: 'fact', label: 'facts' },
  { id: 'event', label: 'events' },
]

const SEVERITY_BADGE: Record<Signal['severity'], string> = {
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  notice: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  urgent: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const OUTCOME_ICON: Record<JournalEntry['outcome'], JSX.Element> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  failed: <XCircle className="h-4 w-4 text-rose-500" />,
  partial: <AlertCircle className="h-4 w-4 text-amber-500" />,
  cancelled: <Slash className="h-4 w-4 text-zinc-500" />,
}

export default function BrainPage() {
  const [summary, setSummary] = useState<BrainSummary | null>(null)
  const [persona, setPersona] = useState<any>(null)
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  
  const [memoryFilter, setMemoryFilter] = useState<string>('all')
  const [memoryQuery, setMemoryQuery] = useState('')
  
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingMemories, setLoadingMemories] = useState(true)
  const [loadingJournal, setLoadingJournal] = useState(true)
  const [loadingSignals, setLoadingSignals] = useState(true)
  
  // NOW Editing state
  const [isEditingNow, setIsEditingNow] = useState(false)
  const [nowValue, setNowValue] = useState('')
  const [savingNow, setSavingNow] = useState(false)

  // Fetch summary & persona & signals
  useEffect(() => {
    fetchSummary()
    fetchPersona()
    fetchSignals()
  }, [])

  // Fetch memories whenever filter or search query changes
  useEffect(() => {
    fetchMemories()
  }, [memoryFilter, memoryQuery])

  // Fetch journal
  useEffect(() => {
    fetchJournal()
  }, [])

  const fetchSummary = async () => {
    setLoadingSummary(true)
    try {
      const res = await api.getBrainSummary()
      setSummary(res.summary)
      if (res.summary.now) {
        setNowValue(res.summary.now.content)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingSummary(false)
    }
  }

  const fetchPersona = async () => {
    try {
      const res = await api.getBrainSummary()
      const token = getToken()
      const pRes = await fetch(`${API_BASE}/api/brain/persona`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (pRes.ok) {
        const pData = (await pRes.json()) as any
        setPersona(pData.persona)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchSignals = async () => {
    setLoadingSignals(true)
    try {
      const token = getToken()
      const sRes = await fetch(`${API_BASE}/api/brain/signals?limit=10`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (sRes.ok) {
        const sData = (await sRes.json()) as any
        setSignals(sData.signals)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingSignals(false)
    }
  }

  const fetchMemories = async () => {
    setLoadingMemories(true)
    try {
      const type = memoryFilter === 'all' ? undefined : memoryFilter
      const res = await api.getMemories(memoryQuery, type)
      setMemories(res.memories)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingMemories(false)
    }
  }

  const fetchJournal = async () => {
    setLoadingJournal(true)
    try {
      const res = await api.getJournal()
      setJournal(res.journal)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingJournal(false)
    }
  }

  const handleSaveNow = async () => {
    setSavingNow(true)
    try {
      // 24 hour default expiry
      await api.updateNow(nowValue, 24 * 3600 * 1000)
      setIsEditingNow(false)
      fetchSummary()
    } catch (err) {
      console.error(err)
    } finally {
      setSavingNow(false)
    }
  }

  const nowExpiresHours = summary?.now
    ? Math.max(0, Math.round(summary.now.expiresInMs / 3_600_000))
    : null

  return (
    <div className="flex-1">
      <PageHeader
        title="Brain Cockpit"
        subtitle="Manage long-term agent memories, journal records, persona details, and proactivity signals."
      />

      <PageBody className="max-w-6xl mx-auto space-y-6">
        {/* Top rollups */}
        {loadingSummary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card/40" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Memories count */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between h-24">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5"><Brain className="h-3.5 w-3.5" /> Memories</span>
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px]">{summary.memories.total}</span>
              </div>
              <div className="text-xl font-bold mt-2 tabular-nums">{summary.memories.total}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {Object.entries(summary.memories.byType)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(' · ')}
              </div>
            </div>

            {/* Journal Rollup */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between h-24">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5"><BookOpenText className="h-3.5 w-3.5" /> Journal (7d)</span>
                <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full text-[10px]">{summary.journal.last7d}</span>
              </div>
              <div className="text-xl font-bold mt-2 tabular-nums">{summary.journal.last7d}</div>
              <div className="text-[10px] text-muted-foreground">
                {summary.journal.unconsolidated} unconsolidated logs pending
              </div>
            </div>

            {/* Signals Rollup */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between h-24">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> Signals</span>
                {summary.signals.urgent > 0 && (
                  <span className="bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full text-[10px] animate-pulse">
                    {summary.signals.urgent} urgent
                  </span>
                )}
              </div>
              <div className="text-xl font-bold mt-2 tabular-nums">{summary.signals.total}</div>
              <div className="text-[10px] text-muted-foreground">
                {summary.signals.urgent > 0 ? `${summary.signals.urgent} needs urgent attention` : 'All systems operating normally'}
              </div>
            </div>

            {/* NOW Scratchpad Status */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between h-24">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> NOW Focus</span>
                {nowExpiresHours !== null && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                    nowExpiresHours <= 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {nowExpiresHours <= 0 ? 'Expired' : `${nowExpiresHours}h left`}
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold truncate mt-2">
                {summary.now?.content || 'No current focus target'}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Anchors agent proactivity rules
              </div>
            </div>
          </div>
        ) : null}

        {/* Main Grid: Left = Signals, Memories, Journal | Right = NOW focus + Persona */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            
            {/* Proactivity signals */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-5 py-4 flex items-center justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  Proactivity Signals
                </h2>
              </div>
              <div className="p-5 space-y-3">
                {loadingSignals ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/30" />
                    ))}
                  </div>
                ) : signals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">All clear. Proactivity engine has no active notifications.</p>
                ) : (
                  signals.map((s) => (
                    <div key={s.key} className="p-3 border border-border rounded-lg bg-card/40 hover:bg-card/85 transition-colors flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="text-sm font-medium text-foreground">{s.title}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[9px] uppercase border ${SEVERITY_BADGE[s.severity]}`}>
                            {s.severity}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {(s.score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      {s.detail && <p className="text-xs text-muted-foreground mt-0.5">{s.detail}</p>}
                      {s.suggestion && (
                        <div className="mt-1.5 p-2 bg-primary/5 rounded border border-primary/10 text-xs">
                          <span className="font-semibold text-primary uppercase">Trigger: </span>
                          Run <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">{s.suggestion.taskType}</code> — {s.suggestion.reason}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground text-right mt-1">
                        observed {timeAgo(s.observedAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Memory explorer */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-5 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  Memory Explorer
                </h2>
                <div className="relative w-full sm:w-64">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <input
                    type="search"
                    value={memoryQuery}
                    onChange={(e) => setMemoryQuery(e.target.value)}
                    placeholder="Search memories..."
                    className="w-full pl-9 pr-4 py-1.5 bg-muted/40 border border-border rounded-lg text-xs outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
              <div className="px-5 py-2.5 border-b border-border bg-muted/10 flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setMemoryFilter(f.id)}
                    className={`px-3 py-1 rounded-full text-[10px] uppercase font-semibold border transition-all ${
                      memoryFilter === f.id
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/75'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="p-5 space-y-3 max-h-[500px] overflow-y-auto">
                {loadingMemories ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-20 animate-pulse rounded-lg bg-muted/30" />
                    ))}
                  </div>
                ) : memories.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No memories found matching the selection.</p>
                ) : (
                  memories.map((m) => (
                    <div key={m.id} className="p-3 border border-border rounded-lg bg-card/30 hover:bg-card/75 transition-all flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded font-semibold uppercase">
                            {m.type}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground font-mono">imp: {(m.importance * 100).toFixed(0)}%</span>
                        </div>
                        <span className="text-muted-foreground">{timeAgo(m.updatedAt)}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground font-normal">{m.content}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground mt-1">
                        <div className="flex flex-wrap gap-1">
                          {m.tags.map((t) => (
                            <span key={t} className="px-1.5 py-0.5 bg-muted rounded">#{t}</span>
                          ))}
                        </div>
                        {m.source && <span className="text-[9px] italic opacity-85">from {m.source}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Journal timeline */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <BookOpenText className="h-4 w-4 text-muted-foreground" />
                  Timeline logs
                </h2>
              </div>
              <div className="p-5">
                {loadingJournal ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/30" />
                    ))}
                  </div>
                ) : journal.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Journal logs are currently empty.</p>
                ) : (
                  <ol className="relative border-l border-border pl-5 ml-2.5 space-y-5">
                    {journal.map((j) => (
                      <li key={j.id} className="relative">
                        <span className="absolute -left-[27px] top-0 flex h-4 w-4 items-center justify-center rounded-full bg-background">
                          {OUTCOME_ICON[j.outcome]}
                        </span>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{j.agentId}</span>
                            <span>·</span>
                            <span>{timeAgo(j.createdAt)}</span>
                            {j.consolidated && (
                              <span className="px-1.5 py-0.2 border border-emerald-500/20 text-emerald-400 bg-emerald-500/5 rounded text-[8px] uppercase">
                                consolidated
                              </span>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed text-foreground">{j.summary}</p>
                          
                          {j.learnings.length > 0 && (
                            <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5 mt-1">
                              {j.learnings.map((l, idx) => (
                                <li key={idx}>{l}</li>
                              ))}
                            </ul>
                          )}
                          
                          {j.followUps.length > 0 && (
                            <div className="mt-1.5 p-1.5 bg-muted/40 rounded border border-border text-[10px] text-muted-foreground">
                              <span className="font-semibold uppercase text-zinc-400">Follow-ups:</span>{' '}
                              {j.followUps.join(' · ')}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

          </div>

          {/* Right sidebar details */}
          <div className="space-y-6">
            
            {/* NOW Scratchpad Card */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-sm">NOW scratchpad</h3>
                </div>
                {!isEditingNow && (
                  <button
                    onClick={() => setIsEditingNow(true)}
                    className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-normal">
                Set a short-term prompt anchor. Every agent run fetches this string and adapts its planning to target it.
              </p>

              {isEditingNow ? (
                <div className="space-y-2">
                  <textarea
                    value={nowValue}
                    onChange={(e) => setNowValue(e.target.value)}
                    rows={4}
                    placeholder="Enter current target/goal for the agents..."
                    className="w-full p-2 bg-muted/40 border border-border rounded-lg text-xs outline-none focus:border-primary/50 resize-none font-normal"
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setIsEditingNow(false)}
                      disabled={savingNow}
                      className="px-2.5 py-1 text-xs border border-border rounded-md hover:bg-muted text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={handleSaveNow}
                      disabled={savingNow}
                      className="px-2.5 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-1"
                    >
                      {savingNow ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 border border-border rounded-lg bg-muted/20 space-y-2">
                  <p className="text-xs leading-relaxed text-foreground font-medium">
                    {summary?.now?.content || 'No active prompt anchor focus configured.'}
                  </p>
                  {summary?.now && (
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-1 border-t border-border/50">
                      <span>scope: {summary.now.scope}</span>
                      <span>set {timeAgo(summary.now.expiresAt)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Persona SOUL Card */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Persona (SOUL.md)</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-normal">
                The core personality identity, tone instructions, and guidelines all running agents inherit.
              </p>

              {persona ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-xl shrink-0">
                      {persona.emoji || '🤖'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground truncate">{persona.name || 'NEXUS Agent'}</div>
                      <div className="text-[10px] text-muted-foreground truncate leading-snug">{persona.tagline || 'AI Assistant'}</div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Core Soul instructions</span>
                    <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-2.5 text-[10px] font-mono text-zinc-300 leading-normal">
                      {persona.soul || 'No soul config found.'}
                    </pre>
                  </div>

                  {persona.traits && persona.traits.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Traits</span>
                      <div className="flex flex-wrap gap-1">
                        {persona.traits.map((t: string) => (
                          <span key={t} className="px-1.5 py-0.5 bg-muted border border-border text-[9px] rounded-full text-zinc-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-40 animate-pulse rounded-lg bg-muted/20" />
              )}
            </div>

          </div>
        </div>
      </PageBody>
    </div>
  )
}
