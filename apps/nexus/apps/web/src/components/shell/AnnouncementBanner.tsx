'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Announcement } from '@posteragent/types/nexus'

const DISMISSED_KEY = 'nexus_dismissed_announcement'
const ANNOUNCEMENT_EVENT = 'nexus-announcement-updated'

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
} satisfies Record<Announcement['type'], typeof Info>

const STYLES = {
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  error: 'border-red-500/40 bg-red-500/10 text-red-100',
  info: 'border-blue-500/40 bg-blue-500/10 text-blue-100',
} satisfies Record<Announcement['type'], string>

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)

  const load = useCallback(async () => {
    try {
      const { announcement: next } = await api.getAnnouncement()
      if (!next) {
        setAnnouncement(null)
        return
      }

      const dismissedId = window.localStorage.getItem(DISMISSED_KEY)
      setAnnouncement(dismissedId === next.id ? null : next)
    } catch {
      setAnnouncement(null)
    }
  }, [])

  useEffect(() => {
    void load()

    const reload = () => { void load() }
    window.addEventListener(ANNOUNCEMENT_EVENT, reload)
    return () => window.removeEventListener(ANNOUNCEMENT_EVENT, reload)
  }, [load])

  async function dismiss() {
    if (!announcement) return

    window.localStorage.setItem(DISMISSED_KEY, announcement.id)
    setAnnouncement(null)

    if (announcement.dismissible) {
      await api.dismissAnnouncement().catch(() => null)
      window.dispatchEvent(new Event(ANNOUNCEMENT_EVENT))
    }
  }

  if (!announcement) return null

  const Icon = ICONS[announcement.type]
  const style = STYLES[announcement.type]

  return (
    <div className={`border-b px-6 py-3 text-sm ${style}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{announcement.message}</p>
          <p className="mt-0.5 text-xs opacity-80">
            Posted {new Date(announcement.created_at).toLocaleString()}
          </p>
        </div>
        {announcement.dismissible && (
          <button
            type="button"
            onClick={() => void dismiss()}
            aria-label="Dismiss announcement"
            className="rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
