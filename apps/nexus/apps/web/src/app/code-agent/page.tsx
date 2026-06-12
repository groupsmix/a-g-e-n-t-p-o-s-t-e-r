'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/shell/AppShell'
import { FileCode2, GitPullRequest, GitBranch, Eye, Edit3, Trash2, Loader2, Plus, FolderOpen, ChevronRight } from 'lucide-react'
import { API_BASE, getToken } from '@/lib/rpc'

interface RepoProject { id: string; owner: string; name: string; branch: string; url: string }
interface FileEntry { name: string; path: string; type: 'file' | 'dir'; size?: number; sha?: string }
interface PullRequest { number: number; title: string; state: string; html_url: string; user: { login: string }; created_at: string }

async function apiFetch(path: string, init?: RequestInit) {
  const token = getToken()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-access-token': token } : {}), ...(init?.headers ?? {}) },
  })
}

export default function CodeAgentPage() {
  const [repos, setRepos] = useState<RepoProject[]>([])
  const [selectedRepo, setSelectedRepo] = useState<RepoProject | null>(null)
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [fileContent, setFileContent] = useState<{ path: string; content: string; sha: string } | null>(null)
  const [pulls, setPulls] = useState<PullRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'files' | 'pulls'>('files')
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [commitMsg, setCommitMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [newPR, setNewPR] = useState({ title: '', head: '', body: '' })
  const [creatingPR, setCreatingPR] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    apiFetch('/api/repo-intel/projects').then(r => r.json()).then((d: { projects: RepoProject[] }) => setRepos(d.projects ?? []))
  }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadFiles = async (repo: RepoProject, path = '') => {
    setLoading(true)
    setFileContent(null)
    setCurrentPath(path)
    try {
      const res = await apiFetch(`/api/code-ops/${repo.id}/files?path=${encodeURIComponent(path)}`)
      const data = await res.json() as FileEntry[] | { files: FileEntry[] }
      setFiles(Array.isArray(data) ? data : (data as { files: FileEntry[] }).files ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  const loadPulls = async (repo: RepoProject) => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/code-ops/${repo.id}/pulls`)
      const data = await res.json() as { pulls: PullRequest[] }
      setPulls(data.pulls ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  const selectRepo = (repo: RepoProject) => {
    setSelectedRepo(repo)
    setCurrentPath('')
    setFileContent(null)
    loadFiles(repo, '')
  }

  const openFile = async (file: FileEntry) => {
    if (file.type === 'dir') { loadFiles(selectedRepo!, file.path); return }
    setLoading(true)
    try {
      const res = await apiFetch(`/api/code-ops/${selectedRepo!.id}/files/${file.path}`)
      const data = await res.json() as { path: string; content: string; sha: string }
      setFileContent(data)
      setEditContent(data.content)
      setEditMode(false)
    } catch { /* ignore */ }
    setLoading(false)
  }

  const saveFile = async () => {
    if (!fileContent || !selectedRepo) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/code-ops/${selectedRepo.id}/files/${fileContent.path}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editContent, message: commitMsg || `chore: update ${fileContent.path}`, sha: fileContent.sha }),
      })
      if (res.ok) { showToast('File saved and committed'); setEditMode(false); setFileContent({ ...fileContent, content: editContent }) }
      else { const d = await res.json() as { error?: string }; showToast(d.error ?? 'Save failed') }
    } catch { showToast('Network error') }
    setSaving(false)
  }

  const createPR = async () => {
    if (!selectedRepo || !newPR.title || !newPR.head) return
    setCreatingPR(true)
    try {
      const res = await apiFetch(`/api/code-ops/${selectedRepo.id}/pulls`, {
        method: 'POST',
        body: JSON.stringify({ title: newPR.title, head: newPR.head, body: newPR.body, base: selectedRepo.branch }),
      })
      const data = await res.json() as { pr_url?: string; error?: string }
      if (data.pr_url) { showToast(`PR created: #${data.pr_url}`); setNewPR({ title: '', head: '', body: '' }); loadPulls(selectedRepo) }
      else showToast(data.error ?? 'PR creation failed')
    } catch { showToast('Network error') }
    setCreatingPR(false)
  }

  const pathParts = currentPath ? currentPath.split('/') : []

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={<span className="flex items-center gap-2"><FileCode2 className="w-5 h-5 text-primary" /> Code Agent</span>}
        subtitle="Read, edit, and commit files — create branches and pull requests via GitHub"
      />

      {toast && (
        <div className="fixed bottom-4 right-4 bg-card border border-border rounded-lg px-4 py-3 shadow-lg text-sm z-50">{toast}</div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Repo picker */}
        <div className="lg:col-span-1">
          <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Repos</h2>
          {repos.length === 0
            ? <p className="text-sm text-muted-foreground">Track a repo in Repository Intelligence first.</p>
            : <div className="space-y-1">
              {repos.map(r => (
                <button key={r.id} onClick={() => selectRepo(r)}
                  className={`w-full text-left p-2.5 rounded border text-sm transition-colors ${selectedRepo?.id === r.id ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-muted/50'}`}>
                  <p className="truncate">{r.owner}/{r.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><GitBranch className="w-3 h-3" />{r.branch}</p>
                </button>
              ))}
            </div>
          }
        </div>

        {/* Main panel */}
        <div className="lg:col-span-3">
          {!selectedRepo ? (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-lg text-muted-foreground">
              <FolderOpen className="w-8 h-8 mb-2" />
              <p className="text-sm">Select a repository to start</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-border">
                {(['files', 'pulls'] as const).map(t => (
                  <button key={t} onClick={() => { setTab(t); if (t === 'pulls') loadPulls(selectedRepo) }}
                    className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {t === 'files' ? <><FileCode2 className="w-3.5 h-3.5 inline mr-1.5" />Files</> : <><GitPullRequest className="w-3.5 h-3.5 inline mr-1.5" />Pull Requests</>}
                  </button>
                ))}
              </div>

              {tab === 'files' && (
                <div>
                  {/* Breadcrumb */}
                  <div className="flex items-center gap-1 px-4 py-2 border-b border-border text-sm bg-muted/20">
                    <button onClick={() => loadFiles(selectedRepo, '')} className="text-primary hover:underline">{selectedRepo.name}</button>
                    {pathParts.map((p, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        <button onClick={() => loadFiles(selectedRepo, pathParts.slice(0, i + 1).join('/'))} className="text-primary hover:underline">{p}</button>
                      </span>
                    ))}
                  </div>

                  {fileContent ? (
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-mono text-muted-foreground">{fileContent.path}</p>
                        <div className="flex gap-2">
                          {editMode ? (
                            <>
                              <input className="text-xs bg-background border border-border rounded px-2 py-1 w-48" placeholder="Commit message" value={commitMsg} onChange={e => setCommitMsg(e.target.value)} />
                              <button onClick={saveFile} disabled={saving} className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50">
                                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Save & Commit
                              </button>
                              <button onClick={() => setEditMode(false)} className="px-3 py-1 border border-border rounded text-xs">Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setEditMode(true)} className="flex items-center gap-1 px-3 py-1 border border-border rounded text-xs hover:bg-muted/50">
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          )}
                          <button onClick={() => setFileContent(null)} className="px-3 py-1 border border-border rounded text-xs hover:bg-muted/50">Back</button>
                        </div>
                      </div>
                      {editMode
                        ? <textarea className="w-full h-96 font-mono text-xs bg-background border border-border rounded p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary" value={editContent} onChange={e => setEditContent(e.target.value)} />
                        : <pre className="text-xs font-mono bg-muted/30 rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap">{fileContent.content}</pre>
                      }
                    </div>
                  ) : loading ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
                  ) : (
                    <div className="divide-y divide-border">
                      {files.map(f => (
                        <button key={f.path} onClick={() => openFile(f)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 text-left transition-colors">
                          {f.type === 'dir' ? <FolderOpen className="w-4 h-4 text-yellow-400 flex-shrink-0" /> : <FileCode2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                          <span className="text-sm truncate">{f.name}</span>
                          {f.size != null && <span className="ml-auto text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)}kb</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'pulls' && (
                <div className="p-4 space-y-4">
                  {/* Create PR */}
                  <div className="border border-border rounded-lg p-4 bg-muted/20">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> Create Pull Request</h3>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input className="bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Title" value={newPR.title} onChange={e => setNewPR(p => ({ ...p, title: e.target.value }))} />
                      <input className="bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Head branch (source)" value={newPR.head} onChange={e => setNewPR(p => ({ ...p, head: e.target.value }))} />
                    </div>
                    <textarea className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Description (optional)" value={newPR.body} onChange={e => setNewPR(p => ({ ...p, body: e.target.value }))} />
                    <button onClick={createPR} disabled={creatingPR || !newPR.title || !newPR.head} className="mt-2 flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50">
                      {creatingPR ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitPullRequest className="w-4 h-4" />} Create PR → {selectedRepo.branch}
                    </button>
                  </div>

                  {/* PR list */}
                  {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    : pulls.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No open pull requests</p>
                    : pulls.map(pr => (
                      <div key={pr.number} className="flex items-start justify-between border border-border rounded-lg p-3 gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">#{pr.number} {pr.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">by {pr.user.login} · {new Date(pr.created_at).toLocaleDateString()}</p>
                        </div>
                        <a href={pr.html_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1 border border-border rounded text-xs hover:bg-muted/50 flex-shrink-0">
                          <Eye className="w-3 h-3" /> View
                        </a>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
