'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sunrise, Package, ShieldCheck, DollarSign, Wallet } from 'lucide-react'
import { api, type Digest } from '@/lib/api'

// The "while you slept" morning report: built / sold / needs review / spend in
// one glance. Same data the cron emails each morning.
export function DigestCard() {
  const [d, setD] = useState<Digest | null>(null)

  useEffect(() => {
    api.getDigest().then(setD).catch(() => setD(null))
  }, [])

  if (!d) return null

  const items = [
    { icon: <Package className="h-4 w-4" />, label: 'Built (24h)', value: String(d.built_24h), href: '/products' },
    { icon: <ShieldCheck className="h-4 w-4" />, label: 'Needs review', value: String(d.needs_review), href: '/review' },
    {
      icon: <DollarSign className="h-4 w-4" />,
      label: 'Sales',
      value: d.sales_configured ? `$${d.total_revenue.toFixed(2)}` : '—',
      sub: d.sales_configured ? `${d.total_sales} orders` : 'connect Gumroad',
      href: '/revenue',
    },
    {
      icon: <Wallet className="h-4 w-4" />,
      label: 'Spend today',
      value: `$${d.spend_today.toFixed(2)}`,
      sub: d.spend_cap > 0 ? `of $${d.spend_cap.toFixed(2)}` : 'free models',
      href: '/settings/keys',
    },
  ]

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sunrise className="h-4 w-4 text-primary" /> Morning Report
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{d.date}</span>
          <Link href="/digest" className="text-xs text-primary hover:underline">View full digest &rarr;</Link>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">What happened while you slept.</p>
      <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <Link
            key={it.label}
            href={it.href}
            className="rounded-xl border border-border bg-card p-3 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {it.icon}
              </span>
              <span className="text-xs">{it.label}</span>
            </div>
            <div className="mt-1.5 text-xl font-semibold">{it.value}</div>
            {it.sub && <div className="text-[11px] text-muted-foreground">{it.sub}</div>}
          </Link>
        ))}
      </div>
    </div>
  )
}
