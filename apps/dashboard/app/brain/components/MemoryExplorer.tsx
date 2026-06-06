'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/utils'
import { Brain } from 'lucide-react'
import type { MemoryItemDTO } from '@/lib/brain/types'

interface MemoriesResponse {
  source: string
  memories: MemoryItemDTO[]
}

const FILTERS: Array<{ id: 'all' | MemoryItemDTO['type']; label: string }> = [
  { id: 'all', label: 'all' },
  { id: 'identity', label: 'identity' },
  { id: 'preference', label: 'preferences' },
  { id: 'project', label: 'projects' },
  { id: 'fact', label: 'facts' },
  { id: 'event', label: 'events' },
]

export function MemoryExplorer(): JSX.Element {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [query, setQuery] = useState('')

  const { data, isLoading } = useQuery<MemoriesResponse>({
    queryKey: ['brain', 'memories', filter, query],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('type', filter)
      if (query.trim()) params.set('q', query.trim())
      const r = await fetch(`/api/brain/memories?${params.toString()}`)
      if (!r.ok) throw new Error('memories fetch failed')
      return r.json()
    },
    placeholderData: (prev) => prev,
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Memory</CardTitle>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search memories…"
            className="h-8 w-64 rounded-md border bg-background px-3 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <CardDescription>
          Long-term store. Identity facts and preferences shape every agent prompt.
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === f.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && !data ? (
          <MemorySkeleton />
        ) : (data?.memories ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No memories match this filter.</p>
        ) : (
          (data?.memories ?? []).map((m) => (
            <div
              key={m.id}
              className="space-y-1 rounded-md border bg-card/60 p-3 transition-colors hover:bg-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {m.type}
                  </Badge>
                  <ImportanceBar value={m.importance} />
                </div>
                <span className="text-[11px] text-muted-foreground">{timeAgo(m.updatedAt)}</span>
              </div>
              <p className="text-sm leading-snug">{m.content}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                {m.tags.map((t) => (
                  <span key={t} className="rounded bg-muted px-1.5 py-0.5">
                    #{t}
                  </span>
                ))}
                {m.source ? <span className="ml-auto opacity-70">from {m.source}</span> : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function ImportanceBar({ value }: { value: number }): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-12 overflow-hidden rounded bg-muted">
        <div
          className="h-full bg-primary"
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {(value * 100).toFixed(0)}
      </span>
    </div>
  )
}

function MemorySkeleton(): JSX.Element {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-md bg-muted/40" />
      ))}
    </div>
  )
}
