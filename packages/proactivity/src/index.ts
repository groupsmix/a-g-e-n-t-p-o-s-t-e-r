/**
 * @posteragent/proactivity
 *
 * TASK-202 — the brain layer's nervous system.
 *
 * Public surface:
 *
 *   import {
 *     runProactivity,
 *     defaultScanners,
 *     journalScanner,
 *     nowScanner,
 *     taskScanner,
 *     DEFAULT_THRESHOLDS,
 *   } from '@posteragent/proactivity'
 *
 *   const report = await runProactivity({ db, autoQueue: true })
 *   // report.signals = ranked observations
 *   // report.queued  = new agent_tasks rows the engine created
 *
 * The engine is schedule-agnostic.  Cloudflare cron, GitHub Actions,
 * or a node `setInterval` all work the same way.
 */

export { runProactivity } from './run.js'
export type { RunProactivityOptions } from './run.js'

export { defaultScanners, journalScanner, nowScanner, taskScanner } from './scanners/index.js'

export type {
  Signal,
  SignalKind,
  SignalSeverity,
  Scanner,
  ScanContext,
  Thresholds,
  ProactivityDB,
  ProactivityLogger,
  ProactivityReport,
} from './types.js'

export { DEFAULT_THRESHOLDS } from './types.js'
