'use client'

import * as React from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useUi } from '@/lib/store'
import { MODULES } from '@/lib/modules'
import {
  Search,
  Hammer,
  Film,
  BarChart3,
  Send,
  Bot,
  Brain,
  TrendingUp,
  Users,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  Brain,
  Search,
  Hammer,
  Film,
  Send,
  BarChart3,
  Bot,
  TrendingUp,
  Users,
  Settings,
}

import type { AgentTaskType } from '@posteragent/types'
import { api } from '@/lib/api'

interface Intent {
  label: string
  route: string
  type: AgentTaskType
  payload: Record<string, unknown>
}

/**
 * Simple keyword-based intent parser. Maps a free-text query to an AgentTaskType
 * + target route + structured payload. Real semantic routing lives in Phase 2.
 */
function parseIntent(q: string): Intent | null {
  const lc = q.toLowerCase().trim()
  if (!lc) return null

  const strip = (re: RegExp): string => q.replace(re, '').trim()

  if (/^(research|find|investigate)\b/.test(lc)) {
    const topic = strip(/^(research|find|investigate)\s+/i)
    return { label: `Research "${topic}"`, route: '/research', type: 'research', payload: { topic } }
  }
  if (/^build (an? )?app\b/.test(lc)) {
    const idea = strip(/^build (an? )?app\s+/i)
    return { label: `Build app: ${idea}`, route: '/builder', type: 'build-app', payload: { idea } }
  }
  if (/^build (an? )?(site|website|landing)\b/.test(lc)) {
    const idea = strip(/^build (an? )?(site|website|landing)\s+/i)
    return { label: `Build site: ${idea}`, route: '/builder', type: 'build-site', payload: { idea } }
  }
  if (/^write\b/.test(lc)) {
    const brief = strip(/^write\s+/i)
    return { label: `Write: ${brief}`, route: '/content', type: 'write', payload: { brief } }
  }
  if (/^analy(s|z)e\b/.test(lc)) {
    const target = strip(/^analy(s|z)e\s+/i)
    return { label: `Analyse: ${target}`, route: '/analyse', type: 'analyse', payload: { target } }
  }
  if (/^publish\b/.test(lc)) {
    const what = strip(/^publish\s+/i)
    return { label: `Publish: ${what}`, route: '/publisher', type: 'publish', payload: { what } }
  }
  if (/^(scrape|find) leads?\b/.test(lc)) {
    const query = strip(/^(scrape|find) leads?\s+/i)
    return { label: `Lead scrape: ${query}`, route: '/leads', type: 'lead-scrape', payload: { query } }
  }

  return null
}

export function CommandPalette(): JSX.Element {
  const router = useRouter()
  const { commandPaletteOpen, closeCommandPalette, toggleCommandPalette } = useUi()
  const [query, setQuery] = React.useState('')
  const [running, setRunning] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  // Cmd-K / Ctrl-K to toggle
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggleCommandPalette()
      }
      if (e.key === 'Escape' && commandPaletteOpen) closeCommandPalette()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commandPaletteOpen, closeCommandPalette, toggleCommandPalette])

  const intent = parseIntent(query)

  const go = (route: string): void => {
    router.push(route)
    closeCommandPalette()
    setQuery('')
    setErrorMsg(null)
  }

  /**
   * Dispatch the parsed intent: create the agent_task via nexus-api, then
   * route the user to the module page where the live feed will show it.
   */
  const runIntent = async (i: Intent): Promise<void> => {
    setRunning(true)
    setErrorMsg(null)
    try {
      await api.createTask({
        type: i.type,
        payload: { ...i.payload, source: 'command-palette' },
        origin: 'dashboard',
      })
      go(i.route)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'failed to queue task')
    } finally {
      setRunning(false)
    }
  }

  if (!commandPaletteOpen) return <></>

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 pt-[12vh] backdrop-blur-sm"
      onClick={closeCommandPalette}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-popover text-popover-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command Palette" className="overflow-hidden rounded-xl">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Research, build, write, analyse, publish…"
              className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              esc
            </kbd>
          </div>
          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No matches. Type a verb: research · build · write · analyse · publish
            </Command.Empty>

            {intent && (
              <Command.Group heading="Run">
                <Command.Item
                  value={`run-${intent.type}`}
                  disabled={running}
                  onSelect={() => void runIntent(intent)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
                    'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                    running && 'opacity-60',
                  )}
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>{intent.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {running ? 'queueing…' : intent.type}
                  </span>
                </Command.Item>
                {errorMsg && (
                  <p className="px-2 pb-2 text-xs text-red-400">{errorMsg}</p>
                )}
              </Command.Group>
            )}

            <Command.Group heading="Jump to">
              {MODULES.map((m) => {
                const Icon = ICONS[m.icon] ?? Search
                return (
                  <Command.Item
                    key={m.id}
                    value={`module-${m.id} ${m.label} ${m.description}`}
                    onSelect={() => go(m.route)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
                      'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{m.label}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {m.description}
                    </span>
                  </Command.Item>
                )
              })}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
