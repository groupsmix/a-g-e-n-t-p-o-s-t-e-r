'use client'

import { useState, useEffect, useRef } from 'react'
import { PageHeader } from '@/components/shell/AppShell'
import { ShieldCheck, ShieldAlert, ShieldX, Play, Loader2, ChevronDown, ChevronUp, AlertTriangle, Info, CheckCircle2, Clock, Trash2, Filter, X } from 'lucide-react'
import { API_BASE, getToken } from '@/lib/rpc'

interface RepoProject { id: string; owner: string; name: string; branch: string }
interface SecurityScan {
  id: string; repo_id: string; branch: string; status: string
  total_files: number; total_findings: number
  critical_count: number; high_count: number; medium_count: number; low_count: number; info_count: number
  verdict: string | null; summary: string | null
  started_at: string; completed_at: string | null; error: string | null
}
interface Finding {
  id: string; scan_id: string; severity: string; category: string
  file_path: string | null; line_number: number | null
  title: string; description: string | null; snippet: string | null; suggestion: string | null
  status: string; source: string
}

async function apiFetch(path: string, init?: RequestInit) {
  const token = getToken()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-access-token': token } : {}), ...(init?.headers ?? {}) },
  })
}

const SEV_COLOR: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  high:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  medium:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  low:      'bg-blue-500/15 text-blue-400 border-blue-500/30',
  info:     'bg-muted text-muted-foreground border-border',
}

const SEV_ICON: Record<string, React.ReactNode> = {
  critical: <ShieldX className="w-4 h-4 text-red-400" />,
  high:     <ShieldAlert className="w-4 h-4 text-orange-400" />,
  medium:   <AlertTriangle className="w-4 h-4 text-yellow-400" />,
  low:      <Info className="w-4 h-4 text-blue-400" />,
  info:     <Info className="w-4 h-4 text-muted-foreground" />,
}

const VERDICT_STYLE: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
  fail: { bg: 'border-red-500/40 bg-red-500/10', icon: <ShieldX className="w-5 h-5 text-red-400" />, label: 'FAIL' },
  warn: { bg: 'border-yellow-500/40 bg-yellow-500/10', icon: <ShieldAlert className="w-5 h-5 text-yellow-400" />, label: 'WARN' },
  pass: { bg: 'border-green-500/40 bg-green-500/10', icon: <ShieldCheck className="w-5 h-5 text-green-400" />, label: 'PASS' },
}

