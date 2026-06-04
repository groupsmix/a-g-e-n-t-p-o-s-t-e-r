'use client'

import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Lock, ShieldCheck } from 'lucide-react'
import { api, setToken } from '@/lib/api'
import type { Settings as BaseSettings } from '@nexus/types'

interface Settings extends BaseSettings {
  default_currency?: string
}
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getSettings()
      .then(setSettings)
      .finally(() => setLoading(false))
  }, [])

  const update = async (patch: Partial<Settings & Record<string, unknown>>) => {
    if (!settings) return
    setSaving(true)
    try {
      const next = { ...settings, ...patch }
      setSettings(next)
      await api.updateSettings(patch)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><SettingsIcon className="h-5 w-5" /> Settings</span>}
        subtitle="Global defaults for the NEXUS engine."
      />
      <PageBody>
        {loading || !settings ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <section className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-medium">General</h2>
              <Row label="Default language">
                <input
                  className="input w-48"
                  defaultValue={settings.default_language ?? 'en'}
                  onBlur={(e) => update({ default_language: e.target.value })}
                />
              </Row>
              <Row label="Default currency">
                <input
                  className="input w-24"
                  defaultValue={settings.default_currency ?? 'USD'}
                  onBlur={(e) => update({ default_currency: e.target.value })}
                />
              </Row>
              <Row label="Graveyard resurface (days)">
                <input
                  type="number"
                  className="input w-24"
                  defaultValue={settings.graveyard_resurface_days ?? 30}
                  onBlur={(e) => update({ graveyard_resurface_days: Number(e.target.value) })}
                />
              </Row>
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-medium">Automation</h2>
              <ToggleRow
                label="CEO review required"
                checked={!!settings.ceo_review_required}
                onChange={(v) => update({ ceo_review_required: v })}
              />
              <ToggleRow
                label="Auto-publish after approval"
                checked={!!settings.auto_publish_after_approval}
                onChange={(v) => update({ auto_publish_after_approval: v })}
              />
              <ToggleRow
                label="Auto-publish to Gumroad on approve"
                checked={!!settings.auto_publish_gumroad}
                onChange={(v) => update({ auto_publish_gumroad: v })}
              />
              <ToggleRow
                label="Trend radar enabled"
                checked={!!settings.trend_radar_enabled}
                onChange={(v) => update({ trend_radar_enabled: v })}
              />
            </section>

            {saving && <div className="text-xs text-muted-foreground">Saving…</div>}

            <AccessControl />
          </div>
        )}
      </PageBody>
    </>
  )
}

function AccessControl() {
  const [isProtected, setIsProtected] = useState<boolean | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    api.getAuthStatus().then((s) => setIsProtected(s.protected)).catch(() => setIsProtected(null))
  }, [])

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const { token } = await api.setupPassword(next, isProtected ? current : undefined)
      setToken(token)
      setIsProtected(true)
      setCurrent(''); setNext('')
      setMsg({ kind: 'ok', text: 'Access password saved. The dashboard is now locked.' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to save' })
    } finally { setBusy(false) }
  }

  async function disable() {
    setBusy(true); setMsg(null)
    try {
      await api.disableAuth(current)
      setToken(null)
      setIsProtected(false)
      setCurrent(''); setNext('')
      setMsg({ kind: 'ok', text: 'Access gate removed — the dashboard is open again.' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to disable' })
    } finally { setBusy(false) }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Lock className="h-4 w-4" /> Access Password
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {isProtected
          ? 'The dashboard is locked. Change or remove the password below.'
          : 'Anyone with the URL can use NEXUS right now. Set a password to lock it.'}
      </p>
      <div className="mt-4 space-y-3">
        {isProtected && (
          <input
            type="password" className="input w-full" placeholder="Current password"
            value={current} onChange={(e) => setCurrent(e.target.value)}
          />
        )}
        <input
          type="password" className="input w-full" placeholder={isProtected ? 'New password' : 'Choose a password'}
          value={next} onChange={(e) => setNext(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={save} disabled={busy || next.length < 4 || (!!isProtected && !current)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <ShieldCheck className="h-4 w-4" /> {isProtected ? 'Change password' : 'Lock dashboard'}
          </button>
          {isProtected && (
            <button
              onClick={disable} disabled={busy || !current}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Remove gate
            </button>
          )}
        </div>
        {msg && (
          <p className={`text-sm ${msg.kind === 'ok' ? 'text-emerald-500' : 'text-destructive'}`}>{msg.text}</p>
        )}
      </div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Row label={label}>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <div
          className={`h-5 w-5 bg-background rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </Row>
  )
}
