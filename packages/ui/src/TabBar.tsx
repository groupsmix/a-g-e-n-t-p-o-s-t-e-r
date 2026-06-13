import type { ReactNode } from 'react'

export interface TabDef {
  id: string
  label: string
  icon?: ReactNode
}

export interface TabBarProps {
  tabs: readonly TabDef[] | TabDef[]
  activeTab: string
  onTabChange: (id: string) => void
  className?: string
}

/**
 * TabBar — URL-param-friendly tab switcher used in /automation and /engineering.
 * Caller controls tab state; this is purely presentational.
 */
export function TabBar({ tabs, activeTab, onTabChange, className = '' }: TabBarProps) {
  return (
    <div className={`flex gap-1 border-b border-border ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onTabChange(t.id)}
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === t.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}
