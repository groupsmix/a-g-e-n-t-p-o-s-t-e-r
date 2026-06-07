/**
 * Format an eval Report for terminal output and CI logs.
 */

import type { Report } from '../types'

export function formatReport(report: Report): string {
  const lines: string[] = []
  lines.push(`Eval report — ${report.generated_at}`)
  lines.push(`Passed ${report.passed}/${report.total} (${report.failed} failed)`)
  lines.push('')
  lines.push('Per agent:')
  for (const a of report.agents) {
    lines.push(`  - ${a.agent.padEnd(28)} ${a.passed}/${a.passed + a.failed} (avg ${(a.avg_score * 100).toFixed(0)}%)`)
  }
  lines.push('')
  for (const r of report.scenarios) {
    const mark = r.pass ? '✓' : '✗'
    lines.push(`  ${mark} ${r.agent.padEnd(20)} ${r.scenario_id.padEnd(40)} ${(r.score * 100).toFixed(0)}%`)
    if (r.error) lines.push(`      error: ${r.error}`)
    if (!r.pass) {
      for (const d of r.details) {
        lines.push(`      • ${d.label.padEnd(40)} ${(d.score * 100).toFixed(0)}% (w ${d.weight})`)
      }
    }
  }
  return lines.join('\n')
}

export function reportExitCode(report: Report): number {
  return report.failed === 0 ? 0 : 1
}
