'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Shirt, Coffee, Image, Loader2, Plus, Rocket, Package, DollarSign,
  Plug, ShoppingBag,
} from 'lucide-react'
import { api, type PODProduct, type PODStats } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

const PRODUCT_TYPES = [
  { value: 't-shirt', label: 'T-Shirt', icon: Shirt },
  { value: 'mug', label: 'Mug', icon: Coffee },
  { value: 'poster', label: 'Poster', icon: Image },
  { value: 'hoodie', label: 'Hoodie', icon: Shirt },
  { value: 'tote-bag', label: 'Tote Bag', icon: ShoppingBag },
] as const

export default function PODPage() {
  const [stats, setStats] = useState<PODStats | null>(null)
  const [products, setProducts] = useState<PODProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [niche, setNiche] = useState('')
  const [productType, setProductType] = useState('t-shirt')
  const [showForm, setShowForm] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.getPodStats().catch(() => null),
      api.getPodProducts().catch(() => ({ products: [] })),
    ]).then(([s, p]) => {
      setStats(s)
      setProducts(p?.products ?? [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!niche.trim()) return
    setCreating(true)
    setError(null)
    try {
      await api.createPodProduct({ niche: niche.trim(), productType })
      setNiche('')
      setShowForm(false)
      load()
    } catch (err) {
      setError((err as Error).message || 'Failed to create product')
    } finally {
      setCreating(false)
    }
  }

  const handlePublish = async (id: string) => {
    setPublishingId(id)
    try {
      await api.publishPodProduct(id)
      load()
    } catch (err) {
      setError((err as Error).message || 'Failed to publish')
    } finally {
      setPublishingId(null)
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Shirt className="h-5 w-5" /> Print on Demand</span>}
        subtitle="Create and sell custom products via Printify — t-shirts, mugs, posters, hoodies & tote bags."
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Product
          </button>
        }
      />

      <PageBody className="space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading POD data…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {/* Stats cards */}
        {!loading && stats && (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              icon={<Package className="h-5 w-5 text-primary" />}
              label="Total Products"
              value={String(stats.total_products)}
            />
            <StatCard
              icon={<Rocket className="h-5 w-5 text-emerald-500" />}
              label="Published"
              value={String(stats.published)}
            />
            <StatCard
              icon={<DollarSign className="h-5 w-5 text-amber-500" />}
              label="Revenue Estimate"
              value={`$${stats.revenue_estimate_usd.toFixed(2)}`}
            />
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold">Create New POD Product</h3>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Niche</label>
              <input
                type="text"
                placeholder="e.g. Cat Lovers, Fitness, Coding…"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Product Type</label>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_TYPES.map((pt) => {
                  const Icon = pt.icon
                  const selected = productType === pt.value
                  return (
                    <button
                      key={pt.value}
                      onClick={() => setProductType(pt.value)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" /> {pt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={creating || !niche.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? 'Creating…' : 'Create Product'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && products.length === 0 && !showForm && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Shirt className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <h3 className="mt-3 text-sm font-semibold">No POD Products Yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Create your first print-on-demand product. You&apos;ll need a Printify API token to publish — add it on the{' '}
              <Link href="/settings/keys" className="text-primary hover:underline">API Keys</Link> page.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> Create Product
              </button>
              <Link
                href="/settings/keys"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                <Plug className="h-4 w-4" /> Setup Printify
              </Link>
            </div>
          </div>
        )}

        {/* Products list */}
        {!loading && products.length > 0 && (
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3 text-sm font-medium">
              POD Products ({products.length})
            </div>
            <div className="divide-y divide-border">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{p.title}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.product_type} · {p.niche || 'No niche'}
                      {p.created_at && ` · ${new Date(p.created_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.status === 'draft' && (
                      <button
                        onClick={() => handlePublish(p.id)}
                        disabled={publishingId === p.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {publishingId === p.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Rocket className="h-3 w-3" />
                        )}
                        Publish
                      </button>
                    )}
                    {p.printify_url && (
                      <a
                        href={p.printify_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        View on Printify ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PageBody>
    </>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    published: 'bg-emerald-500/10 text-emerald-600',
    failed: 'bg-destructive/10 text-destructive',
  }
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[status] || colors.draft}`}>
      {status}
    </span>
  )
}
