'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Lock, DollarSign, ArrowRight, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'

interface SetupStep {
  key: string
  done: boolean
  icon: React.ReactNode
  title: string
  desc: string
  href: string
  cta: string
}

// A persistent "turn on real money" banner. Shows the two switches only the
// owner can flip — set the access password and connect Gumroad — and hides
// itself once both are done.
export function SetupBanner() {
  const [steps, setSteps] = useState<SetupStep[] | null>(null)

  useEffect(() => {
    Promise.all([
      api.getAuthStatus().catch(() => ({ protected: false })),
      api.getKeys().catch(() => ({ keys: [] })),
    ]).then(([auth, keys]) => {
      const gumroad = keys.keys.find((k) => k.key === 'GUMROAD_ACCESS_TOKEN')
      setSteps([
        {
          key: 'access',
          done: !!auth.protected,
          icon: <Lock className="h-4 w-4" />,
          title: 'Lock your dashboard',
          desc: 'Set an access password so only you can build products and spend on keys.',
          href: '/settings',
          cta: 'Set password',
        },
        {
          key: 'gumroad',
          done: !!gumroad?.configured,
          icon: <DollarSign className="h-4 w-4" />,
          title: 'Connect Gumroad to sell',
          desc: 'Add a free Gumroad token to list approved products and track real sales.',
          href: '/settings/keys',
          cta: 'Connect Gumroad',
        },
      ])
    })
  }, [])

  if (!steps || steps.every((s) => s.done)) return null

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Turn on real income</h2>
        <span className="text-xs text-muted-foreground">
          {steps.filter((s) => s.done).length}/{steps.length} done
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Two switches only you can flip. Until then, revenue is just estimates and nothing actually lists or sells.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {steps.map((s) => (
          <div
            key={s.key}
            className={`min-w-0 rounded-xl border p-4 ${
              s.done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2 font-medium text-sm">
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  s.done ? 'bg-emerald-500/15 text-emerald-500' : 'bg-primary/10 text-primary'
                }`}
              >
                {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.icon}
              </span>
              <span className="truncate">{s.title}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground break-words">{s.desc}</p>
            {s.done ? (
              <div className="mt-3 text-xs font-medium text-emerald-500">Done</div>
            ) : (
              <Link
                href={s.href}
                className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <span className="truncate">{s.cta}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
