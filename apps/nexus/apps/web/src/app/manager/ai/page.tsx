'use client'

import { useEffect, useState } from 'react'
import { Cpu } from 'lucide-react'
import { api } from '@/lib/api'
import type { AIModelDashboardStatus } from '@nexus/types'
import { PageHeader, PageBody } from '@/components/shell/AppShell'

interface AIModelRow extends AIModelDashboardStatus {
  rank?: number
  has_key?: boolean
  cost_per_1m_tokens?: number
  monthly_calls?: number
}

export default function ManagerAIPage() {
  const [models, setModels] = useState<AIModelRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getAIModels()
      .then(setModels)
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Cpu className="h-5 w-5" /> AI models</span>}
        subtitle="Registry with tier, provider, status and per-model cost."
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2">Model</th>
                  <th className="text-left px-4 py-2">Provider</th>
                  <th className="text-left px-4 py-2">Rank</th>
                  <th className="text-left px-4 py-2">Has key</th>
                  <th className="text-right px-4 py-2">$ / 1M tok</th>
                  <th className="text-right px-4 py-2">Monthly calls</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{m.name || m.id}</td>
                    <td className="px-4 py-2 text-xs">{m.provider}</td>
                    <td className="px-4 py-2 text-xs">{m.rank ?? '—'}</td>
                    <td className="px-4 py-2 text-xs">{m.has_key ? 'yes' : 'no'}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {m.cost_per_1m_tokens ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {m.monthly_calls ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  )
}
