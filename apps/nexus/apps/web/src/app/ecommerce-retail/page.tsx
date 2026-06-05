'use client'

import Link from 'next/link'
import { ShoppingCart, ArrowRight, Package, Shirt, DollarSign } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { EmptyState } from '@/components/shared/EmptyState'

/**
 * E-Commerce & Retail hub.
 *
 * Stub page: the sidebar links here, but `/api/ecommerce-retail` is not
 * implemented in the NEXUS API. Surfacing the live commerce surfaces (POD,
 * Gumroad/products, revenue) keeps the link useful without faking data.
 */
export default function EcommerceRetailPage() {
  return (
    <>
      <PageHeader
        title="E-Commerce & Retail"
        subtitle="Stores, listings, and direct sales. Domain backend not yet implemented."
      />
      <PageBody className="space-y-6">
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5" />}
          title="E-Commerce domain backend is not built yet"
          description="There is no /api/ecommerce-retail route in nexus-api. Storefronts, inventory, and SKU-level sales will live here once the domain ships."
        />

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
          <p className="font-medium">For maintainers</p>
          <p className="mt-1 text-amber-100/80">
            To turn this on, add a backend route module
            (e.g.{' '}
            <code className="rounded bg-amber-900/30 px-1">
              apps/nexus/apps/nexus-api/src/routes/ecommerce.ts
            </code>
            ), mount it in <code className="rounded bg-amber-900/30 px-1">index.ts</code>, then
            replace this page with a real implementation.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureLink
            href="/pod"
            icon={<Shirt className="h-4 w-4" />}
            title="Print on Demand"
            description="POD shops, blueprints, and design specs are live."
          />
          <FeatureLink
            href="/products"
            icon={<Package className="h-4 w-4" />}
            title="Products"
            description="Digital products, Gumroad listings, and SKUs."
          />
          <FeatureLink
            href="/revenue"
            icon={<DollarSign className="h-4 w-4" />}
            title="Revenue"
            description="Earnings across all monetized surfaces."
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
