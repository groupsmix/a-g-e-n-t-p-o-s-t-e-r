export { monitor } from './monitor.js'
export type { MonitorInput } from './monitor.js'
export { scanMentions } from './scanner.js'
export type { ScannerInput, ScannerOutput } from './scanner.js'
export {
  scoreMentions,
  heuristicSentiment,
  computeVirality,
} from './scorer.js'
export type { ScorerInput, ScorerOutput } from './scorer.js'
export { detectAlerts } from './alerter.js'
