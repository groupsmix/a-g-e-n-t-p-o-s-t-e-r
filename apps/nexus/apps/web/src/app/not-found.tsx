import Link from 'next/link'
import { ArrowLeft, Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <Compass className="h-10 w-10 text-muted-foreground" />
      <h2 className="text-xl font-semibold">Page not found</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        That URL doesn&apos;t match any route. It may be a typo, a stale bookmark,
        or an old link.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>
    </div>
  )
}
