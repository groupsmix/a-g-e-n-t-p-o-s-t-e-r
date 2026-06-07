'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, ArrowRight } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// The create-product flow lives at /jobs/new (it lets you pick the product
// type — landing page, SEO article, POD, digital product, etc.).
// /products/new used to fall through to the [id] dynamic route and render
// "Product not found"; this page makes the destination explicit and forwards
// the user. The hard link stays visible in case the auto-redirect is blocked.
export default function NewProductRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/jobs/new')
  }, [router])

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Plus className="h-5 w-5" /> New product</span>}
        subtitle="Redirecting to the product builder…"
      />
      <PageBody className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening the new job form…
        </div>
        <Link
          href="/jobs/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Continue to product builder <ArrowRight className="h-4 w-4" />
        </Link>
      </PageBody>
    </>
  )
}
