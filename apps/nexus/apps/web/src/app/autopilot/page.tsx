'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Rocket, Play, Loader2, TrendingUp, Package, DollarSign, Activity, Zap, AlertTriangle } from 'lucide-react'
import { api, type AutopilotStatus } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

const ACTION_LABEL: Record<string, string> = {
  research: 'Researched niche',
  build: 'Built product',
  publish: 'Published',
  skip: 'Skipped',
  error: 'Error',
}

export default function AutopilotPage() {
  const [status, setStatus] = useState<AutopilotStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)

  const refresh = useCallback(async () => {
    const s = await api.getAutopilot()
    setStatus(s)
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  async function toggle() {
    if (!status) return
    setBusy(true)
    try {
      await api.toggleAutopilot({ enabled: !status.enabled })
      await refresh()
    } catch (err) {
      // The Worker returns 400 { error: 'no_ai_key', message: ... } when the
      // user tries to flip the engine ON without any AI provider configured.
      // Surface the message so they know to open Settings → Keys rather than
      // assume the dashboard is broken.
      const msg = err instanceof Error ? err.message : 'Failed to toggle autopilot'
      if (typeof window !== 'undefined') window.alert(msg)
    } finally {
      setBusy(false)
    }
  }

  async function setFlag(patch: { auto_approve?: boolean; auto_publish?: boolean }) {
    setBusy(true)
    try {
      await api.toggleAutopilot(patch)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function runOnce() {
    setRunning(true)
    try {
      await api.runAutopilot()
      await refresh()
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Rocket className="h-5 w-5" /> Autopilot</span>}
        subtitle="Flip it ON and the CEO loops on its own: research a niche → build a real product with the agent team → track it. Listing happens via Publish center once a store token is connected."
      />
      <PageBody className="space-y-6">
        {loading || !status ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            {/* No-LLM-key warning. The Worker refuses both /toggle and /run
                in this state; if the engine somehow stayed enabled (user
                rotated keys after toggling on) we still want to scream. */}
            {status.ai_keys_configured === false && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                <div className="text-sm space-y-1">
                  <div className="font-medium">No LLM provider is configured.</div>
                  <div className="text-xs text-muted-foreground">
                    Autopilot will refuse to start a cycle until you add a key.{' '}
                    <Link href="/settings/keys" className="underline">
                      Open Settings → Keys
                    </Link>{' '}
                    — Groq is free and is enough to run the whole engine.
                  </div>
                </div>
              </div>
            )}

            {/* Toggle */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold">
                  Autopilot is
                  <span className={status.enabled ? 'text-emerald-500' : 'text-muted-foreground'}>
                    {status.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  When ON, NEXUS builds {status.per_run} product{status.per_run > 1 ? 's' : ''} per day automatically (daily cron, 06:00 UTC).
                </p>
                {status.ai_provider_source ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Using{' '}
                    <span className="font-mono">{status.ai_provider_source.key}</span>{' '}
                    (
                    {status.ai_provider_source.source === 'kv'
                      ? 'saved key'
                      : 'worker secret'}
                    )
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={runOnce}
                  disabled={running || status.ai_keys_configured === false}
                  title={status.ai_keys_configured === false ? 'Add an AI key first' : undefined}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run one cycle now
                </button>
                <button onClick={toggle}
                  disabled={busy || (!status.enabled && status.ai_keys_configured === false)}
                  title={
                    !status.enabled && status.ai_keys_configured === false
                      ? 'Add an AI key in Settings → Keys before turning the engine on'
                      : undefined
                  }
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 transition-colors ${status.enabled ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'}`}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {status.enabled ? 'Turn OFF' : 'Turn ON'}
                </button>
              </div>
            </div>

            {/* Auto-approve / auto-publish */}
            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow
                label={`Auto-approve products scoring ≥ ${status.min_score}`}
                hint="Skip manual review for high-scoring products."
                on={status.auto_approve} busy={busy}
                onClick={() => setFlag({ auto_approve: !status.auto_approve })}
              />
              <ToggleRow
                label="Auto-publish approved products"
                hint="List them automatically when a store token is connected."
                on={status.auto_publish} busy={busy}
                onClick={() => setFlag({ auto_publish: !status.auto_publish })}
              />
            </div>

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat icon={<Package className="h-5 w-5" />} label="Products built by autopilot" value={String(status.products_built)} />
              <Stat icon={<DollarSign className="h-5 w-5" />} label="Estimated revenue (90-day)"
                value={`$${status.est_revenue.low.toLocaleString()}–$${status.est_revenue.high.toLocaleString()}`} />
              <Stat icon={<TrendingUp className="h-5 w-5" />} label="Top winners tracked" value={String(status.winners.length)} />
            </div>

            {/* Winners */}
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4" /> Winners</h2>
              {status.winners.length === 0 ? (
                <p className="text-sm text-muted-foreground">No scored products yet.</p>
              ) : (
                <div className="space-y-2">
                  {status.winners.map((w) => (
                    <Link key={w.id} href={`/review/${w.id}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-background p-3 hover:bg-muted/40">
                      <span className="truncate font-medium">{w.name || 'Untitled'}</span>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                        <span className="rounded-full bg-muted px-2 py-0.5">{w.status}</span>
                        <span>score {w.ai_score?.toFixed?.(1) ?? w.ai_score}</span>
                        <span className="text-emerald-500">~${w.est.toLocaleString()}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Activity */}
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4" /> Recent activity</h2>
              {status.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet. Turn it on or run a cycle.</p>
              ) : (
                <div className="space-y-1.5">
                  {status.recent.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
                      <span className="font-medium">{ACTION_LABEL[r.action] || r.action}</span>
                      <span className="flex-1 text-muted-foreground">{r.note || r.niche || ''}</span>
                      <span className="shrink-0 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </PageBody>
    </>
  )
}

function ToggleRow({ label, hint, on, busy, onClick }: { label: string; hint: string; on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card/50 p-4">
      <div className="min-w-0 pr-3">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <button onClick={onClick} disabled={busy} aria-pressed={on}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-muted'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  )
}
