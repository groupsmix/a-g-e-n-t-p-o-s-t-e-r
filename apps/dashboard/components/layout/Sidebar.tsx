'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
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
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react'
import { MODULES } from '@/lib/modules'
import { useUi } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

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

const STATUS_VARIANT = {
  active: 'success',
  beta: 'warning',
  planned: 'secondary',
} as const

export function Sidebar(): JSX.Element {
  const pathname = usePathname()
  const { sidebarCollapsed, toggleSidebar } = useUi()

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r bg-card transition-[width] duration-200',
        sidebarCollapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">posteragent</div>
            <div className="truncate text-xs text-muted-foreground">Brain Cockpit</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        <SidebarLink
          href="/"
          label="Home"
          icon={Zap}
          active={pathname === '/'}
          collapsed={sidebarCollapsed}
        />
        <div className={cn('mt-4 px-2 text-[11px] uppercase tracking-wider text-muted-foreground', sidebarCollapsed && 'sr-only')}>
          Modules
        </div>
        {MODULES.map((m) => {
          const Icon = ICONS[m.icon] ?? Zap
          const active = pathname === m.route || pathname.startsWith(`${m.route}/`)
          return (
            <SidebarLink
              key={m.id}
              href={m.route}
              label={m.label}
              icon={Icon}
              active={active}
              collapsed={sidebarCollapsed}
              status={m.status}
            />
          )
        })}
      </nav>

      {/* Footer — collapse toggle */}
      <div className="border-t p-2">
        <button
          onClick={toggleSidebar}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  status,
}: {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  collapsed: boolean
  status?: 'active' | 'beta' | 'planned'
}): JSX.Element {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
      title={collapsed ? label : undefined}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {status && status !== 'active' && (
            <Badge variant={STATUS_VARIANT[status]} className="h-4 px-1.5 text-[10px]">
              {status}
            </Badge>
          )}
        </>
      )}
    </Link>
  )
}
