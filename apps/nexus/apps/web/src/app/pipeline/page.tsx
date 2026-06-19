'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Plus, X, ChevronRight, Play, CheckCircle, XCircle, FileText, Loader2 } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// ─── Types ─────────────────────────────────────────────────────────────────────

type ItemType = 'note' | 'job' | 'product' | 'pod' | 'blog'
type Stage    = 'idea' | 'draft' | 'review' | 'scheduled' | 'published'
type DeliverableType = 'writing' | 'code' | 'design' | 'research'

interface PipelineItem {
  id: string
  type: ItemType
  stage: Stage
  title: string
  content?: string | null
  created_by?: string
  created_at: string
  updated_at: string
}

interface JobBrief {
  id: string
  pipeline_item_id: string
  deliverable_type: DeliverableType
  brief_text: string
  client_name: string | null
  client_notes: string | null
  deadline: string | null
}

interface JobStatus {
  item: PipelineItem
  brief: JobBrief | null
  run: {
    id: string
    status: string
    step_count: number
    deliverable_id: string | null
    started_at: string
    finished_at: string | null
  } | null
  approval: {
    id: string
    status: string
    summary: string
    created_at: string
  } | null
}

const STAGES: { id: Stage; label: string }[] = [
  { id: 'idea',      label: 'Idea' },
  { id: 'draft',     label: 'Draft' },
  { id: 'review',    label: 'Review' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
]

const TYPES: { id: ItemType | 'all'; label: string }[] = [
  { id: 'all',     label: 'All' },
  { id: 'note',    label: 'Notes' },
  { id: 'job',     label: 'Jobs' },
  { id: 'product', label: 'Products' },
  { id: 'pod',     label: 'POD' },
  { id: 'blog',    label: 'Blog' },
]

const TYPE_COLORS: Record<ItemType, string> = {
  note:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  job:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  product: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  pod:     'bg-pink-500/10 text-pink-400 border-pink-500/20',
  blog:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ''
const ITEMS_API = `${API_BASE}/api/pipeline/items`

// ─── API helpers ───────────────────────────────────────────────────────────────

async function fetchItems(): Promise<PipelineItem[]> {
  const res = await fetch(ITEMS_API)
  if (!res.ok) return []
  const data = await res.json() as unknown
  return Array.isArray(data) ? (data as PipelineItem[]) : ((data as Record<string, unknown>).items as PipelineItem[] ?? [])
}

async function createItem(payload: Omit<PipelineItem, 'id' | 'created_at' | 'updated_at'>): Promise<PipelineItem | null> {
  const res = await fetch(ITEMS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  return res.json() as Promise<PipelineItem>
}

async function moveItem(id: string, stage: Stage): Promise<void> {
  await fetch(`${ITEMS_API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  })
}

async function deleteItem(id: string): Promise<void> {
  await fetch(`${ITEMS_API}/${id}`, { method: 'DELETE' })
}

async function fetchJobStatus(itemId: string): Promise<JobStatus | null> {
  const res = await fetch(`${API_BASE}/api/jobs/${itemId}`)
  if (!res.ok) return null
  return res.json() as Promise<JobStatus>
}

async function saveBrief(itemId: string, brief: Omit<JobBrief, 'id' | 'pipeline_item_id'>): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/jobs/${itemId}/brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(brief),
  })
  return res.ok
}

async function startJobAgent(itemId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/jobs/${itemId}/start`, { method: 'POST' })
  return res.ok
}

async function approveJob(itemId: string, notes?: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/jobs/${itemId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer_notes: notes }),
  })
  return res.ok
}

async function rejectJob(itemId: string, notes?: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/jobs/${itemId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewer_notes: notes }),
  })
  return res.ok
}

// ─── Brief Intake Panel ────────────────────────────────────────────────────────

