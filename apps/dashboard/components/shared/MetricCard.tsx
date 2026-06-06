'use client'

import { TrendingUp, Zap, DollarSign, Users, Activity } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn, formatUsd } from '@/lib/utils'

interface MetricProps {
  label: string
  value: string
  delta?: string
  intent?: 'default' | 'success' | 'warning' | 'destructive'
  icon?: 'tasks' | 'spend' | 'agents' | 'revenue' | 'leads'
}

const ICONS = { tasks: Activity, spend: Zap, agents: Activity, revenue: TrendingUp, leads: Users }

export function MetricCard({ label, value, delta, intent = 'default', icon }: MetricProps): JSX.Element {
  const Icon = icon ? ICONS[icon] : DollarSign
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {delta && (
          <span
            className={cn(
              'text-xs',
              intent === 'success' && 'text-success',
              intent === 'warning' && 'text-warning',
              intent === 'destructive' && 'text-destructive',
              intent === 'default' && 'text-muted-foreground',
            )}
          >
            {delta}
          </span>
        )}
      </div>
    </Card>
  )
}

/** Compact metric strip used in the TopBar. Wires up live data later. */
export function MetricBar(): JSX.Element {
  // Placeholder data — Phase 2 wires this to real KPIs via react-query.
  return (
    <div className="flex items-center gap-4 text-xs">
      <Stat label="Tasks" value="0" />
      <Sep />
      <Stat label="AI spend" value={formatUsd(0, { compact: true })} muted={`/ ${formatUsd(20, { compact: true })}`} />
      <Sep />
      <Stat label="Agents" value="0" />
      <Sep />
      <Stat label="Rev/24h" value={formatUsd(0, { compact: true })} />
      <Sep />
      <Stat label="Leads" value="0" />
    </div>
  )
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: string }): JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
      {muted && <span className="text-muted-foreground">{muted}</span>}
    </div>
  )
}

function Sep(): JSX.Element {
  return <span className="h-3 w-px bg-border" />
}
