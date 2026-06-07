/**
 * Stage 1 — split the script into per-voice segments.
 *
 * Convention:
 *   "[Host]: hello world"  → { voice: 'host', text: 'hello world' }
 *   "plain text"           → { voice: 'host', text: 'plain text' }
 *
 * Consecutive lines from the same voice are merged so we make fewer
 * TTS calls.
 */

import type { ScriptSegment } from '../types.js'

const TAG_RX = /^\s*\[([A-Za-z][\w-]*)\]\s*:\s*(.*)$/

export function segmentScript(script: string): ScriptSegment[] {
  const lines = script.split(/\r?\n/)
  const segs: ScriptSegment[] = []
  let curVoice = 'host'
  let buf: string[] = []
  const flush = () => {
    const text = buf.join(' ').trim()
    if (text) segs.push({ voice: curVoice, text })
    buf = []
  }
  for (const raw of lines) {
    const m = raw.match(TAG_RX)
    if (m) {
      const nextVoice = m[1]!.toLowerCase()
      // Only emit a boundary when the speaker actually changes; consecutive
      // lines from the same voice get merged into a single TTS segment.
      if (nextVoice !== curVoice) {
        flush()
        curVoice = nextVoice
      }
      if (m[2]) buf.push(m[2]!.trim())
    } else if (raw.trim()) {
      buf.push(raw.trim())
    } else {
      // blank line: soft boundary, keep voice
      flush()
    }
  }
  flush()
  return segs
}
