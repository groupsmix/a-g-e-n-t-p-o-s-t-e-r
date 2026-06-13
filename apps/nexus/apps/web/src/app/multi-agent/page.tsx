'use client'

import { useState, useEffect, useRef } from 'react'
import { PageHeader } from '@/components/shell/AppShell'
import { Bot, Play, Plus, Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Zap, StopCircle } from 'lucide-react'
import { API_BASE, getToken } from '@/lib/rpc'

interface AgentSession {
  id: string; repo_id: string | null; session_type: string; task_prompt: string
  status: string; current_step: number; started_at: string; completed_at: string | null
}
interface SessionStep {
  id: string; session_id: string; step_index: number; agent_type: string
  status: string; output: string | null; started_at: string | null; completed_at: string | null
}
interface RepoProject { id: string; owner: string; name: string }

async function apiFetch(path: string, init?: RequestInit) {
  const token = getToken()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-access-token': token } : {}), ...(init?.headers ?? {}) },
  })
}

const SESSION_TYPES = [
  { value: 'full', label: 'Full Pipeline', desc: 'Planner → Code → Docs → Tests → Review → Browser' },
  { value: 'code-only', label: 'Code Only', desc: 'Planner → Code → Review' },
  { value: 'doc-only', label: 'Docs Only', desc: 'Planner → Documentation' },
  { value: 'test-only', label: 'Tests Only', desc: 'Planner → Testing' },
  { value: 'review-only', label: 'Review Only', desc: 'Planner → Review' },
]

const AGENT_COLORS: Record<string, string> = {
  planner: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  code: 'text-green-400 bg-green-400/10 border-green-400/20',
  documentation: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  testing: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  review: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  browser: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  running: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  failed: <XCircle className="w-4 h-4 text-destructive" />,
  skipped: <Clock className="w-4 h-4 text-muted-foreground opacity-40" />,
}

