'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Package, Trash2, Search, RotateCw, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { api, type ProductScoreResponse } from '@/lib/api'
import type { Product } from '@nexus/types'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ScoreBadge } from '@/components/shared/ScoreBadge'

// T16: page size for server-side pagination on /products. 25 keeps the
// table readable on a laptop screen and the API round-trip well under a
// second on D1; the server clamps anything above 100 anyway.
const PAGE_SIZE = 25

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  // T10: seed search from ?q= so the back button restores filtered state
  // and operators can deep-link a filtered view to themselves.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState(searchParams?.get('q') ?? '')
  // T16: page also lives in the URL so refresh / back-button / deep-link
  // all restore the same view. Pages are 1-indexed for the human-readable
  // "Page X of Y"; we convert to offset for the API.
  const initialPage = (() => {
    const p = parseInt(searchParams?.get('page') ?? '1', 10)
    return Number.isFinite(p) && p > 0 ? p : 1
  })()
  const [page, setPage] = useState(initialPage)
  const [scores, setScores] = useState<Record<string, number>>({})

  // Reflect search + page into the URL. Changing search resets the page
  // back to 1 so the user doesn't end up on "page 4" of a filtered list
  // that only has 1 page of results.
  useEffect(() => {
    const sp = new URLSearchParams(Array.from(searchParams?.entries() ?? []))
    if (search.trim()) sp.set('q', search.trim())
    else sp.delete('q')
    if (page > 1) sp.set('page', String(page))
    else sp.delete('page')
    const next = sp.toString()
    const current = searchParams?.toString() ?? ''
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ''}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page])

  // Reset to page 1 whenever the search query changes; otherwise a user
  // who was on page 4 and types a new filter sees "no results" until they
  // click Prev. This is the standard pagination UX every shop uses.
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // T16: data fetch keyed on (page, search). Debounce search so we don't
  // hammer the API on every keystroke.
  useEffect(() => {
    let cancelled = false
    const trimmed = search.trim()
    const debounceMs = trimmed ? 250 : 0
    const handle = setTimeout(() => {
      setLoading(true)
      api
        .getProducts({
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          q: trimmed || undefined,
        })
        .then((r) => {
          if (cancelled) return
          const prods = r.products || []
          setProducts(prods)
          setTotal(r.total ?? prods.length)
          setHasMore(Boolean(r.has_more))
          // Fetch scores in the background; they're per-product and we
          // don't want to block the table render on N more requests.
          for (const p of prods) {
            api.getProductScore(p.id).then((s: ProductScoreResponse) => {
              if (cancelled) return
              setScores((prev) => ({ ...prev, [p.id]: s.score.total }))
            }).catch(() => {})
          }
        })
        .catch(() => {
          if (cancelled) return
          setProducts([])
          setTotal(0)
          setHasMore(false)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [page, search])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleDelete = async (p: Product) => {
    if (!confirm(`Delete "${p.name || 'Untitled'}"? This removes the product and its files for good.`)) return
    setDeletingId(p.id)
    const prev = products
    const prevTotal = total
    setProducts((list) => list.filter((x) => x.id !== p.id))
    setTotal((t) => Math.max(0, t - 1))
    try {
      await api.deleteProduct(p.id)
      // After a delete the current page might now be empty (was the last
      // row on the last page) — bounce back one page so the operator
      // doesn't stare at an empty table.
      if (products.length === 1 && page > 1) {
        setPage((p) => p - 1)
      }
    } catch {
      setProducts(prev)
      setTotal(prevTotal)
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

  // T16: search now happens server-side (see the API route — same
  // multi-token AND match the client used to do, just executed against
  // the DB so it composes with LIMIT/OFFSET). The component just renders
  // whatever the server returned for the current page.
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = (page - 1) * PAGE_SIZE + products.length

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Package className="h-5 w-5" /> Products</span>}
        subtitle="Everything NEXUS has generated, across all domains."
        actions={
          total > 0 || search ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {/* T16: show the real total from the server, not "filtered/loaded". */}
                {total === 0 ? '0' : `${rangeStart}–${rangeEnd} of ${total}`}
              </span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="input pl-9 pr-8 w-48 md:w-64 text-sm"
                  aria-label="Search products"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ) : undefined
        }
      />
      <PageBody>
        {loading && products.length === 0 ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : products.length === 0 ? (
          // Distinguish "no products at all yet" from "no products match
          // this search" — the empty state is misleading if the user just
          // typed a filter that found nothing.
          search ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No matches"
              description={`No products match “${search}”.`}
              action={
                <button
                  onClick={() => setSearch('')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Clear search
                </button>
              }
            />
          ) : (
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
          )
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
                {products.map((p) => (
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
            {/* T16: pagination footer — Prev / page indicator / Next.
                Only shown when there's more than one page of results so
                tiny catalogs stay clean. */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs">
                <span className="text-muted-foreground tabular-nums">
                  Page <span className="font-medium text-foreground">{page}</span> of {totalPages}
                  {loading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin opacity-60" aria-hidden="true" />}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasMore || loading}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next page"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </PageBody>
    </>
  )
}
