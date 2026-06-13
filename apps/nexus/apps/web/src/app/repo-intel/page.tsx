'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/shell/AppShell'
import { GitBranch, Plus, Trash2, Search, RefreshCw, FileCode2, GitCommit, ChevronRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { API_BASE, getToken } from '@/lib/rpc'

interface RepoProject {
  id: string
  url: string
  owner: string
  name: string
  branch: string
  status: string
  last_analyzed_at: string | null
  project_map: Record<string, unknown> | null
  created_at: string
}

interface Operation {
  id: string
  repo_id: string
  op_type: string
  summary: string | null
  created_at: string
}

async function apiFetch(path: string, init?: RequestInit) {
  const token = getToken()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-access-token': token } : {}), ...(init?.headers ?? {}) },
  })
}

export default function RepoIntelPage() {
  const [repos, setRepos] = useState<RepoProject[]>([])
  const [ops, setOps] = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)
  const [addUrl, setAddUrl] = useState('')
  const [addBranch, setAddBranch] = useState('main')
  const [adding, setAdding] = useState(false)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<RepoProject | null>(null)
  const [error, setError] = useState('')

  const fetchData = async () => {
    try {
      const [r1, r2] = await Promise.all([
        apiFetch('/api/repo-intel/projects').then(r => r.json()) as Promise<{ projects: RepoProject[] }>,
        apiFetch('/api/repo-intel/operations').then(r => r.json()) as Promise<{ operations: Operation[] }>,
      ])
      setRepos(r1.projects ?? [])
      setOps(r2.operations ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const addRepo = async () => {
    if (!addUrl.trim()) return
    setAdding(true)
    setError('')
    try {
      const res = await apiFetch('/api/repo-intel/projects', {
        method: 'POST',
        body: JSON.stringify({ url: addUrl.trim(), branch: addBranch }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Failed to add repo')
      } else {
        setAddUrl('')
        setAddBranch('main')
        await fetchData()
      }
    } catch { setError('Network error') }
    setAdding(false)
  }

  const analyzeRepo = async (id: string) => {
    setAnalyzing(id)
    try {
      await apiFetch(`/api/repo-intel/projects/${id}/analyze`, { method: 'POST' })
      await fetchData()
      const updated = repos.find(r => r.id === id)
      if (updated) setSelectedRepo(updated)
    } catch { /* ignore */ }
    setAnalyzing(null)
  }

  const deleteRepo = async (id: string) => {
    if (!confirm('Remove this repo from tracking?')) return
    await apiFetch(`/api/repo-intel/projects/${id}`, { method: 'DELETE' })
    setSelectedRepo(null)
    await fetchData()
  }

  const map = selectedRepo?.project_map as Record<string, unknown> | null

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={<span className="flex items-center gap-2"><GitBranch className="w-5 h-5 text-primary" /> Repository Intelligence</span>}
        subtitle="Connect GitHub repos — index codebases, understand architecture, and build project maps"
      />

      {/* Add Repo */}
      <div className="mt-6 bg-card border border-border rounded-lg p-5">
        <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Track a Repository</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="https://github.com/owner/repo"
            value={addUrl}
            onChange={e => setAddUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRepo()}
          />
          <input
            className="w-28 bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="branch"
            value={addBranch}
            onChange={e => setAddBranch(e.target.value)}
          />
          <button
            onClick={addRepo}
            disabled={adding || !addUrl.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Track Repo
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Repo List */}
        <div className="lg:col-span-1">
          <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Tracked Repos ({repos.length})</h2>
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : repos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border rounded-lg">No repos tracked yet</div>
          ) : (
            <div className="space-y-2">
              {repos.map(repo => (
                <button
                  key={repo.id}
                  onClick={() => setSelectedRepo(repo)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedRepo?.id === repo.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{repo.owner}/{repo.name}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <GitBranch className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{repo.branch}</span>
                    {repo.last_analyzed_at
                      ? <span className="ml-auto"><CheckCircle2 className="w-3 h-3 text-green-500" /></span>
                      : <span className="ml-auto"><AlertCircle className="w-3 h-3 text-yellow-500" /></span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-2">
          {!selectedRepo ? (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-lg text-muted-foreground">
              <Search className="w-8 h-8 mb-2" />
              <p className="text-sm">Select a repo to view its project map</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold">{selectedRepo.owner}/{selectedRepo.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedRepo.url}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => analyzeRepo(selectedRepo.id)}
                    disabled={analyzing === selectedRepo.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {analyzing === selectedRepo.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Analyze
                  </button>
                  <button onClick={() => deleteRepo(selectedRepo.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded border border-border hover:border-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {!map ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <FileCode2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>Click Analyze to build the project map</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Stack */}
                  {Array.isArray(map.frameworks) && (map.frameworks as string[]).length > 0 ? (
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Stack</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {(map.frameworks as string[]).map(f => (
                          <span key={f} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">{f}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Metadata */}
                  {map.metadata != null ? (
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Repository</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(map.metadata as Record<string, unknown>)
                          .filter(([, v]) => v != null && v !== '')
                          .map(([k, v]) => (
                            <div key={k} className="bg-muted/40 rounded p-2">
                              <p className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</p>
                              <p className="text-xs font-medium mt-0.5 truncate">{Array.isArray(v) ? (v as string[]).join(', ') || '—' : String(v)}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}

                  {/* File count */}
                  {Array.isArray(map.files) ? (
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Files Indexed</h4>
                      <p className="text-sm"><span className="font-semibold text-primary">{(map.files as unknown[]).length}</span> files in project tree</p>
                      <div className="mt-2 max-h-40 overflow-y-auto space-y-0.5">
                        {(map.files as Array<{path: string}>).slice(0, 30).map(f => (
                          <p key={f.path} className="text-xs text-muted-foreground font-mono">{f.path}</p>
                        ))}
                        {(map.files as unknown[]).length > 30 && <p className="text-xs text-muted-foreground">…and {(map.files as unknown[]).length - 30} more</p>}
                      </div>
                    </div>
                  ) : null}

                  {selectedRepo.last_analyzed_at && (
                    <p className="text-xs text-muted-foreground">Last analyzed: {new Date(selectedRepo.last_analyzed_at).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Operations Log */}
      {ops.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Recent Operations</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Summary</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ops.slice(0, 20).map(op => (
                  <tr key={op.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2"><span className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{op.op_type}</span></td>
                    <td className="px-4 py-2 text-muted-foreground truncate max-w-xs">{op.summary ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(op.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
