'use client'

import { useEffect, useState } from 'react'
import { Globe2, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { Platform } from '@nexus/types'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

export default function ManagerPlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getPlatforms()
      .then(setPlatforms)
      .finally(() => setLoading(false))
  }, [])

  const add = async () => {
    const name = prompt('Platform name?')
    if (!name) return
    const slug = name.toLowerCase().replace(/\s+/g, '-')
    try {
      const p = await api.createPlatform({ name, slug })
      setPlatforms((prev) => [...prev, p])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create platform')
    }
  }

  const remove = async (id: string) => {
    try {
      await api.deletePlatform(id)
      setPlatforms((prev) => prev.filter((x) => x.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete platform')
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Globe2 className="h-5 w-5" /> Platforms</span>}
        subtitle="Marketplaces where the AI will list your products."
        actions={
          <button onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow">
            <Plus className="h-4 w-4" /> New platform
          </button>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ul className="space-y-2">
            {platforms.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.slug}</div>
                </div>
                <button onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive">
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
