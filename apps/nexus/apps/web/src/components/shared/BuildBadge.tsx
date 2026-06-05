'use client'

import { useEffect, useState } from 'react'

// Injected at build time by `pages:build` (see web/package.json).
// Falls back to "dev" when running `next dev` locally.
const BUILD_SHA = (process.env.NEXT_PUBLIC_BUILD_SHA || '').slice(0, 7)
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || ''

function relativeTime(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

/**
 * Small footer badge that shows the current build's commit SHA and how
 * long ago it deployed. Updates client-side every 30s so "1m ago" doesn't
 * stay frozen at "1m ago" while the user has the tab open.
 *
 * The whole point of this badge: when the principal pushes a change and
 * comes back to the dashboard, they can see at a glance whether the live
 * site is running their new code (SHA matches) or stale code (SHA hasn't
 * changed). Removes the entire "did my change deploy?" question class.
 */
export function BuildBadge() {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!BUILD_SHA) {
    return <span className="text-[11px] text-muted-foreground/60" title="No build SHA injected — running in dev mode">NEXUS · dev</span>
  }

  const rel = relativeTime(BUILD_TIME)
  const title = `Commit ${BUILD_SHA}${BUILD_TIME ? ` · deployed ${BUILD_TIME}` : ''}`
  const href = `https://github.com/groupsmix/a-g-e-n-t-p-o-s-t-e-r/commit/${BUILD_SHA}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors font-mono"
    >
      {BUILD_SHA}
      {rel && <span className="text-muted-foreground/40"> · {rel}</span>}
    </a>
  )
}
