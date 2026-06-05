'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { API_BASE, isApiMisconfigured } from '@/lib/api'

/**
 * Visible warning when NEXT_PUBLIC_API_URL is not set in production.
 *
 * Without this, the NEXUS dashboard renders an empty shell because every API
 * call to the (incorrect) localhost:8787 default silently fails. The
 * AuthGate's "API unreachable -> open" branch hides the underlying problem,
 * which makes the misconfig very hard to diagnose from the browser.
 */
export function ApiMisconfigBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(isApiMisconfigured())
  }, [])

  if (!show) return null

  return (
    <div
      role="alert"
      className="border-b border-amber-500/40 bg-amber-500/10 px-6 py-3 text-sm text-amber-100"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">NEXUS API URL is not configured.</p>
          <p className="mt-0.5 text-amber-100/85">
            <code className="rounded bg-amber-900/40 px-1 py-0.5 text-xs">
              NEXT_PUBLIC_API_URL
            </code>{' '}
            is unset, so the app is calling{' '}
            <code className="rounded bg-amber-900/40 px-1 py-0.5 text-xs">
              {API_BASE}
            </code>
            . Every API request will fail and pages will show empty data. Set{' '}
            <code className="rounded bg-amber-900/40 px-1 py-0.5 text-xs">
              NEXT_PUBLIC_API_URL
            </code>{' '}
            in your Vercel project to your deployed Cloudflare Worker URL, then
            redeploy.
          </p>
        </div>
      </div>
    </div>
  )
}
