'use client'

import Link from 'next/link'
import { LayoutGrid, Globe2, Megaphone, FileCode, Cpu } from 'lucide-react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

const tiles = [
  { href: '/manager/domains', label: 'Domains & categories', icon: LayoutGrid, blurb: 'Product taxonomy' },
  { href: '/manager/platforms', label: 'Platforms', icon: Globe2, blurb: 'Marketplaces' },
  { href: '/manager/social', label: 'Social channels', icon: Megaphone, blurb: 'Promo channels' },
  { href: '/manager/prompts', label: 'Prompts', icon: FileCode, blurb: 'Layered templates' },
  { href: '/manager/ai', label: 'AI models', icon: Cpu, blurb: 'Registry & cost' },
]

export default function ManagerIndexPage() {
  return (
    <>
      <PageHeader
        title="Manage"
        subtitle="Configure the building blocks of every workflow."
      />
      <PageBody>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {tiles.map(({ href, label, icon: Icon, blurb }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl border border-border bg-gradient-card p-5 hover:border-primary/40 hover:transition-all"
            >
              <Icon className="h-6 w-6 text-primary/80 mb-3" />
              <div className="font-semibold">{label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{blurb}</div>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  )
}
