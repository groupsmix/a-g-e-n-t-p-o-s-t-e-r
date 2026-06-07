'use client'

import { TrendingUp, Zap, DollarSign, Users, Activity, AlertCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { cn, formatUsd } from '@/lib/utils'
import { api, type MetricValue } from '@/lib/api'

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

/**
 * Compact metric strip used in the TopBar (TASK-104).
 * Polls /api/metrics/summary every 30s; tolerates errors silently.
 */
export function MetricBar(): JSX.Element {
  const { data, isError } = useQuery({
    queryKey: ['metrics', 'summary'],
    queryFn: () => api.metricsSummary(),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  })

  if (isError || !data) {
    // Render skeleton/empty strip so the bar height never collapses.
    return (
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Stat label="Tasks" m={{ value: 0, display: '—', delta: null, source: 'error' }} />
        <Sep />
        <Stat label="AI spend" m={{ value: 0, display: '—', delta: null, source: 'error' }} />
        <Sep />
        <Stat label="Agents" m={{ value: 0, display: '—', delta: null, source: 'error' }} />
        <Sep />
        <Stat label="Rev/24h" m={{ value: 0, display: '—', delta: null, source: 'error' }} />
        <Sep />
        <Stat label="Leads" m={{ value: 0, display: '—', delta: null, source: 'error' }} />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 text-xs" aria-live="polite">
      <Stat label="Tasks" m={data.tasks_today} />
      <Sep />
      <Stat label="AI spend" m={data.ai_spend_today} />
      <Sep />
      <Stat label="Agents" m={data.active_agents} />
      <Sep />
      <Stat label="Rev/24h" m={data.revenue_24h} />
      <Sep />
      <Stat label="Leads" m={data.leads_today} />
    </div>
  )
}

function Stat({ label, m }: { label: string; m: MetricValue }): JSX.Element {
  const dim = m.source !== 'live'
  const positive = m.delta?.startsWith('+') && !m.delta.includes('new')
  return (
    <div
      className={cn('flex items-baseline gap-1.5', dim && 'opacity-60')}
      title={m.note ?? (m.source === 'unconfigured' ? `${label} — provider not connected` : undefined)}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{m.display}</span>
      {m.delta && (
        <span
          className={cn(
            'text-[10px]',
            positive ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {m.delta}
        </span>
      )}
      {m.source === 'error' && (
        <AlertCircle className="h-3 w-3 text-warning" aria-label="metric error" />
      )}
    </div>
  )
}

function Sep(): JSX.Element {
  return <span className="h-3 w-px bg-border" />
}

// keep helper around in case formatUsd is still referenced elsewhere
void formatUsd
void DollarSign