function BriefPanel({
  item,
  onClose,
  onStarted,
}: {
  item: PipelineItem
  onClose: () => void
  onStarted: () => void
}) {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [brief, setBrief] = useState<Omit<JobBrief, 'id' | 'pipeline_item_id'>>({
    deliverable_type: 'writing',
    brief_text: '',
    client_name: null,
    client_notes: null,
    deadline: null,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [reviewerNotes, setReviewerNotes] = useState('')
  const [deliverableContent, setDeliverableContent] = useState<string | null>(null)

  useEffect(() => {
    fetchJobStatus(item.id).then((s) => {
      setJobStatus(s)
      if (s?.brief) {
        setBrief({
          deliverable_type: s.brief.deliverable_type,
          brief_text: s.brief.brief_text,
          client_name: s.brief.client_name,
          client_notes: s.brief.client_notes,
          deadline: s.brief.deadline,
        })
      }
      setLoading(false)
    })
  }, [item.id])

  // Load deliverable when in review
  useEffect(() => {
    if (item.stage === 'review' || jobStatus?.run?.status === 'awaiting_approval') {
      fetch(`${API_BASE}/api/jobs/${item.id}/deliverable`)
        .then(r => r.ok ? r.json() as Promise<{ content_text?: string }> : null)
        .then(d => setDeliverableContent(d?.content_text ?? null))
        .catch(() => {})
    }
  }, [item.id, item.stage, jobStatus?.run?.status])

  async function handleSaveBrief() {
    setSaving(true)
    await saveBrief(item.id, brief)
    setSaving(false)
  }

  async function handleStart() {
    setStarting(true)
    await saveBrief(item.id, brief)
    const ok = await startJobAgent(item.id)
    if (ok) onStarted()
    setStarting(false)
  }

  async function handleApprove() {
    setApproving(true)
    const ok = await approveJob(item.id, reviewerNotes || undefined)
    if (ok) onStarted()
    setApproving(false)
  }

  async function handleReject() {
    setApproving(true)
    const ok = await rejectJob(item.id, reviewerNotes || undefined)
    if (ok) onStarted()
    setApproving(false)
  }

  const isRunning = jobStatus?.run?.status === 'running'
  const isAwaiting = jobStatus?.run?.status === 'awaiting_approval'
  const runStatus = jobStatus?.run?.status

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl h-full bg-background border-l overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold">{item.title}</h2>
            <span className={`text-xs mt-1 inline-flex rounded-full border px-2 py-0.5 ${TYPE_COLORS[item.type]}`}>
              {item.type}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="flex-1 p-5 flex flex-col gap-6">

            {/* Agent status banner */}
            {runStatus && (
              <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
                runStatus === 'awaiting_approval' ? 'bg-amber-500/10 text-amber-400' :
                runStatus === 'running' ? 'bg-blue-500/10 text-blue-400' :
                runStatus === 'done' ? 'bg-emerald-500/10 text-emerald-400' :
                'bg-red-500/10 text-red-400'
              }`}>
                {runStatus === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
                {runStatus === 'awaiting_approval' && <FileText className="h-4 w-4" />}
                <span className="capitalize font-medium">
                  {runStatus === 'awaiting_approval' ? 'Draft ready — awaiting your review' :
                   runStatus === 'running' ? `Agent working (${jobStatus?.run?.step_count ?? 0} steps)…` :
                   runStatus}
                </span>
              </div>
            )}

            {/* Deliverable review */}
            {isAwaiting && deliverableContent && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Deliverable</h3>
                <pre className="text-xs bg-muted rounded-lg p-4 overflow-x-auto whitespace-pre-wrap max-h-64">
                  {deliverableContent}
                </pre>
                <textarea
                  value={reviewerNotes}
                  onChange={e => setReviewerNotes(e.target.value)}
                  placeholder="Reviewer notes (optional)…"
                  rows={2}
                  className="mt-3 w-full text-sm bg-muted border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary resize-none"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    Approve → Scheduled
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={approving}
                    className="flex-1 flex items-center justify-center gap-2 border rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject → Draft
                  </button>
                </div>
              </section>
            )}

            {/* Brief form — show when not running/awaiting */}
            {!isRunning && !isAwaiting && (
              <section>
                <h3 className="text-sm font-semibold mb-3">Brief</h3>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Deliverable type</label>
                    <select
                      value={brief.deliverable_type}
                      onChange={e => setBrief(b => ({ ...b, deliverable_type: e.target.value as DeliverableType }))}
                      className="w-full text-sm bg-muted border rounded-lg px-3 py-2"
                    >
                      {(['writing', 'code', 'design', 'research'] as DeliverableType[]).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Brief <span className="text-destructive">*</span></label>
                    <textarea
                      value={brief.brief_text}
                      onChange={e => setBrief(b => ({ ...b, brief_text: e.target.value }))}
                      placeholder="Describe what needs to be produced, requirements, examples…"
                      rows={5}
                      className="w-full text-sm bg-muted border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Client name</label>
                    <input
                      value={brief.client_name ?? ''}
                      onChange={e => setBrief(b => ({ ...b, client_name: e.target.value || null }))}
                      placeholder="Optional"
                      className="w-full text-sm bg-muted border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Client constraints</label>
                    <textarea
                      value={brief.client_notes ?? ''}
                      onChange={e => setBrief(b => ({ ...b, client_notes: e.target.value || null }))}
                      placeholder="Tone, format, 'don't mention X'…"
                      rows={2}
                      className="w-full text-sm bg-muted border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Deadline</label>
                    <input
                      type="datetime-local"
                      value={brief.deadline ?? ''}
                      onChange={e => setBrief(b => ({ ...b, deadline: e.target.value || null }))}
                      className="w-full text-sm bg-muted border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSaveBrief}
                      disabled={saving}
                      className="px-4 py-2 text-sm border rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save draft'}
                    </button>
                    <button
                      onClick={handleStart}
                      disabled={!brief.brief_text.trim() || starting}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Start Job Agent
                    </button>
                  </div>
                </div>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add Card Form ─────────────────────────────────────────────────────────────

function AddCardForm({
  stage,
  onAdd,
  onCancel,
}: {
  stage: Stage
  onAdd: (title: string, type: ItemType) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ItemType>('note')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title.trim(), type)
  }

  return (
    <form onSubmit={submit} className="rounded-lg border bg-card p-3 flex flex-col gap-2">
      <input
        ref={inputRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Item title…"
        className="w-full bg-transparent text-sm placeholder:text-muted-foreground outline-none"
        onKeyDown={e => e.key === 'Escape' && onCancel()}
      />
      <select
        value={type}
        onChange={e => setType(e.target.value as ItemType)}
        className="text-xs bg-muted border rounded px-2 py-1 text-foreground"
      >
        {TYPES.filter(t => t.id !== 'all').map(t => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="text-xs bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-40"
        >Add</button>
      </div>
    </form>
  )
}

// ─── Item Card ─────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  onMove,
  onDelete,
  onOpenBrief,
}: {
  item: PipelineItem
  onMove: (id: string, stage: Stage) => void
  onDelete: (id: string) => void
  onOpenBrief: (item: PipelineItem) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const currentIdx = STAGES.findIndex(s => s.id === item.stage)
  const nextStage  = STAGES[currentIdx + 1]
  const isAgent    = item.created_by && item.created_by !== 'user'

  return (
    <div className="rounded-lg border bg-card p-3 text-sm group relative">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => item.type === 'job' ? onOpenBrief(item) : undefined}
          className={`font-medium leading-snug flex-1 text-left ${item.type === 'job' ? 'hover:text-primary transition-colors' : ''}`}
        >
          {item.title}
        </button>
        <button
          onClick={() => setShowMenu(v => !v)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${TYPE_COLORS[item.type]}`}>
          {item.type}
        </span>
        {isAgent && (
          <span className="text-xs text-muted-foreground">· AI</span>
        )}
      </div>

      {/* Job-specific action */}
      {item.type === 'job' && (item.stage === 'idea' || item.stage === 'draft') && (
        <button
          onClick={() => onOpenBrief(item)}
          className="mt-2 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          <Play className="h-3 w-3" />
          {item.stage === 'idea' ? 'Add brief & start agent' : 'Continue'}
        </button>
      )}

      {item.type === 'job' && item.stage === 'review' && (
        <button
          onClick={() => onOpenBrief(item)}
          className="mt-2 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          <FileText className="h-3 w-3" />
          Review deliverable
        </button>
      )}

      {/* Move forward (non-job items) */}
      {item.type !== 'job' && nextStage && (
        <button
          onClick={() => onMove(item.id, nextStage.id)}
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-3 w-3" />
          Move to {nextStage.label}
        </button>
      )}

      {showMenu && (
        <div className="absolute right-2 top-8 z-10 rounded-lg border bg-popover shadow-lg p-1 min-w-[120px]">
          {STAGES.filter(s => s.id !== item.stage).map(s => (
            <button
              key={s.id}
              onClick={() => { onMove(item.id, s.id); setShowMenu(false) }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
            >
              → {s.label}
            </button>
          ))}
          <div className="my-1 border-t" />
          <button
            onClick={() => { onDelete(item.id); setShowMenu(false) }}
            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-destructive/10 text-destructive"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Column ────────────────────────────────────────────────────────────────────

function Column({
  stage,
  items,
  onAdd,
  onMove,
  onDelete,
  onOpenBrief,
}: {
  stage: { id: Stage; label: string }
  items: PipelineItem[]
  onAdd: (stage: Stage, title: string, type: ItemType) => void
  onMove: (id: string, stage: Stage) => void
  onDelete: (id: string) => void
  onOpenBrief: (item: PipelineItem) => void
}) {
  const [adding, setAdding] = useState(false)
  const reviewCount = stage.id === 'review' ? items.filter(i => i.type === 'job').length : 0

  return (
    <div className="flex flex-col min-w-[220px] max-w-[260px] w-full bg-muted/30 rounded-xl p-3 gap-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {stage.label}
          </span>
          {reviewCount > 0 && (
            <span className="text-xs bg-amber-500/20 text-amber-400 rounded-full px-2 py-0.5">
              {reviewCount} needs review
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {items.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        {items.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            onMove={onMove}
            onDelete={onDelete}
            onOpenBrief={onOpenBrief}
          />
        ))}
      </div>

      {adding ? (
        <AddCardForm
          stage={stage.id}
          onAdd={(title, type) => { onAdd(stage.id, title, type); setAdding(false) }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add item
        </button>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [items, setItems] = useState<PipelineItem[]>([])
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [briefItem, setBriefItem] = useState<PipelineItem | null>(null)

  const load = useCallback(() => {
    fetchItems().then(setItems).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = typeFilter === 'all' ? items : items.filter(i => i.type === typeFilter)

  async function handleAdd(stage: Stage, title: string, type: ItemType) {
    const optimistic: PipelineItem = {
      id: `tmp-${Date.now()}`,
      type, stage, title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setItems(prev => [...prev, optimistic])
    const created = await createItem({ type, stage, title })
    if (created) {
      setItems(prev => prev.map(i => (i.id === optimistic.id ? created : i)))
    }
  }

  async function handleMove(id: string, stage: Stage) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, stage } : i)))
    await moveItem(id, stage)
  }

  async function handleDelete(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    await deleteItem(id)
  }

  function handleBriefClose() {
    setBriefItem(null)
    load() // refresh after agent started or approval resolved
  }

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="Every item — note, job, product, POD, blog — in one board."
        actions={
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  typeFilter === t.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      <PageBody className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="flex gap-4 pb-4 min-w-max">
            {STAGES.map(stage => (
              <Column
                key={stage.id}
                stage={stage}
                items={filtered.filter(i => i.stage === stage.id)}
                onAdd={handleAdd}
                onMove={handleMove}
                onDelete={handleDelete}
                onOpenBrief={setBriefItem}
              />
            ))}
          </div>
        )}
      </PageBody>

      {briefItem && (
        <BriefPanel
          item={briefItem}
          onClose={handleBriefClose}
          onStarted={handleBriefClose}
        />
      )}
    </>
  )
}
