'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Rocket, Play, Loader2, TrendingUp, Package, DollarSign, Activity, Zap,
  AlertTriangle, Target, Moon, Star, ShoppingCart, CheckCircle2, X,
  ShieldOff, ShieldCheck, RefreshCw, Brain, Upload, Megaphone, ArrowRight,
  Circle, PlayCircle, ChevronRight, BarChart3,
} from 'lucide-react'
import { api, API_BASE, type AutopilotStatus } from '@/lib/api'
import { useProjectionGate } from '@/lib/projection-gate'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// ── Tab definitions ────────────────────────────────────────────────────────

const TABS = [
  { id: 'autopilot', label: 'Autopilot' },
  { id: 'autonome',  label: 'Autonome' },
  { id: 'sleep-mode', label: 'Sleep Mode' },
  { id: 'money-flow', label: 'Money Flow' },
] as const

type TabId = typeof TABS[number]['id']

// ── Main page ──────────────────────────────────────────────────────────────

function AutomationInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const tab          = (searchParams.get('tab') ?? 'autopilot') as TabId

  function setTab(t: TabId) {
    router.push(`/automation?tab=${t}`, { scroll: false })
  }

  return (
    <>
      <PageHeader
        title="Automation"
        subtitle="Autopilot engine, goal-driven loop, overnight sleep mode, and full pipeline overview."
      />
      <PageBody className="space-y-6">
        <div className="flex gap-1 border-b border-border -mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pt-2">
          {tab === 'autopilot'  && <AutopilotPanel />}
          {tab === 'autonome'   && <AutonomePanel />}
          {tab === 'sleep-mode' && <SleepModePanel />}
          {tab === 'money-flow' && <MoneyFlowPanel />}
        </div>
      </PageBody>
    </>
  )
}

