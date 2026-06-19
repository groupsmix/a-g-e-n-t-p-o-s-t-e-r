'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Kanban, TrendingUp, Brain, Cpu, Settings as SettingsIcon,
  Menu, X, Sun, Moon, Monitor, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Nav definition ────────────────────────────────────────────────────────────
// Rule: never add a top-level nav item. New capabilities are tabs, panels, or
// PipelineItem.type values — not new routes. See NEXUS Architecture spec §2.1.

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> }

const NAV_ITEMS: NavItem[] = [
  { to: '/',         label: 'Home',     icon: LayoutDashboard },
  { to: '/pipeline', label: 'Pipeline', icon: Kanban },
  { to: '/growth',   label: 'Growth',   icon: TrendingUp },
  { to: '/brain',    label: 'Brain',    icon: Brain },
  { to: '/ops',      label: 'Ops',      icon: Cpu },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

// ─── Theme toggle ───────────────────────────────────────────────────────────────
type ThemeMode = 'dark' | 'light' | 'auto'

function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark'
    const stored = localStorage.getItem('nexus_theme')
    if (stored && ['dark', 'light', 'auto'].includes(stored)) return stored as ThemeMode
    return 'dark'
  })

  function cycleTheme() {
    const next: ThemeMode = theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark'
    setThemeState(next)
    localStorage.setItem('nexus_theme', next)
    const d = document.documentElement
    const dark = next === 'dark' || (next === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    d.classList.remove('dark', 'light')
    d.classList.add(dark ? 'dark' : 'light')
  }

  return { theme, cycleTheme }
}

// ─── Layout toggle ──────────────────────────────────────────────────────────────
type Layout = 'expanded' | 'compact'

function useLayout() {
  const [layout, setLayoutState] = useState<Layout>(() => {
    if (typeof window === 'undefined') return 'expanded'
    return (localStorage.getItem('nexus_layout') as Layout) || 'expanded'
  })

  function cycleLayout() {
    const next: Layout = layout === 'expanded' ? 'compact' : 'expanded'
    setLayoutState(next)
    localStorage.setItem('nexus_layout', next)
    document.documentElement.setAttribute('data-layout', next)
  }

  return { layout, cycleLayout }
}

// ─── Sidebar ────────────────────────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, cycleTheme } = useTheme()
  const { layout, cycleLayout } = useLayout()

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  function isActive(to: string) {
    if (to === '/') return pathname === '/'
    return pathname.startsWith(to)
  }

  const nav = (
    <nav className="flex flex-col gap-1 flex-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const active = isActive(item.to)
        return (
          <Link
            key={item.to}
            href={item.to}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile toggle button */}
      <button
        className="fixed top-4 left-4 z-50 md:hidden h-8 w-8 flex items-center justify-center rounded-md bg-background border"
        onClick={() => setMobileOpen((v) => !v)}
      >
        {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-full w-56 flex flex-col bg-background border-r px-3 py-4 transition-transform duration-200',
          'md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="mb-6 px-3">
          <span className="text-lg font-bold tracking-tight">NEXUS</span>
        </div>

        {nav}

        {/* Footer controls */}
        <div className="mt-4 flex items-center gap-1 border-t pt-3">
          <button
            onClick={cycleTheme}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={cycleLayout}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title={`Layout: ${layout}`}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>
    </>
  )
}
