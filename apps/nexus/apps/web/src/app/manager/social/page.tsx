'use client'

import { useEffect, useState } from 'react'
import { Megaphone, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { SocialChannel } from '@nexus/types'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { EmptyState } from '@/components/shared/EmptyState'

export default function ManagerSocialPage() {
  const [channels, setChannels] = useState<SocialChannel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getSocialChannels()
      .then(setChannels)
      .finally(() => setLoading(false))
  }, [])

  const add = async () => {
    const name = prompt('Channel name?')
    if (!name) return
    const slug = name.toLowerCase().replace(/\s+/g, '-')
    try {
      const c = await api.createSocialChannel({ name, slug })
      setChannels((prev) => [...prev, c])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create channel')
    }
  }

  const remove = async (id: string) => {
    try {
      await api.deleteSocialChannel(id)
      setChannels((prev) => prev.filter((x) => x.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete channel')
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Megaphone className="h-5 w-5" /> Social channels</span>}
        subtitle="Channels the AI will post promotional content to."
        actions={
          <button onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow">
            <Plus className="h-4 w-4" /> New channel
          </button>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="No social channels yet"
            description="Add a channel and the AI can start posting promotional content to it."
            action={
              <button
                onClick={add}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add your first channel
              </button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {channels.map((c) => (
              <li key={c.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.slug}</div>
                </div>
                <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  )
}
