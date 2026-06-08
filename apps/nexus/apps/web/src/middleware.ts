// Next.js middleware — server-side gate on top of the client AuthGate
// (BUG-216). The client gate alone runs after hydration, which is fine
// for real users but lets direct URL hits like /products briefly render
// before the gate kicks in. This redirects unauthenticated requests at
// the edge so the login screen is what gets streamed first.
//
// Important: the API still does the real auth check (Bearer token).
// This cookie is a UI flag, not a session secret — it's set client-side
// from AuthGate once the token round-trips successfully.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTHED_COOKIE = 'nexus_authed'

// Routes that should always be reachable without a session cookie.
// Everything else is gated. The login form itself lives at "/" so we
// always allow that path (AuthGate decides whether to show the form
// or the dashboard).
const PUBLIC_PATHS = new Set<string>([
  '/',
  '/favicon.ico',
])

// Path prefixes that should be allowed for static assets / Next internals.
const PUBLIC_PREFIXES = [
  '/_next',
  '/api',          // Next API routes (we don't currently have any — the
                   // worker handles the API on a separate origin — but
                   // future ones should self-gate.)
  '/static',
  '/assets',
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  const cookie = req.cookies.get(AUTHED_COOKIE)?.value
  if (cookie === '1') return NextResponse.next()

  // Not authed — redirect to the root which renders AuthGate's login form.
  // Preserve the originally requested path so we can bounce back after login.
  const url = req.nextUrl.clone()
  url.pathname = '/'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

// Run on every route except Next's static assets and any explicit prefixes
// in PUBLIC_PREFIXES (those are double-handled inside the function for
// belt-and-suspenders).
export const config = {
  matcher: [
    // Match everything except static asset files (anything with a "." in
    // the last segment) and _next internals.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.).*)',
  ],
}
