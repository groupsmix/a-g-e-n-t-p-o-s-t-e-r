/**
 * Publisher — TASK-701 dashboard UI.
 *
 * Single page that surfaces the real publish_jobs queue (TASK-700):
 *   • Summary tiles (scheduled / done / failed / 24h throughput)
 *   • 14-day calendar grid of upcoming posts
 *   • Filterable queue with retry + remove actions
 *   • Failure feed with one-click retry
 *
 * Backed by /api/publisher-queue/* on the nexus-api worker; the page
 * falls back to a friendly empty state when D1 isn't configured.
 */

import { Badge } from '@/components/ui/badge'
import { PublisherSummary } from './components/PublisherSummary'
import { PublisherCalendar } from './components/PublisherCalendar'
import { PublisherQueue } from './components/PublisherQueue'
import { PublisherFailures } from './components/PublisherFailures'

export const dynamic = 'force-dynamic'

export default function PublisherPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Publisher</h1>
          <Badge variant="success" className="text-[10px] uppercase">live</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Every social platform, one queue. Scheduled posts, what shipped today,
          what failed and why — with one-click retry.
        </p>
      </header>

      <PublisherSummary />

      <PublisherCalendar />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PublisherQueue />
        </div>
        <div className="lg:col-span-1">
          <PublisherFailures />
        </div>
      </div>
    </div>
  )
}
