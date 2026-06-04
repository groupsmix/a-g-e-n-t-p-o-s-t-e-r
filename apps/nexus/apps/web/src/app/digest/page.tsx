'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Sunrise, Package, ShieldCheck, DollarSign, Wallet, CalendarClock,
  AlertTriangle, Trophy, ArrowRight, RefreshCw, Mail, Clock, Loader2,
} from 'lucide-react'
import { api, type Digest, type DigestRecord } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

type Tab = 'today' | 'history' | 'settings'

export default function DigestPage() {
  const [tab, setTab] = useState<Tab>('today')
  const [digest, setDigest] = useState<Digest | null>(null)
  const [history, setHistory] = useState<DigestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [emailStatus, setEmailStatus] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.getDigest().then(setDigest).catch(() => null),
      api.getDigestHistory().then((r) => setHistory(r.digests)).catch(() => []),
    ]).finally(() => setLoading(false))
  }, [])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const r = await api.generateDigest()
      setDigest(r.digest)
      const h = await api.getDigestHistory()
      setHistory(h.digests)
    } finally {
      setGenerating(false)
    }
  }

  async function handleEmail() {
    setEmailing(true)
    setEmailStatus(null)
    try {
      const r = await api.sendDigestEmail()
      setEmailStatus(r.ok ? 'Sent!' : `Failed: ${r.status}`)
    } catch {
      setEmailStatus('Error sending email')
    } finally {
      setEmailing(false)
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Daily Digest" subtitle="Your morning report — what happened while you slept." />
        <PageBody className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Sunrise className="h-7 w-7 text-primary" /> Daily Digest</span>}
        subtitle="Your morning report — what happened while you slept."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Generate
            </button>
            <button
              onClick={handleEmail}
              disabled={emailing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {emailing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Email now
            </button>
          </div>
        }
      />
      <PageBody className="space-y-6">
        {emailStatus && (
          <div className={`rounded-xl border p-3 text-sm ${emailStatus.startsWith('Sent') ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>
            {emailStatus}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-card/60 p-1 border border-border w-fit">
          {(['today', 'history', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-xs font-medium capitalize transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'today' && digest && <TodayView digest={digest} />}
        {tab === 'today' && !digest && (
          <div className="text-center py-12 text-muted-foreground">
            <Sunrise className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No digest available yet. Click Generate to create one.</p>
          </div>
        )}
        {tab === 'history' && <HistoryView history={history} />}
        {tab === 'settings' && <SettingsView />}
      </PageBody>
    </>
  )
}

function TodayView({ digest: d }: { digest: Digest }) {
  const heroStats = [
    {
      icon: <Package className="h-5 w-5" />,
      label: 'Products Built',
      value: String(d.built_24h),
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      icon: <DollarSign className="h-5 w-5" />,
      label: 'Revenue',
      value: d.sales_configured ? `$${d.total_revenue.toFixed(2)}` : '—',
      sub: d.sales_configured ? `${d.total_sales} orders` : 'connect Gumroad',
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    {
      icon: <Trophy className="h-5 w-5" />,
      label: 'Products Sold',
      value: d.sales_configured ? String(d.total_sales) : '—',
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      label: 'Pending Reviews',
      value: String(d.needs_review),
      color: d.needs_review > 0 ? 'text-amber-500' : 'text-muted-foreground',
      bgColor: d.needs_review > 0 ? 'bg-amber-500/10' : 'bg-muted/10',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Hero stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {heroStats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-gradient-card p-5 shadow-card">
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${s.bgColor} ${s.color}`}>
                {s.icon}
              </span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <div className={`mt-3 text-3xl font-bold ${s.color}`}>{s.value}</div>
            {s.sub && <div className="mt-0.5 text-xs text-muted-foreground">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Secondary stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Wallet className="h-4 w-4" /> AI Spend
          </div>
          <div className="text-xl font-bold">${d.spend_today.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">
            {d.spend_cap > 0 ? `of $${d.spend_cap.toFixed(2)} cap` : 'free models'}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <CalendarClock className="h-4 w-4" /> Schedules Ran
          </div>
          <div className="text-xl font-bold">{d.schedules_ran}</div>
          <div className="text-xs text-muted-foreground">
            <span className="text-emerald-500">{d.schedules_succeeded} ok</span>
            {d.schedules_failed > 0 && <span className="text-red-500 ml-2">{d.schedules_failed} failed</span>}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Package className="h-4 w-4" /> Status
          </div>
          <div className="text-xl font-bold">{d.published} published</div>
          <div className="text-xs text-muted-foreground">{d.approved} approved</div>
        </div>
      </div>

      {/* Activity timeline */}
      {d.recent.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/50 p-5 shadow-card">
          <h3 className="flex items-center gap-2 text-sm font-semibold mb-4">
            <Clock className="h-4 w-4 text-primary" /> Activity Timeline
          </h3>
          <div className="space-y-3">
            {d.recent.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                <span className="flex-1 text-foreground">{r.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best performer */}
      {(d.best_seller || d.top_product) && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-card">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-500 mb-2">
            <Trophy className="h-4 w-4" /> Top Performer
          </h3>
          {d.best_seller && <p className="text-sm">Best seller: <span className="font-semibold">{d.best_seller}</span></p>}
          {d.top_product && <p className="text-sm text-muted-foreground">Latest completed: {d.top_product}</p>}
        </div>
      )}

      {/* Issues section */}
      {d.errors.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 shadow-card">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-500 mb-3">
            <AlertTriangle className="h-4 w-4" /> Needs Attention
          </h3>
          <ul className="space-y-2">
            {d.errors.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                <div>
                  <span className="font-medium">{e.product_name ?? 'Unknown product'}</span>
                  <span className="text-muted-foreground"> — failed at {e.failed_step ?? 'unknown step'}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/review" className="group flex items-center justify-between rounded-2xl border border-border bg-gradient-card p-4 shadow-card hover:border-primary/40 hover:shadow-glow transition-all">
          <span className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" /> Review pending products
            {d.needs_review > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-500">{d.needs_review}</span>}
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <Link href="/revenue" className="group flex items-center justify-between rounded-2xl border border-border bg-gradient-card p-4 shadow-card hover:border-primary/40 hover:shadow-glow transition-all">
          <span className="flex items-center gap-2 text-sm font-medium">
            <DollarSign className="h-4 w-4 text-primary" /> Check revenue
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <Link href="/history" className="group flex items-center justify-between rounded-2xl border border-border bg-gradient-card p-4 shadow-card hover:border-primary/40 hover:shadow-glow transition-all">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-primary" /> View run history
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  )
}

function HistoryView({ history }: { history: DigestRecord[] }) {
  const [selected, setSelected] = useState<DigestRecord | null>(null)

  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No past digests yet. Generate one to start building history.</p>
      </div>
    )
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="text-xs text-primary hover:underline"
        >
          &larr; Back to history
        </button>
        <div className="text-lg font-bold">{selected.date}</div>
        <TodayView digest={selected.data} />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {history.map((h) => (
        <button
          key={h.id}
          onClick={() => setSelected(h)}
          className="w-full flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors text-left"
        >
          <div>
            <div className="text-sm font-semibold">{h.date}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {h.data.built_24h} built · ${h.data.total_revenue.toFixed(2)} revenue · {h.data.needs_review} pending
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

function SettingsView() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card max-w-lg space-y-4">
      <h3 className="text-sm font-semibold">Digest Email Settings</h3>
      <p className="text-xs text-muted-foreground">
        The daily digest is emailed automatically at 07:00 UTC when a Resend API key and recipient email are configured in your API keys settings.
      </p>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">Email delivery</span>
          <Link href="/settings/keys" className="text-xs text-primary hover:underline">
            Configure in API Keys &rarr;
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Schedule</span>
          <span className="text-xs text-muted-foreground">Daily at 07:00 UTC</span>
        </div>
      </div>
    </div>
  )
}
