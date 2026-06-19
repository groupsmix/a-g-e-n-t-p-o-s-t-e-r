'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Megaphone, Play, Loader2, Send, Zap, Activity, AlertCircle } from 'lucide-react'
import { api, type MarketingStatus } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

const STATUS_STYLE: Record<string, string> = {
  posted: 'text-emerald-500',
  generated: 'text-amber-500',
  skipped: 'text-muted-foreground',
  failed: 'text-destructive',
}

export default function MarketingPage() {
  const [status, setStatus] = useState<MarketingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)

  const refresh = useCallback(async () => {
    const s = await api.getMarketing()
    setStatus(s)
  }, [])

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [refresh])

  async function toggle() {
    if (!status) return
    setBusy(true)
    try { await api.toggleMarketing({ enabled: !status.enabled }); await refresh() }
    finally { setBusy(false) }
  }

  async function runOnce() {
    setRunning(true)
    try { await api.runMarketing(); await refresh() }
    finally { setRunning(false) }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Megaphone className="h-5 w-5" /> Marketing</span>}
        subtitle="The crew that sells while you sleep: for each live product it writes channel-specific promo copy and posts it on the daily cron."
      />
      <PageBody className="space-y-6">
        {loading || !status ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            {/* Toggle */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold">
                  Marketing is
                  <span className={status.enabled ? 'text-emerald-500' : 'text-muted-foreground'}>
                    {status.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  When ON, the crew promotes {status.per_run} live product{status.per_run > 1 ? 's' : ''} per day across your active channels (daily cron, 06:00 UTC).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={runOnce} disabled={running}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run one cycle now
                </button>
                <button onClick={toggle} disabled={busy}
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 transition-colors ${status.enabled ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'}`}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  {status.enabled ? 'Turn OFF' : 'Turn ON'}
                </button>
              </div>
            </div>

            {/* Delivery warning */}
            {!status.delivery_configured && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  No posting channel connected yet — the crew will still <b>write</b> the promo copy and save it here, but won’t auto-post.
                  Add an <b>Ayrshare key</b> or a <b>Zapier/Make webhook</b> on the{' '}
                  <Link href="/settings/keys" className="underline">API keys page</Link> to auto-post.
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat icon={<Send className="h-5 w-5" />} label="Promotions posted" value={String(status.promotions_sent)} />
              <Stat icon={<Megaphone className="h-5 w-5" />} label="Active channels" value={String(status.channels.length)} />
              <Stat icon={<Zap className="h-5 w-5" />} label="Per day" value={String(status.per_run)} />
            </div>

            {/* Channels */}
            {status.channels.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {status.channels.map((ch) => (
                  <span key={ch.slug} className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">{ch.name}</span>
                ))}
              </div>
            )}

            {/* Activity */}
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4" /> Recent promotions</h2>
              {status.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing yet. Turn it on or run a cycle.</p>
              ) : (
                <div className="space-y-2">
                  {status.recent.map((r, i) => (
                    <div key={i} className="rounded-lg border border-border/60 bg-background p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className={`font-semibold uppercase ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span>
                          {r.channel && r.channel !== 'system' && <span className="rounded bg-muted px-1.5 py-0.5">{r.channel}</span>}
                          {r.product_name && <span className="text-muted-foreground">· {r.product_name}</span>}
                        </span>
                        <span className="shrink-0 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      {r.content && <p className="mt-1.5 whitespace-pre-wrap text-foreground/80">{r.content}</p>}
                      {!r.content && r.note && <p className="mt-1.5 text-muted-foreground">{r.note}</p>}
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

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  )
}
