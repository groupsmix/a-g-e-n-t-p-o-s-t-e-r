'use client'

import { useEffect, useState, useRef } from 'react'
import { Plus, X, ChevronRight } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// ─── Types ─────────────────────────────────────────────────────────────────────

type ItemType = 'note' | 'job' | 'product' | 'pod' | 'blog'
type Stage    = 'idea' | 'draft' | 'review' | 'scheduled' | 'published'

interface PipelineItem {
  id: string
  type: ItemType
  stage: Stage
  title: string
  content?: string
  created_at: string
  updated_at: string
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

// ─── API helpers ───────────────────────────────────────────────────────────────

async function fetchItems(): Promise<PipelineItem[]> {
  const res = await fetch(`${API_BASE}/api/pipeline`)
  if (!res.ok) return []
  const data = await res.json() as unknown
  return Array.isArray(data) ? (data as PipelineItem[]) : ((data as Record<string, unknown>).items as PipelineItem[] ?? [])
}

async function createItem(payload: Omit<PipelineItem, 'id' | 'created_at' | 'updated_at'>): Promise<PipelineItem | null> {
  const res = await fetch(`${API_BASE}/api/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  return res.json()
}

async function moveItem(id: string, stage: Stage): Promise<void> {
  await fetch(`${API_BASE}/api/pipeline/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  })
}

async function deleteItem(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/pipeline/${id}`, { method: 'DELETE' })
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
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Item title…"
        className="w-full bg-transparent text-sm placeholder:text-muted-foreground outline-none"
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as ItemType)}
        className="text-xs bg-muted border rounded px-2 py-1 text-foreground"
      >
        {TYPES.filter((t) => t.id !== 'all').map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="text-xs bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </form>
  )
}

// ─── Item Card ─────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  onMove,
  onDelete,
}: {
  item: PipelineItem
  onMove: (id: string, stage: Stage) => void
  onDelete: (id: string) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const currentIdx = STAGES.findIndex((s) => s.id === item.stage)
  const nextStage  = STAGES[currentIdx + 1]

  return (
    <div className="rounded-lg border bg-card p-3 text-sm group relative">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug flex-1">{item.title}</p>
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${TYPE_COLORS[item.type]}`}>
        {item.type}
      </div>

      {nextStage && (
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
          {STAGES.filter((s) => s.id !== item.stage).map((s) => (
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
}: {
  stage: { id: Stage; label: string }
  items: PipelineItem[]
  onAdd: (stage: Stage, title: string, type: ItemType) => void
  onMove: (id: string, stage: Stage) => void
  onDelete: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col min-w-[220px] max-w-[260px] w-full bg-muted/30 rounded-xl p-3 gap-2">
      {/* Column header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {stage.label}
        </span>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onMove={onMove} onDelete={onDelete} />
        ))}
      </div>

      {/* Add card */}
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

  useEffect(() => {
    fetchItems()
      .then(setItems)
      .finally(() => setLoading(false))
  }, [])

  const filtered = typeFilter === 'all' ? items : items.filter((i) => i.type === typeFilter)

  async function handleAdd(stage: Stage, title: string, type: ItemType) {
    const optimistic: PipelineItem = {
      id: `tmp-${Date.now()}`,
      type,
      stage,
      title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setItems((prev) => [...prev, optimistic])
    const created = await createItem({ type, stage, title })
    if (created) {
      setItems((prev) => prev.map((i) => (i.id === optimistic.id ? created : i)))
    }
  }

  async function handleMove(id: string, stage: Stage) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, stage } : i)))
    await moveItem(id, stage)
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    await deleteItem(id)
  }

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="Every item — note, job, product, POD, blog — in one board."
        actions={
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {TYPES.map((t) => (
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
            Loading…
          </div>
        ) : (
          <div className="flex gap-4 pb-4 min-w-max">
            {STAGES.map((stage) => (
              <Column
                key={stage.id}
                stage={stage}
                items={filtered.filter((i) => i.stage === stage.id)}
                onAdd={handleAdd}
                onMove={handleMove}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </PageBody>
    </>
  )
}
