'use client'

import { useEffect, useState } from 'react'
import { LayoutGrid, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { Domain, Category } from '@posteragent/types/nexus'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

export default function ManagerDomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [categoriesByDomain, setCategoriesByDomain] = useState<Record<string, Category[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDomains().then(async (ds) => {
      setDomains(ds)
      const entries = await Promise.all(
        ds.map(async (d) => [d.id, await api.getCategories(d.id).catch(() => [])] as const)
      )
      setCategoriesByDomain(Object.fromEntries(entries))
    }).finally(() => setLoading(false))
  }, [])

  const addDomain = async () => {
    const name = prompt('Domain name?')
    if (!name) return
    const slug = name.toLowerCase().replace(/\s+/g, '-')
    try {
      const d = await api.createDomain({ name, slug })
      setDomains((prev) => [...prev, d])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create domain')
    }
  }

  const addCategory = async (domainId: string) => {
    const name = prompt('Category name?')
    if (!name) return
    const slug = name.toLowerCase().replace(/\s+/g, '-')
    try {
      const c = await api.createCategory(domainId, { name, slug })
      setCategoriesByDomain((prev) => ({ ...prev, [domainId]: [...(prev[domainId] ?? []), c] }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create category')
    }
  }

  const deleteDomain = async (id: string) => {
    try {
      await api.deleteDomain(id)
      setDomains((prev) => prev.filter((x) => x.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete domain')
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><LayoutGrid className="h-5 w-5" /> Domains & categories</span>}
        subtitle="Your product taxonomy. Used by the AI to route workflows."
        actions={
          <button
            onClick={addDomain}
            className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow"
          >
            <Plus className="h-4 w-4" /> New domain
          </button>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            {domains.map((d) => (
              <section key={d.id} className="rounded-2xl border border-border bg-card p-5">
                <header className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{d.icon}</span>
                    <div>
                      <div className="text-sm font-semibold">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.slug}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => addCategory(d.id)}
                      className="text-xs rounded-md border border-border px-2.5 py-1 hover:border-primary/40"
                    >
                      + category
                    </button>
                    <button
                      onClick={() => deleteDomain(d.id)}
                      className="text-xs rounded-md border border-border px-2.5 py-1 hover:border-destructive/40 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </header>
                <div className="flex flex-wrap gap-2">
                  {(categoriesByDomain[d.id] ?? []).map((c) => (
                    <span key={c.id} className="text-xs rounded-full bg-muted px-2.5 py-1">
                      {c.name}
                    </span>
                  ))}
                  {(categoriesByDomain[d.id] ?? []).length === 0 && (
                    <span className="text-xs text-muted-foreground">no categories yet</span>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </PageBody>
    </>
  )
}