export default function AutomationPage() {
  return (
    <Suspense>
      <AutomationInner />
    </Suspense>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTOPILOT PANEL
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_LABEL: Record<string, string> = {
  research: 'Researched niche',
  build:    'Built product',
  publish:  'Published',
  skip:     'Skipped',
  error:    'Error',
}

function AutopilotPanel() {
  const [status,  setStatus]  = useState<AutopilotStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)
  const [running, setRunning] = useState(false)
  const gate = useProjectionGate()

  const refresh = useCallback(async () => {
    const s = await api.getAutopilot()
    setStatus(s)
  }, [])

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [refresh])

  async function toggle() {
    if (!status) return
    setBusy(true)
    try {
      await api.toggleAutopilot({ enabled: !status.enabled })
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle autopilot'
      if (typeof window !== 'undefined') window.alert(msg)
    } finally {
      setBusy(false)
    }
  }

  async function setFlag(patch: { auto_approve?: boolean; auto_publish?: boolean }) {
    setBusy(true)
    try { await api.toggleAutopilot(patch); await refresh() }
    finally { setBusy(false) }
  }

  async function runOnce() {
    setRunning(true)
    try { await api.runAutopilot(); await refresh() }
    finally { setRunning(false) }
  }

  if (loading || !status) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }

  return (
    <div className="space-y-6">
      {status.ai_keys_configured === false && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
          <div className="text-sm space-y-1">
            <div className="font-medium">No LLM provider is configured.</div>
            <div className="text-xs text-muted-foreground">
              Autopilot will refuse to start a cycle until you add a key.{' '}
              <Link href="/settings/keys" className="underline">Open Settings → Keys</Link>{' '}
              — Groq is free and is enough to run the whole engine.
            </div>
          </div>
        </div>
      )}

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
          {status.ai_provider_source && (
            <p className="text-xs text-muted-foreground mt-1">
              Using <span className="font-mono">{status.ai_provider_source.key}</span>{' '}
              ({status.ai_provider_source.source === 'kv' ? 'saved key' : 'worker secret'})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runOnce}
            disabled={running || status.ai_keys_configured === false}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run one cycle now
          </button>
          <button onClick={toggle}
            disabled={busy || (!status.enabled && status.ai_keys_configured === false)}
            className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 transition-colors ${status.enabled ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {status.enabled ? 'Turn OFF' : 'Turn ON'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleRow label={`Auto-approve products scoring ≥ ${status.min_score}`} hint="Skip manual review for high-scoring products."
          on={status.auto_approve} busy={busy} onClick={() => setFlag({ auto_approve: !status.auto_approve })} />
        <ToggleRow label="Auto-publish approved products" hint="List them automatically when a store token is connected."
          on={status.auto_publish} busy={busy} onClick={() => setFlag({ auto_publish: !status.auto_publish })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Package className="h-5 w-5" />} label="Products built by autopilot" value={String(status.products_built)} />
        {status.est_revenue_locked || !status.est_revenue ? (
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="Estimated revenue (90-day)" value="—"
            hint={status.est_revenue_locked_reason ?? 'Available after 10 recorded sales.'} />
        ) : (
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="Estimated revenue (90-day)"
            value={`$${status.est_revenue.low.toLocaleString()}–$${status.est_revenue.high.toLocaleString()}`} />
        )}
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Top winners tracked" value={String(status.winners.length)} />
      </div>

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
                  {gate.locked ? (
                    <span className="text-muted-foreground" title={gate.reason ?? 'Projection hidden until 10 recorded sales.'}>~$—</span>
                  ) : (
                    <span className="text-emerald-500">~${w.est.toLocaleString()}</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

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
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTONOME PANEL
// ═══════════════════════════════════════════════════════════════════════════

type AutnomeGoal = {
  id: string; title: string; metric: string; target: number; period: string
  tags?: string[]; enabled?: number | boolean
}
// BUG-P1-5: API returns `generated_at`, not `started_at`.
type AutnomeRunResult = {
  generated_at: string; goals_evaluated: number; off_track: number
  actions_planned: number; tasks_enqueued: number; notifications_sent: number
  enqueue_errors: number
  actions: Array<{ goal_id?: string; status?: string; note?: string }>
}
type AutnomeRun = { id: string | number; generated_at: string; result: AutnomeRunResult }

function AutonomePanel() {
  const [goals,        setGoals]        = useState<AutnomeGoal[]>([])
  const [runs,         setRuns]         = useState<AutnomeRun[]>([])
  const [loading,      setLoading]      = useState(true)
  const [running,      setRunning]      = useState(false)
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${goals.length} goal${goals.length === 1 ? '' : 's'} · ${runs.length} recent run${runs.length === 1 ? '' : 's'}`}
        </div>
        <button onClick={trigger} disabled={running || loading || unconfigured}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run tick
        </button>
      </div>

      {unconfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
          <p className="font-medium text-amber-500">Database not configured</p>
          <p className="mt-1 text-muted-foreground">
            The Autonome tables don&apos;t exist on the connected D1 database yet.
            Run the latest migrations from <code className="rounded bg-muted px-1.5 py-0.5">apps/nexus/apps/nexus-api/migrations</code>.
          </p>
        </div>
      )}

      <AutonomeSection icon={<Target className="h-4 w-4" />} title={`Goals (${goals.length})`}>
        {goals.length === 0 ? (
          <AutonomeEmpty>No goals set yet. Create one to start steering the loop.</AutonomeEmpty>
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
      </AutonomeSection>

      <AutonomeSection icon={<Rocket className="h-4 w-4" />} title={`Recent runs (${runs.length})`}>
        {runs.length === 0 ? (
          <AutonomeEmpty>No runs yet. Hit &ldquo;Run tick&rdquo; to kick the loop manually.</AutonomeEmpty>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((r) => {
              const ts = r.generated_at ? new Date(r.generated_at) : null
              const tsLabel = ts && !isNaN(ts.getTime()) ? ts.toLocaleString() : '—'
              const enq = r.result?.tasks_enqueued ?? 0
              const errs = r.result?.enqueue_errors ?? 0
              const status = errs > 0 ? 'errors' : enq > 0 ? 'ok' : 'idle'
              const goalLabel = r.result?.actions?.[0]?.goal_id || 'autonome tick'
              return (
                <div key={String(r.id)} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{goalLabel}</div>
                    <div className="text-xs text-muted-foreground">
                      {tsLabel} · {enq} task{enq === 1 ? '' : 's'} enqueued
                      {errs > 0 ? ` · ${errs} error${errs === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${status === 'ok' ? 'bg-emerald-500/15 text-emerald-500' : status === 'errors' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                    {status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </AutonomeSection>
    </div>
  )
}

function AutonomeSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-medium">{icon} {title}</div>
      {children}
    </div>
  )
}
function AutonomeEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</div>
}

// ═══════════════════════════════════════════════════════════════════════════
// SLEEP MODE PANEL
// ═══════════════════════════════════════════════════════════════════════════

interface SleepModeState {
  kill_switch_active: boolean; enabled: boolean; auto_publish: boolean
  per_run: number; min_score: number; reject_below: number; publish_at: number
  max_spend_usd: number | null; allowed_platforms: string[]; banned_niches: string[]
}

const SM_PLATFORMS = [
  { id: 'gumroad',  label: 'Gumroad' },  { id: 'shopify',   label: 'Shopify' },
  { id: 'etsy',     label: 'Etsy' },     { id: 'substack',  label: 'Substack' },
  { id: 'kofi',     label: 'Ko-fi' },    { id: 'social',    label: 'Social channels' },
]

const SM_EMPTY: SleepModeState = {
  kill_switch_active: false, enabled: false, auto_publish: false,
  per_run: 1, min_score: 7, reject_below: 7.5, publish_at: 8.5,
  max_spend_usd: null, allowed_platforms: [], banned_niches: [],
}

function SleepModePanel() {
  const [state,      setState]      = useState<SleepModeState>(SM_EMPTY)
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [running,    setRunning]    = useState(false)
  const [runResult,  setRunResult]  = useState<{ built: number } | null>(null)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)
  const [nicheInput, setNicheInput] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await (api as any).getAutopilot() as SleepModeState & Record<string, unknown>
      setState({
        kill_switch_active: s.kill_switch_active ?? false, enabled: s.enabled ?? false,
        auto_publish: s.auto_publish ?? false, per_run: s.per_run ?? 1,
        min_score: s.min_score ?? 7, reject_below: s.reject_below ?? 7.5,
        publish_at: s.publish_at ?? 8.5, max_spend_usd: s.max_spend_usd ?? null,
        allowed_platforms: s.allowed_platforms ?? [], banned_niches: s.banned_niches ?? [],
      })
    } catch { showToast('Failed to load settings', false) }
  }, [])

  useEffect(() => { refresh().finally(() => setLoading(false)) }, [refresh])

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function save(patch: Partial<SleepModeState>) {
    setSaving(true)
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await api.toggleAutopilot(patch as any)
      setState((prev) => ({ ...prev, ...patch }))
      showToast('Saved', true)
    } catch { showToast('Save failed', false) }
    finally { setSaving(false) }
  }

  function debouncedSave(patch: Partial<SleepModeState>) {
    setState((prev) => ({ ...prev, ...patch }))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(patch), 800)
  }

  async function toggleKillSwitch() {
    const next = !state.kill_switch_active
    await save({ kill_switch_active: next })
  }

  async function runOnce() {
    setRunning(true)
    setRunResult(null)
    try {
      const r = await api.runAutopilot() as any
      setRunResult({ built: r?.built ?? 0 })
      await refresh()
    } finally { setRunning(false) }
  }

  function addNiche() {
    const n = nicheInput.trim()
    if (!n || state.banned_niches.includes(n)) return
    const next = [...state.banned_niches, n]
    setNicheInput('')
    save({ banned_niches: next })
  }

  function removeNiche(n: string) {
    save({ banned_niches: state.banned_niches.filter((x) => x !== n) })
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-destructive text-destructive-foreground'}`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {toast.msg}
        </div>
      )}

      <SleepModeSection title="Kill Switch" hint="Emergency stop — disables ALL automation globally.">
        <ToggleRow label="Kill switch" hint={state.kill_switch_active ? 'ALL automation is paused.' : 'Automation is running normally.'}
          on={state.kill_switch_active} busy={saving} onClick={toggleKillSwitch} color="blue" />
      </SleepModeSection>

      <SleepModeSection title="Overnight Mode" hint="Let the engine build while you sleep.">
        <ToggleRow label="Enable sleep mode" hint="Runs a batch during quiet hours." on={state.enabled} busy={saving}
          onClick={() => save({ enabled: !state.enabled })} />
        <ToggleRow label="Auto-publish" hint="List products immediately after the cycle." on={state.auto_publish} busy={saving}
          onClick={() => save({ auto_publish: !state.auto_publish })} />
      </SleepModeSection>

      <SleepModeSection title="Limits" hint="Control how many products are built and at what quality bar.">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Products per run', key: 'per_run', min: 1, max: 10, step: 1 },
            { label: 'Min score to keep', key: 'min_score', min: 1, max: 10, step: 0.5 },
            { label: 'Auto-publish at', key: 'publish_at', min: 1, max: 10, step: 0.5 },
          ].map(({ label, key, min, max, step }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs text-muted-foreground">{label}</label>
              <input type="number" min={min} max={max} step={step}
                value={(state as any)[key]}
                onChange={(e) => debouncedSave({ [key]: parseFloat(e.target.value) } as any)}
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Max spend (USD/run, empty = unlimited)</label>
          <input type="number" min={0} step={0.5} placeholder="No limit"
            value={state.max_spend_usd ?? ''}
            onChange={(e) => debouncedSave({ max_spend_usd: e.target.value ? parseFloat(e.target.value) : null })}
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </SleepModeSection>

      <SleepModeSection title="Allowed Platforms" hint="Only build for these. Leave empty to allow all.">
        <div className="flex flex-wrap gap-2">
          {SM_PLATFORMS.map((p) => {
            const on = state.allowed_platforms.includes(p.id)
            return (
              <button key={p.id} onClick={() => {
                const next = on ? state.allowed_platforms.filter((x) => x !== p.id) : [...state.allowed_platforms, p.id]
                save({ allowed_platforms: next })
              }} className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>
                {p.label}
              </button>
            )
          })}
        </div>
      </SleepModeSection>

      <SleepModeSection title="Banned Niches" hint="Never build products in these topics.">
        <div className="flex flex-wrap gap-2 mb-2">
          {state.banned_niches.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs text-destructive">
              {n}
              <button onClick={() => removeNiche(n)} className="hover:opacity-70"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="e.g. crypto, gambling, supplements…" value={nicheInput}
            onChange={(e) => setNicheInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNiche() } }}
            className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          <button onClick={addNiche} disabled={!nicheInput.trim() || saving}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-40 transition-colors">Add</button>
        </div>
      </SleepModeSection>

      <SleepModeSection title="Run a Test Cycle" hint="Trigger one full automation cycle now. Good for testing before you go offline.">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button onClick={runOnce} disabled={running || state.kill_switch_active}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Running cycle…' : 'Run one cycle now'}
          </button>
          {state.kill_switch_active && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Kill switch is ON — disable it first.
            </p>
          )}
          {runResult && !running && (
            <p className="text-sm text-emerald-500 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Done — {runResult.built} product{runResult.built !== 1 ? 's' : ''} built.
            </p>
          )}
        </div>
      </SleepModeSection>

      {saving && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin" /> Saving…
        </div>
      )}
    </div>
  )
}

function SleepModeSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MONEY FLOW PANEL  (was: money-workflow page)
// ═══════════════════════════════════════════════════════════════════════════

interface PipelineSummary {
  meta: { autopilot_enabled: boolean; kill_switch_active: boolean }
  stages: {
    trends:        { new: number; acted: number; total: number }
    opportunities: { new: number; scored: number; approved: number; rejected: number; total: number }
    building:      { running: number; built_today: number }
    review:        { pending: number; approved: number; rejected: number }
    publish:       { ready: number; published: number; failed: number }
    marketing:     { packaged: number; missing: number }
    revenue:       { total_products: number }
    learning:      { patterns_discovered: number; last_sync: string | null }
  }
  spend_today_usd: number
  total_products:  number
}

interface RevenueSnap { total_revenue?: number; total_sales?: number; configured?: boolean }

type Health = 'good' | 'warn' | 'idle' | 'blocked'

function trendHealth(s: PipelineSummary['stages']['trends']): Health {
  if (s.new > 5) return 'good'; if (s.total > 0) return 'warn'; return 'idle'
}
function oppHealth(s: PipelineSummary['stages']['opportunities']): Health {
  if (s.new > 0 || s.scored > 0) return 'good'; if (s.total > 0) return 'warn'; return 'idle'
}
function buildHealth(s: PipelineSummary['stages']['building']): Health {
  if (s.running > 0 || s.built_today > 0) return 'good'; return 'idle'
}
function reviewHealth(s: PipelineSummary['stages']['review']): Health {
  if (s.pending > 3) return 'warn'; if (s.pending > 0) return 'good'; return 'idle'
}
function publishHealth(s: PipelineSummary['stages']['publish']): Health {
  if (s.failed > 0) return 'blocked'; if (s.ready > 0) return 'warn'; if (s.published > 0) return 'good'; return 'idle'
}
function marketingHealth(s: PipelineSummary['stages']['marketing']): Health {
  if (s.missing > 0) return 'warn'; if (s.packaged > 0) return 'good'; return 'idle'
}
function revenueHealth(rev: RevenueSnap | null): Health {
  if (!rev?.configured) return 'idle'; if ((rev.total_revenue ?? 0) > 0) return 'good'; return 'warn'
}
function learningHealth(s: PipelineSummary['stages']['learning']): Health {
  if (s.patterns_discovered > 10) return 'good'; if (s.patterns_discovered > 0) return 'warn'; return 'idle'
}

