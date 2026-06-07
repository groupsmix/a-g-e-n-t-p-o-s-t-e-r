/**
 * Eval framework contracts (TASK-1100).
 *
 * Each `Scenario` is a (input, expected) pair plus an `assertions`
 * array that scores the output. Scenarios belong to a `Suite`,
 * Suites run inside a `Runner` that records `Report`s.
 *
 * Why bespoke rather than vitest fixtures: agent outputs are
 * non-deterministic. We want soft assertions ('output mentions X
 * with weight 0.3') that combine into a score, not pass/fail
 * matchers. Failures get a numeric delta CI can chart.
 */

export interface Assertion<Output = unknown> {
  /** Stable label shown in reports. */
  label: string
  /** 0..1 weight for the overall scenario score. */
  weight: number
  /** Return 0..1 indicating how well the output satisfies the assertion. */
  score(output: Output, expected: unknown): number | Promise<number>
}

export interface Scenario<Input = unknown, Output = unknown> {
  id: string
  agent: string
  description?: string
  input: Input
  expected?: unknown
  assertions: Assertion<Output>[]
  /** Override default scoring threshold (0.7). */
  pass_threshold?: number
  /** Tags surfaced in reports — e.g. ['regression', 'flaky']. */
  tags?: string[]
}

export type AgentRunner<Input = unknown, Output = unknown> = (
  input: Input,
) => Promise<Output>

export interface Suite<Input = unknown, Output = unknown> {
  name: string
  run: AgentRunner<Input, Output>
  scenarios: Scenario<Input, Output>[]
}

export interface ScenarioResult {
  scenario_id: string
  agent: string
  pass: boolean
  score: number
  threshold: number
  details: Array<{ label: string; weight: number; score: number }>
  duration_ms: number
  error?: string
}

export interface Report {
  generated_at: string
  total: number
  passed: number
  failed: number
  agents: Array<{ agent: string; passed: number; failed: number; avg_score: number }>
  scenarios: ScenarioResult[]
}
