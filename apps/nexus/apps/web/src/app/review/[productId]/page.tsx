'use client'

export const runtime = 'edge'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, assetUrl, API_BASE } from '@/lib/api'
import type { ProductDetail } from '@nexus/types'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { ScoreBar } from '@/components/shared/ScoreBar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Markdown } from '@/components/Markdown'
import {
  CheckCircle2, XCircle, AlertTriangle, ThumbsDown, ThumbsUp, Edit3, Trash2, Download,
  FileText, ExternalLink,
} from 'lucide-react'

const DELIVERABLE_FORMATS: { key: string; label: string }[] = [
  { key: 'planner', label: 'Planner' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'template', label: 'Template' },
  { key: 'prompt_pack', label: 'Prompt Pack' },
  { key: 'guide', label: 'Guide' },
  { key: 'workbook', label: 'Workbook' },
]

export default function ReviewPage() {
  const params = useParams<{ productId: string }>()
  const id = params?.productId as string
  const router = useRouter()
  const [p, setP] = useState<ProductDetail | null>(null)
  const [tab, setTab] = useState<'platforms' | 'social'>('platforms')
  const [activePlatform, setActivePlatform] = useState(0)
  const [activeSocial, setActiveSocial] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [editing, setEditing] = useState<null | 'title' | 'description' | 'tags'>(null)
  const [genning, setGenning] = useState(false)
  const [fmt, setFmt] = useState('')
  const [gumroadBusy, setGumroadBusy] = useState(false)

  useEffect(() => {
    api.getProductDetail(id).then(setP).catch(() => setP(null))
  }, [id])

  if (!p) {
    return (
      <PageBody>
        <div className="text-sm text-muted-foreground">Loading review…</div>
      </PageBody>
    )
  }

  const approve = async () => {
    try {
      await api.approveProduct(p.id)
      router.push('/products')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve product')
    }
  }
  const reject = async () => {
    try {
      await api.rejectProduct(p.id, feedback || 'No reason given')
      router.push('/graveyard')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject product')
    }
  }
  const updateField = async (patch: Partial<ProductDetail>) => {
    const prev = { ...p }
    setP({ ...p, ...patch })
    try {
      await api.updateProductSection(p.id, patch)
      setEditing(null)
    } catch (err) {
      setP(prev)
      alert(err instanceof Error ? err.message : 'Failed to save changes')
    }
  }
  const del = async () => {
    if (!confirm(`Delete "${p.name || 'this product'}"? This removes it and its files for good.`)) return
    try {
      await api.deleteProduct(p.id)
      router.push('/products')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete product')
    }
  }
  const genDeliverable = async (format?: string) => {
    setGenning(true)
    try {
      const r = await api.generateDeliverable(p.id, format ? { format, force: true } : undefined)
      setP({ ...p, deliverable_url: r.deliverable_url, deliverable_format: r.deliverable_format })
    } catch {
      alert('Could not generate the deliverable right now. The free AI engine may be busy — try again in a moment.')
    } finally {
      setGenning(false)
    }
  }

  const publishGumroad = async () => {
    setGumroadBusy(true)
    try {
      const res = await api.publishProductToGumroad(p.id)
      setP({ ...p, gumroad_product_id: res.gumroad_product_id, gumroad_url: res.gumroad_url })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish to Gumroad')
    } finally {
      setGumroadBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span>
            CEO Review{' '}
            <span className="text-muted-foreground font-normal text-base">· {p.name}</span>
          </span>
        }
        subtitle={<span>{p.domain_name} → {p.category_name}</span>}
        actions={
          <div className="flex items-center gap-3">
            {p.generated_offline ? (
              <span
                title="At least one step used the offline template fallback. Add an AI provider key for fully real content."
                className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
              >
                Draft (offline)
              </span>
            ) : (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Real AI
              </span>
            )}
            <StatusBadge status={p.status} />
            <div className="rounded-full border border-border bg-card px-3 py-1.5 text-sm">
              AI score{' '}
              <span className="font-mono font-bold ml-1 text-gradient">
                {typeof p.ai_score === 'number' ? p.ai_score.toFixed(1) : '—'}
              </span>
              <span className="text-muted-foreground">/10</span>
            </div>
          </div>
        }
      />
      <PageBody>
        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-5">
            {p.image_url && (
              <Section title="Hero image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetUrl(p.image_url) ?? ''}
                  alt={p.name ?? 'Generated hero image'}
                  className="w-full max-w-md rounded-xl border border-border"
                />
              </Section>
            )}

            <Section title="Deliverable (the file the buyer gets)">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-medium">
                      {p.deliverable_url ? `${p.deliverable_format || 'Product'} · PDF` : 'No deliverable yet'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.deliverable_url
                        ? 'Real, downloadable content — not just a brief.'
                        : 'Generate the actual file the buyer downloads.'}
                    </div>
                  </div>
                </div>
                {p.deliverable_url ? (
                  <a
                    href={assetUrl(p.deliverable_url) ?? ''}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View PDF
                  </a>
                ) : (
                  <button
                    onClick={() => genDeliverable()}
                    disabled={genning}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" /> {genning ? 'Generating…' : 'Generate deliverable'}
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
                <span className="text-xs text-muted-foreground">
                  {p.deliverable_format ? `Format: ${p.deliverable_format}.` : 'Auto-picks a format.'} Force a different one:
                </span>
                <select
                  value={fmt}
                  onChange={(e) => setFmt(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">Auto (pick for me)</option>
                  {DELIVERABLE_FORMATS.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => genDeliverable(fmt || undefined)}
                  disabled={genning}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:border-primary/40 disabled:opacity-50"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {genning ? 'Generating…' : p.deliverable_url ? 'Regenerate' : 'Generate'}
                </button>
              </div>
            </Section>

            <Section
              title="Title"
              actions={
                <button
                  onClick={() => setEditing('title')}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <Edit3 className="h-3 w-3" /> Edit
                </button>
              }
            >
              <div className="space-y-2">
                {p.title_variants.map((t, i) => (
                  <label
                    key={i}
                    className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                      p.selected_title_index === i
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="title"
                      checked={p.selected_title_index === i}
                      onChange={() => updateField({ selected_title_index: i })}
                      className="mt-1"
                    />
                    <div className="text-sm">{t}</div>
                  </label>
                ))}
              </div>
            </Section>

            <Section
              title="Description"
              actions={
                <button
                  onClick={() => setEditing(editing === 'description' ? null : 'description')}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <Edit3 className="h-3 w-3" /> Edit
                </button>
              }
            >
              {editing === 'description' ? (
                <textarea
                  defaultValue={p.description}
                  onBlur={(e) => updateField({ description: e.target.value })}
                  className="input min-h-32 w-full"
                />
              ) : (
                <Markdown className="text-sm text-foreground/90">{p.description || ''}</Markdown>
              )}
            </Section>

            <Section
              title="Tags"
              actions={
                <button
                  onClick={() => setEditing(editing === 'tags' ? null : 'tags')}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <Edit3 className="h-3 w-3" /> Edit
                </button>
              }
            >
              {editing === 'tags' ? (
                <input
                  defaultValue={p.tags.join(', ')}
                  onBlur={(e) =>
                    updateField({
                      tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  className="input w-full"
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <span key={t} className="text-xs rounded-full bg-muted px-2.5 py-1">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Pricing">
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold tabular-nums">
                  ${typeof p.price === 'number' ? p.price.toFixed(0) : '—'}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    {p.currency}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Revenue est. (90 days)
                  </div>
                  <div className="text-sm font-mono">
                    ${p.revenue_estimate_detail?.min ?? '—'}–${p.revenue_estimate_detail?.max ?? '—'}
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Variations">
              <div className="flex border-b border-border mb-3">
                <button
                  onClick={() => setTab('platforms')}
                  className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                    tab === 'platforms'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground'
                  }`}
                >
                  Platforms ({p.platform_variants.length})
                </button>
                <button
                  onClick={() => setTab('social')}
                  className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                    tab === 'social'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground'
                  }`}
                >
                  Social ({p.social_variants.length})
                </button>
              </div>
              {tab === 'platforms' ? (
                <>
                  <div className="flex gap-1 mb-3 flex-wrap">
                    {p.platform_variants.map((v, i) => (
                      <button
                        key={v.id}
                        onClick={() => setActivePlatform(i)}
                        className={`text-xs px-2.5 py-1 rounded-full border ${
                          activePlatform === i
                            ? 'border-primary bg-primary/10'
                            : 'border-border'
                        }`}
                      >
                        {v.platform_name}
                      </button>
                    ))}
                  </div>
                  {p.platform_variants[activePlatform] && (
                    <div className="rounded-xl border border-border p-4 space-y-3 bg-background/50">
                      <div className="font-semibold text-sm">
                        {p.platform_variants[activePlatform].title}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {p.platform_variants[activePlatform].description}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {p.platform_variants[activePlatform].tags.map((t: string) => (
                          <span key={t} className="text-[11px] rounded bg-muted px-1.5 py-0.5">
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="text-sm font-mono">
                        ${p.platform_variants[activePlatform].price}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex gap-1 mb-3 flex-wrap">
                    {p.social_variants.map((v, i) => (
                      <button
                        key={v.id}
                        onClick={() => setActiveSocial(i)}
                        className={`text-xs px-2.5 py-1 rounded-full border ${
                          activeSocial === i
                            ? 'border-primary bg-primary/10'
                            : 'border-border'
                        }`}
                      >
                        {v.channel_name}
                      </button>
                    ))}
                  </div>
                  {p.social_variants[activeSocial] && (
                    <div className="rounded-xl border border-border p-4 space-y-2 bg-background/50">
                      {p.social_variants[activeSocial].content.hook && (
                        <div className="text-xs text-muted-foreground italic">
                          Hook: {p.social_variants[activeSocial].content.hook}
                        </div>
                      )}
                      <div className="text-sm whitespace-pre-wrap">
                        {p.social_variants[activeSocial].content.caption}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {p.social_variants[activeSocial].content.hashtags.map((h: string) => (
                          <span key={h} className="text-[11px] text-primary">
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Section>

            {p.launch_boost_pack && (
              <Section title="Launch boost pack">
                <div className="space-y-2">
                  {p.launch_boost_pack.posts.map((post, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"
                    >
                      <div className="text-[11px] font-mono uppercase text-muted-foreground tabular-nums w-12 shrink-0">
                        {post.when}
                      </div>
                      <div className="text-xs font-medium w-24 shrink-0">{post.channel}</div>
                      <div className="text-foreground/80">{post.content}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>

          <div className="space-y-5">
            <Section title="Section scores">
              <div className="space-y-3">
                {Object.entries(p.section_scores).map(([k, v]) => (
                  <ScoreBar key={k} value={v as number} label={k} />
                ))}
              </div>
            </Section>

            {p.issues.length > 0 && (
              <Section title="Issues to fix">
                <ul className="space-y-3">
                  {p.issues.map((iss, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                        <span className="font-medium capitalize">{iss.section}</span>
                      </div>
                      <div className="text-muted-foreground mt-0.5">{iss.problem}</div>
                      <div className="text-success mt-0.5">→ {iss.fix}</div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Listing health">
              <ul className="space-y-1.5 text-sm">
                {p.health_check.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {h.status === 'pass' && (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    )}
                    {h.status === 'warn' && (
                      <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    )}
                    {h.status === 'fail' && (
                      <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div>{h.label}</div>
                      {h.detail && (
                        <div className="text-[11px] text-muted-foreground">{h.detail}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            {p.competitor_gap?.detected && (
              <Section title="Competitor gap">
                <div className="text-sm rounded-xl bg-success/10 border border-success/30 p-3 text-success">
                  {p.competitor_gap.summary}
                </div>
              </Section>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 mt-8 -mx-6 md:-mx-8 px-6 md:px-8 py-4 border-t border-border bg-background/95 backdrop-blur flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to products
            </Link>
            <a
              href={`${API_BASE}/api/products/${p.id}/deliverable`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <Download className="h-4 w-4" /> Download
            </a>
            {p.gumroad_url ? (
              <a
                href={p.gumroad_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" /> Gumroad
              </a>
            ) : (
              <button
                onClick={publishGumroad}
                disabled={gumroadBusy}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <ExternalLink className="h-4 w-4" /> {gumroadBusy ? 'Publishing…' : 'Publish to Gumroad'}
              </button>
            )}
            <button
              onClick={del}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
          <div className="flex items-center gap-2">
            {showReject ? (
              <div className="flex items-center gap-2">
                <input
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="What's wrong? (sent back to AI)"
                  className="input w-72"
                />
                <button
                  onClick={reject}
                  className="inline-flex items-center gap-1 rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium"
                >
                  <ThumbsDown className="h-4 w-4" /> Reject
                </button>
                <button
                  onClick={() => setShowReject(false)}
                  className="text-sm text-muted-foreground px-2"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowReject(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-4 py-2 text-sm hover:border-destructive/50 hover:text-destructive"
                >
                  <ThumbsDown className="h-4 w-4" /> Reject
                </button>
                <button
                  onClick={approve}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold "
                >
                  <ThumbsUp className="h-4 w-4" /> Approve
                </button>
              </>
            )}
          </div>
        </div>
      </PageBody>
    </>
  )
}

function Section({
  title,
  actions,
  children,
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  )
}
