'use client'

import Link from 'next/link'
import { Link2, ArrowRight, Radar, Eye, Brain } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { EmptyState } from '@/components/shared/EmptyState'

/**
 * Affiliate Marketing hub.
 *
 * Stub page: the sidebar links here, but `/api/affiliate-marketing` is not
 * implemented in the NEXUS API. Pointing users at the closest live features
 * (opportunities, competitors, learning loop) avoids a broken-link UX while
 * the real domain backend gets built.
 */
export default function AffiliateMarketingPage() {
  return (
    <>
      <PageHeader
        title="Affiliate Marketing"
        subtitle="Promote third-party offers and take a cut. This domain isn't wired in yet."
      />
      <PageBody className="space-y-6">
        <EmptyState
          icon={<Link2 className="h-5 w-5" />}
          title="Affiliate Marketing backend is not built yet"
          description="There is no /api/affiliate-marketing route in nexus-api. Tracked links, networks, and payouts will live here once the domain ships."
        />

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
          <p className="font-medium">For maintainers</p>
          <p className="mt-1 text-amber-100/80">
            To turn this on, add a backend route module
            (e.g.{' '}
            <code className="rounded bg-amber-900/30 px-1">
              apps/nexus/apps/nexus-api/src/routes/affiliate.ts
            </code>
            ), mount it in <code className="rounded bg-amber-900/30 px-1">index.ts</code>, then
            replace this page with a real implementation.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureLink
            href="/opportunities"
            icon={<Radar className="h-4 w-4" />}
            title="Opportunity Radar"
            description="Closest existing feature — surfaces things worth promoting."
          />
          <FeatureLink
            href="/competitors"
            icon={<Eye className="h-4 w-4" />}
            title="Competitors"
            description="See which affiliates other creators push."
          />
          <FeatureLink
            href="/learning"
            icon={<Brain className="h-4 w-4" />}
            title="Learning Loop"
            description="Patterns from what's converted in the past."
          />
        </div>
      </PageBody>
    </>
  )
}

function FeatureLink({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Open <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  )
}
