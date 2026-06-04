'use client'

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import type { QualityGateResult } from '@/lib/api'

interface QualityGatePanelProps {
  gate: QualityGateResult
  title?: string
}

export function QualityGatePanel({ gate, title = 'Quality Gate' }: QualityGatePanelProps) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        gate.pass
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-red-500/30 bg-red-500/5'
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium mb-2">
        {gate.pass ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        <span>{title}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          Score: {gate.score}/100
        </span>
      </div>
      {gate.issues.length > 0 && (
        <ul className="space-y-1">
          {gate.issues.map((issue, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}
      {gate.pass && gate.issues.length === 0 && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">All checks passed</p>
      )}
    </div>
  )
}
