'use client'

import { useEffect, useState } from 'react'
import { KeyRound, Check, ExternalLink, Gauge, AlertTriangle } from 'lucide-react'
import { api, type ApiKeyInfo } from '@/lib/api'
import { toast } from '@/lib/toast'

// Light per-provider format hints (BUG-212). Not a hard block — just warns
// the user if the key clearly doesn't match the provider's published format,
// because typing gibberish into a 12-field form is easy and the only
// previous feedback was "engine is using them now" even on garbage.
//
// Note: this is intentionally permissive. We only flag obvious mismatches
// (wrong prefix or too short) — there's no auth-endpoint round trip here.
const KEY_PREFIXES: Record<string, { prefix: RegExp; example: string }> = {
  GROQ_API_KEY: { prefix: /^gsk_/, example: 'gsk_…' },
  OPENAI_API_KEY: { prefix: /^sk-/, example: 'sk-…' },
  ANTHROPIC_API_KEY: { prefix: /^sk-ant-/, example: 'sk-ant-…' },
  DEEPSEEK_API_KEY: { prefix: /^sk-/, example: 'sk-…' },
  PERPLEXITY_API_KEY: { prefix: /^pplx-/, example: 'pplx-…' },
  MISTRAL_API_KEY: { prefix: /^[A-Za-z0-9]{20,}$/, example: '20+ alphanumeric chars' },
  GOOGLE_API_KEY: { prefix: /^AIza/, example: 'AIza…' },
  FAL_KEY: { prefix: /^[a-f0-9-]{30,}:[a-f0-9]+$/i, example: 'uuid:hex' },
}

const MAX_DAILY_CAP_USD = 1000

function keyLooksWrong(secretKey: string, value: string): string | null {
  if (!value) return null
  const rule = KEY_PREFIXES[secretKey]
  if (!rule) return null
  if (rule.prefix.test(value)) return null
  return `Expected format: ${rule.example}`
}
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const GROUP_ORDER: ApiKeyInfo['group'][] = ['AI', 'Publishing', 'Social', 'Email']
const GROUP_BLURB: Record<ApiKeyInfo['group'], string> = {
  AI: 'Text + image generation. Groq is free and all you need for real AI content.',
  Publishing: 'Storefronts where NEXUS lists finished products.',
  Social: 'Auto-posting. A free Zapier/Make webhook covers every platform.',
  Email: 'Email scheduler output straight to your inbox. Resend has a free tier; set a From + To address.',
}

