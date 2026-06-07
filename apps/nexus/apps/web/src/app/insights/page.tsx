'use client'

import { useState } from 'react'
import { Sparkles, Search, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

export default function InsightsPage() {
  const [queryId, setQueryId] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<unknown[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unconfigured, setUnconfigured] = useState(false)

  const run = async () => {
    if (!queryId.trim()) return
    setRunning(true); setError(null); setResult(null); setUnconfigured(false)
    try {
      const res = await api.getInsight(queryId.trim())
      if (res.source === 'unconfigured') {
        setUnconfigured(true)
      } else {
        setResult(res.rows ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Insights</span>}
        subtitle="MindsDB-backed predictions and trend models — query by saved query ID."
      />
      <PageBody className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-sm font-medium">Run a saved query</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved queries are defined inside the agent-mindsdb package. Enter the query ID to fetch its rows.
          </p>
          <div className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={queryId}
                onChange={(e) => setQueryId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && run()}
                placeholder="e.g. top_products_30d"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <button
              onClick={run}
              disabled={running || !queryId.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Run
            </button>
          </div>
        </div>

        {unconfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
            <p className="font-medium text-amber-500">MindsDB not connected</p>
            <p className="mt-1 text-muted-foreground">
              Add a MindsDB endpoint + token in Settings → Keys to enable saved insight queries.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">Query failed</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3 text-sm font-medium">
              {result.length} row{result.length === 1 ? '' : 's'}
            </div>
            <pre className="overflow-x-auto p-5 text-xs">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </PageBody>
    </>
  )
}
