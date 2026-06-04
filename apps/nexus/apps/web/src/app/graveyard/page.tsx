'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Skull } from 'lucide-react'
import { api } from '@/lib/api'
import type { Product } from '@nexus/types'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { StatusBadge } from '@/components/shared/StatusBadge'

export default function GraveyardPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.getGraveyard()
      .then((r) => setProducts(r.products || []))
      .catch((err: Error) => setError(err.message || 'Failed to load graveyard'))
      .finally(() => setLoading(false))
  }, [])

  const handleRestore = async (id: string) => {
    setBusyIds((prev) => new Set(prev).add(id))
    setError(null)
    try {
      await api.restoreProduct(id)
      setProducts((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore product')
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Skull className="h-5 w-5" /> Graveyard</span>}
        subtitle="Rejected and expired products. Approve to resurface."
      />
      <PageBody>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            The graveyard is empty.
          </div>
        ) : (
          <ul className="space-y-3">
            {products.map((p) => (
              <li key={p.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{p.name || 'Untitled'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {p.graveyard_reason ?? 'No reason recorded'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  <button
                    onClick={() => handleRestore(p.id)}
                    disabled={busyIds.has(p.id)}
                    className="text-xs rounded-md border border-border px-2.5 py-1 hover:border-primary/40 disabled:opacity-50"
                  >
                    {busyIds.has(p.id) ? 'Restoring...' : 'Restore'}
                  </button>
                  <Link
                    href={`/review/${p.id}`}
                    className="text-xs rounded-md border border-border px-2.5 py-1 hover:border-primary/40"
                  >
                    Review
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  )
}
