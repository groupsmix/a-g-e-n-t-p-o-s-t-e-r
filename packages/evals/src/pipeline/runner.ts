/**
 * The eval runner. Walks every scenario in every suite, calls the
 * agent runner, scores assertions, and returns a Report. Errors
 * inside an agent runner are caught and counted as failures rather
 * than throwing.
 */

import type {
  Assertion, Report, Scenario, ScenarioResult, Suite,
} from '../types'

async function scoreAssertions<O>(assertions: Assertion<O>[], output: O, expected: unknown): Promise<{
  total: number; details: ScenarioResult['details']
}> {
  const details: ScenarioResult['details'] = []
  let totalWeight = 0
  let weighted = 0
  for (const a of assertions) {
    let s = 0
    try { s = Number(await a.score(output, expected)) || 0 } catch { s = 0 }
    s = Math.max(0, Math.min(1, s))
    details.push({ label: a.label, weight: a.weight, score: s })
    weighted += s * a.weight
    totalWeight += a.weight
  }
  return { total: totalWeight > 0 ? weighted / totalWeight : 0, details }
}

export interface RunOptions {
  /** Only run scenarios matching one of these agents. */
  agents?: string[]
  /** Only run scenarios matching one of these tags. */
  tags?: string[]
}

export async function runSuites(
  suites: Suite[],
  opts: RunOptions = {},
): Promise<Report> {
  const start = new Date()
  const results: ScenarioResult[] = []
  for (const suite of suites) {
    for (const scenario of suite.scenarios as Scenario[]) {
      if (opts.agents && !opts.agents.includes(scenario.agent)) continue
      if (opts.tags && !(scenario.tags ?? []).some((t) => opts.tags!.includes(t))) continue
      const t0 = Date.now()
      let result: ScenarioResult
      try {
        const output = await suite.run(scenario.input)
        const { total, details } = await scoreAssertions(scenario.assertions, output, scenario.expected)
        const threshold = scenario.pass_threshold ?? 0.7
        result = {
          scenario_id: scenario.id,
          agent: scenario.agent,
          pass: total >= threshold,
          score: total,
          threshold,
          details,
          duration_ms: Date.now() - t0,
        }
      } catch (err) {
        result = {
          scenario_id: scenario.id,
          agent: scenario.agent,
          pass: false,
          score: 0,
          threshold: scenario.pass_threshold ?? 0.7,
          details: [],
          duration_ms: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        }
      }
      results.push(result)
    }
  }
  // Aggregate per agent.
  const byAgent = new Map<string, { passed: number; failed: number; sum: number; count: number }>()
  for (const r of results) {
    const a = byAgent.get(r.agent) ?? { passed: 0, failed: 0, sum: 0, count: 0 }
    if (r.pass) a.passed += 1; else a.failed += 1
    a.sum += r.score
    a.count += 1
    byAgent.set(r.agent, a)
  }
  return {
    generated_at: start.toISOString(),
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    agents: Array.from(byAgent.entries()).map(([agent, v]) => ({
      agent, passed: v.passed, failed: v.failed,
      avg_score: v.count > 0 ? v.sum / v.count : 0,
    })),
    scenarios: results,
  }
}
