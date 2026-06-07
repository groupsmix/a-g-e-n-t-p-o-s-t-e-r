'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Eye, MousePointer, Heart } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

type Summary = {
  source: 'live' | 'unconfigured'
  totals: { posts: number; impressions: number; engagements: number; clicks: number }
  by_platform: Array<{ platform: string; posts: number; impressions: number; engagements: number; clicks: number }>
  note?: string
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getAnalyticsSummary().then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [])

  const totals = data?.totals ?? { posts: 0, impressions: 0, engagements: 0, clicks: 0 }
  const unconfigured = data?.source === 'unconfigured'

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Analytics</span>}
        subtitle="Cross-platform post performance, pulled from connected accounts."
      />
      <PageBody className="space-y-6">
        {unconfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
            <p className="font-medium text-amber-500">Analytics not configured</p>
            <p className="mt-1 text-muted-foreground">
              Connect your platforms and run the analytics collector to see real numbers.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat icon={<BarChart3 className="h-5 w-5 text-primary" />} label="Posts" value={loading ? '…' : String(totals.posts)} />
          <Stat icon={<Eye className="h-5 w-5 text-blue-500" />} label="Impressions" value={loading ? '…' : totals.impressions.toLocaleString()} />
          <Stat icon={<Heart className="h-5 w-5 text-rose-500" />} label="Engagements" value={loading ? '…' : totals.engagements.toLocaleString()} />
          <Stat icon={<MousePointer className="h-5 w-5 text-emerald-500" />} label="Clicks" value={loading ? '…' : totals.clicks.toLocaleString()} />
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">By platform</div>
          {!data || data.by_platform.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              {loading ? 'Loading…' : 'No platform data yet.'}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.by_platform.map((p) => (
                <div key={p.platform} className="grid grid-cols-5 gap-4 px-5 py-3 text-sm">
                  <div className="font-medium capitalize">{p.platform}</div>
                  <div className="text-muted-foreground"><span className="text-foreground">{p.posts}</span> posts</div>
                  <div className="text-muted-foreground"><span className="text-foreground">{p.impressions.toLocaleString()}</span> impr</div>
                  <div className="text-muted-foreground"><span className="text-foreground">{p.engagements.toLocaleString()}</span> eng</div>
                  <div className="text-muted-foreground"><span className="text-foreground">{p.clicks.toLocaleString()}</span> clicks</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageBody>
    </>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  )
}
