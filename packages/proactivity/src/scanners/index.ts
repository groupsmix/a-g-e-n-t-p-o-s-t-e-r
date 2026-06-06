/**
 * Built-in scanners.  Order matters only for log readability; the
 * runner runs them all in parallel.
 */
export { journalScanner } from './journal.js'
export { nowScanner } from './now.js'
export { taskScanner } from './tasks.js'

import { journalScanner } from './journal.js'
import { nowScanner } from './now.js'
import { taskScanner } from './tasks.js'
import type { Scanner } from '../types.js'

export const defaultScanners: Scanner[] = [journalScanner, nowScanner, taskScanner]
