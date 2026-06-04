'use client'

import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { api } from '@/lib/api'
import type { PublishItem } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

export default function PublishPage() {
  const [items, setItems] = useState<PublishItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    api.getPublishQueue()
      .then((r) => setItems(r.items || []))
      .finally(() => setLoading(false))
  }, [])

  async function publish(id: string) {
    setBusy((b) => ({ ...b, [id]: true }))
    setErrors((e) => { const next = { ...e }; delete next[id]; return next })
    try {
      await api.publishItem(id)
      setItems((list) => list.filter((it) => it.id !== id))
    } catch (err) {
      // Real publish failed (e.g. missing platform credentials) — keep the item
      // and show why, instead of pretending it succeeded.
      setErrors((e) => ({ ...e, [id]: err instanceof Error ? err.message : 'Publish failed' }))
      setBusy((b) => ({ ...b, [id]: false }))
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Send className="h-5 w-5" /> Publish center</span>}
        subtitle="Approved products ready to go live on their platforms."
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Nothing queued. Approve products to populate this list.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">{item.product_name || item.title || item.id}</div>
                  <div className="text-xs text-muted-foreground">{item.platform_name ?? '—'}</div>
                  {errors[item.id] && (
                    <div className="mt-1 text-xs text-red-500 max-w-md">{errors[item.id]}</div>
                  )}
                </div>
                <button
                  onClick={() => publish(item.id)}
                  disabled={busy[item.id]}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  <Send className="h-4 w-4" /> {busy[item.id] ? 'Publishing…' : 'Publish'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  )
}