export default function MultiAgentPage() {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [repos, setRepos] = useState<RepoProject[]>([])
  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null)
  const [steps, setSteps] = useState<SessionStep[]>([])
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [running, setRunning] = useState(false)
  const [form, setForm] = useState({ task_prompt: '', repo_id: '', session_type: 'full' })
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSessions = async () => {
    try {
      const res = await apiFetch('/api/multi-agent/sessions?limit=30')
      const d = await res.json() as { sessions: AgentSession[] }
      setSessions(d.sessions ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  const fetchSessionDetail = async (id: string) => {
    try {
      const res = await apiFetch(`/api/multi-agent/sessions/${id}`)
      const d = await res.json() as { session: AgentSession; steps: SessionStep[] }
      setSelectedSession(d.session)
      setSteps(d.steps ?? [])
      return d.session
    } catch { return null }
  }

  useEffect(() => {
    fetchSessions()
    apiFetch('/api/repo-intel/projects').then(r => r.json()).then((d) => setRepos((d as { projects: RepoProject[] }).projects ?? []))
  }, [])

  // Poll active session
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (selectedSession && ['planning', 'running'].includes(selectedSession.status)) {
      pollRef.current = setInterval(() => fetchSessionDetail(selectedSession.id), 3000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [selectedSession?.id, selectedSession?.status])

  const createSession = async () => {
    if (!form.task_prompt.trim()) return
    setCreating(true)
    try {
      const res = await apiFetch('/api/multi-agent/sessions', {
        method: 'POST',
        body: JSON.stringify({ task_prompt: form.task_prompt, session_type: form.session_type, repo_id: form.repo_id || undefined }),
      })
      const d = await res.json() as AgentSession & { steps?: string[] }
      if (d.id) {
        setShowForm(false)
        setForm({ task_prompt: '', repo_id: '', session_type: 'full' })
        await fetchSessions()
        await fetchSessionDetail(d.id)
      }
    } catch { /* ignore */ }
    setCreating(false)
  }

  const runNextStep = async () => {
    if (!selectedSession) return
    setRunning(true)
    try {
      await apiFetch(`/api/multi-agent/sessions/${selectedSession.id}/run`, { method: 'POST' })
      const updated = await fetchSessionDetail(selectedSession.id)
      await fetchSessions()
      // Auto-continue if still running and not done
      if (updated && !['done', 'failed', 'cancelled'].includes(updated.status)) {
        // Schedule next step automatically for non-planner agents
      }
    } catch { /* ignore */ }
    setRunning(false)
  }

  const runAll = async () => {
    if (!selectedSession) return
    setRunning(true)
    let sess = selectedSession
    while (sess && !['done', 'failed', 'cancelled'].includes(sess.status)) {
      try {
        const res = await apiFetch(`/api/multi-agent/sessions/${sess.id}/run`, { method: 'POST' })
        const d = await res.json() as { session_done?: boolean }
        const updated = await fetchSessionDetail(sess.id)
        await fetchSessions()
        if (d.session_done || !updated || ['done', 'failed', 'cancelled'].includes(updated.status)) break
        sess = updated
      } catch { break }
    }
    setRunning(false)
  }

  const cancelSession = async () => {
    if (!selectedSession) return
    await apiFetch(`/api/multi-agent/sessions/${selectedSession.id}`, { method: 'DELETE' })
    await fetchSessionDetail(selectedSession.id)
    await fetchSessions()
  }

  const statusBadge = (status: string) => {
    const cls: Record<string, string> = {
      planning: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      running: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      done: 'bg-green-500/10 text-green-400 border-green-500/20',
      failed: 'bg-red-500/10 text-red-400 border-red-500/20',
      cancelled: 'bg-muted text-muted-foreground border-border',
      needs_review: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    }
    return <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cls[status] ?? 'bg-muted text-muted-foreground border-border'}`}>{status}</span>
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={<span className="flex items-center gap-2"><Bot className="w-5 h-5 text-primary" /> Multi-Agent Coordinator</span>}
        subtitle="Planner → Code → Documentation → Testing → Review → Browser — autonomous end-to-end delivery"
        actions={
          <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New Session
          </button>
        }
      />

      {/* Create form */}
      {showForm && (
        <div className="mt-6 bg-card border border-border rounded-lg p-5">
          <h2 className="font-semibold mb-4">New Agent Session</h2>
          <div className="space-y-3">
            <textarea
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Describe the task in detail — e.g. 'Add rate limiting middleware to the Hono API, write unit tests, update the API docs, and create a PR'"
              value={form.task_prompt}
              onChange={e => setForm(f => ({ ...f, task_prompt: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Pipeline Type</label>
                <select className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.session_type} onChange={e => setForm(f => ({ ...f, session_type: e.target.value }))}>
                  {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Repository (optional)</label>
                <select className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.repo_id} onChange={e => setForm(f => ({ ...f, repo_id: e.target.value }))}>
                  <option value="">No repository</option>
                  {repos.map(r => <option key={r.id} value={r.id}>{r.owner}/{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded text-sm hover:bg-muted/50">Cancel</button>
              <button onClick={createSession} disabled={creating || !form.task_prompt.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />} Create Session
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Session list */}
        <div className="lg:col-span-1">
          <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Sessions</h2>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            : sessions.length === 0 ? <div className="text-center py-10 border border-dashed border-border rounded-lg text-muted-foreground text-sm">No sessions yet</div>
            : <div className="space-y-2">
              {sessions.map(s => (
                <button key={s.id} onClick={() => fetchSessionDetail(s.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedSession?.id === s.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'}`}>
                  <div className="flex items-center justify-between mb-1">
                    {statusBadge(s.status)}
                    <span className="text-xs text-muted-foreground">{new Date(s.started_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm line-clamp-2 mt-1">{s.task_prompt}</p>
                  <p className="text-xs text-muted-foreground mt-1 capitalize">{s.session_type.replace('-', ' ')}</p>
                </button>
              ))}
            </div>
          }
        </div>

        {/* Session detail */}
        <div className="lg:col-span-2">
          {!selectedSession ? (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-lg text-muted-foreground">
              <Bot className="w-8 h-8 mb-2" />
              <p className="text-sm">Select a session or create a new one</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Session header */}
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">{statusBadge(selectedSession.status)}<span className="text-xs text-muted-foreground capitalize">{selectedSession.session_type.replace('-', ' ')}</span></div>
                    <p className="text-sm">{selectedSession.task_prompt}</p>
                    <p className="text-xs text-muted-foreground mt-1">Step {selectedSession.current_step} of {steps.length} · Started {new Date(selectedSession.started_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!['done', 'failed', 'cancelled'].includes(selectedSession.status) && (
                      <>
                        <button onClick={runAll} disabled={running}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50">
                          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} Run All
                        </button>
                        <button onClick={runNextStep} disabled={running}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-xs hover:bg-muted/50 disabled:opacity-50">
                          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Next
                        </button>
                        <button onClick={cancelSession} className="p-1.5 border border-border rounded text-muted-foreground hover:text-destructive hover:border-destructive transition-colors">
                          <StopCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Step progress bar */}
                {steps.length > 0 && (
                  <div className="mt-4 flex gap-1.5">
                    {steps.map(step => (
                      <div key={step.id} className="flex-1 flex flex-col items-center gap-1">
                        <div className={`w-full h-1.5 rounded-full ${step.status === 'done' ? 'bg-green-500' : step.status === 'running' ? 'bg-primary animate-pulse' : step.status === 'failed' ? 'bg-destructive' : 'bg-muted'}`} />
                        <span className="text-xs text-muted-foreground capitalize truncate w-full text-center">{step.agent_type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Steps */}
              {steps.map(step => (
                <div key={step.id} className={`border rounded-lg overflow-hidden ${AGENT_COLORS[step.agent_type]?.includes('text') ? 'border-current/20' : 'border-border'}`}>
                  <button onClick={() => setExpandedStep(expandedStep === step.step_index ? null : step.step_index)}
                    className={`w-full flex items-center justify-between p-4 text-left hover:bg-muted/20 transition-colors`}>
                    <div className="flex items-center gap-3">
                      {STATUS_ICON[step.status] ?? STATUS_ICON.pending}
                      <div>
                        <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded border ${AGENT_COLORS[step.agent_type] ?? 'bg-muted text-muted-foreground border-border'}`}>
                          {step.agent_type} agent
                        </span>
                        {step.started_at && <span className="ml-2 text-xs text-muted-foreground">{new Date(step.started_at).toLocaleTimeString()}</span>}
                      </div>
                    </div>
                    {expandedStep === step.step_index ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {expandedStep === step.step_index && step.output && (
                    <div className="border-t border-border p-4 bg-background">
                      <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80 max-h-96 overflow-y-auto">{step.output}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
