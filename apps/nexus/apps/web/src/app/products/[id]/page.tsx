'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, assetUrl } from '@/lib/api'
import { toast } from '@/lib/toast'
import type { ProductDetail } from '@nexus/types'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ScoreBar } from '@/components/shared/ScoreBar'
import { Loader2, ArrowLeft, CheckCircle2, XCircle, Edit3, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id as string
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [gumroadBusy, setGumroadBusy] = useState(false)

  useEffect(() => {
    api
      .getProductDetail(id)
      .then(setProduct)
      .catch((err: Error) => setError(err.message || 'Failed to load product'))
      .finally(() => setLoading(false))
  }, [id])

  const handleApprove = async () => {
    setActionBusy(true)
    try {
      await api.approveProduct(id)
      setProduct((p) => (p ? { ...p, status: 'approved' } : p))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve product')
    } finally {
      setActionBusy(false)
    }
  }

  const handleReject = async () => {
    const feedback = prompt('Rejection reason (optional):') ?? 'No reason given'
    setActionBusy(true)
    try {
      await api.rejectProduct(id, feedback)
      setProduct((p) => (p ? { ...p, status: 'rejected' } : p))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject product')
    } finally {
      setActionBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this product permanently?')) return
    setActionBusy(true)
    try {
      await api.deleteProduct(id)
      router.push('/products')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete product')
      setActionBusy(false)
    }
  }

  const handlePublishGumroad = async () => {
    setGumroadBusy(true)
    try {
      const res = await api.publishProductToGumroad(id)
      setProduct((p) =>
        p ? { ...p, gumroad_product_id: res.gumroad_product_id, gumroad_url: res.gumroad_url } : p,
      )
      toast.success('Published to Gumroad')
    } catch (err) {
      // BUG-204: an alert() box gets auto-dismissed by some browser modes
      // (Playwright in particular) and felt like the click did nothing.
      // Use the in-app toast and, if the failure looks like a missing token,
      // point the user at the Settings page.
      const message = err instanceof Error ? err.message : 'Failed to publish to Gumroad'
      const looksLikeMissingToken =
        /GUMROAD_ACCESS_TOKEN/i.test(message) ||
        /not configured/i.test(message) ||
        /unauthor/i.test(message)
      if (looksLikeMissingToken) {
        toast.error('Connect Gumroad in Settings → Keys first')
      } else {
        toast.error(message)
      }
    } finally {
      setGumroadBusy(false)
    }
  }

  if (loading) {
    return (
      <PageBody>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageBody>
    )
  }

  if (error || !product) {
    return (
      <PageBody>
        <div className="text-center py-16">
          <p className="text-sm text-destructive mb-4">{error || 'Product not found'}</p>
          <Link href="/products" className="text-primary hover:underline text-sm">
            ← Back to products
          </Link>
        </div>
      </PageBody>
    )
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Link href="/products" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            {product.name || 'Untitled Product'}
          </span>
        }
        subtitle={
          <span>
            {product.domain_name} → {product.category_name}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={product.status} />
            <div className="rounded-full border border-border bg-card px-3 py-1.5 text-sm">
              AI score{' '}
              <span className="font-mono font-bold ml-1">
                {typeof product.ai_score === 'number' ? product.ai_score.toFixed(1) : '—'}
              </span>
              <span className="text-muted-foreground">/10</span>
            </div>
          </div>
        }
      />
      <PageBody>
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 max-w-5xl">
          {/* Main content */}
          <div className="space-y-6">
            {/* Image */}
            {product.image_url && (
              <Card>
                <CardContent className="p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assetUrl(product.image_url) ?? ''}
                    alt={product.name ?? 'Product image'}
                    className="w-full max-w-md rounded-xl border border-border"
                  />
                </CardContent>
              </Card>
            )}

            {/* Description */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {product.description || 'No description available'}
                </p>
              </CardContent>
            </Card>

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Tags</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {product.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-muted px-2.5 py-1 text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Section Scores */}
            {product.section_scores && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Quality Scores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(product.section_scores).map(([key, value]) => (
                    <ScoreBar key={key} label={key} value={value} />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Issues */}
            {product.issues && product.issues.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Review Issues</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {product.issues.map((issue, i) => (
                    <div key={i} className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm font-medium capitalize">{issue.section}</p>
                      <p className="text-xs text-muted-foreground mt-1">{issue.problem}</p>
                      <p className="text-xs text-primary mt-1">Fix: {issue.fix}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(product.status === 'pending_review' || product.status === 'draft') && (
                  <>
                    <Button
                      className="w-full"
                      onClick={handleApprove}
                      disabled={actionBusy}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleReject}
                      disabled={actionBusy}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </>
                )}
                <Link href={`/review/${product.id}`} className="block">
                  <Button variant="outline" className="w-full">
                    <Edit3 className="h-4 w-4 mr-2" />
                    Full Review
                  </Button>
                </Link>
                {product.gumroad_url ? (
                  <a
                    href={product.gumroad_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button variant="outline" className="w-full">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on Gumroad
                    </Button>
                  </a>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handlePublishGumroad}
                    disabled={gumroadBusy}
                  >
                    {gumroadBusy ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Publish to Gumroad
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={handleDelete}
                  disabled={actionBusy}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </CardContent>
            </Card>

            {/* Pricing */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pricing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {product.currency} {product.price?.toFixed(2) ?? '—'}
                </div>
                {product.revenue_estimate_detail && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Est. revenue: {product.revenue_estimate_detail.currency}{' '}
                    {product.revenue_estimate_detail.min}–{product.revenue_estimate_detail.max}/mo
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Deliverable */}
            {product.deliverable_url && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Deliverable</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground mb-2">
                    Format: {product.deliverable_format || 'unknown'}
                  </div>
                  <a
                    href={assetUrl(product.deliverable_url) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Download deliverable →
                  </a>
                </CardContent>
              </Card>
            )}

            {/* Health Check */}
            {product.health_check && product.health_check.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Health Check</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {product.health_check.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          item.status === 'pass'
                            ? 'bg-green-500'
                            : item.status === 'warn'
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        }`}
                      />
                      <span className="text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </PageBody>
    </>
  )
}
