'use client'

import { useEffect, useState } from 'react'
import {
  Globe2,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  ExternalLink,
  Clock,
} from 'lucide-react'
import {
  api,
  type PlatformStatusInfo,
  type FlowInfo,
  type PlatformListing,
  type ListingResult,
} from '@/lib/api'
import type { Product } from '@posteragent/types/nexus'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

const STATUS_ICON: Record<string, React.ReactNode> = {
  listed: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
  pending: <Clock className="h-4 w-4 text-amber-500" />,
}

export default function PlatformsPage() {
  const [platforms, setPlatforms] = useState<PlatformStatusInfo[]>([])
  const [flows, setFlows] = useState<FlowInfo[]>([])
  const [listings, setListings] = useState<PlatformListing[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [listingBusy, setListingBusy] = useState(false)
  const [listResults, setListResults] = useState<ListingResult[] | null>(null)
  const [listError, setListError] = useState('')

  // Flow executor state
  const [selectedFlow, setSelectedFlow] = useState<string>('')
  const [flowVars, setFlowVars] = useState<Record<string, string>>({})
  const [flowBusy, setFlowBusy] = useState(false)
  const [flowLog, setFlowLog] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      api.getPlatformStatuses().catch(() => ({ platforms: [] })),
      api.getBrowserFlows().catch(() => ({ flows: [] })),
      api.getPlatformListings().catch(() => ({ listings: [] })),
      api.getProducts({ limit: 50 }).catch(() => ({ products: [] })),
    ]).then(([p, f, l, pr]) => {
      setPlatforms(p.platforms)
      setFlows(f.flows)
      setListings(l.listings)
      setProducts(pr.products)
      setLoading(false)
    })
  }, [])

  const runListAll = async () => {
    if (!selectedProduct || listingBusy) return
    setListingBusy(true)
    setListError('')
    setListResults(null)
    try {
      const product = products.find((p) => p.id === selectedProduct)
      if (!product) throw new Error('Product not found')
      const res = await api.listOnAllPlatforms({
        id: product.id,
        title: product.name ?? '',
        niche: product.niche ?? '',
      })
      setListResults(res.results)
      // Refresh listings
      api.getPlatformListings().then((l) => setListings(l.listings)).catch(() => void 0)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to list')
    } finally {
      setListingBusy(false)
    }
  }

  const runFlow = async () => {
    if (!selectedFlow || flowBusy) return
    setFlowBusy(true)
    setFlowLog([])
    try {
      const res = await api.executeBrowserFlow(selectedFlow, flowVars)
      const log = res.results.map(
        (r) => `[${r.ok ? 'OK' : 'FAIL'}] ${r.action} — ${r.message ?? ''} (${r.durationMs}ms)`,
      )
      setFlowLog(log)
    } catch (err) {
      setFlowLog([`Error: ${err instanceof Error ? err.message : 'unknown'}`])
    } finally {
      setFlowBusy(false)
    }
  }

  const activeFlow = flows.find((f) => f.name === selectedFlow)

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Globe2 className="h-5 w-5" /> Multi-Platform Listing
          </span>
        }
        subtitle="Manage listings across Gumroad, Etsy, Creative Market and Payhip via browser automation."
      />
      <PageBody className="space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading platforms…
          </div>
        )}

        {/* ── Platform Status Cards ────────────────────────────────── */}
        {!loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {platforms.map((p) => (
              <div
                key={p.name}
                className="rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{p.name}</span>
                  {p.configured ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                      <AlertCircle className="h-3 w-3" /> Not configured
                    </span>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Method: <span className="font-medium">{p.method}</span>
                  {p.requiresAuth && ' · Auth required'}
                </div>
                <a
                  href={p.baseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {p.baseUrl} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        )}

        {/* ── List on all platforms ──────────────────────────────── */}
        {!loading && products.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3">
            <div className="text-sm font-semibold">List on All Platforms</div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Product
                </label>
                <select
                  className="input w-full"
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  disabled={listingBusy}
                >
                  <option value="">Select a product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={runListAll}
                disabled={!selectedProduct || listingBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {listingBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {listingBusy ? 'Listing…' : 'List on all platforms'}
              </button>
            </div>

            {listError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
                {listError}
              </div>
            )}

            {listResults && (
              <div className="space-y-2">
                {listResults.map((r) => (
                  <div
                    key={r.platform}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {r.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium capitalize">{r.platform}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {r.ok
                        ? `Listed (${r.execution?.totalMs ?? 0}ms)`
                        : r.error ?? 'Failed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pre-built Flows ────────────────────────────────────── */}
        {!loading && flows.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3">
            <div className="text-sm font-semibold">Execute Pre-built Flow</div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Flow
                </label>
                <select
                  className="input w-full"
                  value={selectedFlow}
                  onChange={(e) => {
                    setSelectedFlow(e.target.value)
                    setFlowVars({})
                    setFlowLog([])
                  }}
                  disabled={flowBusy}
                >
                  <option value="">Select a flow…</option>
                  {flows.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.name} ({f.platform})
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={runFlow}
                disabled={!selectedFlow || flowBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {flowBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {flowBusy ? 'Running…' : 'Run flow'}
              </button>
            </div>

            {activeFlow && activeFlow.variables.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {activeFlow.variables.map((v) => (
                  <div key={v}>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {v}
                    </label>
                    <input
                      className="input w-full"
                      value={flowVars[v] ?? ''}
                      onChange={(e) =>
                        setFlowVars((prev) => ({ ...prev, [v]: e.target.value }))
                      }
                      disabled={flowBusy}
                      placeholder={v}
                    />
                  </div>
                ))}
              </div>
            )}

            {flowLog.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Execution Log
                </div>
                <pre className="max-h-60 overflow-y-auto text-xs whitespace-pre-wrap">
                  {flowLog.join('\n')}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── Recent Listings ────────────────────────────────────── */}
        {!loading && (
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3 text-sm font-medium">
              Recent Listings ({listings.length})
            </div>
            {listings.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No listing attempts yet. Use the controls above to list products.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {listings.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {STATUS_ICON[l.status] ?? (
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium capitalize">
                          {l.platform}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Product: {l.product_id.slice(0, 8)}…
                          {l.listed_at && ` · Listed ${new Date(l.listed_at).toLocaleDateString()}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          l.status === 'listed'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : l.status === 'error'
                              ? 'bg-red-500/10 text-red-500'
                              : 'bg-amber-500/10 text-amber-500'
                        }`}
                      >
                        {l.status}
                      </span>
                      {l.platform_url && (
                        <a
                          href={l.platform_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PageBody>
    </>
  )
}
