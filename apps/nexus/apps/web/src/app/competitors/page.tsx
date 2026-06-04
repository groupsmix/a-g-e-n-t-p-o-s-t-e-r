'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Eye, Plus, Trash2, Loader2, Search, TrendingUp,
  DollarSign, Lightbulb, RefreshCw, ExternalLink,
} from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

interface Competitor {
  id: string
  name: string
  platform: string
  url: string
  niche: string | null
  last_checked_at: string | null
  created_at: string
}

interface CompetitorInsights {
  insights: string
  trending_products: { title: string; reason: string }[]
  price_gaps: { niche: string; observation: string }[]
  opportunities: { title: string; description: string }[]
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [insights, setInsights] = useState<CompetitorInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [scanning, setScanning] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', url: '', platform: 'etsy', niche: '' })
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.getCompetitors()
      .then((data) => setCompetitors(data.competitors))
      .catch(() => toast.error('Failed to load competitors'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const loadInsights = async () => {
    setInsightsLoading(true)
    try {
      const data = await api.getCompetitorInsights()
      setInsights(data)
    } catch { toast.error('Failed to load insights') }
    setInsightsLoading(false)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.url) return
    setSubmitting(true)
    try {
      await api.addCompetitor(formData)
      setFormData({ name: '', url: '', platform: 'etsy', niche: '' })
      setShowForm(false)
      load()
    } catch { toast.error('Failed to add competitor') }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteCompetitor(id)
      setCompetitors((prev) => prev.filter((c) => c.id !== id))
    } catch { toast.error('Failed to delete competitor') }
  }

  const handleScan = async (id: string) => {
    setScanning(id)
    try {
      await api.scanCompetitor(id)
      load()
    } catch { toast.error('Scan failed') }
    setScanning(null)
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Eye className="h-6 w-6" /> Competitor Tracker
          </span>
        }
        subtitle="Monitor what's selling in your niches. Track competitors, scan their stores, and get AI-powered insights."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={loadInsights}
              disabled={insightsLoading}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-sidebar-accent transition-colors disabled:opacity-50"
            >
              {insightsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
              Get Insights
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-md bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Add Competitor
            </button>
          </div>
        }
      />
      <PageBody className="space-y-6">
        {/* Add Competitor Form */}
        {showForm && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-semibold mb-4">Add Competitor</h3>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Competitor name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                required
              />
              <input
                type="url"
                placeholder="Store URL"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                required
              />
              <select
                value={formData.platform}
                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="etsy">Etsy</option>
                <option value="gumroad">Gumroad</option>
                <option value="shopify">Shopify</option>
                <option value="amazon">Amazon</option>
                <option value="other">Other</option>
              </select>
              <input
                type="text"
                placeholder="Niche (optional)"
                value={formData.niche}
                onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="md:col-span-2 flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Competitors List */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading competitors…
          </div>
        ) : competitors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
            <Eye className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No competitors tracked yet.</p>
            <p className="text-xs mt-1">Add a competitor to start monitoring their products.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {competitors.map((comp) => (
              <div key={comp.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{comp.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{comp.platform}</span>
                    {comp.niche && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{comp.niche}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <a href={comp.url} target="_blank" rel="noreferrer" className="hover:text-foreground flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> {comp.url}
                    </a>
                    {comp.last_checked_at && (
                      <span>Last scan: {new Date(comp.last_checked_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleScan(comp.id)}
                    disabled={scanning === comp.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
                    title="Scan competitor"
                  >
                    {scanning === comp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Scan
                  </button>
                  <button
                    onClick={() => handleDelete(comp.id)}
                    className="inline-flex items-center rounded-md border border-border px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                    title="Stop tracking"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Insights Panel */}
        {insights && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" /> AI Insights
            </h3>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground whitespace-pre-line">{insights.insights}</p>
            </div>

            {insights.trending_products.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-green-500" /> Trending Products
                </h4>
                <ul className="space-y-2">
                  {insights.trending_products.map((p, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{p.title}</span>
                      <span className="text-muted-foreground ml-2">— {p.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {insights.price_gaps.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-emerald-500" /> Price Gaps
                </h4>
                <ul className="space-y-2">
                  {insights.price_gaps.map((g, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{g.niche}</span>
                      <span className="text-muted-foreground ml-2">— {g.observation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {insights.opportunities.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
                  <RefreshCw className="h-4 w-4 text-blue-500" /> Opportunities
                </h4>
                <ul className="space-y-2">
                  {insights.opportunities.map((o, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{o.title}</span>
                      <span className="text-muted-foreground block text-xs mt-0.5">{o.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </PageBody>
    </>
  )
}