const HEALTH_RING: Record<Health, string> = {
  good: 'ring-2 ring-emerald-500/60', warn: 'ring-2 ring-amber-500/60',
  blocked: 'ring-2 ring-destructive/60', idle: 'ring-1 ring-border',
}
const HEALTH_DOT: Record<Health, string> = {
  good: 'bg-emerald-500', warn: 'bg-amber-500', blocked: 'bg-destructive', idle: 'bg-muted-foreground/30',
}
const HEALTH_LABEL: Record<Health, string> = {
  good: 'Active', warn: 'Attention', blocked: 'Blocked', idle: 'Idle',
}

function MoneyFlowPanel() {
  const [summary, setSummary] = useState<PipelineSummary | null>(null)
  const [revenue, setRevenue] = useState<RevenueSnap | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('nexus_token') ?? '' : ''
      const r = await fetch(`${API_BASE}/api/pipeline/summary`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (r.ok) setSummary(await r.json())
      const rev = await api.getRevenue().catch(() => null)
      setRevenue(rev as RevenueSnap | null)
    } catch {/* ignore */}
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading pipeline…</div>
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Pipeline summary unavailable. Is the API running?</p>
        <button onClick={() => load(true)} className="text-xs underline text-muted-foreground hover:text-foreground">Retry</button>
      </div>
    )
  }

  const st = summary.stages

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${summary.meta.kill_switch_active ? 'bg-destructive/15' : summary.meta.autopilot_enabled ? 'bg-emerald-500/15' : 'bg-muted'}`}>
            {summary.meta.kill_switch_active ? <ShieldOff className="h-4 w-4 text-destructive" /> : summary.meta.autopilot_enabled ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div>
            <div className="text-sm font-semibold">
              {summary.meta.kill_switch_active ? 'Kill switch ON — all automation paused' : summary.meta.autopilot_enabled ? 'Autopilot running' : 'Autopilot OFF'}
            </div>
            {summary.spend_today_usd > 0 && (
              <div className="text-xs text-muted-foreground">${summary.spend_today_usd.toFixed(2)} spent today · {summary.total_products} total products</div>
            )}
          </div>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50 transition-colors">
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StageCard icon={<TrendingUp className="h-5 w-5" />} title="Trends" description="New niches to explore"
          health={trendHealth(st.trends)} metric={st.trends.new} metricLabel="new trends" secondaryMetric={`${st.trends.total} total`} href="/trends" cta="Browse trends" />
        <StageCard icon={<Brain className="h-5 w-5" />} title="Opportunities" description="Scored and waiting for approval"
          health={oppHealth(st.opportunities)} metric={st.opportunities.new} metricLabel="new opportunities"
          secondaryMetric={`${st.opportunities.scored} scored`} href="/opportunities" cta="Review opps" />
        <StageCard icon={<Package className="h-5 w-5" />} title="Building" description="Agent team building products"
          health={buildHealth(st.building)} metric={st.building.running} metricLabel="running now"
          secondaryMetric={`${st.building.built_today} built today`} href="/jobs" cta="View jobs" />
        <StageCard icon={<ShieldCheck className="h-5 w-5" />} title="Review" description="Products awaiting your approval"
          health={reviewHealth(st.review)} metric={st.review.pending} metricLabel="awaiting review"
          secondaryMetric={st.review.approved > 0 ? `${st.review.approved} approved` : undefined}
          href="/review" cta="Review queue" urgent={st.review.pending > 0} />
        <StageCard icon={<Upload className="h-5 w-5" />} title="Publish" description="List on Gumroad, Shopify, and connected platforms"
          health={publishHealth(st.publish)} metric={st.publish.ready} metricLabel="ready to publish"
          secondaryMetric={`${st.publish.published} live`} href="/publish" cta="Publish center"
          urgent={st.publish.failed > 0} urgentLabel={st.publish.failed > 0 ? `${st.publish.failed} failed` : undefined} />
        <StageCard icon={<Megaphone className="h-5 w-5" />} title="Marketing" description="Posts, emails, SEO copy"
          health={marketingHealth(st.marketing)} metric={st.marketing.packaged} metricLabel="products packaged"
          secondaryMetric={st.marketing.missing > 0 ? `${st.marketing.missing} missing pack` : undefined}
          href="/marketing" cta="Marketing hub" urgent={st.marketing.missing > 0} />
        <StageCard icon={<DollarSign className="h-5 w-5" />} title="Revenue" description="Real sales synced from connected platforms"
          health={revenueHealth(revenue)} metric={revenue?.total_revenue ?? null} metricLabel="total revenue" metricPrefix="$"
          secondaryMetric={revenue?.total_sales != null ? `${revenue.total_sales} sales` : 'Connect Gumroad →'} href="/revenue" cta="Revenue dashboard" />
        <StageCard icon={<Activity className="h-5 w-5" />} title="Learning Loop" description="Winners feed the next ideas automatically"
          health={learningHealth(st.learning)} metric={st.learning.patterns_discovered} metricLabel="patterns found"
          secondaryMetric={st.learning.last_sync ? `Last sync ${new Date(st.learning.last_sync).toLocaleDateString()}` : 'Not synced yet'}
          href="/learning" cta="View patterns" />
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <h2 className="text-sm font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <QuickLink href="/automation?tab=sleep-mode" icon={<Zap className="h-3.5 w-3.5" />} label="Sleep Mode settings" />
          <QuickLink href="/trends" icon={<TrendingUp className="h-3.5 w-3.5" />} label="Browse new trends" />
          <QuickLink href="/review" icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Review queue" />
          <QuickLink href="/marketing" icon={<Megaphone className="h-3.5 w-3.5" />} label="Generate marketing packs" />
          <QuickLink href="/observability" icon={<Activity className="h-3.5 w-3.5" />} label="System health" />
        </div>
      </div>

      <MFRecommendedSettings />
    </div>
  )
}

function StageCard({
  icon, title, description, health, metric, metricLabel, metricPrefix,
  secondaryMetric, href, cta, highlight, urgent, urgentLabel,
}: {
  icon: React.ReactNode; title: string; description: string; health: Health
  metric: number | null | undefined; metricLabel: string; metricPrefix?: string
  secondaryMetric?: string; href: string; cta: string; highlight?: boolean
  urgent?: boolean; urgentLabel?: string
}) {
  return (
    <Link href={href}
      className={`group flex flex-col gap-3 rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm ${HEALTH_RING[health]}`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${health === 'good' ? 'bg-emerald-500/10 text-emerald-500' : health === 'blocked' ? 'bg-destructive/10 text-destructive' : health === 'warn' ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
          {icon}
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${health === 'good' ? 'text-emerald-500' : health === 'blocked' ? 'text-destructive' : health === 'warn' ? 'text-amber-500' : 'text-muted-foreground'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[health]}`} />
          {HEALTH_LABEL[health]}
        </span>
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <div className="flex-1">
        {metric != null ? (
          <div className={`text-2xl font-bold tabular-nums ${highlight ? 'text-emerald-500' : urgent ? 'text-amber-500' : ''}`}>
            {metricPrefix}{typeof metric === 'number' ? metric.toLocaleString() : metric}
          </div>
        ) : (
          <div className="text-2xl font-bold text-muted-foreground">—</div>
        )}
        <div className="text-xs text-muted-foreground">{metricLabel}</div>
        {urgentLabel && <div className="mt-1 text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {urgentLabel}</div>}
        {secondaryMetric && !urgentLabel && <div className="mt-1 text-xs text-muted-foreground/70">{secondaryMetric}</div>}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 pt-2 mt-auto">
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{cta}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </Link>
  )
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
      {icon}{label}<ArrowRight className="h-3 w-3 text-muted-foreground" />
    </Link>
  )
}

