'use client'

import { useEffect, useState } from 'react'
import { Users, Zap, ShieldCheck, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { api, type TeamWave } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { EmptyState } from '@/components/shared/EmptyState'

export default function TeamPage() {
  const [waves, setWaves] = useState<TeamWave[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getTeam()
      .then((d) => setWaves(d.waves))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load team'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Users className="h-5 w-5" /> AI Agent Team</span>}
        subtitle="Many specialized models work together — each on what it's best at, in parallel, with automatic fallback. The CEO orchestrates them."
      />
      <PageBody>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the team…
          </div>
        )}
        {error && <div className="text-sm text-destructive">{error}</div>}

        {!loading && !error && waves.length === 0 && (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No agent team configured yet"
            description="Once your AI models are set up, the roles that run each stage of a workflow line up here."
            action={
              <Link
                href="/manager/ai"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Configure AI models
              </Link>
            }
          />
        )}

        {!loading && !error && waves.length > 0 && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> Roles in the same wave run in parallel
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Every role falls back to the free engine
              </span>
            </div>

            {waves.map((w, i) => (
              <div key={w.wave} className="rounded-xl border border-border bg-card/50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    {i + 1}
                  </span>
                  Stage {i + 1}
                  {w.parallel ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                      <Zap className="h-3 w-3" /> {w.roles.length} agents in parallel
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      sequential
                    </span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {w.roles.map((r) => (
                    <div key={r.step} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{r.role}</span>
                        {r.primary.isFree && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                            FREE
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Model: <span className="font-mono text-foreground">{r.primary.name}</span>
                      </div>
                      {r.fallbacks.length > 1 && (
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          Fallbacks: {r.fallbacks.slice(0, 4).map((f) => f.name).join(' → ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </>
  )
}
