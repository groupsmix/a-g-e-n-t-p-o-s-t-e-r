'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/shell/AppShell'
import { HardDrive, Database, Trash2, Loader2, RefreshCw, FolderOpen, File, ChevronRight, Download, Upload, AlertTriangle, X, Check, ChevronLeft, Search } from 'lucide-react'
import { API_BASE, getToken } from '@/lib/rpc'

async function apiFetch(path: string, init?: RequestInit) {
  const token = getToken()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(token ? { 'x-access-token': token } : {}) },
  })
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-destructive/40 rounded-xl shadow-2xl p-6 max-w-sm w-full">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 border border-border rounded text-sm hover:bg-muted/50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-destructive text-destructive-foreground rounded text-sm font-medium hover:bg-destructive/90 transition-colors">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState('')
  const [type, setType] = useState<'ok' | 'err'>('ok')
  const show = (m: string, t: 'ok' | 'err' = 'ok') => { setMsg(m); setType(t); setTimeout(() => setMsg(''), 3500) }
  const Toast = msg ? (
    <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium ${type === 'ok' ? 'bg-card border-green-500/30 text-green-400' : 'bg-card border-destructive/30 text-destructive'}`}>
      {type === 'ok' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      {msg}
    </div>
  ) : null
  return { show, Toast }
}

// ══════════════════════════════════════════════════════════════════════════════
// R2 Tab
// ══════════════════════════════════════════════════════════════════════════════
function R2Tab() {
  const [objects, setObjects] = useState<{ key: string; size: number; size_human: string; uploaded: string | null; content_type: string | null }[]>([])
  const [prefixes, setPrefixes] = useState<string[]>([])
  const [prefix, setPrefix] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<{ count: number; total_size_human: string } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ msg: string; action: () => Promise<void> } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const { show, Toast } = useToast()

  const load = useCallback(async (pfx = prefix, cur?: string) => {
    setLoading(true)
    setSelected(new Set())
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (pfx) params.set('prefix', pfx)
      if (cur) params.set('cursor', cur)
      const res = await apiFetch(`/api/storage/r2/list?${params}`)
      const d = await res.json() as { objects: typeof objects; prefixes: string[]; truncated: boolean; cursor: string | null }
      setObjects(d.objects ?? [])
      setPrefixes(d.prefixes ?? [])
      setCursor(d.truncated ? d.cursor : null)
    } catch { show('Failed to load', 'err') }
    setLoading(false)
  }, [prefix])

  const loadStats = async () => {
    try {
      const res = await apiFetch('/api/storage/r2/stats')
      const d = await res.json() as { count: number; total_size_human: string }
      setStats(d)
    } catch { /* ignore */ }
  }

  useEffect(() => { load(''); loadStats() }, [])

  const navigateTo = (pfx: string) => {
    setCursorStack([])
    setPrefix(pfx)
    load(pfx, undefined)
  }

  const goBack = () => {
    const parts = prefix.split('/').filter(Boolean)
    parts.pop()
    const parent = parts.length ? parts.join('/') + '/' : ''
    setCursorStack([])
    setPrefix(parent)
    load(parent, undefined)
  }

  const deleteOne = (key: string) => {
    setConfirm({
      msg: `Delete "${key.split('/').pop()}"? This cannot be undone.`,
      action: async () => {
        await apiFetch(`/api/storage/r2/object/${key}`, { method: 'DELETE' })
        show(`Deleted ${key.split('/').pop()}`)
        load(prefix)
        loadStats()
      },
    })
  }

  const deleteSelected = () => {
    const keys = [...selected]
    setConfirm({
      msg: `Delete ${keys.length} selected file${keys.length > 1 ? 's' : ''}? This cannot be undone.`,
      action: async () => {
        await apiFetch('/api/storage/r2/delete-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys }),
        })
        show(`Deleted ${keys.length} files`)
        load(prefix)
        loadStats()
      },
    })
  }

  const emptyBucket = () => {
    setConfirm({
      msg: `Empty the entire ASSETS bucket${prefix ? ` under "${prefix}"` : ''}? ALL files will be permanently deleted.`,
      action: async () => {
        const res = await apiFetch(`/api/storage/r2/empty${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`, { method: 'DELETE' })
        const d = await res.json() as { deleted: number }
        show(`Deleted ${d.deleted} files`)
        load(prefix)
        loadStats()
      },
    })
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const key = prefix + file.name
      await apiFetch(`/api/storage/r2/object/${key}`, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: await file.arrayBuffer(),
      })
      show(`Uploaded ${file.name}`)
      load(prefix)
      loadStats()
    } catch { show('Upload failed', 'err') }
    setUploading(false)
  }

  const toggle = (key: string) => {
    setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const filtered = search
    ? objects.filter(o => o.key.toLowerCase().includes(search.toLowerCase()))
    : objects

  const breadcrumbs = prefix.split('/').filter(Boolean)

  return (
    <div className="space-y-4">
      {Toast}
      {confirm && <ConfirmDialog message={confirm.msg} onConfirm={async () => { setConfirm(null); await confirm.action() }} onCancel={() => setConfirm(null)} />}

      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-4 p-3 bg-muted/30 border border-border rounded-lg text-sm">
          <span className="font-semibold">{stats.count} objects</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{stats.total_size_human} total</span>
          <button onClick={() => { load(prefix); loadStats() }} className="ml-auto p-1 text-muted-foreground hover:text-foreground"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm min-w-0">
          <button onClick={() => navigateTo('')} className="text-primary hover:underline font-medium">nexus-assets</button>
          {breadcrumbs.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <button onClick={() => navigateTo(breadcrumbs.slice(0, i + 1).join('/') + '/')} className="text-primary hover:underline">{part}</button>
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="bg-background border border-border rounded pl-8 pr-3 py-1.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Filter…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Upload */}
          <label className={`flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-xs hover:bg-muted/50 cursor-pointer transition-colors ${uploading ? 'opacity-50' : ''}`}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Upload
            <input type="file" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} disabled={uploading} />
          </label>

          {/* Batch delete */}
          {selected.size > 0 && (
            <button onClick={deleteSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive border border-destructive/30 rounded text-xs hover:bg-destructive/20 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete {selected.size}
            </button>
          )}

          {/* Empty bucket */}
          <button onClick={emptyBucket} className="flex items-center gap-1.5 px-3 py-1.5 border border-destructive/40 text-destructive rounded text-xs hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Empty {prefix ? 'Folder' : 'Bucket'}
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : prefixes.length === 0 && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
            <HardDrive className="w-8 h-8 mb-2 opacity-30" />
            {prefix ? 'Folder is empty' : 'Bucket is empty'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Back row */}
            {prefix && (
              <button onClick={goBack} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-sm text-muted-foreground">
                <ChevronLeft className="w-4 h-4" /> ..
              </button>
            )}
            {/* Sub-folders */}
            {prefixes.map(pfx => (
              <button key={pfx} onClick={() => navigateTo(pfx)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left">
                <FolderOpen className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <span className="text-sm truncate">{pfx.replace(prefix, '').replace(/\/$/, '')}/</span>
                <ChevronRight className="ml-auto w-4 h-4 text-muted-foreground" />
              </button>
            ))}
            {/* Files */}
            {filtered.map(obj => {
              const name = obj.key.split('/').pop() ?? obj.key
              return (
                <div key={obj.key} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors group ${selected.has(obj.key) ? 'bg-primary/5' : ''}`}>
                  <input type="checkbox" className="w-3.5 h-3.5 accent-primary flex-shrink-0" checked={selected.has(obj.key)} onChange={() => toggle(obj.key)} />
                  <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate flex-1" title={obj.key}>{name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{obj.size_human}</span>
                  {obj.content_type && <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[120px]">{obj.content_type}</span>}
                  {obj.uploaded && <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:block">{new Date(obj.uploaded).toLocaleDateString()}</span>}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a href={`${API_BASE}/api/storage/r2/object/${obj.key}`} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors" title="Download">
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => deleteOne(obj.key)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {cursor && (
        <div className="flex justify-center">
          <button onClick={() => { setCursorStack(s => [...s, cursor!]); load(prefix, cursor!) }}
            className="px-4 py-2 border border-border rounded text-sm hover:bg-muted/50 transition-colors">
            Load more
          </button>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// KV Tab
// ══════════════════════════════════════════════════════════════════════════════
function KVTab() {
  const [keys, setKeys] = useState<{ name: string; expiration: number | null }[]>([])
  const [loading, setLoading] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [stats, setStats] = useState<{ count: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [viewing, setViewing] = useState<{ key: string; value: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<{ msg: string; action: () => Promise<void> } | null>(null)
  const { show, Toast } = useToast()

  const loadKeys = useCallback(async (pfx = prefix, cur?: string) => {
    setLoading(true)
    setSelected(new Set())
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (pfx) params.set('prefix', pfx)
      if (cur) params.set('cursor', cur)
      const res = await apiFetch(`/api/storage/kv/list?${params}`)
      const d = await res.json() as { keys: typeof keys; truncated: boolean; cursor: string | null }
      setKeys(cur ? prev => [...prev, ...(d.keys ?? [])] : (d.keys ?? []))
      setCursor(d.truncated ? d.cursor : null)
    } catch { show('Failed to load', 'err') }
    setLoading(false)
  }, [prefix])

  const loadStats = async () => {
    try {
      const res = await apiFetch('/api/storage/kv/stats')
      const d = await res.json() as { count: number }
      setStats(d)
    } catch { /* ignore */ }
  }

  useEffect(() => { loadKeys(''); loadStats() }, [])

  const viewKey = async (key: string) => {
    try {
      const res = await apiFetch(`/api/storage/kv/key/${key}`)
      const d = await res.json() as { key: string; value: string }
      setViewing(d)
      setEditVal(d.value)
      setEditing(false)
    } catch { show('Failed to read key', 'err') }
  }

  const saveKey = async () => {
    if (!viewing) return
    setSaving(true)
    try {
      await apiFetch(`/api/storage/kv/key/${viewing.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: editVal }),
      })
      setViewing({ ...viewing, value: editVal })
      setEditing(false)
      show('Saved')
    } catch { show('Save failed', 'err') }
    setSaving(false)
  }

  const addKey = async () => {
    if (!newKey) return
    setAdding(true)
    try {
      await apiFetch(`/api/storage/kv/key/${newKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newVal }),
      })
      show(`Added ${newKey}`)
      setNewKey('')
      setNewVal('')
      loadKeys(prefix)
      loadStats()
    } catch { show('Failed to add key', 'err') }
    setAdding(false)
  }

  const deleteOne = (key: string) => {
    setConfirm({
      msg: `Delete KV key "${key}"?`,
      action: async () => {
        await apiFetch(`/api/storage/kv/key/${key}`, { method: 'DELETE' })
        show(`Deleted ${key}`)
        if (viewing?.key === key) setViewing(null)
        loadKeys(prefix)
        loadStats()
      },
    })
  }

  const deleteSelected = () => {
    const ks = [...selected]
    setConfirm({
      msg: `Delete ${ks.length} KV key${ks.length > 1 ? 's' : ''}?`,
      action: async () => {
        await apiFetch('/api/storage/kv/delete-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: ks }),
        })
        show(`Deleted ${ks.length} keys`)
        if (viewing && ks.includes(viewing.key)) setViewing(null)
        loadKeys(prefix)
        loadStats()
      },
    })
  }

  const emptyKV = () => {
    setConfirm({
      msg: `Delete ALL KV keys${prefix ? ` with prefix "${prefix}"` : ''}? This clears the entire CONFIG namespace${prefix ? ' prefix' : ''}.`,
      action: async () => {
        const res = await apiFetch(`/api/storage/kv/empty${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`, { method: 'DELETE' })
        const d = await res.json() as { deleted: number }
        show(`Deleted ${d.deleted} keys`)
        setViewing(null)
        loadKeys(prefix)
        loadStats()
      },
    })
  }

  const toggle = (name: string) => setSelected(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })

  return (
    <div className="space-y-4">
      {Toast}
      {confirm && <ConfirmDialog message={confirm.msg} onConfirm={async () => { setConfirm(null); await confirm.action() }} onCancel={() => setConfirm(null)} />}

      {/* Stats */}
      {stats && (
        <div className="flex items-center gap-4 p-3 bg-muted/30 border border-border rounded-lg text-sm">
          <span className="font-semibold">{stats.count} keys</span>
          <button onClick={() => { loadKeys(prefix); loadStats() }} className="ml-auto p-1 text-muted-foreground hover:text-foreground"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Add new key */}
      <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">Add / Update Key</h3>
        <div className="flex gap-2">
          <input className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono" placeholder="key" value={newKey} onChange={e => setNewKey(e.target.value)} />
          <input className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="value" value={newVal} onChange={e => setNewVal(e.target.value)} />
          <button onClick={addKey} disabled={adding || !newKey} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50">
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Set
          </button>
        </div>
      </div>

      {/* Filter + toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full bg-background border border-border rounded pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary font-mono" placeholder="Filter by prefix…" value={prefix}
            onChange={e => { setPrefix(e.target.value) }}
            onKeyDown={e => e.key === 'Enter' && loadKeys(e.currentTarget.value)} />
        </div>
        <button onClick={() => loadKeys(prefix)} className="px-3 py-1.5 border border-border rounded text-xs hover:bg-muted/50 transition-colors">Search</button>

        {selected.size > 0 && (
          <button onClick={deleteSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive border border-destructive/30 rounded text-xs hover:bg-destructive/20 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete {selected.size}
          </button>
        )}
        <button onClick={emptyKV} className="flex items-center gap-1.5 px-3 py-1.5 border border-destructive/40 text-destructive rounded text-xs hover:bg-destructive/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> {prefix ? 'Delete Prefix' : 'Empty Namespace'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Key list */}
        <div className="border border-border rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center h-48"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
              <Database className="w-8 h-8 mb-2 opacity-30" />
              No keys found
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
              {keys.map(k => (
                <div key={k.name} className={`flex items-center gap-2 px-3 py-2 hover:bg-muted/20 cursor-pointer group transition-colors ${viewing?.key === k.name ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                  onClick={() => viewKey(k.name)}>
                  <input type="checkbox" className="w-3.5 h-3.5 accent-primary flex-shrink-0" checked={selected.has(k.name)} onChange={e => { e.stopPropagation(); toggle(k.name) }} onClick={e => e.stopPropagation()} />
                  <span className="text-xs font-mono truncate flex-1" title={k.name}>{k.name}</span>
                  {k.expiration && <span className="text-xs text-muted-foreground hidden sm:block">exp {new Date(k.expiration * 1000).toLocaleDateString()}</span>}
                  <button onClick={e => { e.stopPropagation(); deleteOne(k.name) }} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all rounded">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {cursor && (
            <div className="p-2 border-t border-border">
              <button onClick={() => loadKeys(prefix, cursor)} className="w-full text-xs text-center text-muted-foreground hover:text-foreground py-1 transition-colors">Load more</button>
            </div>
          )}
        </div>

        {/* Value viewer */}
        <div className="border border-border rounded-lg overflow-hidden">
          {!viewing ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
              <Database className="w-6 h-6 mb-2 opacity-30" />
              Click a key to inspect its value
            </div>
          ) : (
            <div className="p-4 space-y-3 h-full">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono text-muted-foreground truncate">{viewing.key}</p>
                <div className="flex gap-1.5 flex-shrink-0">
                  {editing ? (
                    <>
                      <button onClick={saveKey} disabled={saving} className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground rounded text-xs font-medium disabled:opacity-50">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                      </button>
                      <button onClick={() => setEditing(false)} className="px-2.5 py-1 border border-border rounded text-xs hover:bg-muted/50">Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setEditing(true)} className="px-2.5 py-1 border border-border rounded text-xs hover:bg-muted/50">Edit</button>
                  )}
                  <button onClick={() => deleteOne(viewing.key)} className="p-1.5 text-muted-foreground hover:text-destructive border border-border rounded transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setViewing(null)} className="p-1.5 text-muted-foreground hover:text-foreground border border-border rounded transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {editing ? (
                <textarea className="w-full h-64 font-mono text-xs bg-background border border-border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary" value={editVal} onChange={e => setEditVal(e.target.value)} />
              ) : (
                <pre className="text-xs font-mono bg-muted/30 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">{viewing.value}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Page
// ══════════════════════════════════════════════════════════════════════════════
export default function StoragePage() {
  const [tab, setTab] = useState<'r2' | 'kv'>('r2')

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={<span className="flex items-center gap-2"><HardDrive className="w-5 h-5 text-primary" /> Storage Manager</span>}
        subtitle="Browse, upload, download, and delete files in R2 and manage KV config keys — all from here"
      />

      {/* Tabs */}
      <div className="mt-6 flex border-b border-border">
        <button onClick={() => setTab('r2')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors ${tab === 'r2' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <HardDrive className="w-4 h-4" /> R2 Files <span className="ml-1 text-xs text-muted-foreground">(nexus-assets)</span>
        </button>
        <button onClick={() => setTab('kv')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors ${tab === 'kv' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Database className="w-4 h-4" /> KV Config <span className="ml-1 text-xs text-muted-foreground">(CONFIG namespace)</span>
        </button>
      </div>

      <div className="mt-6">
        {tab === 'r2' ? <R2Tab /> : <KVTab />}
      </div>
    </div>
  )
}
