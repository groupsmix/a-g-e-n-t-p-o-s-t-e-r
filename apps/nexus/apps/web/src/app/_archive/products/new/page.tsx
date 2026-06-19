import Link from 'next/link'
import { Sparkles, Rocket, Radar, ArrowRight } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

// BUG-209: NEXUS doesn't have (and doesn't want) a manual "Create Product"
// wizard — products come out of the autopilot pipeline. Previously this
// route silently redirected to /jobs/new, which is a different form
// (Freelance Job intake) and confused testers. A bare 404 was equally
// confusing — the route is linked from the sidebar and search results.
// Render an explanation page that points at the real entry points.
export default function NewProductPage() {
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Create a product</span>}
        subtitle="NEXUS doesn't have a manual product form — products come out of the autopilot pipeline."
      />
      <PageBody className="max-w-2xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Pick the path that fits what you&apos;re trying to do:
        </p>

        <Link
          href="/autopilot"
          className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Rocket className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Turn on Autopilot</div>
              <div className="text-xs text-muted-foreground">
                Let the engine generate, score, and queue products for you on a schedule.
              </div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Link
          href="/opportunities"
          className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Radar className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Start from an opportunity</div>
              <div className="text-xs text-muted-foreground">
                Scan trends and promote a specific opportunity into a build.
              </div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <p className="text-xs text-muted-foreground">
          Looking for the freelance job intake? That lives at{' '}
          <Link href="/jobs/new" className="text-primary hover:underline">/jobs/new</Link>.
        </p>
      </PageBody>
    </>
  )
}
