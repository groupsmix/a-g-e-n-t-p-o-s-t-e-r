'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  FileCode2, GitPullRequest, GitBranch, Eye, Edit3, Trash2, Loader2, Plus,
  FolderOpen, ChevronRight, Bot, Play, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, Zap, StopCircle, Search, RefreshCw, GitCommit,
  AlertCircle,
} from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { API_BASE, getToken } from '@/lib/rpc'

// ── Tab definitions ────────────────────────────────────────────────────────

const TABS = [
  { id: 'code-agent',   label: 'Code Agent' },
  { id: 'multi-agent',  label: 'Multi-Agent' },
  { id: 'repo-intel',   label: 'Repo Intel' },
] as const

type TabId = typeof TABS[number]['id']

// ── Shared API helper ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const token = getToken()
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-access-token': token } : {}), ...(init?.headers ?? {}) },
  })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return r.json()
}

// ── Main page ──────────────────────────────────────────────────────────────

function EngineeringInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const tab          = (searchParams.get('tab') ?? 'code-agent') as TabId

  function setTab(t: TabId) {
    router.push(`/engineering?tab=${t}`, { scroll: false })
  }

  return (
    <>
      <PageHeader
        title="Engineering"
        subtitle="Code agent file browser, multi-agent session orchestration, and repo intelligence."
      />
      <PageBody className="space-y-6">
        <div className="flex gap-1 border-b border-border -mb-6">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="pt-2">
          {tab === 'code-agent'  && <CodeAgentPanel />}
          {tab === 'multi-agent' && <MultiAgentPanel />}
          {tab === 'repo-intel'  && <RepoIntelPanel />}
        </div>
      </PageBody>
    </>
  )
}

