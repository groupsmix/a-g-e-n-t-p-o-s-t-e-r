'use client'

import { useState } from 'react'
import { PageHeader, PageBody } from '@/components/shell/AppShell'
import { TrendsView } from '@/components/intelligence/TrendsView'
import { WinnersView } from '@/components/intelligence/WinnersView'
import { cn } from '@/lib/utils'

const tabs = [
  { key: 'trends', label: 'Trend radar' },
  { key: 'winners', label: 'Winner patterns' },
] as const

type TabKey = (typeof tabs)[number]['key']

export default function IntelligencePage() {
  const [tab, setTab] = useState<TabKey>('trends')

  return (
    <>
      <PageHeader
        title="Intelligence"
        subtitle="What's trending to build next, and the patterns that win — in one place."
      />
      <PageBody className="space-y-6">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1 w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'trends' ? <TrendsView /> : <WinnersView />}
      </PageBody>
    </>
  )
}
