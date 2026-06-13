'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Package, ShieldCheck,
  Settings as SettingsIcon, Globe2, History,
  Bot, CalendarClock, Rocket, LayoutDashboard, ChevronDown, DollarSign,
  Menu, X, LayoutGrid, Workflow, Brain, Sunrise, Shirt,
  Briefcase, FlaskConical, PenLine, Mail, Eye, Radar,
  Sun, Moon, Monitor, Layers, BarChart3, Activity, Wallet, Send, Sparkles, Flag,
  Terminal, BellRing, GitBranch, FileCode2, Network, ShieldAlert, HardDrive,
  TrendingUp, Cpu, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { BuildBadge } from '@/components/shared/BuildBadge'

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }> }

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Bot, Package, Shirt, Briefcase,
  Rocket, ShieldCheck, DollarSign, Brain, Sunrise, Globe2, CalendarClock, History, BarChart3, Activity,
  SettingsIcon, LayoutGrid, Workflow, Wallet, Send, Sparkles, Flag, Terminal, BellRing,
  GitBranch, FileCode2, Network, ShieldAlert, HardDrive, TrendingUp, Cpu, Zap,
  PenLine, Mail, Radar, Eye, FlaskConical,
}

const topItems: Item[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/ceo', label: 'AI Assistant', icon: Bot },
]

const defaultSections: { title: string; items: Item[]; collapsible?: boolean }[] = [
  {
    title: 'Create',
    collapsible: true,
    items: [
      { to: '/notes', label: 'Notes', icon: PenLine },
      { to: '/jobs', label: 'Freelance Jobs', icon: Briefcase },
      { to: '/jobs/new?type=digital_product', label: 'Digital Products', icon: Package },
      { to: '/jobs/new?type=pod_product', label: 'Print on Demand', icon: Shirt },
      { to: '/blog', label: 'Blog Engine', icon: PenLine },
      { to: '/publisher-queue', label: 'Publisher Queue', icon: Send },
      { to: '/review', label: 'Review Queue', icon: ShieldCheck },
    ],
  },
  {
    title: 'Grow',
    collapsible: true,
    items: [
      { to: '/revenue', label: 'Revenue', icon: DollarSign },
      { to: '/budget', label: 'Budget', icon: Wallet },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/insights', label: 'Insights', icon: Sparkles },
      { to: '/ab-testing', label: 'A/B Testing', icon: FlaskConical },
      { to: '/email', label: 'Email Lists', icon: Mail },
      { to: '/leads', label: 'Leads', icon: Radar },
    ],
  },
  {
    title: 'Intelligence',
    collapsible: true,
    items: [
      { to: '/brain', label: 'Brain Cockpit', icon: Brain },
      { to: '/learning', label: 'Learning Loop', icon: TrendingUp },
      { to: '/competitors', label: 'Competitors', icon: Eye },
      { to: '/opportunities', label: 'Opportunity Radar', icon: Radar },
    ],
  },
  {
    title: 'Automate',
    collapsible: true,
    items: [
      { to: '/command-center', label: 'Command Center', icon: Terminal },
      { to: '/autopilot', label: 'Autopilot', icon: Rocket },
      { to: '/autonome', label: 'Autonome', icon: Zap },
      { to: '/sleep-mode', label: 'Sleep Mode', icon: Moon },
      { to: '/money-workflow', label: 'Money Workflow', icon: BarChart3 },
      { to: '/queue', label: 'Job Queue', icon: Activity },
      { to: '/notifications', label: 'Notifications', icon: BellRing },
    ],
  },
  {
    title: 'Engineering',
    collapsible: true,
    items: [
      { to: '/repo-intel', label: 'Repo Intelligence', icon: GitBranch },
      { to: '/code-agent', label: 'Code Agent', icon: FileCode2 },
      { to: '/multi-agent', label: 'Multi-Agent', icon: Network },
      { to: '/security-audit', label: 'Security Audit', icon: ShieldAlert },
      { to: '/storage', label: 'Storage Manager', icon: HardDrive },
      { to: '/e2e-tests', label: 'E2E Tests', icon: FlaskConical },
    ],
  },
  {
    title: 'System',
    collapsible: true,
    items: [
      { to: '/digest', label: 'Digest', icon: Sunrise },
      { to: '/platforms', label: 'Platforms', icon: Globe2 },
      { to: '/schedules', label: 'Schedules', icon: CalendarClock },
      { to: '/observability', label: 'Observability', icon: Cpu },
      { to: '/history', label: 'History', icon: History },
      { to: '/manager', label: 'Manage', icon: LayoutGrid },
      { to: '/manager/flags', label: 'Feature Flags', icon: Flag },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
]

function resolveIcon(name?: string): React.ComponentType<{ className?: string }> | undefined {
  if (!name) return undefined
  return ICON_MAP[name]
}

function useSidebarSections() {
  const [sections, setSections] = useState(defaultSections)
  useEffect(() => {
    api.getUserPreference('sidebar_order').then((res) => {
      if (!res?.value) return
      try {
        const custom = JSON.parse(res.value) as { title: string; items: { to: string; label: string; icon?: string }[] }[]
        if (!Array.isArray(custom) || custom.length === 0) return
        const defaultItemMap = new Map<string, Item>()
        for (const sec of defaultSections) for (const it of sec.items) defaultItemMap.set(it.to, it)
        for (const top of topItems) defaultItemMap.set(top.to, top)
        const merged = custom.map((sec) => ({
          title: sec.title,
          items: sec.items
            .map((it) => {
              const existing = defaultItemMap.get(it.to)
              return {
                to: it.to,
                label: it.label || existing?.label || it.to,
                icon: resolveIcon(it.icon) || existing?.icon || LayoutGrid,
              }
            }),
        }))
        setSections(merged)
      } catch { /* ignore parse errors */ }
    }).catch(() => {})
  }, [])
  return sections
}

type ThemeMode = 'dark' | 'light' | 'auto'

function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark'
    const stored = localStorage.getItem('nexus_theme')
    if (stored && ['dark', 'light', 'auto'].includes(stored)) return stored as ThemeMode
    return 'dark'
  })
  useEffect(() => {
    applyTheme(theme)
    api.getUserPreference('theme').then((res) => {
      if (res?.value && ['dark', 'light', 'auto'].includes(res.value)) {
        setThemeState(res.value as ThemeMode)
        applyTheme(res.value as ThemeMode)
        localStorage.setItem('nexus_theme', res.value)
      }
    }).catch(() => {})
  }, [])
  const setTheme = (t: ThemeMode) => {
    setThemeState(t)
    applyTheme(t)
    localStorage.setItem('nexus_theme', t)
    api.setUserPreference('theme', t).catch(() => {})
  }
  return { theme, setTheme }
}

