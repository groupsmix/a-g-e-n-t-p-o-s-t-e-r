'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, Inbox } from 'lucide-react'
import { api } from '@/lib/api'
import type { Product } from '@nexus/types'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

export default function ReviewQueuePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getProducts({ status: 'pending_review' })
      .then((r) => {
        // Defense-in-depth filter (BUG-206): workflow runs that complete with
        // no usable output (no title + ai_score === 0) should never land in
        // the human review queue. The workflow engine now rejects these
        // upstream, but old rows or future regressions get hidden here too.
        const usable = (r.products || []).filter((p) => {
          const hasTitle = typeof p.name === 'string' && p.name.trim().length > 0
          const score = typeof p.ai_score === 'number' ? p.ai_score : 0
          return hasTitle && score > 0
        })
        setProducts(usable)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Review Queue</span>}
        subtitle="Products awaiting CEO approval."
        actions={
          products.length > 0 ? (
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
              {products.length} pending
            </span>
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
            icon={<Inbox className="h-5 w-5" />}
            title="Queue is clear"
            description="All workflows have been reviewed. Check back after your next build."
          />
        ) : (
          <div className="space-y-3 max-w-3xl">
            {products.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4 hover:border-primary/20 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.name || 'Untitled'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{p.niche ?? '—'}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {typeof p.ai_score === 'number' && (
                    <span className="text-xs font-mono text-muted-foreground">{p.ai_score.toFixed(1)}/10</span>
                  )}
                  <StatusBadge status={p.status} />
                  <Link
                    href={`/review/${p.id}`}
                    className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Review
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </>
  )
}
