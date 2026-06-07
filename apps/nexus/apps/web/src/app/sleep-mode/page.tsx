'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Moon, Zap, Play, Loader2, DollarSign, Star, Package,
  ShoppingCart, AlertTriangle, CheckCircle2, X, ShieldOff, ShieldCheck, RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// ── Types ──────────────────────────────────────────────────────────────────

interface SleepModeState {
  // master switches
  kill_switch_active: boolean
  enabled:            boolean
  auto_publish:       boolean
  // limits
  per_run:            number
  min_score:          number
  reject_below:       number
  publish_at:         number
  max_spend_usd:      number | null
  // platform / niche controls
  allowed_platforms:  string[]
  banned_niches:      string[]
}

const PLATFORMS = [
  { id: 'gumroad',   label: 'Gumroad' },
  { id: 'shopify',   label: 'Shopify' },
  { id: 'etsy',      label: 'Etsy' },
  { id: 'substack',  label: 'Substack' },
  { id: 'kofi',      label: 'Ko-fi' },
  { id: 'social',    label: 'Social channels' },
]

const EMPTY: SleepModeState = {
  kill_switch_active: false,
  enabled:            false,
  auto_publish:       false,
  per_run:            1,
  min_score:          7,
  reject_below:       7.5,
  publish_at:         8.5,
  max_spend_usd:      null,
  allowed_platforms:  [],
  banned_niches:      [],
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SleepModePage() {
  const [state, setState]       = useState<SleepModeState>(EMPTY)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [running, setRunning]   = useState(false)
  const [runResult, setRunResult] = useState<{ built: number } | null>(null)
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null)
  const [nicheInput, setNicheInput] = useState('')
  const saveTimer               = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      // getAutopilot returns the extended status (after applying the API addendum)
      const s = await (api as any).getAutopilot() as SleepModeState & Record<string, unknown>
      setState({
        kill_switch_active: s.kill_switch_active ?? false,
        enabled:            s.enabled            ?? false,
        auto_publish:       s.auto_publish        ?? false,
        per_run:            s.per_run             ?? 1,
        min_score:          s.min_score           ?? 7,
        reject_below:       s.reject_below        ?? 7.5,
        publish_at:         s.publish_at          ?? 8.5,
        max_spend_usd:      s.max_spend_usd       ?? null,
        allowed_platforms:  s.allowed_platforms   ?? [],
        banned_niches:      s.banned_niches       ?? [],
      })
    } catch {
      showToast('Failed to load settings', false)
    }
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  // ── Save helpers ──────────────────────────────────────────────────────────

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function save(patch: Partial<SleepModeState>) {
    setSaving(true)
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      await (api as any).toggleAutopilot(patch)
      showToast('Saved', true)
    } catch {
      showToast('Failed to save', false)
    } finally {
      setSaving(false)
    }
  }

  // Debounce numeric field saves (don't fire on every keystroke)
  function scheduleNumericSave(patch: Partial<SleepModeState>) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(patch), 800)
  }

  // ── Kill switch ───────────────────────────────────────────────────────────

  async function toggleKillSwitch() {
    setSaving(true)
    try {
      const next = !state.kill_switch_active
      await (api as any).toggleAutopilot({ kill_switch_active: next })
      setState((s) => ({ ...s, kill_switch_active: next }))
      showToast(next ? '🛑 Kill switch ON — automation stopped' : '✅ Kill switch OFF — automation resumed', next ? false : true)
    } catch {
      showToast('Failed to toggle kill switch', false)
    } finally {
      setSaving(false)
    }
  }

  // ── Simple toggle helper ───────────────────────────────────────────────────

  function toggle(field: 'enabled' | 'auto_publish') {
    const next = !state[field]
    setState((s) => ({ ...s, [field]: next }))
    save({ [field]: next })
  }

  // ── Platform helpers ──────────────────────────────────────────────────────

  function togglePlatform(id: string) {
    const cur = state.allowed_platforms
    const next = cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]
    setState((s) => ({ ...s, allowed_platforms: next }))
    save({ allowed_platforms: next })
  }

  // ── Banned niches helpers ─────────────────────────────────────────────────

  function addNiche() {
    const v = nicheInput.trim().toLowerCase()
    if (!v || state.banned_niches.includes(v)) { setNicheInput(''); return }
    const next = [...state.banned_niches, v]
    setState((s) => ({ ...s, banned_niches: next }))
    save({ banned_niches: next })
    setNicheInput('')
  }

  function removeNiche(n: string) {
    const next = state.banned_niches.filter((x) => x !== n)
    setState((s) => ({ ...s, banned_niches: next }))
    save({ banned_niches: next })
  }

  // ── Run one cycle ─────────────────────────────────────────────────────────

  async function runOnce() {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await (api as any).runAutopilot() as { built: number }
      setRunResult(res)
      showToast(`Cycle complete — ${res.built} product${res.built !== 1 ? 's' : ''} built`, true)
      await refresh()
    } catch {
      showToast('Cycle failed', false)
    } finally {
      setRunning(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <PageHeader title={<span className="flex items-center gap-2"><Moon className="h-5 w-5" /> Sleep Mode</span>} subtitle="Control how autonomous the system is while you sleep." />
        <PageBody>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Moon className="h-5 w-5" /> Sleep Mode</span>}
        subtitle="Control exactly how autonomous the system is. Set limits, choose platforms, and ban risky niches — then go to sleep."
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg text-white transition-opacity ${toast.ok ? 'bg-emerald-600' : 'bg-destructive'}`}>
          {toast.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      <PageBody className="space-y-5">

        {/* ── Kill switch ─────────────────────────────────────────────────── */}
        <div className={`flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between transition-colors ${state.kill_switch_active ? 'border-destructive/60 bg-destructive/10' : 'border-border bg-card/50'}`}>
          <div className="flex items-start gap-3">
            {state.kill_switch_active
              ? <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
            <div>
              <div className="font-semibold text-base">Emergency Kill Switch</div>
              <p className="text-sm text-muted-foreground">
                {state.kill_switch_active
                  ? 'ALL automation is stopped. No products are being built or published.'
                  : 'Automation is running normally. Flip to instantly stop everything.'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleKillSwitch}
            disabled={saving}
            className={`shrink-0 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50 transition-colors ${state.kill_switch_active ? 'bg-emerald-600 hover:bg-emerald-600/90 text-white' : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'}`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {state.kill_switch_active ? 'Resume automation' : 'Stop everything now'}
          </button>
        </div>

        {/* ── Master switches ──────────────────────────────────────────────── */}
        <Section title="Automation Controls">
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Autopilot"
              hint="Master switch — when OFF, no products are built automatically."
              on={state.enabled}
              busy={saving}
              onClick={() => toggle('enabled')}
              color="emerald"
            />
            <ToggleRow
              label="Auto-publish"
              hint="Publish approved products automatically. Turn OFF to build without going live."
              on={state.auto_publish}
              busy={saving}
              onClick={() => toggle('auto_publish')}
              color="blue"
            />
          </div>
        </Section>

        {/* ── Limits ──────────────────────────────────────────────────────── */}
        <Section title="Limits">
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Max products per night */}
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                <Package className="h-4 w-4 text-muted-foreground" /> Max products / night
              </div>
              <p className="text-xs text-muted-foreground mb-3">Caps how many products the system builds per cron run (daily at 07:00 UTC).</p>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={1} max={20} step={1}
                  value={state.per_run}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setState((s) => ({ ...s, per_run: v }))
                    scheduleNumericSave({ per_run: v })
                  }}
                  className="flex-1 accent-primary"
                />
                <span className="w-6 text-center text-sm font-bold tabular-nums">{state.per_run}</span>
              </div>
            </div>

            {/* Min score */}
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                <Star className="h-4 w-4 text-muted-foreground" /> Min score threshold
              </div>
              <p className="text-xs text-muted-foreground mb-3">Only products scoring at or above this are auto-approved and published.</p>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={10} step={0.5}
                  value={state.min_score}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setState((s) => ({ ...s, min_score: v }))
                    scheduleNumericSave({ min_score: v })
                  }}
                  className="flex-1 accent-primary"
                />
                <span className="w-10 text-center text-sm font-bold tabular-nums">{state.min_score.toFixed(1)}</span>
              </div>
            </div>

            {/* Max spend */}
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" /> Max daily AI spend
              </div>
              <p className="text-xs text-muted-foreground mb-3">Estimated USD cap per day. Leave blank for no limit.</p>
              <div className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 text-muted-foreground text-sm">$</span>
                <input
                  type="number" min={0} step={1} placeholder="No limit"
                  value={state.max_spend_usd ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value
                    const v = raw === '' ? null : Number(raw)
                    setState((s) => ({ ...s, max_spend_usd: v }))
                    scheduleNumericSave({ max_spend_usd: v })
                  }}
                  className="min-w-0 flex-1 rounded-md border border-border bg-muted px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        </Section>

        {/* ── Publish quality gate ─────────────────────────────────────────── */}
        <Section
          title="Publish Quality Gate"
          hint="Scores are on a 0–10 scale. Products below the reject line are discarded, the middle band is kept as drafts for manual review, and only the top band is eligible for auto-publishing."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                <ShieldOff className="h-4 w-4 text-destructive" /> Reject below
              </div>
              <p className="text-xs text-muted-foreground mb-3">Anything scoring under this is auto-rejected.</p>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={10} step={0.1}
                  value={state.reject_below}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setState((s) => ({ ...s, reject_below: v }))
                    scheduleNumericSave({ reject_below: v })
                  }}
                  className="flex-1 accent-destructive"
                />
                <span className="w-10 text-center text-sm font-bold tabular-nums">{state.reject_below.toFixed(1)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Publish at
              </div>
              <p className="text-xs text-muted-foreground mb-3">Products at or above this are eligible for Sleep Mode publishing.</p>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={10} step={0.1}
                  value={state.publish_at}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setState((s) => ({ ...s, publish_at: v }))
                    scheduleNumericSave({ publish_at: v })
                  }}
                  className="flex-1 accent-emerald-500"
                />
                <span className="w-10 text-center text-sm font-bold tabular-nums">{state.publish_at.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Live band summary */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-2 text-destructive">
              <div className="font-semibold">Reject</div>
              <div className="tabular-nums">&lt; {state.reject_below.toFixed(1)}</div>
            </div>
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-amber-600 dark:text-amber-400">
              <div className="font-semibold">Draft only</div>
              <div className="tabular-nums">{state.reject_below.toFixed(1)}–{(Math.max(state.reject_below, state.publish_at) - 0.1).toFixed(1)}</div>
            </div>
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-2 text-emerald-600 dark:text-emerald-400">
              <div className="font-semibold">Auto-publish</div>
              <div className="tabular-nums">{Math.max(state.reject_below, state.publish_at).toFixed(1)}+</div>
            </div>
          </div>
        </Section>

        {/* ── Allowed platforms ────────────────────────────────────────────── */}
        <Section title="Allowed Platforms" hint="When none are selected, all platforms are allowed. Select specific ones to restrict publishing.">
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = state.allowed_platforms.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  disabled={saving}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30'}`}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  {p.label}
                  {on && <CheckCircle2 className="h-3.5 w-3.5" />}
                </button>
              )
            })}
          </div>
          {state.allowed_platforms.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Publishing restricted to: {state.allowed_platforms.join(', ')}
            </p>
          )}
        </Section>

        {/* ── Banned niches ────────────────────────────────────────────────── */}
        <Section title="Banned Niches" hint="Any niche containing one of these keywords will be skipped by autopilot.">
          <div className="flex flex-wrap gap-2 mb-3">
            {state.banned_niches.length === 0 && (
              <span className="text-sm text-muted-foreground">No banned niches yet.</span>
            )}
            {state.banned_niches.map((n) => (
              <span key={n} className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                {n}
                <button onClick={() => removeNiche(n)} className="hover:text-destructive/70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. crypto, gambling, supplements…"
              value={nicheInput}
              onChange={(e) => setNicheInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNiche() } }}
              className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={addNiche}
              disabled={!nicheInput.trim() || saving}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        </Section>

        {/* ── Test cycle ──────────────────────────────────────────────────── */}
        <Section title="Run a Test Cycle" hint="Trigger one full automation cycle right now without waiting for the nightly cron. Good for testing before you go offline.">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <button
              onClick={runOnce}
              disabled={running || state.kill_switch_active}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
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
                <CheckCircle2 className="h-4 w-4" />
                Done — {runResult.built} product{runResult.built !== 1 ? 's' : ''} built.
              </p>
            )}
          </div>
        </Section>

        {/* ── Save indicator ───────────────────────────────────────────────── */}
        {saving && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" /> Saving…
          </div>
        )}

      </PageBody>
    </>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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

function ToggleRow({
  label, hint, on, busy, onClick, color = 'emerald',
}: {
  label: string; hint: string; on: boolean; busy: boolean; onClick: () => void; color?: 'emerald' | 'blue'
}) {
  const track = on
    ? color === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500'
    : 'bg-muted'
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-4">
      <div className="min-w-0 pr-3">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <button
        onClick={onClick}
        disabled={busy}
        aria-pressed={on}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${track}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}
