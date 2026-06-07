'use client'

import { useEffect, useState } from 'react'
import { Rocket, Play, Loader2, Target } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

type Goal = {
  id: string
  title: string
  metric: string
  target: number
  period: string
  tags?: string[]
  enabled?: number | boolean
}
type Run = {
  id: string
  goal_id: string
  started_at: string
  status: string
  tasks_enqueued?: number
  notes?: string
}

export default function AutonomePage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [unconfigured, setUnconfigured] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const [g, r] = await Promise.all([api.getAutonomeGoals(), api.getAutonomeRuns()])
      setGoals(g.goals || [])
      setRuns(r.runs || [])
      setUnconfigured(g.source === 'unconfigured' || r.source === 'unconfigured')
    } catch {
      setUnconfigured(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const trigger = async () => {
    setRunning(true)
    try { await api.runAutonomeTick(); await refresh() } finally { setRunning(false) }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Rocket className="h-5 w-5" /> Autonome</span>}
        subtitle="Goal-driven loop that plans and dispatches tasks toward your numbers."
      />
      <PageBody className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${goals.length} goal${goals.length === 1 ? '' : 's'} · ${runs.length} recent run${runs.length === 1 ? '' : 's'}`}
          </div>
          <button
            onClick={trigger}
            disabled={running || loading || unconfigured}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run tick
          </button>
        </div>

        {unconfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
            <p className="font-medium text-amber-500">Database not configured</p>
            <p className="mt-1 text-muted-foreground">
              The Autonome tables (goals, autonome_runs) don&apos;t exist on the connected D1 database yet.
              Run the latest migrations from <code className="rounded bg-muted px-1.5 py-0.5">apps/nexus/apps/nexus-api/migrations</code>.
            </p>
          </div>
        )}

        <Section icon={<Target className="h-4 w-4" />} title={`Goals (${goals.length})`}>
          {goals.length === 0 ? (
            <Empty>No goals set yet. Create one to start steering the loop.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {goals.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{g.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.metric} → {g.target} per {g.period}
                      {g.tags && g.tags.length > 0 && <span className="ml-2">[{g.tags.join(', ')}]</span>}
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${g.enabled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                    {g.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section icon={<Rocket className="h-4 w-4" />} title={`Recent runs (${runs.length})`}>
          {runs.length === 0 ? (
            <Empty>No runs yet. Hit &ldquo;Run tick&rdquo; to kick the loop manually.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.goal_id}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.started_at).toLocaleString()} · {r.tasks_enqueued ?? 0} task{r.tasks_enqueued === 1 ? '' : 's'} enqueued
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${r.status === 'ok' || r.status === 'success' ? 'bg-emerald-500/15 text-emerald-500' : r.status === 'error' || r.status === 'failed' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </PageBody>
    </>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-medium">{icon} {title}</div>
      {children}
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</div>
}
