'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Bell, BellOff, Check, CheckCheck, Circle, AlertCircle, Info,
  Loader2, RefreshCw, Sparkles, Zap, AlertTriangle, ShieldAlert,
  Package, Brain, Rocket, BarChart3,
} from 'lucide-react'
import { PageBody, PageHeader } from '@/components/shell/AppShell'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Notification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  task_id: string | null
  agent_id: string | null
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

type NotifKind = 'info' | 'warning' | 'error' | 'success' | string

const KIND_CONFIG: Record<string, { icon: React.ReactNode; border: string; badge: string }> = {
  info:       { icon: <Info className="h-4 w-4 text-blue-400" />,          border: 'border-blue-500/15', badge: 'bg-blue-500/10 text-blue-400' },
  warning:    { icon: <AlertTriangle className="h-4 w-4 text-amber-400" />, border: 'border-amber-500/20', badge: 'bg-amber-500/10 text-amber-400' },
  error:      { icon: <AlertCircle className="h-4 w-4 text-rose-400" />,   border: 'border-rose-500/20', badge: 'bg-rose-500/10 text-rose-400' },
  success:    { icon: <Sparkles className="h-4 w-4 text-emerald-400" />,   border: 'border-emerald-500/15', badge: 'bg-emerald-500/10 text-emerald-400' },
  approval:   { icon: <ShieldAlert className="h-4 w-4 text-amber-400" />,  border: 'border-amber-500/20', badge: 'bg-amber-500/10 text-amber-400' },
  task:       { icon: <Zap className="h-4 w-4 text-primary" />,            border: 'border-primary/15', badge: 'bg-primary/10 text-primary' },
  agent:      { icon: <Brain className="h-4 w-4 text-violet-400" />,       border: 'border-violet-500/15', badge: 'bg-violet-500/10 text-violet-400' },
  product:    { icon: <Package className="h-4 w-4 text-cyan-400" />,       border: 'border-cyan-500/15', badge: 'bg-cyan-500/10 text-cyan-400' },
  autopilot:  { icon: <Rocket className="h-4 w-4 text-indigo-400" />,      border: 'border-indigo-500/15', badge: 'bg-indigo-500/10 text-indigo-400' },
  analytics:  { icon: <BarChart3 className="h-4 w-4 text-emerald-400" />,  border: 'border-emerald-500/15', badge: 'bg-emerald-500/10 text-emerald-400' },
}

function getKindConfig(type: string) {
  return KIND_CONFIG[type] ?? KIND_CONFIG.info
}

// ── Components ────────────────────────────────────────────────────────────────

function NotificationItem({
  notif,
  onRead,
}: {
  notif: Notification
  onRead: (id: string) => void
}) {
  const cfg = getKindConfig(notif.type)
  const [marking, setMarking] = useState(false)

  const handleRead = async () => {
    if (notif.read || marking) return
    setMarking(true)
    try {
      await api.markNotificationRead(notif.id)
      onRead(notif.id)
    } catch { /* ignore */ } finally { setMarking(false) }
  }

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all',
        cfg.border,
        notif.read ? 'bg-card/30 opacity-60' : 'bg-card hover:bg-card/80',
      )}
    >
      {/* Unread dot */}
      {!notif.read && (
        <span className="absolute top-4 right-4 h-2 w-2 rounded-full bg-primary animate-pulse" />
      )}

      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center', notif.read ? 'bg-muted/30' : 'bg-muted/50')}>
          {cfg.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={cn('font-semibold text-sm', notif.read ? 'text-muted-foreground' : 'text-foreground')}>
                {notif.title || '(no title)'}
              </h3>
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase', cfg.badge)}>
                {notif.type}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
              {timeAgo(notif.created_at)}
            </span>
          </div>

          {notif.message && (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{notif.message}</p>
          )}

          <div className="mt-2.5 flex items-center gap-3 text-[10px] text-muted-foreground">
            {notif.agent_id && (
              <span className="flex items-center gap-1">
                <Brain className="h-3 w-3" />{notif.agent_id}
              </span>
            )}
            {notif.task_id && (
              <span className="flex items-center gap-1 font-mono">
                <Zap className="h-3 w-3" />{notif.task_id.slice(0, 12)}…
              </span>
            )}
            {!notif.read && (
              <button
                onClick={handleRead}
                disabled={marking}
                className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                {marking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Mark read
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const fetch = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await api.getNotifications()
      setNotifications(res.notifications ?? [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const handleMarkRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
  }

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read)
    await Promise.allSettled(unread.map((n) => api.markNotificationRead(n.id)))
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const unreadCount = notifications.filter((n) => !n.read).length
  const allTypes = Array.from(new Set(notifications.map((n) => n.type))).filter(Boolean)

  const displayed = notifications.filter((n) => {
    if (filter === 'unread' && n.read) return false
    if (typeFilter !== 'all' && n.type !== typeFilter) return false
    return true
  })

  return (
    <div className="flex-1">
      <PageHeader
        title="Notifications"
        subtitle="System alerts, agent updates, approval requests, and task completion signals from your AI engine."
      />

      <PageBody className="max-w-3xl mx-auto space-y-5">
        {/* Header stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl font-bold tabular-nums text-foreground">{notifications.length}</div>
            <div className="text-[10px] uppercase font-semibold text-muted-foreground mt-1">Total</div>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="text-2xl font-bold tabular-nums text-primary">{unreadCount}</div>
            <div className="text-[10px] uppercase font-semibold text-muted-foreground mt-1">Unread</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl font-bold tabular-nums text-muted-foreground">{notifications.length - unreadCount}</div>
            <div className="text-[10px] uppercase font-semibold text-muted-foreground mt-1">Read</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Read filter pills */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold transition-colors',
                  filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                {f === 'all' ? 'All' : `Unread (${unreadCount})`}
              </button>
            ))}
          </div>

          {/* Type filter */}
          {allTypes.length > 1 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-muted/40 border border-border rounded-lg outline-none focus:border-primary/50"
            >
              <option value="all">All types</option>
              {allTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          <div className="ml-auto flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
            <button
              onClick={() => fetch(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/30" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-16 text-center">
            <BellOff className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {filter === 'unread' ? 'All caught up! No unread notifications.' : 'No notifications yet.'}
            </p>
            {filter === 'unread' && (
              <button
                onClick={() => setFilter('all')}
                className="mt-3 text-xs text-primary hover:underline"
              >
                View all notifications →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayed.map((n) => (
              <NotificationItem
                key={n.id}
                notif={n}
                onRead={handleMarkRead}
              />
            ))}
          </div>
        )}
      </PageBody>
    </div>
  )
}
