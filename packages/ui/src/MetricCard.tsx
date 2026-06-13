import type { ReactNode } from 'react'

export interface MetricCardProps {
  icon?: ReactNode
  label: string
  value: string | number
  hint?: string
  className?: string
}

/**
 * MetricCard — a stat card showing a metric value with label and optional icon.
 * Matches the repeating "Stat" pattern that appears across analytics, autopilot,
 * brain, and revenue pages. Pure Tailwind, no style imports needed.
 */
export function MetricCard({ icon, label, value, hint, className = '' }: MetricCardProps) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</div>
      )}
    </div>
  )
}
