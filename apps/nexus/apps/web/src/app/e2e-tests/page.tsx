'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { PageHeader } from '@/components/shell/AppShell'
import {
  FlaskConical, Play, Plus, Trash2, Loader2, CheckCircle2, XCircle,
  Clock, ChevronDown, ChevronUp, Globe2, Brain, MousePointerClick,
  Camera, Keyboard, Eye, Zap, StopCircle, RefreshCw, Tag, Edit3, Save, X
} from 'lucide-react'
import { API_BASE, getToken } from '@/lib/rpc'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Suite {
  id: string; name: string; description: string | null; goal: string
  start_url: string | null; max_steps: number; enabled: number
  last_run_at: string | null; last_verdict: string | null
}
interface Run {
  id: string; suite_id: string; status: string; total_steps: number
  answer: string | null; error: string | null; total_ms: number | null
  started_at: string; completed_at: string | null
}
interface Step {
  id: string; step_index: number; event_type: string; thought: string | null
  action_type: string | null; page_title: string | null; page_url: string | null
  message: string | null; screenshot_url: string | null; error: string | null
}
interface AgentEvent {
  type: string; step: number; goal?: string; thought?: string
  action?: { type: string; url?: string; selector?: string; value?: string }
  pageTitle?: string; pageUrl?: string; screenshotUrl?: string
  screenshotDataUrl?: string; message?: string; answer?: string; error?: string; totalMs?: number
}

function apiFetch(path: string, init?: RequestInit) {
  const token = getToken()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-access-token': token } : {}), ...(init?.headers ?? {}) },
  })
}

