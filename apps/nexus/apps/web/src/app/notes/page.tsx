'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Pin, PinOff, Plus, Search, Trash2, Tag, X, FileText, Bot,
} from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { cn } from '@/lib/utils'

interface Note {
  id: string
  title: string
  content: string
  tags: string
  pinned: number
  created_at: string
  updated_at: string
}

type NotePatch = { title?: string; content?: string; tags?: string; pinned?: boolean }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const AUTOSAVE_DELAY = 1200

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [selected, setSelected] = useState<Note | null>(null)
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async (q = '') => {
    try {
      const res = await api.getNotes(q)
      setNotes(res.notes)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setTimeout(() => load(search), 300)
    return () => clearTimeout(t)
  }, [search, load])

  const selectNote = (note: Note) => {
    setSelected(note)
    setTitle(note.title)
    setContent(note.content)
    setTags(note.tags)
    setShowTagInput(false)
  }

  const newNote = async () => {
    try {
      const res = await api.createNote({ title: 'Untitled', content: '', tags: '', pinned: false })
      if (res.note) {
        await load()
        selectNote(res.note)
        setTimeout(() => contentRef.current?.focus(), 50)
      }
    } catch { /* ignore */ }
  }

  const saveNote = useCallback(async (id: string, patch: NotePatch) => {
    setSaving(true)
    try {
      const res = await api.updateNote(id, patch)
      if (res.note) {
        setSelected(res.note)
        setNotes((prev) => prev.map((n) => (n.id === id ? res.note! : n)))
      }
    } finally {
      setSaving(false)
    }
  }, [])

  const scheduleSave = useCallback((id: string, patch: NotePatch) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNote(id, patch), AUTOSAVE_DELAY)
  }, [saveNote])

  const onTitleChange = (val: string) => {
    setTitle(val)
    if (selected) scheduleSave(selected.id, { title: val, content, tags })
  }

  const onContentChange = (val: string) => {
    setContent(val)
    if (selected) scheduleSave(selected.id, { title, content: val, tags })
  }

  const togglePin = async () => {
    if (!selected) return
    const pinned = selected.pinned ? false : true
    await saveNote(selected.id, { title, content, tags, pinned })
    await load(search)
  }

  const deleteNote = async () => {
    if (!selected) return
    if (!confirm('Delete this note?')) return
    await api.deleteNote(selected.id)
    const remaining = notes.filter((n) => n.id !== selected.id)
    setNotes(remaining)
    setSelected(remaining[0] ?? null)
    if (remaining[0]) { setTitle(remaining[0].title); setContent(remaining[0].content); setTags(remaining[0].tags) }
    else { setTitle(''); setContent(''); setTags('') }
  }

  const addTag = async () => {
    const newTag = tagInput.trim()
    if (!newTag || !selected) return
    const existingTags = tags.split(',').map((t) => t.trim()).filter(Boolean)
    if (existingTags.includes(newTag)) { setTagInput(''); return }
    const updated = [...existingTags, newTag].join(', ')
    setTags(updated)
    setTagInput('')
    setShowTagInput(false)
    await saveNote(selected.id, { title, content, tags: updated })
  }

  const removeTag = async (tag: string) => {
    if (!selected) return
    const updated = tags.split(',').map((t) => t.trim()).filter((t) => t && t !== tag).join(', ')
    setTags(updated)
    await saveNote(selected.id, { title, content, tags: updated })
  }

  const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean)

  const filteredNotes = notes

  return (
    <div className="flex flex-col h-screen">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Notes
          </span>
        }
        subtitle="Personal notepad — your ideas, context, and plans. The AI assistant can read these when you ask."
      />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar — note list */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-border bg-card/40">
          <div className="p-3 border-b border-border space-y-2">
            <button
              onClick={newNote}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2 hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> New Note
            </button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {search ? 'No notes match' : 'No notes yet'}
              </div>
            ) : (
              filteredNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => selectNote(note)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/40 transition-colors',
                    selected?.id === note.id && 'bg-primary/8 border-l-2 border-l-primary',
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {note.pinned ? <Pin className="h-3 w-3 text-primary shrink-0" /> : null}
                    <span className="text-xs font-medium truncate text-foreground">
                      {note.title || 'Untitled'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {note.content || 'Empty note'}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(note.updated_at)}</p>
                </button>
              ))
            )}
          </div>

          <div className="px-3 py-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
              <Bot className="h-3 w-3" /> AI can read these notes
            </p>
          </div>
        </aside>

        {/* Editor */}
        {selected ? (
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Editor toolbar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/20">
              <div className="flex items-center gap-2 flex-wrap">
                {tagList.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {showTagInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setShowTagInput(false) }}
                      placeholder="tag name"
                      className="text-xs px-2 py-0.5 bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/50 w-24"
                    />
                    <button onClick={addTag} className="text-xs text-primary hover:underline">add</button>
                    <button onClick={() => setShowTagInput(false)} className="text-xs text-muted-foreground hover:text-foreground">cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTagInput(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground text-xs hover:border-primary/50 hover:text-primary transition-colors"
                  >
                    <Tag className="h-3 w-3" /> tag
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {saving && <span className="text-[10px] text-muted-foreground mr-2">saving…</span>}
                <button
                  onClick={togglePin}
                  title={selected.pinned ? 'Unpin' : 'Pin to top'}
                  className={cn(
                    'h-7 w-7 rounded-md flex items-center justify-center transition-colors',
                    selected.pinned
                      ? 'text-primary bg-primary/10 hover:bg-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  {selected.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={deleteNote}
                  title="Delete note"
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Title */}
            <div className="px-8 pt-6">
              <input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Note title…"
                className="w-full text-2xl font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/40 text-foreground"
              />
            </div>

            {/* Content */}
            <div className="flex-1 px-8 py-4 min-h-0">
              <textarea
                ref={contentRef}
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                placeholder="Start writing… the AI assistant can read this when you ask it to."
                className="w-full h-full resize-none bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground/40 leading-relaxed"
              />
            </div>

            <div className="px-8 py-2 border-t border-border/50 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Last updated {timeAgo(selected.updated_at)}
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Bot className="h-3 w-3" /> visible to AI
              </span>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">No note selected</p>
            <p className="text-xs mt-1 max-w-xs">
              Pick a note from the list or create a new one. The AI can read your notes — just ask it to "check my notes" or "what are my ideas about X".
            </p>
            <button
              onClick={newNote}
              className="mt-4 flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> New Note
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
