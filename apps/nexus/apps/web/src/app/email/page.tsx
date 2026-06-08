'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Mail, Users, Send, Plus, Loader2, Trash2, Copy, Check,
  BarChart3, Eye, MousePointerClick,
} from 'lucide-react'
import {
  api,
  API_BASE,
  type Subscriber,
  type SubscribersResponse,
  type EmailCampaign,
} from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-amber-500',
  sent: 'text-emerald-500',
  failed: 'text-destructive',
}

export default function EmailPage() {
  const [subs, setSubs] = useState<SubscribersResponse | null>(null)
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [productId, setProductId] = useState('')
  const [customSubject, setCustomSubject] = useState('')

  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const [s, c] = await Promise.all([api.getSubscribers(), api.getCampaigns()])
      setSubs(s ?? { total: 0, active: 0, subscribers: [] })
      setCampaigns(c?.campaigns ?? [])
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load email data')
      setSubs({ total: 0, active: 0, subscribers: [] })
      setCampaigns([])
    }
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  async function handleCreate() {
    setCreating(true)
    try {
      await api.createCampaign({
        product_id: productId || undefined,
        subject: customSubject || undefined,
      })
      setShowCreate(false)
      setProductId('')
      setCustomSubject('')
      await refresh()
    } finally {
      setCreating(false)
    }
  }

  async function handleSend(id: string) {
    setSending(id)
    try {
      await api.sendCampaign(id)
      await refresh()
    } finally {
      setSending(null)
    }
  }

  async function handleUnsubscribe(id: string) {
    await api.unsubscribe(id)
    await refresh()
  }

  const embedSnippet = `<form action="${API_BASE}/api/email/subscribe" method="POST">
  <input type="email" name="email" placeholder="Your email" required />
  <input type="text" name="name" placeholder="Your name" />
  <input type="hidden" name="source" value="website" />
  <button type="submit">Subscribe</button>
</form>`

  function copySnippet() {
    navigator.clipboard.writeText(embedSnippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Email Lists
          </span>
        }
        subtitle="Capture leads and send product launch emails to your subscriber list."
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Create Campaign
          </button>
        }
      />
      <PageBody className="space-y-6">
        {loading || !subs ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {loadError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <p className="font-medium text-destructive">Couldn&apos;t load email data</p>
                <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
              </div>
            )}

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                icon={<Users className="h-5 w-5" />}
                label="Total subscribers"
                value={String(subs.total ?? 0)}
              />
              <Stat
                icon={<Mail className="h-5 w-5" />}
                label="Active subscribers"
                value={String(subs.active ?? 0)}
              />
              <Stat
                icon={<Send className="h-5 w-5" />}
                label="Campaigns sent"
                value={String((campaigns ?? []).filter((c) => c.status === 'sent').length)}
              />
            </div>

            {/* Subscriber growth placeholder */}
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4" /> Subscriber Growth
              </h2>
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                Growth chart will appear as your list grows
              </div>
            </div>

            {/* Create Campaign Modal */}
            {showCreate && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
                <h2 className="text-sm font-semibold">New Campaign</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Product ID (optional — AI writes email for this product)
                    </label>
                    <input
                      type="text"
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                      placeholder="product-uuid"
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Custom subject (optional — AI generates if blank)
                    </label>
                    <input
                      type="text"
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      placeholder="Your subject line"
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Create
                  </button>
                  <button
                    onClick={() => setShowCreate(false)}
                    className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Campaigns */}
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Send className="h-4 w-4" /> Campaigns
              </h2>
              {(campaigns ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  <p>No campaigns yet. Create one to get started.</p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Create your first campaign
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {(campaigns ?? []).map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-border/60 bg-background p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-semibold uppercase ${STATUS_COLORS[c.status] || ''}`}
                            >
                              {c.status}
                            </span>
                            <span className="truncate font-medium text-sm">
                              {c.subject}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            {c.product_name && <span>Product: {c.product_name}</span>}
                            <span>{new Date(c.created_at).toLocaleDateString()}</span>
                            {c.sent_at && (
                              <span>
                                Sent: {new Date(c.sent_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {c.status === 'sent' && (
                            <div className="mt-2 flex items-center gap-4 text-xs">
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" /> {c.open_count} opens
                              </span>
                              <span className="flex items-center gap-1">
                                <MousePointerClick className="h-3 w-3" /> {c.click_count}{' '}
                                clicks
                              </span>
                            </div>
                          )}
                        </div>
                        {c.status === 'draft' && (
                          <button
                            onClick={() => handleSend(c.id)}
                            disabled={sending === c.id}
                            className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {sending === c.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            Send
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subscribers */}
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" /> Subscribers
              </h2>
              {(subs.subscribers ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No subscribers yet. Share the signup form to start collecting leads.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2 text-left font-medium">Email</th>
                        <th className="px-4 py-2 text-left font-medium">Name</th>
                        <th className="px-4 py-2 text-left font-medium">Source</th>
                        <th className="px-4 py-2 text-left font-medium">Subscribed</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(subs.subscribers ?? []).map((s) => (
                        <tr
                          key={s.id}
                          className="border-b border-border/40 last:border-0"
                        >
                          <td className="px-4 py-2">{s.email}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {s.name || '—'}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {s.source || '—'}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {new Date(s.subscribed_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2">
                            {s.unsubscribed_at ? (
                              <span className="text-destructive text-xs">
                                Unsubscribed
                              </span>
                            ) : (
                              <span className="text-emerald-500 text-xs">Active</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {!s.unsubscribed_at && (
                              <button
                                onClick={() => handleUnsubscribe(s.id)}
                                className="text-muted-foreground hover:text-destructive"
                                title="Unsubscribe"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Embeddable Signup Form */}
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Copy className="h-4 w-4" /> Embeddable Signup Form
                </h2>
                <button
                  onClick={copySnippet}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-muted/50 p-4 text-xs">
                <code>{embedSnippet}</code>
              </pre>
            </div>
          </>
        )}
      </PageBody>
    </>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  )
}