export default function SecurityAuditPage() {
  const [repos, setRepos] = useState<RepoProject[]>([])
  const [selectedRepo, setSelectedRepo] = useState<RepoProject | null>(null)
  const [scans, setScans] = useState<SecurityScan[]>([])
  const [selectedScan, setSelectedScan] = useState<SecurityScan | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null)
  const [sevFilter, setSevFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    apiFetch('/api/repo-intel/projects').then(r => r.json()).then((d) => setRepos((d as { projects: RepoProject[] }).projects ?? []))
  }, [])

  const loadScans = async (repo: RepoProject) => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/security-audit/${repo.id}/scans`)
      const d = await res.json() as { scans: SecurityScan[] }
      setScans(d.scans ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  const loadScan = async (scan: SecurityScan) => {
    setSelectedScan(scan)
    setFindings([])
    try {
      const res = await apiFetch(`/api/security-audit/${scan.repo_id}/scans/${scan.id}`)
      const d = await res.json() as { scan: SecurityScan; findings: Finding[] }
      setSelectedScan(d.scan)
      setFindings(d.findings ?? [])
    } catch { /* ignore */ }
  }

  // Poll running scan
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (selectedScan?.status === 'running') {
      pollRef.current = setInterval(async () => {
        const res = await apiFetch(`/api/security-audit/${selectedScan.repo_id}/scans/${selectedScan.id}`)
        const d = await res.json() as { scan: SecurityScan; findings: Finding[] }
        setSelectedScan(d.scan)
        setFindings(d.findings ?? [])
        if (d.scan.status !== 'running') {
          clearInterval(pollRef.current!)
          if (selectedRepo) loadScans(selectedRepo)
        }
      }, 4000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [selectedScan?.id, selectedScan?.status])

  const startScan = async () => {
    if (!selectedRepo) return
    setScanning(true)
    try {
      const res = await apiFetch(`/api/security-audit/${selectedRepo.id}/scans`, { method: 'POST' })
      const d = await res.json() as SecurityScan
      if (d.id) {
        await loadScans(selectedRepo)
        setSelectedScan(d)
        setFindings([])
      }
    } catch { /* ignore */ }
    setScanning(false)
  }

  const updateFindingStatus = async (findingId: string, status: string) => {
    await apiFetch(`/api/security-audit/findings/${findingId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    setFindings(f => f.map(fi => fi.id === findingId ? { ...fi, status } : fi))
  }

  const deleteScan = async (scan: SecurityScan) => {
    if (!confirm('Delete this scan and all its findings?')) return
    await apiFetch(`/api/security-audit/${scan.repo_id}/scans/${scan.id}`, { method: 'DELETE' })
    if (selectedScan?.id === scan.id) { setSelectedScan(null); setFindings([]) }
    if (selectedRepo) loadScans(selectedRepo)
  }

  const filteredFindings = findings.filter(f => {
    if (sevFilter && f.severity !== sevFilter) return false
    if (catFilter && f.category !== catFilter) return false
    if (statusFilter && f.status !== statusFilter) return false
    return true
  })

  const SevBadge = ({ s }: { s: string }) => (
    <span className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase tracking-wide ${SEV_COLOR[s] ?? SEV_COLOR.info}`}>{s}</span>
  )

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={<span className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Security Audit Agent</span>}
        subtitle="Multi-layer security scanning: secret detection, OWASP Top 10, dependency CVEs, AI code review"
      />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Repo + Scan list */}
        <div className="lg:col-span-1 space-y-5">
          {/* Repo picker */}
          <div>
            <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Repository</h2>
            {repos.length === 0
              ? <p className="text-sm text-muted-foreground">Track a repo in Repository Intelligence first.</p>
              : <div className="space-y-1">
                {repos.map(r => (
                  <button key={r.id}
                    onClick={() => { setSelectedRepo(r); loadScans(r); setSelectedScan(null); setFindings([]) }}
                    className={`w-full text-left p-2.5 rounded border text-sm transition-colors ${selectedRepo?.id === r.id ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-muted/50'}`}>
                    <p className="truncate">{r.owner}/{r.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.branch}</p>
                  </button>
                ))}
              </div>
            }
          </div>

          {/* Scan button */}
          {selectedRepo && (
            <button onClick={startScan} disabled={scanning}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded font-medium text-sm hover:bg-primary/90 disabled:opacity-50">
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run Security Scan
            </button>
          )}

          {/* Scan history */}
          {scans.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Scan History</h2>
              <div className="space-y-1.5">
                {scans.map(scan => (
                  <div key={scan.id} className={`rounded border p-2.5 cursor-pointer transition-colors ${selectedScan?.id === scan.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
                    onClick={() => loadScan(scan)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {scan.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                        {scan.status === 'done' && scan.verdict && VERDICT_STYLE[scan.verdict]?.icon}
                        {scan.status === 'failed' && <ShieldX className="w-3 h-3 text-destructive" />}
                        {scan.status === 'pending' && <Clock className="w-3 h-3 text-muted-foreground" />}
                        <span className="text-xs font-medium capitalize">{scan.verdict ?? scan.status}</span>
                      </div>
                      <button onClick={e => { e.stopPropagation(); deleteScan(scan) }} className="p-0.5 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {scan.status === 'done' && (
                      <div className="flex gap-2 mt-1.5 text-xs">
                        {scan.critical_count > 0 && <span className="text-red-400 font-semibold">{scan.critical_count}C</span>}
                        {scan.high_count > 0 && <span className="text-orange-400 font-semibold">{scan.high_count}H</span>}
                        {scan.medium_count > 0 && <span className="text-yellow-400">{scan.medium_count}M</span>}
                        {scan.low_count > 0 && <span className="text-blue-400">{scan.low_count}L</span>}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(scan.started_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Scan detail */}
        <div className="lg:col-span-3">
          {!selectedScan ? (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-lg text-muted-foreground">
              <ShieldCheck className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Select a repo and run a scan to see results</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary card */}
              <div className={`border rounded-lg p-5 ${selectedScan.verdict ? VERDICT_STYLE[selectedScan.verdict]?.bg : 'border-border bg-card'}`}>
                {selectedScan.status === 'running' ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <div>
                      <p className="font-semibold">Scanning repository…</p>
                      <p className="text-sm text-muted-foreground mt-0.5">Running pattern analysis, dependency audit, and AI review</p>
                    </div>
                  </div>
                ) : selectedScan.status === 'failed' ? (
                  <div className="flex items-center gap-3 text-destructive">
                    <ShieldX className="w-5 h-5" />
                    <div>
                      <p className="font-semibold">Scan failed</p>
                      <p className="text-sm mt-0.5">{selectedScan.error}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {selectedScan.verdict && VERDICT_STYLE[selectedScan.verdict]?.icon}
                        <div>
                          <p className="font-semibold text-lg">{selectedScan.verdict ? VERDICT_STYLE[selectedScan.verdict]?.label : '—'}</p>
                          <p className="text-sm text-muted-foreground">{selectedScan.total_files} files scanned · {selectedScan.total_findings} findings</p>
                        </div>
                      </div>
                      <div className="flex gap-3 text-sm font-semibold">
                        {selectedScan.critical_count > 0 && <span className="text-red-400">{selectedScan.critical_count} Critical</span>}
                        {selectedScan.high_count > 0 && <span className="text-orange-400">{selectedScan.high_count} High</span>}
                        {selectedScan.medium_count > 0 && <span className="text-yellow-400">{selectedScan.medium_count} Medium</span>}
                        {selectedScan.low_count > 0 && <span className="text-blue-400">{selectedScan.low_count} Low</span>}
                        {selectedScan.info_count > 0 && <span className="text-muted-foreground">{selectedScan.info_count} Info</span>}
                      </div>
                    </div>
                    {selectedScan.summary && (
                      <p className="text-sm text-foreground/80 mt-3 leading-relaxed">{selectedScan.summary}</p>
                    )}
                    {selectedScan.completed_at && (
                      <p className="text-xs text-muted-foreground mt-2">Completed {new Date(selectedScan.completed_at).toLocaleString()}</p>
                    )}
                  </>
                )}
              </div>

              {/* Filters */}
              {findings.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  {(['critical','high','medium','low','info'] as const).map(s => (
                    <button key={s} onClick={() => setSevFilter(sevFilter === s ? '' : s)}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors ${sevFilter === s ? SEV_COLOR[s] : 'border-border text-muted-foreground hover:border-primary hover:text-primary'}`}>
                      {s}
                    </button>
                  ))}
                  {(catFilter || sevFilter || statusFilter) && (
                    <button onClick={() => { setSevFilter(''); setCatFilter(''); setStatusFilter('') }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors">
                      <X className="w-3 h-3" /> Clear
                    </button>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{filteredFindings.length} of {findings.length}</span>
                </div>
              )}

              {/* Findings list */}
              <div className="space-y-2">
                {filteredFindings.map(finding => (
                  <div key={finding.id} className={`border rounded-lg overflow-hidden transition-colors ${finding.status === 'false_positive' ? 'opacity-40' : ''} ${finding.status === 'resolved' ? 'opacity-60' : ''}`}>
                    <button onClick={() => setExpandedFinding(expandedFinding === finding.id ? null : finding.id)}
                      className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-muted/20 transition-colors">
                      <div className="flex-shrink-0">{SEV_ICON[finding.severity] ?? SEV_ICON.info}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SevBadge s={finding.severity} />
                          <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground capitalize">{finding.category}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-muted/60 rounded text-muted-foreground">{finding.source}</span>
                          <span className="font-medium text-sm">{finding.title}</span>
                        </div>
                        {finding.file_path && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                            {finding.file_path}{finding.line_number ? `:${finding.line_number}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {finding.status !== 'open' && (
                          <span className="text-xs text-muted-foreground capitalize">{finding.status.replace('_', ' ')}</span>
                        )}
                        {expandedFinding === finding.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {expandedFinding === finding.id && (
                      <div className="border-t border-border p-4 bg-background space-y-3">
                        {finding.description && <p className="text-sm text-foreground/80">{finding.description}</p>}
                        {finding.snippet && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase">Affected Code</p>
                            <pre className="text-xs font-mono bg-muted/40 rounded p-3 overflow-x-auto whitespace-pre-wrap">{finding.snippet}</pre>
                          </div>
                        )}
                        {finding.suggestion && (
                          <div className="flex gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-green-400 mb-0.5">Recommended Fix</p>
                              <p className="text-sm">{finding.suggestion}</p>
                            </div>
                          </div>
                        )}
                        {/* Status actions */}
                        <div className="flex gap-2 pt-1">
                          {finding.status !== 'resolved' && (
                            <button onClick={() => updateFindingStatus(finding.id, 'resolved')}
                              className="text-xs px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded hover:bg-green-500/20 transition-colors">
                              Mark Resolved
                            </button>
                          )}
                          {finding.status !== 'acknowledged' && (
                            <button onClick={() => updateFindingStatus(finding.id, 'acknowledged')}
                              className="text-xs px-3 py-1.5 bg-muted text-muted-foreground border border-border rounded hover:bg-muted/80 transition-colors">
                              Acknowledge
                            </button>
                          )}
                          {finding.status !== 'false_positive' && (
                            <button onClick={() => updateFindingStatus(finding.id, 'false_positive')}
                              className="text-xs px-3 py-1.5 text-muted-foreground border border-border rounded hover:bg-muted/50 transition-colors">
                              False Positive
                            </button>
                          )}
                          {finding.status !== 'open' && (
                            <button onClick={() => updateFindingStatus(finding.id, 'open')}
                              className="text-xs px-3 py-1.5 text-muted-foreground border border-border rounded hover:bg-muted/50 transition-colors">
                              Reopen
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {filteredFindings.length === 0 && findings.length === 0 && selectedScan.status === 'done' && (
                  <div className="text-center py-12 border border-dashed border-green-500/30 rounded-lg">
                    <ShieldCheck className="w-8 h-8 text-green-400 mx-auto mb-2" />
                    <p className="font-semibold text-green-400">No findings detected</p>
                    <p className="text-sm text-muted-foreground mt-1">Codebase passed all pattern, dependency, and AI checks</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
