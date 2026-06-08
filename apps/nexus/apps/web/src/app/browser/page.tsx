'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Globe2,
  Loader2,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  XCircle,
  MousePointerClick,
  Keyboard,
  Navigation,
  Camera,
  Clock,
  Square,
  Brain,
  Eye,
  Play,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import {
  api,
  API_BASE,
  type BrowseResult,
  type AgentEvent,
  type BrowserAction,
} from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { VoiceInput } from '@/components/VoiceInput'

type Tab = 'agent' | 'quick'

export default function BrowserPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('agent')

  useEffect(() => {
    api.browserStatus().then((s) => setEnabled(s.enabled)).catch(() => setEnabled(false))
  }, [])

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Globe2 className="h-5 w-5" /> Browser
          </span>
        }
        subtitle="An autonomous AI agent drives a real Chromium — give it a goal and watch it work, step by step."
      />
      <PageBody className="max-w-4xl space-y-5">
        {enabled === false && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
            Browser Rendering isn&apos;t enabled on the API worker yet. It needs the Workers Paid plan and the
            <code className="mx-1 rounded bg-background/60 px-1">[browser]</code> binding.
          </div>
        )}

        <div className="inline-flex rounded-lg border border-border bg-card p-1 text-sm">
          <TabButton active={tab === 'agent'} onClick={() => setTab('agent')}>
            <Sparkles className="h-4 w-4" /> AI Agent
          </TabButton>
          <TabButton active={tab === 'quick'} onClick={() => setTab('quick')}>
            <Globe2 className="h-4 w-4" /> Quick browse
          </TabButton>
        </div>

        {tab === 'agent' ? <AgentTab /> : <QuickBrowseTab />}
      </PageBody>
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// Tab: Devin-style autonomous Agent — observe → think → act loop,
// streamed live over SSE.
// ──────────────────────────────────────────────────────────────

