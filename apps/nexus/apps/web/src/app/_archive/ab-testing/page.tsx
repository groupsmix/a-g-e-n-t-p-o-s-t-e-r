'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  FlaskConical, Plus, Loader2, Trophy, BarChart3,
  Eye, MousePointerClick, CheckCircle2, Clock,
} from 'lucide-react'
import { api, type ABTest, type ABTestDetail } from '@/lib/api'
import { toast } from '@/lib/toast'
import type { Product } from '@posteragent/types/nexus'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

function StatusBadge({ status }: { status: string }) {
  const running = status === 'running'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        running
          ? 'bg-blue-500/10 text-blue-400'
          : 'bg-emerald-500/10 text-emerald-400'
      }`}
    >
      {running ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {running ? 'Running' : 'Completed'}
    </span>
  )
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = {
    high: 'bg-emerald-500/10 text-emerald-400',
    medium: 'bg-amber-500/10 text-amber-400',
    low: 'bg-red-500/10 text-red-400',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[confidence] ?? colors.low}`}>
      {confidence} confidence
    </span>
  )
}

function VariantCard({
  label,
  title,
  description,
  views,
  conversions,
  conversionRate,
  isWinner,
}: {
  label: string
  title: string
  description: string
  views: number
  conversions: number
  conversionRate: number
  isWinner: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        isWinner
          ? 'border-emerald-500/50 bg-emerald-500/5'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-muted-foreground">
          Variant {label.toUpperCase()}
        </span>
        {isWinner && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
            <Trophy className="h-3.5 w-3.5" /> Winner
          </span>
        )}
      </div>
      <h3 className="text-sm font-medium mb-1 line-clamp-2">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4 line-clamp-3">{description || '—'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <Eye className="h-3 w-3" /> Views
          </div>
          <div className="text-lg font-semibold">{views.toLocaleString()}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <MousePointerClick className="h-3 w-3" /> Conv.
          </div>
          <div className="text-lg font-semibold">{conversions.toLocaleString()}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <BarChart3 className="h-3 w-3" /> Rate
          </div>
          <div className="text-lg font-semibold">{conversionRate}%</div>
        </div>
      </div>
    </div>
  )
}

function TestRow({
  test,
  onSelect,
  onComplete,
}: {
  test: ABTest
  onSelect: (id: string) => void
  onComplete: (id: string) => void
}) {
  const convRateA =
    test.variant_a_views > 0
      ? Math.round((test.variant_a_conversions / test.variant_a_views) * 10000) / 100
      : 0
  const convRateB =
    test.variant_b_views > 0
      ? Math.round((test.variant_b_conversions / test.variant_b_views) * 10000) / 100
      : 0

  return (
    <div
      className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors cursor-pointer"
      onClick={() => onSelect(test.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h3 className="font-medium text-sm truncate">
            {test.product_name ?? test.product_id}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Created {new Date(test.created_at).toLocaleDateString()}
          </p>
        </div>
        <StatusBadge status={test.status} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg border border-border/50 p-3">
          <div className="text-xs text-muted-foreground mb-1">Variant A</div>
          <div className="text-xs truncate">{test.variant_a_title}</div>
          <div className="text-sm font-semibold mt-1">
            {convRateA}% <span className="text-xs font-normal text-muted-foreground">conv.</span>
          </div>
        </div>
        <div className="rounded-lg border border-border/50 p-3">
          <div className="text-xs text-muted-foreground mb-1">Variant B</div>
          <div className="text-xs truncate">{test.variant_b_title}</div>
          <div className="text-sm font-semibold mt-1">
            {convRateB}% <span className="text-xs font-normal text-muted-foreground">conv.</span>
          </div>
        </div>
      </div>

      {test.status === 'completed' && test.winner && (
        <div className="flex items-center gap-1 text-xs text-emerald-400">
          <Trophy className="h-3.5 w-3.5" />
          Winner: Variant {test.winner.toUpperCase()}
        </div>
      )}

      {test.status === 'running' && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onComplete(test.id)
          }}
          className="mt-1 text-xs text-primary hover:underline"
        >
          Pick winner
        </button>
      )}
    </div>
  )
}