export default function EngineeringPage() {
  return (
    <Suspense>
      <EngineeringInner />
    </Suspense>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CODE AGENT PANEL
// ═══════════════════════════════════════════════════════════════════════════

interface RepoProject { id: string; owner: string; name: string; branch: string; url: string }
interface FileEntry { name: string; path: string; type: 'file' | 'dir'; size?: number; sha?: string }
interface PullRequest { number: number; title: string; state: string; html_url: string; user: { login: string }; created_at: string }

function CodeAgentPanel() {
  const [repos,         setRepos]         = useState<RepoProject[]>([])
  const [selectedRepo,  setSelectedRepo]  = useState<RepoProject | null>(null)
  const [currentPath,   setCurrentPath]   = useState('')
  const [files,         setFiles]         = useState<FileEntry[]>([])
  const [fileContent,   setFileContent]   = useState<string | null>(null)
  const [viewingFile,   setViewingFile]   = useState<FileEntry | null>(null)
  const [prs,           setPrs]           = useState<PullRequest[]>([])
  const [loading,       setLoading]       = useState(true)
  const [loadingFiles,  setLoadingFiles]  = useState(false)
  const [tab,           setTab]           = useState<'files' | 'prs'>('files')

  useEffect(() => {
    apiFetch('/api/code-agent/repos').then(d => {
      setRepos(d.repos || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function selectRepo(repo: RepoProject) {
    setSelectedRepo(repo)
    setCurrentPath('')
    setViewingFile(null)
    setFileContent(null)
    setLoadingFiles(true)
    try {
      const [fr, pr] = await Promise.all([
        apiFetch(`/api/code-agent/repos/${repo.id}/files?path=`),
        apiFetch(`/api/code-agent/repos/${repo.id}/prs`),
      ])
      setFiles(fr.files || [])
      setPrs(pr.prs || [])
    } finally { setLoadingFiles(false) }
  }

  async function browseDir(entry: FileEntry) {
    if (!selectedRepo) return
    setViewingFile(null); setFileContent(null)
    setLoadingFiles(true)
    try {
      const d = await apiFetch(`/api/code-agent/repos/${selectedRepo.id}/files?path=${encodeURIComponent(entry.path)}`)
      setFiles(d.files || [])
      setCurrentPath(entry.path)
    } finally { setLoadingFiles(false) }
  }

  async function viewFile(entry: FileEntry) {
    if (!selectedRepo) return
    setViewingFile(entry); setFileContent(null)
    const d = await apiFetch(`/api/code-agent/repos/${selectedRepo.id}/file?path=${encodeURIComponent(entry.path)}`)
    setFileContent(d.content ?? '')
  }

  async function navigateUp() {
    if (!selectedRepo || !currentPath) return
    const parts = currentPath.split('/').filter(Boolean)
    const parentPath = parts.slice(0, -1).join('/')
    setLoadingFiles(true); setViewingFile(null); setFileContent(null)
    try {
      const d = await apiFetch(`/api/code-agent/repos/${selectedRepo.id}/files?path=${encodeURIComponent(parentPath)}`)
      setFiles(d.files || [])
      setCurrentPath(parentPath)
    } finally { setLoadingFiles(false) }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading repos…</div>

  return (
    <div className="space-y-6">
      {repos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
          <FileCode2 className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No repos connected. Add one via Repo Intel.</p>
        </div>
      ) : !selectedRepo ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Select a repo</h2>
          {repos.map(r => (
            <button key={r.id} onClick={() => selectRepo(r)}
              className="w-full flex items-center justify-between rounded-xl border border-border bg-card/50 p-4 hover:bg-muted/40 transition-colors text-left">
              <div>
                <div className="font-medium">{r.owner}/{r.name}</div>
                <div className="text-xs text-muted-foreground">branch: {r.branch}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedRepo(null)} className="text-xs text-muted-foreground hover:text-foreground underline">← Repos</button>
            <span className="font-medium">{selectedRepo.owner}/{selectedRepo.name}</span>
            <div className="ml-auto flex gap-2">
              {['files', 'prs'].map(t => (
                <button key={t} onClick={() => setTab(t as any)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`}>
                  {t === 'files' ? 'Files' : `PRs (${prs.length})`}
                </button>
              ))}
            </div>
          </div>

          {tab === 'files' && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="font-mono">{currentPath || '/'}</span>
                {currentPath && <button onClick={navigateUp} className="ml-auto hover:text-foreground">↑ Up</button>}
              </div>
              {loadingFiles ? (
                <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : viewingFile ? (
                <div>
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
                    <button onClick={() => { setViewingFile(null); setFileContent(null) }} className="text-muted-foreground hover:text-foreground">← Back</button>
                    <span className="font-mono text-muted-foreground">{viewingFile.path}</span>
                  </div>
                  <pre className="p-4 text-xs font-mono overflow-auto max-h-[60vh] whitespace-pre-wrap">
                    {fileContent ?? <span className="text-muted-foreground italic">Loading…</span>}
                  </pre>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {files.map(f => (
                    <button key={f.path} onClick={() => f.type === 'dir' ? browseDir(f) : viewFile(f)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left">
                      {f.type === 'dir' ? <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <FileCode2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className="text-sm font-mono flex-1 truncate">{f.name}</span>
                      {f.type === 'dir' && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  ))}
                  {files.length === 0 && <div className="px-4 py-6 text-sm text-muted-foreground text-center">Empty directory</div>}
                </div>
              )}
            </div>
          )}

          {tab === 'prs' && (
            <div className="space-y-2">
              {prs.length === 0 ? (
                <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">No open pull requests.</div>
              ) : prs.map(pr => (
                <a key={pr.number} href={pr.html_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-xl border border-border bg-card/50 p-4 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium truncate">#{pr.number} {pr.title}</div>
                    <div className="text-xs text-muted-foreground">{pr.user.login} · {new Date(pr.created_at).toLocaleDateString()}</div>
                  </div>
                  <span className={`ml-3 rounded-full px-2 py-0.5 text-xs shrink-0 ${pr.state === 'open' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>{pr.state}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-AGENT PANEL
// ═══════════════════════════════════════════════════════════════════════════

interface AgentSession {
  id: string; repo_id: string | null; session_type: string; task_prompt: string
  status: string; current_step: number; started_at: string; completed_at: string | null
}
interface SessionStep {
  id: string; session_id: string; step_index: number; agent_type: string
  status: string; output: string | null; started_at: string | null; completed_at: string | null
}
interface MARepoProject { id: string; owner: string; name: string }

const SESSION_TYPES = [
  { value: 'full', label: 'Full Pipeline', desc: 'Planner → Code → Docs → Tests → Review → Browser' },
  { value: 'code-only', label: 'Code Only', desc: 'Planner → Code → Review' },
  { value: 'docs', label: 'Docs Only', desc: 'Planner → Docs' },
  { value: 'browser', label: 'Browser Task', desc: 'Browser agent for web research / UI testing' },
]

function MultiAgentPanel() {
  const [sessions,     setSessions]     = useState<AgentSession[]>([])
  const [repos,        setRepos]        = useState<MARepoProject[]>([])
  const [loading,      setLoading]      = useState(true)
  const [creating,     setCreating]     = useState(false)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [steps,        setSteps]        = useState<Record<string, SessionStep[]>>({})
  const [form,         setForm]         = useState({ repo_id: '', session_type: 'full', task_prompt: '' })
  const pollerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = async () => {
    try {
      const [sd, rd] = await Promise.all([
        apiFetch('/api/multi-agent/sessions'),
        apiFetch('/api/code-agent/repos'),
      ])
      setSessions(sd.sessions || [])
      setRepos(rd.repos || [])
    } finally { setLoading(false) }
  }

  useEffect(() => {
    refresh()
    pollerRef.current = setInterval(refresh, 5000)
    return () => { if (pollerRef.current) clearInterval(pollerRef.current) }
  }, [])

  async function loadSteps(sessionId: string) {
    const d = await apiFetch(`/api/multi-agent/sessions/${sessionId}/steps`)
    setSteps(prev => ({ ...prev, [sessionId]: d.steps || [] }))
  }

  async function createSession() {
    if (!form.task_prompt.trim()) return
    setCreating(true)
    try {
      await apiFetch('/api/multi-agent/sessions', { method: 'POST', body: JSON.stringify(form) })
      setForm(f => ({ ...f, task_prompt: '' }))
      await refresh()
    } finally { setCreating(false) }
  }

  async function stopSession(id: string) {
    await apiFetch(`/api/multi-agent/sessions/${id}/stop`, { method: 'POST' })
    await refresh()
  }

  const STATUS_ICON: Record<string, React.ReactNode> = {
    pending:   <Clock className="h-4 w-4 text-muted-foreground" />,
    running:   <Loader2 className="h-4 w-4 animate-spin text-primary" />,
    completed: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    failed:    <XCircle className="h-4 w-4 text-destructive" />,
    stopped:   <StopCircle className="h-4 w-4 text-muted-foreground" />,
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…</div>

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
        <h2 className="text-sm font-semibold">New Session</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Repo (optional)</label>
            <select value={form.repo_id} onChange={e => setForm(f => ({ ...f, repo_id: e.target.value }))}
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">No repo</option>
              {repos.map(r => <option key={r.id} value={r.id}>{r.owner}/{r.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Pipeline type</label>
            <select value={form.session_type} onChange={e => setForm(f => ({ ...f, session_type: e.target.value }))}
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">{SESSION_TYPES.find(t => t.value === form.session_type)?.desc}</p>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Task prompt</label>
          <textarea value={form.task_prompt} onChange={e => setForm(f => ({ ...f, task_prompt: e.target.value }))} rows={3} placeholder="Describe what the agent team should build or research…"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
        </div>
        <button onClick={createSession} disabled={creating || !form.task_prompt.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start session
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Sessions ({sessions.length})</h2>
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">No sessions yet. Start one above.</div>
        ) : sessions.map(s => {
          const expanded = expandedId === s.id
          return (
            <div key={s.id} className="rounded-xl border border-border bg-card/50">
              <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={async () => {
                if (expanded) { setExpandedId(null) } else { setExpandedId(s.id); await loadSteps(s.id) }
              }}>
                {STATUS_ICON[s.status] ?? <Zap className="h-4 w-4" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.task_prompt}</div>
                  <div className="text-xs text-muted-foreground">{s.session_type} · step {s.current_step} · {new Date(s.started_at).toLocaleString()}</div>
                </div>
                {s.status === 'running' && (
                  <button onClick={e => { e.stopPropagation(); stopSession(s.id) }}
                    className="text-xs text-destructive hover:opacity-70 border border-destructive/30 rounded px-2 py-1">Stop</button>
                )}
                {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>
              {expanded && steps[s.id] && (
                <div className="border-t border-border divide-y divide-border">
                  {steps[s.id].map(step => (
                    <div key={step.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        {STATUS_ICON[step.status] ?? <Zap className="h-3.5 w-3.5" />}
                        <span className="font-medium">{step.agent_type}</span>
                        <span className="text-muted-foreground ml-auto">{step.status}</span>
                      </div>
                      {step.output && (
                        <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{step.output}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// REPO INTEL PANEL
// ═══════════════════════════════════════════════════════════════════════════

interface RepoIntelProject {
  id: string; url: string; owner: string; name: string; branch: string
  status: string; last_analyzed_at: string | null
  project_map: Record<string, unknown> | null; created_at: string
}
interface Operation {
  id: string; repo_id: string; op_type: string; summary: string | null; created_at: string
}

function RepoIntelPanel() {
  const [repos,    setRepos]    = useState<RepoIntelProject[]>([])
  const [ops,      setOps]      = useState<Operation[]>([])
  const [loading,  setLoading]  = useState(true)
  const [addUrl,   setAddUrl]   = useState('')
  const [addBranch, setAddBranch] = useState('main')
  const [adding,   setAdding]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [analyzing, setAnalyzing] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const [rd, od] = await Promise.all([
        apiFetch('/api/repo-intel/repos'),
        apiFetch('/api/repo-intel/ops'),
      ])
      setRepos(rd.repos || [])
      setOps(od.ops || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function addRepo() {
    if (!addUrl.trim()) return
    setAdding(true)
    try {
      await apiFetch('/api/repo-intel/repos', { method: 'POST', body: JSON.stringify({ url: addUrl, branch: addBranch }) })
      setAddUrl(''); setAddBranch('main')
      await refresh()
    } finally { setAdding(false) }
  }

  async function analyzeRepo(id: string) {
    setAnalyzing(id)
    try { await apiFetch(`/api/repo-intel/repos/${id}/analyze`, { method: 'POST' }); await refresh() }
    finally { setAnalyzing(null) }
  }

  async function deleteRepo(id: string) {
    if (!confirm('Remove this repo?')) return
    await apiFetch(`/api/repo-intel/repos/${id}`, { method: 'DELETE' })
    await refresh()
  }

  const filtered = repos.filter(r => `${r.owner}/${r.name}`.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading repos…</div>

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <h2 className="text-sm font-semibold">Add Repo</h2>
        <div className="flex gap-2">
          <input type="text" value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="https://github.com/owner/repo"
            className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          <input type="text" value={addBranch} onChange={e => setAddBranch(e.target.value)} placeholder="branch"
            className="w-28 rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          <button onClick={addRepo} disabled={adding || !addUrl.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Repos ({repos.length})</h2>
          <div className="ml-auto flex items-center gap-2 border border-border rounded-md px-2 py-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…"
              className="bg-transparent text-sm focus:outline-none w-32" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
            {repos.length === 0 ? 'No repos added yet.' : 'No repos match your search.'}
          </div>
        ) : filtered.map(r => (
          <div key={r.id} className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{r.owner}/{r.name}</span>
                  <span className="text-xs text-muted-foreground font-normal">({r.branch})</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 ${r.status === 'analyzed' ? 'bg-emerald-500/15 text-emerald-500' : r.status === 'analyzing' ? 'bg-amber-500/15 text-amber-500' : 'bg-muted'}`}>{r.status}</span>
                  {r.last_analyzed_at && <span>Last: {new Date(r.last_analyzed_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => analyzeRepo(r.id)} disabled={analyzing === r.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50 transition-colors">
                  {analyzing === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Analyze
                </button>
                <button onClick={() => deleteRepo(r.id)} className="rounded-md border border-border px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors">
                  Remove
                </button>
              </div>
            </div>
            {r.project_map && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <GitCommit className="h-3 w-3" /> Project map
                </summary>
                <pre className="mt-2 rounded bg-muted/50 p-2 text-[11px] font-mono overflow-auto max-h-40 whitespace-pre-wrap">
                  {JSON.stringify(r.project_map, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {ops.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Recent operations</h2>
          <div className="space-y-1">
            {ops.slice(0, 10).map(op => (
              <div key={op.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{op.op_type}</span>
                  {op.summary && <span className="text-muted-foreground ml-2">{op.summary}</span>}
                </div>
                <span className="shrink-0 text-muted-foreground">{new Date(op.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