function MFRecommendedSettings() {
  const [applied, setApplied] = useState(false)
  const [loading, setLoading] = useState(false)

  async function applyDefaults() {
    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('nexus_token') ?? '' : ''
      await fetch(`${API_BASE}/api/pipeline/seed-defaults`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      setApplied(true)
    } finally { setLoading(false) }
  }

  if (applied) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-500">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Starter settings applied — autopilot ON, auto-publish OFF, min score 8, max 1 product/night, $2 spend cap.
        <Link href="/automation?tab=sleep-mode" className="underline ml-auto shrink-0">Adjust →</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-500">
          <AlertTriangle className="h-4 w-4" /> First time? Apply recommended starter settings
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Autopilot ON · Auto-publish OFF · Min score 8 · 1 product/night · $2 spend cap.
        </p>
      </div>
      <button onClick={applyDefaults} disabled={loading}
        className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-500/90 disabled:opacity-50 transition-colors">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
        Apply starter settings
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// Single ToggleRow used by both Autopilot and Sleep Mode panels
function ToggleRow({ label, hint, on, busy, onClick, color = 'emerald' }: {
  label: string; hint: string; on: boolean; busy: boolean; onClick: () => void; color?: 'emerald' | 'blue'
}) {
  const track = on ? (color === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500') : 'bg-muted'
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card/50 p-4">
      <div className="min-w-0 pr-3">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <button onClick={onClick} disabled={busy} aria-pressed={on}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${track}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
  )
}