// ── Verdict badge ─────────────────────────────────────────────────────────────
const VERDICT: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
  pass:      { cls: 'bg-green-500/10 text-green-400 border-green-500/30',   icon: <CheckCircle2 className="w-3 h-3" />, label: 'PASS' },
  fail:      { cls: 'bg-red-500/10 text-red-400 border-red-500/30',         icon: <XCircle className="w-3 h-3" />,      label: 'FAIL' },
  error:     { cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30',icon: <XCircle className="w-3 h-3" />,      label: 'ERROR' },
  running:   { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30',      icon: <Loader2 className="w-3 h-3 animate-spin" />, label: 'RUNNING' },
  cancelled: { cls: 'bg-muted text-muted-foreground border-border',         icon: <StopCircle className="w-3 h-3" />,   label: 'CANCELLED' },
}
function VBadge({ v }: { v: string | null }) {
  const d = v ? (VERDICT[v] ?? VERDICT.error) : null
  if (!d) return null
  return <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-semibold ${d.cls}`}>{d.icon}{d.label}</span>
}

// ── Event type → icon ─────────────────────────────────────────────────────────
const EVENT_ICON: Record<string, React.ReactNode> = {
  observation: <Eye className="w-3.5 h-3.5 text-blue-400" />,
  thinking:    <Brain className="w-3.5 h-3.5 text-purple-400" />,
  action:      <MousePointerClick className="w-3.5 h-3.5 text-green-400" />,
  frame:       <Camera className="w-3.5 h-3.5 text-muted-foreground" />,
  done:        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
  error:       <XCircle className="w-3.5 h-3.5 text-red-400" />,
  started:     <Play className="w-3.5 h-3.5 text-primary" />,
  navigate:    <Globe2 className="w-3.5 h-3.5 text-blue-400" />,
  click:       <MousePointerClick className="w-3.5 h-3.5 text-yellow-400" />,
  type:        <Keyboard className="w-3.5 h-3.5 text-orange-400" />,
  screenshot:  <Camera className="w-3.5 h-3.5 text-muted-foreground" />,
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite form
// ══════════════════════════════════════════════════════════════════════════════
function SuiteForm({ onSave, onCancel, initial }: {
  onSave: (data: Partial<Suite>) => Promise<void>
  onCancel: () => void
  initial?: Suite
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [goal, setGoal] = useState(initial?.goal ?? '')
  const [startUrl, setStartUrl] = useState(initial?.start_url ?? '')
  const [desc, setDesc] = useState(initial?.description ?? '')
  const [maxSteps, setMaxSteps] = useState(initial?.max_steps ?? 15)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !goal.trim()) return
    setSaving(true)
    await onSave({ name: name.trim(), goal: goal.trim(), start_url: startUrl.trim() || undefined, description: desc.trim() || undefined, max_steps: maxSteps })
    setSaving(false)
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-3">
      <h3 className="font-semibold text-sm">{initial ? 'Edit Test Suite' : 'New Test Suite'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Name *</label>
          <input className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" value={name} onChange={e => setName(e.target.value)} placeholder="Login flow" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Start URL (optional)</label>
          <input className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono" value={startUrl} onChange={e => setStartUrl(e.target.value)} placeholder="https://yoursite.com/login" />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Goal / Scenario *  <span className="text-muted-foreground/60">(plain English — the AI will figure out the steps)</span></label>
        <textarea className="w-full bg-background border border-border rounded px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-primary"
          value={goal} onChange={e => setGoal(e.target.value)}
          placeholder="Navigate to the login page, enter username 'testuser' and password 'testpass', click Sign In, and verify the dashboard loads successfully" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Description</label>
          <input className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Max steps (1–30)</label>
          <input type="number" min={1} max={30} className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" value={maxSteps} onChange={e => setMaxSteps(Math.max(1, Math.min(30, parseInt(e.target.value) || 15)))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 border border-border rounded text-sm hover:bg-muted/50 transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving || !name.trim() || !goal.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50 hover:bg-primary/90">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Live run panel — SSE stream from /api/browser-agent/run
// ══════════════════════════════════════════════════════════════════════════════
function LiveRunPanel({ runId, suite, onFinish }: { runId: string; suite: Suite; onFinish: (verdict: string) => void }) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [done, setDone] = useState(false)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const stepCountRef = useRef(0)

  const saveStep = useCallback(async (ev: AgentEvent) => {
    await apiFetch(`/api/e2e-tests/runs/${runId}/steps`, {
      method: 'POST',
      body: JSON.stringify({
        step_index: ev.step,
        event_type: ev.type,
        thought: ev.thought ?? null,
        action_type: ev.action?.type ?? null,
        page_title: ev.pageTitle ?? null,
        page_url: ev.pageUrl ?? null,
        message: ev.message ?? null,
        screenshot_url: ev.screenshotUrl ?? (ev.screenshotDataUrl ? `data:${ev.step}` : null),
        error: ev.error ?? null,
      }),
    })
  }, [runId])

  useEffect(() => {
    const ac = new AbortController()
    abortRef.current = ac
    const token = getToken()

    const url = `${API_BASE}/api/browser-agent/run`
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-access-token': token } : {}) },
      body: JSON.stringify({ goal: suite.goal, startUrl: suite.start_url || undefined, maxSteps: suite.max_steps, liveMode: true }),
      signal: ac.signal,
    }).then(async res => {
      const reader = res.body?.getReader()
      if (!reader) return
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done: d, value } = await reader.read()
        if (d) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n\n')
        buf = lines.pop() ?? ''
        for (const chunk of lines) {
          const dataLine = chunk.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const ev: AgentEvent = JSON.parse(dataLine.slice(5))
            setEvents(prev => [...prev, ev])
            stepCountRef.current = Math.max(stepCountRef.current, ev.step)
            if (ev.screenshotUrl) setLastScreenshot(ev.screenshotUrl)
            if (ev.screenshotDataUrl) setLastScreenshot(ev.screenshotDataUrl)
            // Save non-frame events to DB
            if (ev.type !== 'frame') saveStep(ev)
            if (ev.type === 'done' || ev.type === 'error') {
              const verdict = ev.type === 'done' ? 'pass' : 'fail'
              await apiFetch(`/api/e2e-tests/runs/${runId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: verdict, answer: ev.answer ?? null, total_ms: ev.totalMs ?? null, total_steps: stepCountRef.current }),
              })
              setDone(true)
              onFinish(verdict)
            }
          } catch { /* skip bad JSON */ }
        }
      }
    }).catch(err => {
      if (err?.name !== 'AbortError') {
        setEvents(prev => [...prev, { type: 'error', step: -1, error: String(err) }])
        apiFetch(`/api/e2e-tests/runs/${runId}`, { method: 'PATCH', body: JSON.stringify({ status: 'error', error: String(err) }) })
        setDone(true)
        onFinish('error')
      }
    })

    return () => ac.abort()
  }, [runId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [events])

  const cancel = async () => {
    abortRef.current?.abort()
    await apiFetch(`/api/e2e-tests/runs/${runId}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) })
    setDone(true)
    onFinish('cancelled')
  }

  const visibleEvents = events.filter(e => e.type !== 'frame')

  return (
    <div className="space-y-4">
      {/* Live screenshot */}
      {lastScreenshot && (
        <div className="rounded-lg overflow-hidden border border-border bg-black flex items-center justify-center min-h-[200px] max-h-[420px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lastScreenshot.startsWith('data:') ? lastScreenshot : `${API_BASE}${lastScreenshot}`}
            alt="live browser" className="max-w-full max-h-[420px] object-contain" />
        </div>
      )}

      {/* Event stream */}
      <div className="border border-border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
        {visibleEvents.map((ev, i) => (
          <div key={i} className="border-b border-border last:border-0">
            <button className="w-full flex items-start gap-3 p-3 text-left hover:bg-muted/20 transition-colors"
              onClick={() => setExpandedStep(expandedStep === i ? null : i)}>
              <div className="flex-shrink-0 mt-0.5">{EVENT_ICON[ev.action?.type ?? ev.type] ?? EVENT_ICON.action}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Step {ev.step} · {ev.action?.type ?? ev.type}</span>
                  {ev.pageUrl && <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:block">{ev.pageUrl}</span>}
                </div>
                {ev.thought && <p className="text-sm mt-0.5 text-foreground/80 line-clamp-2">{ev.thought}</p>}
                {ev.message && !ev.thought && <p className="text-sm mt-0.5 text-muted-foreground line-clamp-1">{ev.message}</p>}
              </div>
              {ev.screenshotUrl && <Camera className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
              {expandedStep === i ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
            </button>
            {expandedStep === i && (
              <div className="px-4 pb-3 space-y-2">
                {ev.thought && <p className="text-sm text-foreground/80">{ev.thought}</p>}
                {ev.action && <pre className="text-xs font-mono bg-muted/30 rounded p-2 overflow-x-auto">{JSON.stringify(ev.action, null, 2)}</pre>}
                {ev.pageTitle && <p className="text-xs text-muted-foreground">Page: <span className="text-foreground">{ev.pageTitle}</span></p>}
                {ev.answer && <div className="bg-green-500/10 border border-green-500/20 rounded p-2 text-sm text-green-400">{ev.answer}</div>}
                {ev.error && <div className="bg-red-500/10 border border-red-500/20 rounded p-2 text-sm text-red-400">{ev.error}</div>}
                {ev.screenshotUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${API_BASE}${ev.screenshotUrl}`} alt={`step ${ev.step}`} className="rounded border border-border max-w-full max-h-64 object-contain" />
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {!done && (
        <button onClick={cancel} className="flex items-center gap-2 px-4 py-2 border border-destructive/40 text-destructive rounded text-sm hover:bg-destructive/10 transition-colors">
          <StopCircle className="w-4 h-4" /> Cancel Run
        </button>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Run history item
// ══════════════════════════════════════════════════════════════════════════════
function RunHistoryItem({ run, onDelete }: { run: Run; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(false)

  const expand = async () => {
    if (!expanded && steps.length === 0) {
      setLoading(true)
      const res = await apiFetch(`/api/e2e-tests/runs/${run.id}`)
      const d = await res.json() as { steps: Step[] }
      setSteps(d.steps ?? [])
      setLoading(false)
    }
    setExpanded(e => !e)
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={expand} className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/20 transition-colors">
        <VBadge v={run.status} />
        <span className="text-sm text-muted-foreground">{new Date(run.started_at).toLocaleString()}</span>
        {run.total_ms && <span className="text-xs text-muted-foreground">{(run.total_ms / 1000).toFixed(1)}s</span>}
        <span className="text-xs text-muted-foreground">{run.total_steps} steps</span>
        <button onClick={e => { e.stopPropagation(); onDelete() }} className="ml-auto p-1 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t border-border p-3 space-y-2">
          {run.answer && <div className="bg-green-500/10 border border-green-500/20 rounded p-2 text-sm text-green-400">{run.answer}</div>}
          {run.error && <div className="bg-red-500/10 border border-red-500/20 rounded p-2 text-sm text-red-400">{run.error}</div>}
          {loading ? <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div> : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {steps.map(s => (
                <div key={s.id} className="flex items-start gap-2 text-xs py-1">
                  <span className="flex-shrink-0 mt-0.5">{EVENT_ICON[s.action_type ?? s.event_type] ?? EVENT_ICON.action}</span>
                  <div className="min-w-0">
                    <span className="text-muted-foreground font-mono">{s.event_type}</span>
                    {s.thought && <p className="text-foreground/80 truncate">{s.thought}</p>}
                    {s.page_url && <p className="text-muted-foreground/60 truncate">{s.page_url}</p>}
                  </div>
                  {s.screenshot_url && !s.screenshot_url.startsWith('data:') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`${API_BASE}${s.screenshot_url}`} alt="" className="w-16 h-10 object-cover rounded border border-border flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Main page
// ══════════════════════════════════════════════════════════════════════════════
export default function E2ETestsPage() {
  const [suites, setSuites] = useState<Suite[]>([])
  const [selected, setSelected] = useState<Suite | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [activeRun, setActiveRun] = useState<{ runId: string; suite: Suite } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingSuite, setEditingSuite] = useState<Suite | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSuites = async () => {
    const res = await apiFetch('/api/e2e-tests/suites')
    const d = await res.json() as { suites: Suite[] }
    setSuites(d.suites ?? [])
    setLoading(false)
  }

  const fetchRuns = async (suiteId: string) => {
    const res = await apiFetch(`/api/e2e-tests/suites/${suiteId}/runs`)
    const d = await res.json() as { runs: Run[] }
    setRuns(d.runs ?? [])
  }

  useEffect(() => { fetchSuites() }, [])

  const selectSuite = (s: Suite) => {
    setSelected(s)
    setActiveRun(null)
    fetchRuns(s.id)
  }

  const createSuite = async (data: Partial<Suite>) => {
    await apiFetch('/api/e2e-tests/suites', { method: 'POST', body: JSON.stringify(data) })
    setShowForm(false)
    fetchSuites()
  }

  const updateSuite = async (data: Partial<Suite>) => {
    await apiFetch(`/api/e2e-tests/suites/${editingSuite!.id}`, { method: 'PUT', body: JSON.stringify(data) })
    setEditingSuite(null)
    fetchSuites()
    if (selected?.id === editingSuite!.id) {
      const res = await apiFetch(`/api/e2e-tests/suites/${editingSuite!.id}`)
      const d = await res.json() as { suite: Suite }
      setSelected(d.suite)
    }
  }

  const deleteSuite = async (id: string) => {
    if (!confirm('Delete this test suite and all its runs?')) return
    await apiFetch(`/api/e2e-tests/suites/${id}`, { method: 'DELETE' })
    if (selected?.id === id) setSelected(null)
    fetchSuites()
  }

  const startRun = async () => {
    if (!selected) return
    const res = await apiFetch(`/api/e2e-tests/suites/${selected.id}/runs`, { method: 'POST' })
    const d = await res.json() as { id: string }
    setActiveRun({ runId: d.id, suite: selected })
  }

  const onRunFinish = async (verdict: string) => {
    await fetchSuites()
    if (selected) fetchRuns(selected.id)
    setSuites(prev => prev.map(s => s.id === selected?.id ? { ...s, last_verdict: verdict } : s))
  }

  const deleteRun = async (runId: string) => {
    await apiFetch(`/api/e2e-tests/runs/${runId}`, { method: 'DELETE' })
    if (selected) fetchRuns(selected.id)
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={<span className="flex items-center gap-2"><FlaskConical className="w-5 h-5 text-primary" /> AI E2E Test Runner</span>}
        subtitle="Describe test scenarios in plain English — the AI controls a real browser and runs them end-to-end"
        actions={
          <button onClick={() => { setShowForm(true); setEditingSuite(null) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New Test Suite
          </button>
        }
      />

      {(showForm || editingSuite) && (
        <div className="mt-6">
          <SuiteForm
            onSave={editingSuite ? updateSuite : createSuite}
            onCancel={() => { setShowForm(false); setEditingSuite(null) }}
            initial={editingSuite ?? undefined}
          />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Suite list */}
        <div className="lg:col-span-1">
          <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Test Suites ({suites.length})</h2>
          {loading ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            : suites.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground text-sm">
                No test suites yet — create one to get started
              </div>
            ) : (
              <div className="space-y-2">
                {suites.map(s => (
                  <div key={s.id} onClick={() => selectSuite(s)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${selected?.id === s.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{s.name}</p>
                        {s.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{s.description}</p>}
                      </div>
                      <VBadge v={s.last_verdict} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{s.goal}</p>
                    {s.start_url && <p className="text-xs text-muted-foreground font-mono mt-1 truncate">{s.start_url}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={e => { e.stopPropagation(); setEditingSuite(s); setShowForm(false) }}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"><Edit3 className="w-3 h-3" /></button>
                      <button onClick={e => { e.stopPropagation(); deleteSuite(s.id) }}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3 h-3" /></button>
                      {s.last_run_at && <span className="text-xs text-muted-foreground ml-auto">{new Date(s.last_run_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-lg text-muted-foreground">
              <FlaskConical className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">Select a test suite to run it</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Suite header */}
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{selected.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{selected.goal}</p>
                    {selected.start_url && <p className="text-xs font-mono text-muted-foreground mt-1">{selected.start_url}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Max {selected.max_steps} steps</p>
                  </div>
                  <button onClick={startRun} disabled={!!activeRun && !['pass','fail','error','cancelled'].includes(activeRun?.runId ? '' : '')}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 flex-shrink-0">
                    <Zap className="w-4 h-4" /> Run Now
                  </button>
                </div>
              </div>

              {/* Active run */}
              {activeRun && (
                <div className="bg-card border border-primary/20 rounded-lg p-4">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" /> Live Run
                  </h4>
                  <LiveRunPanel runId={activeRun.runId} suite={activeRun.suite} onFinish={onRunFinish} />
                </div>
              )}

              {/* Run history */}
              {runs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Run History</h4>
                    <button onClick={() => fetchRuns(selected.id)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {runs.map(r => (
                      <RunHistoryItem key={r.id} run={r} onDelete={() => deleteRun(r.id)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