export default function ABTestingPage() {
  const [tests, setTests] = useState<ABTest[]>([])
  const [selectedDetail, setSelectedDetail] = useState<ABTestDetail | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.getABTests()
      .then((r) => setTests(r.tests))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!selectedProductId) return
    setCreating(true)
    try {
      await api.createABTest(selectedProductId)
      setShowCreate(false)
      setSelectedProductId('')
      load()
    } catch { toast.error('Failed to create A/B test') }
    setCreating(false)
  }

  const handleOpenCreate = async () => {
    setShowCreate(true)
    try {
      const res = await api.getProducts({ status: 'approved', limit: 100 })
      setProducts(res.products)
    } catch { toast.error('Failed to load products') }
  }

  const handleSelect = async (id: string) => {
    try {
      const detail = await api.getABTest(id)
      setSelectedDetail(detail)
    } catch { toast.error('Failed to load test details') }
  }

  const handleComplete = async (id: string) => {
    try {
      await api.completeABTest(id)
      load()
      if (selectedDetail?.id === id) {
        const detail = await api.getABTest(id)
        setSelectedDetail(detail)
      }
    } catch { toast.error('Failed to complete test') }
  }

  const runningTests = tests.filter((t) => t.status === 'running')
  const completedTests = tests.filter((t) => t.status === 'completed')

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FlaskConical className="h-6 w-6" /> A/B Testing
          </span>
        }
        subtitle="Test product listing variants to find what converts best."
        actions={
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-md bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Create A/B Test
          </button>
        }
      />
      <PageBody className="space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tests…
          </div>
        )}

        {/* Create dialog */}
        {showCreate && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm">Create A/B Test</h3>
            <p className="text-xs text-muted-foreground">
              Pick a product and we&apos;ll auto-generate variant B using AI.
            </p>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.id}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={!selectedProductId || creating}
                className="inline-flex items-center gap-2 rounded-md bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Test
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Selected test detail */}
        {selectedDetail && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">
                  {selectedDetail.product_name ?? selectedDetail.product_id}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={selectedDetail.status} />
                  <ConfidenceBadge confidence={selectedDetail.stats.confidence} />
                  <span className="text-xs text-muted-foreground">
                    {selectedDetail.stats.total_views} total views
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <VariantCard
                label="a"
                title={selectedDetail.variant_a_title}
                description={selectedDetail.variant_a_description}
                views={selectedDetail.variant_a_views}
                conversions={selectedDetail.variant_a_conversions}
                conversionRate={selectedDetail.stats.variant_a_conversion_rate}
                isWinner={selectedDetail.winner === 'a'}
              />
              <VariantCard
                label="b"
                title={selectedDetail.variant_b_title}
                description={selectedDetail.variant_b_description}
                views={selectedDetail.variant_b_views}
                conversions={selectedDetail.variant_b_conversions}
                conversionRate={selectedDetail.stats.variant_b_conversion_rate}
                isWinner={selectedDetail.winner === 'b'}
              />
            </div>

            {selectedDetail.status === 'running' && (
              <button
                onClick={() => handleComplete(selectedDetail.id)}
                className="inline-flex items-center gap-2 rounded-md bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                <Trophy className="h-4 w-4" /> Pick Winner
              </button>
            )}
          </div>
        )}

        {/* Running tests */}
        {!loading && runningTests.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" /> Running Tests ({runningTests.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {runningTests.map((t) => (
                <TestRow key={t.id} test={t} onSelect={handleSelect} onComplete={handleComplete} />
              ))}
            </div>
          </div>
        )}

        {/* Completed tests */}
        {!loading && completedTests.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Completed ({completedTests.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {completedTests.map((t) => (
                <TestRow key={t.id} test={t} onSelect={handleSelect} onComplete={handleComplete} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && tests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No A/B tests yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Create your first A/B test to compare product listing variants and find what converts best.
            </p>
            <button
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> Create your first A/B test
            </button>
          </div>
        )}
      </PageBody>
    </>
  )
}
