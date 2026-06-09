import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

// T15: Cost label clarity.
//
// Operators kept reading bare "$0.00" as "we forgot to track spend" when
// the real story is "the run cost nothing because it stayed on the free
// tier" (Groq, Cloudflare Workers AI, etc.). When spend is exactly $0 but
// we *did* actually do work (runs > 0, or a hint that activity happened),
// render "Free tier" instead — it's the same number, but it tells the
// truth about where it came from.
//
// `activity` is anything truthy that confirms work was done:
//   - run/call count (number)
//   - "have we tracked anything ever?" boolean
//   - omitted → fall back to plain "$0.00" (idle state, no activity)
export function formatCost(
  amount: number | null | undefined,
  activity?: number | boolean | null,
): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0
  if (n === 0) {
    const hasActivity =
      typeof activity === 'number' ? activity > 0 : Boolean(activity)
    if (hasActivity) return 'Free tier'
    return '$0.00'
  }
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}
