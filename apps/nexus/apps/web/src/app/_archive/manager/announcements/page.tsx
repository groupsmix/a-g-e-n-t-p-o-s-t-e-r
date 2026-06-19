'use client'

import { useEffect, useState } from 'react'
import { BellRing, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { Announcement } from '@posteragent/types/nexus'
import { toast } from '@/lib/toast'
import { PageBody, PageHeader } from '@/components/shell/AppShell'
import { EmptyState } from '@/components/shared/EmptyState'

const ANNOUNCEMENT_EVENT = 'nexus-announcement-updated'

export default function ManagerAnnouncementsPage() {
  const [message, setMessage] = useState('')
  const [type, setType] = useState<Announcement['type']>('info')
  const [dismissible, setDismissible] = useState(true)
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await api.getAnnouncement()
      setAnnouncement(data.announcement)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load announcement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function publish() {
    const trimmed = message.trim()
    if (!trimmed) {
      toast.error('Message is required')
      return
    }

    setSaving(true)
    try {
      const { announcement: next } = await api.setAnnouncement({
        message: trimmed,
        type,
        dismissible,
      })
      setAnnouncement(next)
      setMessage('')
      toast.success('Announcement published')
      window.dispatchEvent(new Event(ANNOUNCEMENT_EVENT))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish announcement')
    } finally {
      setSaving(false)
    }
  }

  async function clearAnnouncement() {
    setSaving(true)
    try {
      await api.clearAnnouncement()
      setAnnouncement(null)
      toast.success('Announcement cleared')
      window.dispatchEvent(new Event(ANNOUNCEMENT_EVENT))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear announcement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><BellRing className="h-5 w-5" /> Announcements</span>}
        subtitle="Publish a persistent banner across the NEXUS dashboard."
      />
      <PageBody className="max-w-4xl space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-medium">Publish announcement</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This appears as a top-of-page banner across NEXUS until it is dismissed or cleared.
            </p>
          </div>

          <label className="block space-y-2">
            <span className="text-sm text-muted-foreground">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Daily run finished. 12 posts published and 3 queued for review."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Announcement['type'])}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <input
                type="checkbox"
                checked={dismissible}
                onChange={(e) => setDismissible(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <div>
                <div className="text-sm font-medium">Dismissible</div>
                <div className="text-xs text-muted-foreground">Allow the operator to close the banner.</div>
              </div>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void publish()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <BellRing className="h-4 w-4" /> Publish
            </button>
            <button
              type="button"
              onClick={() => void clearAnnouncement()}
              disabled={saving || !announcement}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Clear
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4">
            <h2 className="text-sm font-medium">Active announcement</h2>
            <p className="mt-1 text-sm text-muted-foreground">Shows the current banner stored in Worker KV.</p>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : announcement ? (
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">{announcement.message}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Type: {announcement.type} · Dismissible: {announcement.dismissible ? 'yes' : 'no'} · Created:{' '}
                    {new Date(announcement.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  Refresh
                </button>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<BellRing className="h-5 w-5" />}
              title="No active announcement"
              description="Publish one above to show a persistent banner across the dashboard."
            />
          )}
        </section>
      </PageBody>
    </>
  )
}
