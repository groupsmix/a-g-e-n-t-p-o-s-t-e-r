'use client'

import { Search, Bell } from 'lucide-react'
import { useUi } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { MetricBar } from '@/components/shared/MetricCard'

export function TopBar(): JSX.Element {
  const { openCommandPalette } = useUi()

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Cmd-K trigger */}
      <button
        onClick={openCommandPalette}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Open command palette"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search or run a command…</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Metrics */}
      <div className="ml-auto hidden lg:block">
        <MetricBar />
      </div>

      <Button variant="ghost" size="icon" aria-label="Notifications">
        <Bell className="h-4 w-4" />
      </Button>
    </header>
  )
}
