'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { History as HistoryIcon } from 'lucide-react'
import { api } from '@/lib/api'
import type { HistoryRun } from '@/lib/api'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

// Format a cost in USD: $0.00 for normal values, $0.0000 for sub-cent
// (cheap models can run for fractions of a cent — round-to-2 would show
// every step as $0.00 which hides the cost signal entirely).
function formatCost(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

function StatusPill({ status, failedStep }: { status: string; failedStep?: string | null }) {
  const cls =
    status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
    status === 'running' ? 'bg-blue-500/10 text-blue-400' :
    status === 'failed' ? 'bg-red-500/10 text-red-500' :
    'bg-muted text-muted-foreground'
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
        {status}
      </span>
      {status === 'failed' && failedStep && (
        <span className="text-[10px] text-destructive">at {failedStep}</span>
      )}
    </span>
  )
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<HistoryRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getHistory()
      .then((r) => setRuns(r.runs || []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><HistoryIcon className="h-5 w-5" /> Run History</span>}
        subtitle="Every workflow run with cost, duration, and outcome."
      />
      <PageBody>
        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : runs.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon className="h-5 w-5" />}
            title="No runs yet"
            description="Run a workflow to see history here."
          />
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Product</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Health</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Steps</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tokens</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cost</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Started</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {r.product_name || <span className="text-muted-foreground italic">(unnamed product)</span>}
                    </td>
                    <td className="px-4 py-3"><StatusPill status={r.status} failedStep={r.failed_step} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {Number(r.steps_completed ?? 0)}/{Number(r.step_count ?? 0)}
                      {Number(r.steps_failed ?? 0) > 0 && (
                        <span className="ml-1 text-destructive">({Number(r.steps_failed)} failed)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                      {Number(r.run_tokens ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {formatCost(r.run_cost_usd)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/workflow/${r.id}`} className="text-xs text-primary hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  )
}
