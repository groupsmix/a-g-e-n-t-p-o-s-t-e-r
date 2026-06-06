'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AgentTask } from '@posteragent/types'
import { api } from '@/lib/api'
import { TaskCard } from './TaskCard'
import { Activity } from 'lucide-react'

interface ConnectionState {
  status: 'connecting' | 'live' | 'paused' | 'error'
  detail?: string
}

/**
 * Real-time task feed.
 *
 *   1. Initial fetch via React Query (api.listTasks) populates the list.
 *   2. SSE subscription via api.subscribeTasks streams deltas as they happen.
 *   3. Incoming tasks are upserted by id; the list stays sorted by createdAt.
 *
 * Lives in app/page.tsx (mission control).  Renders its own connection
 * indicator so the operator knows whether the stream is live.
 */
export function LiveActivityFeed(): React.ReactElement {
  const initial = useQuery({
    queryKey: ['tasks', 'initial'],
    queryFn: () => api.listTasks({ limit: 30 }),
    staleTime: 60_000,
  })

  const [tasks, setTasks] = React.useState<AgentTask[]>([])
  const [conn, setConn] = React.useState<ConnectionState>({ status: 'connecting' })

  // Seed from the initial fetch once.
  React.useEffect(() => {
    if (initial.data) setTasks(initial.data)
  }, [initial.data])

  // Open the SSE stream once on mount.
  React.useEffect(() => {
    const es = api.subscribeTasks({
      onOpen: () => setConn({ status: 'live' }),
      onTask: (incoming) => {
        setTasks((prev) => {
          const idx = prev.findIndex((t) => t.id === incoming.id)
          const next = idx >= 0
            ? [...prev.slice(0, idx), incoming, ...prev.slice(idx + 1)]
            : [incoming, ...prev]
          // newest first, cap at 100 in memory
          next.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          return next.slice(0, 100)
        })
      },
      onPing: () => setConn({ status: 'live' }),
      onClose: () => setConn({ status: 'paused', detail: 'reconnecting…' }),
      onError: (info) => setConn({ status: 'error', detail: info.message }),
    })
    return () => es.close()
  }, [])

  const indicator = (
    <span
      className="inline-flex items-center gap-1.5 text-xs"
      title={conn.detail}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          conn.status === 'live'
            ? 'animate-pulse bg-emerald-400'
            : conn.status === 'connecting'
              ? 'bg-amber-400'
              : conn.status === 'paused'
                ? 'bg-zinc-400'
                : 'bg-red-400'
        }`}
      />
      <span className="text-muted-foreground">
        {conn.status === 'live' && 'live'}
        {conn.status === 'connecting' && 'connecting…'}
        {conn.status === 'paused' && (conn.detail ?? 'paused')}
        {conn.status === 'error' && (conn.detail ?? 'error')}
      </span>
    </span>
  )

  // ── Empty state ────────────────────────────────────────────────────────────
  if (initial.isLoading) {
    return (
      <Frame indicator={indicator}>
        <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          Loading recent tasks…
        </div>
      </Frame>
    )
  }
  if (initial.isError) {
    return (
      <Frame indicator={indicator}>
        <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-red-500/30 text-sm text-red-300">
          <span>Couldn't reach nexus-api.</span>
          <span className="text-xs text-muted-foreground">
            {(initial.error as Error).message}
          </span>
        </div>
      </Frame>
    )
  }
  if (tasks.length === 0) {
    return (
      <Frame indicator={indicator}>
        <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          No tasks yet.&nbsp;
          Run something from{' '}
          <kbd className="mx-1 rounded border bg-muted px-1 py-0.5 font-mono">⌘K</kbd>.
        </div>
      </Frame>
    )
  }

  // ── Populated feed ────────────────────────────────────────────────────────
  return (
    <Frame indicator={indicator}>
      <div className="space-y-2">
        {tasks.slice(0, 12).map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {tasks.length > 12 && (
          <p className="pt-1 text-center text-xs text-muted-foreground">
            +{tasks.length - 12} more in feed
          </p>
        )}
      </div>
    </Frame>
  )
}

// ── Frame ───────────────────────────────────────────────────────────────────
// The header + scroll container is the same in every state, so factor it out.
function Frame({
  children,
  indicator,
}: {
  children: React.ReactNode
  indicator: React.ReactNode
}): React.ReactElement {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary" />
          Live activity
        </div>
        {indicator}
      </div>
      <div className="max-h-[420px] overflow-y-auto p-3">{children}</div>
    </div>
  )
}
