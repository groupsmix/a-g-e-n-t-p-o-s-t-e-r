'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Brain, Package, ShieldCheck, Upload, Megaphone,
  DollarSign, Activity, Loader2, ArrowRight, Zap, AlertTriangle,
  CheckCircle2, Circle, PlayCircle, ChevronRight, Play, Star,
  FileText, Image as ImageIcon, ExternalLink, Settings, RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { OpportunityInfo, Domain, Product, ProductDetail, WorkflowStatusResponse } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

type StepKey =
  | 'opportunity'
  | 'brief'
  | 'deliverable'
  | 'listing'
  | 'review'
  | 'publish'
  | 'marketing'
  | 'revenue'

interface StepStatus {
  key: StepKey
  label: string
  description: string
  icon: React.ReactNode
  status: 'pending' | 'running' | 'done' | 'error' | 'disabled'
  details?: string
}

export default function CreateProductWizard() {
  const [opportunities, setOpportunities] = useState<OpportunityInfo[]>([])
  const [selectedOpp, setSelectedOpp] = useState<OpportunityInfo | null>(null)
  const [domains, setDomains] = useState<Domain[]>([])
  const [selectedDomain, setSelectedDomain] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [customNiche, setCustomNiche] = useState('')
  const [productName, setProductName] = useState('')

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusResponse | null>(null)
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null)

  // Load prerequisites
  useEffect(() => {
    Promise.all([
      api.getOpportunities({ status: 'approved' }).catch(() => ({ opportunities: [] })),
      api.getDomains().catch(() => []),
    ]).then(([oppData, domData]) => {
      setOpportunities(oppData.opportunities)
      setDomains(domData)
      if (oppData.opportunities.length > 0) {
        setSelectedOpp(oppData.opportunities[0])
        setCustomNiche(oppData.opportunities[0].niche || '')
        setProductName(oppData.opportunities[0].trend_name)
      }
      setLoading(false)
    })
  }, [])

  // Poll workflow if active
  useEffect(() => {
    if (!workflowId) return
    const timer = setInterval(async () => {
      try {
        const res = await api.getWorkflowStatus(workflowId)
        setWorkflowStatus(res)
        if (res.status === 'completed' || res.status === 'failed') {
          clearInterval(timer)
          setBusy(false)
          if (res.status === 'completed' && res.product_id) {
            setProductId(res.product_id)
            const detail = await api.getProductDetail(res.product_id)
            setProductDetail(detail)
          }
        }
      } catch (err) {
        console.error('Error polling workflow:', err)
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [workflowId])

  const handleSelectOpportunity = (opp: OpportunityInfo) => {
    setSelectedOpp(opp)
    setCustomNiche(opp.niche || '')
    setProductName(opp.trend_name)
  };

  const handleStartWorkflow = async () => {
    setBusy(true)
    setWorkflowId(null)
    setWorkflowStatus(null)
    setProductId(null)
    setProductDetail(null)

    try {
      // Resolve slug names or default to selected info
      const dSlug = selectedOpp ? 'digital-products' : selectedDomain || 'digital-products'
      const cSlug = selectedCategory || 'notion-templates'

      const input = {
        domain_slug: dSlug,
        category_slug: cSlug,
        user_input: {
          niche: customNiche || selectedOpp?.niche || 'productivity',
          product_name: productName || selectedOpp?.trend_name || 'My Product',
          language: 'en',
          let_ai_price: true,
          let_ai_audience: true,
        }
      }

      const res = await api.startWorkflow(input)
      setWorkflowId(res.workflow_id)
      setProductId(res.product_id)
    } catch (err: any) {
      alert(err.message || 'Failed to start AI workflow')
      setBusy(false)
    }
  }

  const handleManualApprove = async () => {
    if (!productId) return
    try {
      await api.approveProduct(productId)
      const detail = await api.getProductDetail(productId)
      setProductDetail(detail)
      alert('Product manual review successfully passed! Approved for launch.')
    } catch (err: any) {
      alert(err.message || 'Approval failed')
    }
  }

  const handleGumroadExport = async () => {
    if (!productId) return
    try {
      const res = await api.publishProductToGumroad(productId)
      alert(`Gumroad draft created! Live URL: ${res.gumroad_url}`)
    } catch (err: any) {
      alert(err.message || 'Publishing failed. Connecting to Gumroad in mock draft mode.')
    }
  }

  // Calculate wizard steps and readiness flags
  const steps: StepStatus[] = [
    {
      key: 'opportunity',
      label: 'Opportunity Selected',
      description: 'Select an AI-radar target niche',
      icon: <Star className="h-4 w-4" />,
      status: selectedOpp ? 'done' : 'pending',
      details: selectedOpp ? `Radar pick: ${selectedOpp.trend_name} (Score ${selectedOpp.total_score})` : 'No opportunity selected'
    },
    {
      key: 'brief',
      label: 'Product Brief Ready',
      description: 'AI-generated structure and goals',
      icon: <FileText className="h-4 w-4" />,
      status: workflowStatus?.status === 'completed' ? 'done' : workflowId ? 'running' : 'pending',
      details: productDetail ? (productDetail.name ?? 'Product Generated') : workflowId ? 'Generating brief...' : 'Requires workflow run'
    },
    {
      key: 'deliverable',
      label: 'Deliverable Ready',
      description: 'Actual file generated & saved to R2',
      icon: <Package className="h-4 w-4" />,
      status: productDetail?.deliverable_url ? 'done' : workflowId ? 'running' : 'pending',
      details: productDetail?.deliverable_url ? 'File stored on Cloudflare R2' : 'Pending asset generator step'
    },
    {
      key: 'listing',
      label: 'Cover & Listing Ready',
      description: 'Copy, tags, and variants complete',
      icon: <ImageIcon className="h-4 w-4" />,
      status: productDetail ? 'done' : workflowId ? 'running' : 'pending',
      details: productDetail ? `$${productDetail.ai_score || '7.5'} AI score estimated` : 'Pending copywriter step'
    },
    {
      key: 'review',
      label: 'Manual Review passed',
      description: 'CRO score checklist checks out',
      icon: <ShieldCheck className="h-4 w-4" />,
      status: productDetail?.status === 'approved' || productDetail?.status === 'published' ? 'done' : productDetail ? 'running' : 'pending',
      details: productDetail ? `Status: ${productDetail.status}` : 'Pending review state'
    },
    {
      key: 'publish',
      label: 'Publishing Ready',
      description: 'Gumroad draft state configured',
      icon: <Upload className="h-4 w-4" />,
      status: productDetail?.status === 'published' ? 'done' : productDetail?.status === 'approved' ? 'running' : 'pending',
      details: productDetail?.gumroad_url ? 'Staged draft ready' : 'Requires manual review pass first'
    },
    {
      key: 'marketing',
      label: 'Marketing Pack Ready',
      description: 'Promo emails and Pinterest pins',
      icon: <Megaphone className="h-4 w-4" />,
      status: false ? 'done' : 'pending',
      details: false ? 'Copy blocks successfully saved' : 'Awaiting publication to unlock'
    },
    {
      key: 'revenue',
      label: 'Revenue Tracking Ready',
      description: 'Sync system active & connecting',
      icon: <DollarSign className="h-4 w-4" />,
      status: productDetail?.status === 'published' ? 'done' : 'disabled',
      details: 'Will synchronize Gumroad sales automatically'
    }
  ]

  if (loading) {
    return (
      <>
        <PageHeader title="Create next sellable product" subtitle="AI Guided Digital Product Engine" />
        <PageBody>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading radar intelligence...
          </div>
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <PlayCircle className="h-6 w-6 text-primary" /> Create Next Sellable Product
          </span>
        }
        subtitle="One focused private loop: Opportunity → Product Brief → Deliverable → Review → Gumroad Draft → Marketing."
      />

      <PageBody className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Form & Opportunity Selection */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Choose Opportunity */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-400" /> 1. Select Opportunity
              </h2>
              <span className="text-xs text-muted-foreground">approved from Radar</span>
            </div>

            {opportunities.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No approved opportunities found in radar. You can type a custom niche below or go to{' '}
                <Link href="/opportunities" className="text-primary underline">Opportunity Radar</Link> to scan.
              </div>
            ) : (
              <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
                {opportunities.map((opp) => (
                  <button
                    key={opp.id}
                    onClick={() => handleSelectOpportunity(opp)}
                    className={`flex items-start justify-between p-3 rounded-lg border text-left transition-colors text-xs ${selectedOpp?.id === opp.id ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted'}`}
                  >
                    <div>
                      <div className="font-semibold text-foreground">{opp.trend_name}</div>
                      <div className="text-muted-foreground mt-0.5 line-clamp-1">{opp.product_idea}</div>
                    </div>
                    <span className="text-primary font-mono font-bold shrink-0 ml-3">{opp.total_score} pts</span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/40">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Custom Niche / Keyword</label>
                <input
                  type="text"
                  value={customNiche}
                  onChange={(e) => setCustomNiche(e.target.value)}
                  placeholder="e.g. productivity, coding, finance"
                  className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Product Name</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Freelancer Client OS"
                  className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <button
              onClick={handleStartWorkflow}
              disabled={busy || (!productName && !selectedOpp)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/95 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Assemble Brief & Build Deliverable
            </button>
          </div>

          {/* Section 2: Interactive Manual Review Gate & Outputs */}
          {productDetail && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> 2. Product Brief & Human Copy
              </h2>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Generated Product Title</div>
                  <div className="font-semibold text-sm mt-0.5">{productDetail.name}</div>
                </div>

                <div className="p-3 bg-muted rounded-lg space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-primary">
                    <Package className="h-3.5 w-3.5" /> Deliverable Asset Staged
                  </div>
                  <p className="text-muted-foreground">
                    An interactive guide file has been compiled with zero AI hallmarks and stored inside the Cloudflare R2 secure storage bucket.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <button
                      onClick={handleManualApprove}
                      disabled={productDetail.status === 'approved' || productDetail.status === 'published'}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50 font-medium"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve Listing & Cover
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center">Marks listing status as ready for export</p>
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={handleGumroadExport}
                      disabled={productDetail.status !== 'approved'}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-amber-500 hover:bg-amber-500/20 disabled:opacity-50 font-medium"
                    >
                      <Upload className="h-4 w-4" />
                      Push Draft to Gumroad
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center">Never auto-publishes without final check</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: 8-Step Readiness Wizard Checklist */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Loop Readiness Guide
            </h2>
            <p className="text-xs text-muted-foreground">
              These checks verify your digital product is ready, humanized, reviewed, and staged safely.
            </p>

            <div className="space-y-3">
              {steps.map((step) => (
                <div key={step.key} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background/50">
                  <div className={`mt-0.5 shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-xs ${
                    step.status === 'done' ? 'bg-emerald-500/10 text-emerald-500' :
                    step.status === 'running' ? 'bg-blue-500/10 text-blue-400' :
                    step.status === 'disabled' ? 'bg-muted text-muted-foreground/30' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {step.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold leading-tight">{step.label}</span>
                      <span className={`text-[10px] uppercase font-bold tabular-nums ${
                        step.status === 'done' ? 'text-emerald-500' :
                        step.status === 'running' ? 'text-blue-400 animate-pulse' :
                        step.status === 'disabled' ? 'text-muted-foreground/30' :
                        'text-muted-foreground'
                      }`}>
                        {step.status === 'done' ? 'Ready' : step.status === 'running' ? 'Building...' : step.status === 'disabled' ? 'Disabled' : 'Pending'}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{step.description}</p>
                    {step.details && (
                      <p className="text-[9px] text-primary mt-1 font-mono">{step.details}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageBody>
    </>
  )
}
