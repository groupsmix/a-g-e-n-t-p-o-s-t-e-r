'use client'

import { useCallback, useEffect, useState } from 'react'
import { Lock, Loader2, Workflow } from 'lucide-react'
import { api, getToken, setToken } from '@/lib/api'

type Phase = 'checking' | 'open' | 'login' | 'authed' | 'unreachable'

// Mirror the auth state to a cookie so the Next.js middleware (BUG-216)
// can gate routes at the edge. The cookie is just a UI flag — the real
// session is the Bearer token in localStorage validated by the API.
const AUTHED_COOKIE = 'nexus_authed'
function setAuthedCookie(authed: boolean) {
  if (typeof document === 'undefined') return
  if (authed) {
    // 24h cookie. SameSite=Lax so a fresh tab counts, Secure so we never
    // ship it on plain HTTP. Path=/ so middleware sees it everywhere.
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${AUTHED_COOKIE}=1; path=/; max-age=86400; SameSite=Lax${secure}`
  } else {
    document.cookie = `${AUTHED_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    try {
      const { protected: isProtected } = await api.getAuthStatus()
      if (!isProtected) {
        // Open instance — drop the gate cookie so middleware doesn't bounce.
        setAuthedCookie(true)
        return setPhase('open')
      }
      // Protected — validate the stored token by hitting a guarded endpoint.
      if (!getToken()) {
        setAuthedCookie(false)
        return setPhase('login')
      }
      try {
        await api.getSpend()
        setAuthedCookie(true)
        setPhase('authed')
      } catch {
        setToken(null)
        setAuthedCookie(false)
        setPhase('login')
      }
    } catch {
      // BUG-216: previously this branch set the gate cookie to "1" so the
      // middleware would let the user through whenever the API was
      // unreachable. That meant a fresh browser hitting /products with
      // the API down (or just slow) bypassed the gate completely.
      // Now we leave the cookie cleared and surface a dedicated
      // "service offline" state. The middleware will still bounce
      // anonymous deep-links to the login screen.
      setAuthedCookie(false)
      setPhase('unreachable')
    }
  }, [])

  useEffect(() => {
    check()
    const onAuthRequired = () => setPhase('login')
    window.addEventListener('nexus-auth-required', onAuthRequired)
    return () => window.removeEventListener('nexus-auth-required', onAuthRequired)
  }, [check])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { token } = await api.login(password)
      setToken(token)
      setAuthedCookie(true)
      setPassword('')
      setPhase('authed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (phase === 'unreachable') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-gradient-card p-8 text-center shadow-glow">
          <div className="mb-3 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <Workflow className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <h1 className="text-lg font-bold">NEXUS is offline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We can&apos;t reach the API. The app stays locked until it&apos;s back —
            so nothing leaks through.
          </p>
          <button
            onClick={() => { setPhase('checking'); check() }}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-sidebar-accent transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'login') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-gradient-card p-8 shadow-glow">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Workflow className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold">NEXUS is locked</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter your access password to continue.</p>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Access password"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy || !password}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gradient-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Unlock
          </button>
        </form>
      </div>
    )
  }

  return <>{children}</>
}
