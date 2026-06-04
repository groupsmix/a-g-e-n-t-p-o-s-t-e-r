'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Globe2, Loader2, ExternalLink, Maximize2, Minimize2, Monitor, Power,
} from 'lucide-react'
import { api } from '@/lib/api'

interface LiveBrowserPanelProps {
  onScreenshot?: (url: string) => void
  className?: string
}

type SessionState =
  | { status: 'idle' }
  | { status: 'starting'; startUrl: string | null }
  | { status: 'active'; sessionId: string; embedUrl: string }
  | { status: 'error'; message: string }

export function LiveBrowserPanel({ className }: LiveBrowserPanelProps) {
  const [session, setSession] = useState<SessionState>({ status: 'idle' })
  const [urlInput, setUrlInput] = useState('')
  const [expanded, setExpanded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const startSession = useCallback(async (url?: string) => {
    setSession({ status: 'starting', startUrl: url ?? null })
    try {
      const result = await api.hyperbeamCreate(url)
      if (result.ok && result.embedUrl) {
        setSession({
          status: 'active',
          sessionId: result.sessionId,
          embedUrl: result.embedUrl,
        })
      } else {
        setSession({
          status: 'error',
          message: 'Failed to start browser session. Check your Hyperbeam API key.',
        })
      }
    } catch {
      setSession({
        status: 'error',
        message: 'Could not connect to browser service. Make sure HYPERBEAM_API_KEY is set.',
      })
    }
  }, [])

  const endSession = useCallback(async () => {
    if (session.status === 'active') {
      try {
        await api.hyperbeamDestroy(session.sessionId)
      } catch { /* best effort cleanup */ }
    }
    setSession({ status: 'idle' })
    setUrlInput('')
  }, [session])

  useEffect(() => {
    return () => {
      if (session.status === 'active') {
        api.hyperbeamDestroy(session.sessionId).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const normalized = urlInput.trim()
    if (!normalized) return

    const url = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`
    setUrlInput(url)

    if (session.status === 'active') {
      if (iframeRef.current) {
        iframeRef.current.src = `${session.embedUrl}&start_url=${encodeURIComponent(url)}`
      }
    } else {
      startSession(url)
    }
  }

  return (
    <div className={`flex flex-col border-l border-border bg-card overflow-hidden ${expanded ? 'fixed inset-0 z-50 shadow-2xl' : ''} ${className ?? ''}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-2 py-1.5 shrink-0">
        {session.status === 'active' && (
          <div className="flex items-center gap-1 mr-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-medium text-emerald-500 uppercase tracking-wide">Live</span>
          </div>
        )}

        <form onSubmit={handleUrlSubmit} className="flex-1 mx-1">
          <div className="relative">
            <Globe2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Search or enter URL"
              className="w-full rounded-md border border-border bg-background pl-7 pr-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        </form>

        {session.status === 'active' && (
          <>
            <a
              href={urlInput || '#'}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={endSession}
              className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
              title="End session"
            >
              <Power className="h-3.5 w-3.5" />
            </button>
          </>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={expanded ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 bg-neutral-900 overflow-hidden">
        {/* Starting */}
        {session.status === 'starting' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral-900">
            <div className="relative">
              <div className="h-12 w-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              <Globe2 className="absolute inset-0 m-auto h-5 w-5 text-primary/60" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Starting live browser...</p>
            {session.startUrl && (
              <p className="mt-1 text-xs text-muted-foreground/50 max-w-[250px] truncate">{session.startUrl}</p>
            )}
          </div>
        )}

        {/* Error */}
        {session.status === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="max-w-sm text-center px-4">
              <Globe2 className="mx-auto h-8 w-8 text-destructive/50" />
              <p className="mt-2 text-sm text-destructive">{session.message}</p>
              <button
                onClick={() => startSession()}
                className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Live browser iframe */}
        {session.status === 'active' && (
          <iframe
            ref={iframeRef}
            src={session.embedUrl}
            className="h-full w-full border-0"
            allow="clipboard-read; clipboard-write; autoplay; fullscreen"
          />
        )}

        {/* Idle — empty state */}
        {session.status === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center px-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4">
                <Monitor className="h-8 w-8 text-primary/30" />
              </div>
              <p className="text-sm font-medium text-foreground/80">Live Browser</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-[220px] mx-auto">
                Browse the web in real-time. Click, scroll, type — just like a real browser.
              </p>
              <button
                onClick={() => startSession()}
                className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Loader2 className="hidden" />
                Start Browser
              </button>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {['google.com', 'gumroad.com', 'etsy.com'].map((site) => (
                  <button
                    key={site}
                    onClick={() => { setUrlInput(`https://${site}`); startSession(`https://${site}`) }}
                    className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                  >
                    {site}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