interface ActiveAiProvider { key: string; label: string; source: 'kv' | 'worker_secret' }

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([])
  const [activeAi, setActiveAi] = useState<ActiveAiProvider | null>(null)
  const [aiCount, setAiCount] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [spend, setSpend] = useState<{ today: number; cap: number; cap_reached: boolean } | null>(null)
  const [capDraft, setCapDraft] = useState('')
  const [off, setOff] = useState<Record<string, boolean>>({})

  const load = () => {
    setLoading(true)
    api.getKeys()
      .then((r) => {
        setKeys(r.keys)
        setActiveAi(r.ai_provider_source ?? null)
        setAiCount(r.ai_configured_count ?? 0)
      })
      .catch(() => {
        setKeys([])
        setActiveAi(null)
        setAiCount(0)
      })
      .finally(() => setLoading(false))
    api.getSpend().then(setSpend).catch(() => setSpend(null))
    api.getProviders()
      .then((r) => setOff(Object.fromEntries(r.providers.map((p) => [p.secretKey, p.off]))))
      .catch(() => setOff({}))
  }
  useEffect(load, [])

  const capError = (() => {
    if (capDraft === '') return null
    const n = Number(capDraft)
    if (!Number.isFinite(n)) return 'Not a number'
    if (n < 0) return 'Cap can\u2019t be negative'
    if (n > MAX_DAILY_CAP_USD) return `Cap above $${MAX_DAILY_CAP_USD} looks like a typo`
    return null
  })()

  const saveCap = async () => {
    const n = Number(capDraft)
    // BUG-211: the button must be disabled for any invalid value, and the
    // submit handler must double-check (defense in depth — some browsers
    // ignore `disabled` for keyboard Enter, and stale `capError` from a
    // race can let an invalid value through). We also surface a toast so
    // the rejection isn't silent.
    if (capDraft === '' || !Number.isFinite(n) || n < 0 || n > MAX_DAILY_CAP_USD) {
      toast.error(
        n < 0
          ? `Cap can't be negative — got ${capDraft}`
          : `Cap must be between 0 and ${MAX_DAILY_CAP_USD}`,
      )
      return
    }
    try {
      await api.setCap(n)
      toast.success(n === 0 ? 'Daily cap removed (unlimited)' : `Daily cap set to $${n}`)
      setCapDraft('')
      api.getSpend().then(setSpend).catch(() => {})
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set cap')
    }
  }

  const toggleProvider = async (secretKey: string) => {
    const next = !off[secretKey]
    setOff((o) => ({ ...o, [secretKey]: next }))
    try {
      await api.toggleProvider(secretKey, next)
    } catch {
      setOff((o) => ({ ...o, [secretKey]: !next }))
    }
  }

  const save = async () => {
    const payload = Object.fromEntries(
      Object.entries(drafts).filter(([, v]) => v !== undefined)
    )
    if (Object.keys(payload).length === 0) return
    setSaving(true)
    try {
      await api.saveKeys(payload)
      setDrafts({})
      setSavedAt(Date.now())
      load()
    } finally {
      setSaving(false)
    }
  }

  const dirty = Object.values(drafts).some((v) => v && v.length > 0)

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> API Keys</span>}
        subtitle="Add provider keys here — keys are stored server-side and used by the engine immediately."
      />
      <PageBody>
        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            {/* Active AI provider banner — the runtime's own answer to
                "which key is generating my content right now?". When this
                is null, autopilot will refuse to start cycles. */}
            {activeAi ? (
              <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
                <Check className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                <div className="text-sm space-y-1">
                  <div>
                    Active AI provider:{' '}
                    <span className="font-medium">{activeAi.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Source:{' '}
                    {activeAi.source === 'kv'
                      ? 'saved in the dashboard (KV)'
                      : 'Worker secret (set via wrangler)'}
                    {' · '}
                    {aiCount} AI key{aiCount === 1 ? '' : 's'} configured
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                <div className="text-sm space-y-1">
                  <div className="font-medium">No LLM provider is configured.</div>
                  <div className="text-xs text-muted-foreground">
                    Autopilot will refuse to start cycles until you add a key
                    below. Groq is free and is enough to run the whole engine.
                  </div>
                </div>
              </section>
            )}

            {/* AI spend meter */}
            <section className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">AI Spend</h3>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">${(spend?.today ?? 0).toFixed(2)}</span>
                <span className="text-xs text-muted-foreground">
                  used today{spend && spend.cap > 0 ? ` of $${spend.cap.toFixed(2)} cap` : ' · no cap set'}
                </span>
                {spend?.cap_reached && (
                  <span className="text-xs text-warning">cap reached — using free models</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={MAX_DAILY_CAP_USD} step={1}
                  placeholder={spend && spend.cap > 0 ? String(spend.cap) : `Daily cap in $ (0 = unlimited, max ${MAX_DAILY_CAP_USD})`}
                  value={capDraft}
                  onChange={(e) => setCapDraft(e.target.value)}
                  className={`input w-56 text-sm ${capError ? 'border-destructive' : ''}`}
                  aria-invalid={capError ? 'true' : 'false'}
                />
                <button
                  onClick={saveCap}
                  disabled={capDraft === '' || capError !== null}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50 hover:bg-muted transition-colors"
                >
                  Set cap
                </button>
              </div>
              {capError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {capError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                When the cap is hit, paid models pause for the day and the free engines take over.
              </p>
            </section>

            {/* Key groups */}
            {GROUP_ORDER.map((group) => {
              const items = keys.filter((k) => k.group === group)
              if (items.length === 0) return null
              return (
                <section key={group} className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">{group}</h3>
                    <p className="text-xs text-muted-foreground">{GROUP_BLURB[group]}</p>
                  </div>
                  {items.map((k) => (
                    <div key={k.key} className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">{k.label}</label>
                        <div className="flex items-center gap-3">
                          {k.group === 'AI' && k.configured && (
                            <button
                              onClick={() => toggleProvider(k.key)}
                              aria-pressed={!off[k.key]}
                              title={off[k.key] ? 'Provider paused — click to resume' : 'Provider active — click to pause'}
                              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${off[k.key] ? 'bg-muted' : 'bg-emerald-500'}`}
                            >
                              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${off[k.key] ? 'left-0.5' : 'left-[18px]'}`} />
                            </button>
                          )}
                          {k.configured ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                              <Check className="h-3 w-3" /> Set
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not set</span>
                          )}
                        </div>
                      </div>
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder={k.configured ? (k.masked ?? '••••') : `Paste ${k.key}…`}
                        value={drafts[k.key] ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [k.key]: e.target.value }))}
                        className={`input w-full font-mono text-sm ${
                          keyLooksWrong(k.key, drafts[k.key] ?? '') ? 'border-amber-500/60' : ''
                        }`}
                      />
                      {(() => {
                        const warn = keyLooksWrong(k.key, drafts[k.key] ?? '')
                        if (!warn) return null
                        return (
                          <p className="text-[11px] text-amber-500 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {warn}
                          </p>
                        )
                      })()}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-muted-foreground">{k.key}</span>
                        {k.help?.startsWith('http') ? (
                          <a href={k.help} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                            Get key <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{k.help}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </section>
              )
            })}

            {/* Save bar */}
            <div className="sticky bottom-0 -mx-6 md:-mx-8 px-6 md:px-8 py-4 border-t border-border bg-background/95 backdrop-blur flex items-center gap-3">
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save keys'}
              </button>
              {savedAt && !dirty && (
                <span className="inline-flex items-center gap-1 text-sm text-emerald-500">
                  <Check className="h-4 w-4" /> Saved — the engine is using them now.
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">Leave a field blank to delete a key.</span>
            </div>
          </div>
        )}
      </PageBody>
    </>
  )
}
