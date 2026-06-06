'use client'

import * as React from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useUi } from '@/lib/store'
import { MODULES } from '@/lib/modules'
import { parseIntents, type Intent } from '@/lib/intent'
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
import { api } from '@/lib/api'

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

/**
 * Command Palette (cmd+K).  Parses a free-text query through `parseIntents`
 * and offers the top candidate(s) as runnable actions, plus the static
 * "Jump to" module list as a fallback.
 *
 * Intent dispatch flow:
 *   1. User types → `parseIntents` returns ranked AgentTaskType candidates
 *   2. User picks one → POST /api/tasks (origin: 'dashboard')
 *   3. We navigate to the intent's destination route so the live feed there
 *      will show the task once nexus-api picks it up.
 */
export function CommandPalette(): JSX.Element {
  const router = useRouter()
  const { commandPaletteOpen, closeCommandPalette, toggleCommandPalette } = useUi()
  const [query, setQuery] = React.useState('')
  const [runningType, setRunningType] = React.useState<string | null>(null)
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

  const intents = React.useMemo(() => parseIntents(query), [query])

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
    setRunningType(i.type)
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
      setRunningType(null)
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
              No matches. Try: <span className="font-mono">research</span> ·{' '}
              <span className="font-mono">build app</span> ·{' '}
              <span className="font-mono">write</span> ·{' '}
              <span className="font-mono">video about</span> ·{' '}
              <span className="font-mono">find leads</span>
            </Command.Empty>

            {intents.length > 0 && (
              <Command.Group heading={intents.length > 1 ? 'Run (best match first)' : 'Run'}>
                {intents.map((intent, idx) => {
                  const isRunning = runningType === intent.type
                  return (
                    <Command.Item
                      key={`${intent.type}-${idx}`}
                      value={`run-${intent.type}-${idx} ${intent.label}`}
                      disabled={isRunning}
                      onSelect={() => void runIntent(intent)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
                        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                        isRunning && 'opacity-60',
                      )}
                    >
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="truncate">{intent.label}</span>
                      <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                        {isRunning ? 'queueing…' : intent.type}
                      </span>
                    </Command.Item>
                  )
                })}
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
