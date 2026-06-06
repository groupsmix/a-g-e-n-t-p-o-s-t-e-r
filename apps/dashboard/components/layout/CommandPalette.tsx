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

/**
 * Simple keyword-based intent parser. Maps a free-text query to an AgentTaskType
 * and a target route. Real semantic routing comes in Phase 2.
 */
function parseIntent(q: string): { label: string; route: string; type: string } | null {
  const lc = q.toLowerCase().trim()
  if (!lc) return null

  if (/^(research|find|investigate)\b/.test(lc))
    return { label: `Research "${q.replace(/^research\s+/i, '')}"`, route: '/research', type: 'research' }
  if (/^build (an? )?app\b/.test(lc))
    return { label: `Build app: ${q.replace(/^build (an? )?app\s+/i, '')}`, route: '/builder', type: 'build-app' }
  if (/^build (an? )?(site|website|landing)\b/.test(lc))
    return { label: `Build site: ${q.replace(/^build (an? )?(site|website|landing)\s+/i, '')}`, route: '/builder', type: 'build-site' }
  if (/^write\b/.test(lc))
    return { label: `Write: ${q.replace(/^write\s+/i, '')}`, route: '/content', type: 'write' }
  if (/^analy(s|z)e\b/.test(lc))
    return { label: `Analyse: ${q.replace(/^analy(s|z)e\s+/i, '')}`, route: '/analyse', type: 'analyse' }
  if (/^publish\b/.test(lc))
    return { label: `Publish: ${q.replace(/^publish\s+/i, '')}`, route: '/publisher', type: 'publish' }
  if (/^(scrape|find) leads?\b/.test(lc))
    return { label: `Lead scrape: ${q}`, route: '/leads', type: 'lead-scrape' }

  return null
}

export function CommandPalette(): JSX.Element {
  const router = useRouter()
  const { commandPaletteOpen, closeCommandPalette, toggleCommandPalette } = useUi()
  const [query, setQuery] = React.useState('')

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
                  onSelect={() => go(intent.route)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
                    'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                  )}
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>{intent.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{intent.type}</span>
                </Command.Item>
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
