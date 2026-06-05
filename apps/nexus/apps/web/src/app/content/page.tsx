'use client'

import Link from 'next/link'
import { FileText, ArrowRight, PenLine, Mail, Eye } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { EmptyState } from '@/components/shared/EmptyState'

/**
 * Content & Media hub.
 *
 * Stub page: the sidebar links here, but the dedicated `/api/content` route
 * does not exist yet. Until that ships, this page surfaces the related
 * features that DO exist (blog, email, competitors) so users have somewhere
 * useful to go instead of a 404.
 */
export default function ContentPage() {
  return (
    <>
      <PageHeader
        title="Content & Media"
        subtitle="The content domain — blogs, newsletters, video, and audio."
      />
      <PageBody className="space-y-6">
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="Content domain hub is not built yet"
          description="The unified Content & Media view is on the roadmap. In the meantime, the pieces below are live and working."
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureLink
            href="/blog"
            icon={<PenLine className="h-4 w-4" />}
            title="Blog Engine"
            description="Long-form posts, SEO drafts, and scheduling."
          />
          <FeatureLink
            href="/email"
            icon={<Mail className="h-4 w-4" />}
            title="Email Lists"
            description="Subscribers, campaigns, and embed snippets."
          />
          <FeatureLink
            href="/competitors"
            icon={<Eye className="h-4 w-4" />}
            title="Competitors"
            description="Track what other creators are shipping."
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