function AgentTab() {
  const [goal, setGoal] = useState('')
  const [startUrl, setStartUrl] = useState('')
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<AgentEvent[]>([])
  // Latest live frame (inline JPEG data URL) streamed by the API while an
  // action runs. Kept out of the event list so the feed doesn't bloat with
  // hundreds of base64 blobs.
  const [liveFrame, setLiveFrame] = useState<string | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  // Auto-scroll feed as new events arrive
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [events.length])

  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!goal.trim() || running) return
    setEvents([])
    setLiveFrame(null)
    setError('')
    setRunning(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`${API_BASE}/api/browser-agent/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          startUrl: startUrl.trim() || undefined,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        setError(`Could not start agent (HTTP ${res.status}). ${text.slice(0, 200)}`)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Split on double-newline (SSE event boundary)
        let boundary
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)

          const dataLine = rawEvent
            .split('\n')
            .find((l) => l.startsWith('data: '))
          if (!dataLine) continue

          try {
            const evt = JSON.parse(dataLine.slice(6)) as AgentEvent
            // Frame events are huge (base64 JPEG) and arrive at ~1.5fps.
            // Route them to the live viewport only — never into the event log,
            // or memory grows unbounded and the React tree thrashes.
            if (evt.type === 'frame' && evt.screenshotDataUrl) {
              setLiveFrame(evt.screenshotDataUrl)
            } else {
              setEvents((prev) => [...prev, evt])
              // Also use observation screenshots as live frames so the viewport
              // reflects the most recent state between actions.
              if (evt.type === 'observation' && evt.screenshotUrl) {
                setLiveFrame(evt.screenshotUrl)
              }
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message)
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
  }

  const stepGroups = useMemo(() => groupByStep(events), [events])
  const doneEvent = events.find((e) => e.type === 'done')
  const lastError = [...events].reverse().find((e) => e.type === 'error' && e.step === -1)
  const hasStarted = events.length > 0

  const samples = [
    'Open hacker news and tell me the top 3 stories',
    'Test my landing page at posteragent.com — try clicking around and report anything broken',
    'Search github trending for typescript repos this week',
    'Go to weather.com and find the forecast for Casablanca',
  ]

  return (
    <div className="space-y-5">
      <form onSubmit={start} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Goal for the agent
          </label>
          <div className="flex items-start gap-2">
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Test my landing page for broken links and confusing copy"
              rows={3}
              className="input min-h-[88px] flex-1 resize-y"
              disabled={running}
            />
            <VoiceInput
              disabled={running}
              label="Voice"
              onTranscript={(t) => setGoal((prev) => (prev ? `${prev} ${t}` : t))}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Starting URL hint <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            value={startUrl}
            onChange={(e) => setStartUrl(e.target.value)}
            placeholder="e.g. https://news.ycombinator.com"
            className="input w-full"
            disabled={running}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
            >
              <Square className="h-4 w-4 fill-current" /> Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!goal.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-current" />
              Run agent
            </button>
          )}

          {!running && !goal && (
            <div className="flex flex-wrap items-center gap-1.5">
              {samples.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setGoal(s)}
                  className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>
      )}

      {lastError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Agent error
          </div>
          <div className="mt-1">{lastError.error}</div>
        </div>
      )}

      {/* Live status banner */}
      {hasStarted && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2 text-sm shadow-card">
          <div className="flex items-center gap-2">
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium">Agent is working…</span>
                <span className="text-xs text-muted-foreground">
                  step {Math.max(0, ...events.map((e) => e.step))}
                </span>
              </>
            ) : doneEvent ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="font-medium">Done</span>
                <span className="text-xs text-muted-foreground">
                  {doneEvent.totalMs ? `${(doneEvent.totalMs / 1000).toFixed(1)}s · ` : ''}
                  {doneEvent.step} steps
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="font-medium">Stopped</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Live viewport — updates every ~600ms while the AI works */}
      {(running || liveFrame) && (
        <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-card">
          <div className="flex items-center justify-between border-b border-border bg-card/60 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              {running ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  <span className="font-medium uppercase tracking-wide text-red-500">Live</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <span className="font-medium uppercase tracking-wide text-muted-foreground">Last frame</span>
                </>
              )}
              <span className="text-muted-foreground">AI agent viewport</span>
            </div>
          </div>
          <div className="relative aspect-[16/10] w-full bg-black">
            {liveFrame ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={liveFrame}
                alt="Live browser viewport"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Waiting for first frame…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Final answer */}
      {doneEvent && doneEvent.answer && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 shadow-card">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" /> Final answer
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{doneEvent.answer}</p>
        </div>
      )}

      {/* Live step feed */}
      {stepGroups.length > 0 && (
        <div
          ref={feedRef}
          className="max-h-[70vh] space-y-3 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-card"
        >
          {stepGroups.map((g) => (
            <StepCard key={g.step} step={g.step} events={g.events} />
          ))}
        </div>
      )}
    </div>
  )
}

function StepCard({
  step,
  events,
}: {
  step: number
  events: AgentEvent[]
}) {
  const obs = events.find((e) => e.type === 'observation')
  const think = events.find((e) => e.type === 'thinking')
  const act = events.find((e) => e.type === 'action')
  const stepError = events.find((e) => e.type === 'error')
  const done = events.find((e) => e.type === 'done')
  const stepFailed = !!act?.error || !!stepError

  // Every step starts expanded so the user always sees the latest activity.
  // They can collapse older steps as they go.
  const [open, setOpen] = useState(true)

  const title = act
    ? formatActionTitle(act.action)
    : think
      ? truncate(think.thought || 'Thinking…', 80)
      : obs
        ? `Observing ${obs.pageTitle || obs.pageUrl || 'page'}`
        : `Step ${step}`

  return (
    <div
      className={`rounded-xl border ${
        stepFailed
          ? 'border-red-500/30 bg-red-500/5'
          : done
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-border bg-background/40'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
            stepFailed
              ? 'border-red-500/40 bg-red-500/10 text-red-500'
              : done
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                : 'border-border bg-background text-muted-foreground'
          }`}
          aria-hidden
        >
          {act ? (
            <ActionIcon action={act.action} />
          ) : think ? (
            <Brain className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-medium">
              <span className="text-muted-foreground">Step {step}</span> · {title}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </div>
          </div>
          {!open && think?.thought && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{think.thought}</div>
          )}
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 px-3 py-3">
          {obs?.pageUrl && (
            <div className="flex items-center gap-2 text-xs">
              <Globe2 className="h-3 w-3 text-muted-foreground" />
              <span className="truncate font-mono text-muted-foreground">{obs.pageUrl}</span>
            </div>
          )}
          {think?.thought && (
            <div className="flex items-start gap-2 text-sm">
              <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="leading-relaxed">{think.thought}</p>
            </div>
          )}
          {act?.action && (
            <div className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted-foreground">
                <ActionIcon action={act.action} />
              </span>
              <code className="break-all text-xs">{formatActionDetail(act.action)}</code>
            </div>
          )}
          {act?.error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-500">
              {act.error}
            </div>
          )}
          {obs?.screenshotUrl && (
            <a
              href={`${API_BASE}${obs.screenshotUrl}`}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${API_BASE}${obs.screenshotUrl}`}
                alt={`Step ${step} screenshot`}
                className="w-full"
                loading="lazy"
              />
            </a>
          )}
          {obs?.elements && obs.elements.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {obs.elements.length} interactive element{obs.elements.length === 1 ? '' : 's'} seen
              </summary>
              <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                {obs.elements.slice(0, 15).map((el) => (
                  <li key={el.index} className="truncate">
                    [{el.index}] &lt;{el.tag}&gt; &quot;{el.text}&quot;
                  </li>
                ))}
                {obs.elements.length > 15 && <li>… +{obs.elements.length - 15} more</li>}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Tab: Quick browse — original one-shot fetch + summarize
// ──────────────────────────────────────────────────────────────

function QuickBrowseTab() {
  const [url, setUrl] = useState('')
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BrowseResult | null>(null)
  const [error, setError] = useState('')

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await api.browserRun(url.trim(), instruction.trim() || undefined)
      if (!res.ok) setError(res.error || 'The browser could not open that page.')
      else setResult(res)
    } catch {
      setError('Something went wrong reaching the browser engine.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={run} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.com"
            className="input w-full"
            disabled={busy}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            What should I look for? (optional)
          </label>
          <div className="flex items-center gap-2">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. summarize the pricing, or list the main headlines"
              className="input flex-1"
              disabled={busy}
            />
            <VoiceInput
              disabled={busy}
              label="Voice"
              onTranscript={(t) => setInstruction((prev) => (prev ? `${prev} ${t}` : t))}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
          {busy ? 'Opening…' : 'Open & read'}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>
      )}

      {result && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card">
          <div>
            <div className="text-sm font-semibold">{result.title || result.url}</div>
            <a
              href={result.finalUrl || result.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {result.finalUrl || result.url} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {result.summary && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Summary
              </div>
              <p className="whitespace-pre-wrap text-sm">{result.summary}</p>
            </div>
          )}
          {result.screenshotUrl && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Screenshot
              </div>
              <a href={`${API_BASE}${result.screenshotUrl}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_BASE}${result.screenshotUrl}`}
                  alt="Page screenshot"
                  className="w-full rounded-lg border border-border"
                />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// UI helpers
// ──────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function ActionIcon({ action }: { action?: BrowserAction }) {
  if (!action) return <Camera className="h-3.5 w-3.5" />
  switch (action.type) {
    case 'navigate':
      return <Navigation className="h-3.5 w-3.5" />
    case 'click':
      return <MousePointerClick className="h-3.5 w-3.5" />
    case 'type':
    case 'fillForm':
      return <Keyboard className="h-3.5 w-3.5" />
    case 'wait':
      return <Clock className="h-3.5 w-3.5" />
    case 'screenshot':
      return <Camera className="h-3.5 w-3.5" />
    default:
      return <Globe2 className="h-3.5 w-3.5" />
  }
}

function formatActionTitle(action?: BrowserAction): string {
  if (!action) return 'Action'
  switch (action.type) {
    case 'navigate':
      return `Navigate ${action.url || ''}`
    case 'click':
      return `Click ${action.selector || ''}`
    case 'type':
      return `Type into ${action.selector || ''}`
    case 'select':
      return `Select in ${action.selector || ''}`
    case 'scroll':
      return `Scroll ${action.value || ''}px`
    case 'wait':
      return `Wait ${action.waitMs || ''}ms`
    case 'screenshot':
      return `Screenshot`
    case 'fillForm':
      return `Fill form`
    default:
      return action.type
  }
}

function formatActionDetail(action: BrowserAction): string {
  switch (action.type) {
    case 'navigate':
      return action.url || ''
    case 'click':
      return `click ${action.selector}`
    case 'type':
      return `type "${truncate(action.value || '', 60)}" → ${action.selector}`
    case 'select':
      return `select ${action.value} → ${action.selector}`
    case 'scroll':
      return `scroll by ${action.value || 0}px`
    case 'wait':
      return `wait ${action.waitMs || 0}ms`
    case 'fillForm':
      return `fill form (${Object.keys(action.fields || {}).length} fields)`
    default:
      return action.type
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

function groupByStep(events: AgentEvent[]): { step: number; events: AgentEvent[] }[] {
  const groups = new Map<number, AgentEvent[]>()
  for (const e of events) {
    if (e.step < 1) continue // started=0 and global errors=-1 are shown separately
    const arr = groups.get(e.step) || []
    arr.push(e)
    groups.set(e.step, arr)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([step, events]) => ({ step, events }))
}
