'use client'

import { cn } from '@/lib/utils'

interface ScoreBadgeProps {
  score: number
  label?: string
  size?: 'sm' | 'md'
}

export function ScoreBadge({ score, label, size = 'sm' }: ScoreBadgeProps) {
  const color =
    score >= 80
      ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400'
      : score >= 60
        ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400'
        : 'bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums',
        color,
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
      )}
      title={label ? `${label}: ${score}/100` : `Score: ${score}/100`}
    >
      {score}
      {label && <span className="font-normal opacity-70">/{label}</span>}
    </span>
  )
}