function applyTheme(t: ThemeMode) {
  const html = document.documentElement
  if (t === 'light') { html.classList.remove('dark'); html.classList.add('light') }
  else if (t === 'dark') { html.classList.remove('light'); html.classList.add('dark') }
  else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) { html.classList.remove('light'); html.classList.add('dark') }
    else { html.classList.remove('dark'); html.classList.add('light') }
  }
}

export type LayoutMode = 'compact' | 'expanded' | 'minimal'

function applyLayout(l: LayoutMode) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-layout', l)
}

function useLayout() {
  const [layout, setLayoutState] = useState<LayoutMode>(() => {
    if (typeof window === 'undefined') return 'expanded'
    const stored = localStorage.getItem('nexus_layout')
    if (stored && ['compact', 'expanded', 'minimal'].includes(stored)) return stored as LayoutMode
    return 'expanded'
  })
  useEffect(() => {
    applyLayout(layout)
    api.getUserPreference('dashboard_layout').then((res) => {
      if (res?.value && ['compact', 'expanded', 'minimal'].includes(res.value)) {
        setLayoutState(res.value as LayoutMode)
        applyLayout(res.value as LayoutMode)
        localStorage.setItem('nexus_layout', res.value)
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const setLayout = (l: LayoutMode) => {
    setLayoutState(l)
    applyLayout(l)
    localStorage.setItem('nexus_layout', l)
    api.setUserPreference('dashboard_layout', l).catch(() => {})
  }
  return { layout, setLayout }
}

const themeIcons: Record<ThemeMode, React.ComponentType<{ className?: string }>> = {
  dark: Moon,
  light: Sun,
  auto: Monitor,
}

const THEME_CYCLE: ThemeMode[] = ['dark', 'light', 'auto']
const LAYOUT_CYCLE: LayoutMode[] = ['expanded', 'compact', 'minimal']

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
        <Workflow className="h-4 w-4 text-primary" />
      </div>
      <div>
        <div className="font-semibold tracking-tight text-sm text-foreground">NEXUS</div>
        <div className="text-[10px] text-muted-foreground leading-none">AI Engine</div>
      </div>
    </Link>
  )
}

function NavList({ onNavigate, sections }: { onNavigate?: () => void; sections: typeof defaultSections }) {
  const pathname = usePathname() || '/'
  const isActive = (to: string) =>
    to === '/' ? pathname === '/' :
    to === '/settings' ? pathname === '/settings' :
    pathname === to || (to !== '/' && to !== '/settings' && pathname.startsWith(to.split('?')[0]))

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    let stored: Record<string, boolean> = {}
    if (typeof window !== 'undefined') {
      try {
        stored = JSON.parse(localStorage.getItem('nexus_sidebar_open') || '{}') || {}
      } catch { stored = {} }
    }
    const initial: Record<string, boolean> = {}
    for (const sec of sections) {
      initial[sec.title] =
        sec.title in stored
          ? stored[sec.title]
          : !sec.collapsible || sec.items.some((i) => isActive(i.to))
    }
    return initial
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('nexus_sidebar_open', JSON.stringify(openSections))
    } catch { /* ignore */ }
  }, [openSections])

  useEffect(() => {
    setOpenSections((prev) => {
      const next: Record<string, boolean> = {}
      let changed = Object.keys(prev).length !== sections.length
      for (const sec of sections) {
        if (sec.title in prev) {
          next[sec.title] = prev[sec.title]
        } else {
          next[sec.title] = !sec.collapsible || sec.items.some((i) => isActive(i.to))
          changed = true
        }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections])

  const renderItem = (item: Item) => {
    const Icon = item.icon
    const active = isActive(item.to)
    return (
      <li key={item.to}>
        <Link
          href={item.to}
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all duration-150',
            active
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : '')} />
          {item.label}
        </Link>
      </li>
    )
  }

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
      <ul className="space-y-0.5">{topItems.map(renderItem)}</ul>
      {sections.map((sec) => {
        const isOpen = openSections[sec.title] ?? true
        return (
          <div key={sec.title}>
            {sec.collapsible ? (
              <button
                onClick={() => setOpenSections((prev) => ({ ...prev, [sec.title]: !prev[sec.title] }))}
                className="w-full flex items-center justify-between px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              >
                {sec.title}
                <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', isOpen ? '' : '-rotate-90')} />
              </button>
            ) : (
              <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {sec.title}
              </div>
            )}
            {isOpen && (
              <ul className="space-y-0.5">{sec.items.map(renderItem)}</ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}

export function Sidebar() {
  const [open, setOpen] = useState(false)
  const sections = useSidebarSections()
  const { theme, setTheme } = useTheme()
  const { layout, setLayout } = useLayout()

  const ThemeIcon = themeIcons[theme]

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }
  const cycleLayout = () => {
    const idx = LAYOUT_CYCLE.indexOf(layout)
    setLayout(LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length])
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="md:hidden fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-sidebar px-4 text-sidebar-foreground">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Brand />
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col bg-sidebar text-sidebar-foreground shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <Brand />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} sections={sections} />
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <BuildBadge />
              <div className="flex items-center gap-1">
                <button onClick={cycleTheme} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title={`Theme: ${theme}`}>
                  <ThemeIcon className="h-3.5 w-3.5" />
                </button>
                <button onClick={cycleLayout} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title={`Layout: ${layout}`}>
                  <Layers className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 border-b border-border">
          <Brand />
        </div>
        <NavList sections={sections} />
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <BuildBadge />
          <div className="flex items-center gap-1">
            <button onClick={cycleTheme} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title={`Theme: ${theme}`}>
              <ThemeIcon className="h-3.5 w-3.5" />
            </button>
            <button onClick={cycleLayout} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title={`Layout: ${layout}`}>
              <Layers className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
