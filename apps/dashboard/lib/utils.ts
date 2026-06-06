import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Shadcn-style tailwind class merger. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Format a USD amount with up to 2 decimals (or "—" if undefined). */
export function formatUsd(amount: number | undefined | null, opts?: { compact?: boolean }): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: opts?.compact ? 'compact' : 'standard',
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Relative time formatter — "2m ago", "in 3h". */
export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const abs = Math.abs(diff)
  const suffix = diff >= 0 ? 'ago' : 'from now'
  const fmt = (n: number, unit: string) => `${n}${unit} ${suffix}`
  if (abs < 60_000) return 'just now'
  if (abs < 3_600_000) return fmt(Math.floor(abs / 60_000), 'm')
  if (abs < 86_400_000) return fmt(Math.floor(abs / 3_600_000), 'h')
  if (abs < 2_592_000_000) return fmt(Math.floor(abs / 86_400_000), 'd')
  return d.toLocaleDateString()
}
