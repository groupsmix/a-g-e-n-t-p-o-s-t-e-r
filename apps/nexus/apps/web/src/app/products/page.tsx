'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Package, Trash2, Search, RotateCw, Loader2 } from 'lucide-react'
import { api, type ProductScoreResponse } from '@/lib/api'
import type { Product } from '@nexus/types'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ScoreBadge } from '@/components/shared/ScoreBadge'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [scores, setScores] = useState<Record<string, number>>({})

  useEffect(() => {
    api
      .getProducts({ limit: 100 })
      .then((r) => {
        const prods = r.products || []
        setProducts(prods)
        for (const p of prods) {
          api.getProductScore(p.id).then((s: ProductScoreResponse) => {
            setScores((prev) => ({ ...prev, [p.id]: s.score.total }))
          }).catch(() => {})
        }
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (p: Product) => {
    if (!confirm(`Delete "${p.name || 'Untitled'}"? This removes the product and its files for good.`)) return
    setDeletingId(p.id)
    const prev = products
    setProducts((list) => list.filter((x) => x.id !== p.id))
    try {
      await api.deleteProduct(p.id)
    } catch {
      setProducts(prev)
      alert('Failed to delete. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  // Re-dispatch the 15-step pipeline for a stuck or rejected product. We
  // optimistically flip the row's status to 'running' so the UI reflects
  // the new state immediately; if the server fails we roll the row back.
  const handleRetry = async (p: Product) => {
    setRetryingId(p.id)
    const prevStatus = p.status
    setProducts((list) =>
      list.map((x) => (x.id === p.id ? { ...x, status: 'running' } : x)),
    )
    try {
      await api.retryProduct(p.id)
    } catch {
      setProducts((list) =>
        list.map((x) => (x.id === p.id ? { ...x, status: prevStatus } : x)),
      )
      alert('Failed to retry. Please try again.')
    } finally {
      setRetryingId(null)
    }
  }

  const filtered = search
    ? products.filter((p) =>
        (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.niche || '').toLowerCase().includes(search.toLowerCase())
      )
    : products

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Package className="h-5 w-5" /> Products</span>}
        subtitle="Everything NEXUS has generated, across all domains."
        actions={
          products.length > 0 ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="input pl-9 w-48 md:w-64 text-sm"
              />
            </div>
          ) : undefined
        }
      />
      <PageBody>
        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="No products yet"
            description="Pick a domain to start your first workflow."
            action={
              <Link href="/create" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Build a product
              </Link>
            }
          />
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Product</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Niche</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium">{p.name || 'Untitled'}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                      {p.niche ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {typeof scores[p.id] === 'number' ? (
                        <ScoreBadge score={scores[p.id]} label="100" />
                      ) : typeof p.ai_score === 'number' ? (
                        <span className="font-mono text-xs">{p.ai_score.toFixed(1)}/10</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/review/${p.id}`}
                          className="rounded-md bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/20 transition-colors"
                        >
                          View
                        </Link>
                        {/* Retry is offered for any product the pipeline
                            couldn't finish: stuck-in-running (wedged worker)
                            or rejected (the sweep flips stale runners to
                            rejected). The Worker stops any open run and
                            queues a fresh one. */}
                        {(p.status === 'running' || p.status === 'rejected') && (
                          <button
                            onClick={() => handleRetry(p)}
                            disabled={retryingId === p.id}
                            title="Retry pipeline"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-50 transition-colors"
                          >
                            {retryingId === p.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCw className="h-3.5 w-3.5" />
                            )}
                            Retry
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          title="Delete product"
                          className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {search && filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No products match &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
        )}
      </PageBody>
    </>
  )
}
