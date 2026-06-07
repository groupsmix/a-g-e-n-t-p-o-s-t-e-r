/**
 * Stage 2 — turn the storyboard into a list of CaptionCues for
 * burn-in or upload-time captioning.  Each scene's caption is split
 * into ~3-second cues so reader cadence stays comfortable.
 */

import type { CaptionCue, Storyboard } from '../types.js'

function splitForCues(text: string, maxChars = 60): string[] {
  const words = text.split(/\s+/)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) out.push(cur.trim())
      cur = w
    } else {
      cur = (cur + ' ' + w).trim()
    }
  }
  if (cur) out.push(cur.trim())
  return out
}

export function generateCaptions(story: Storyboard): CaptionCue[] {
  const cues: CaptionCue[] = []
  let t = 0
  for (const s of story.scenes) {
    const chunks = splitForCues(s.caption)
    const dur = s.durationSec / Math.max(1, chunks.length)
    for (const c of chunks) {
      cues.push({
        start: +t.toFixed(2),
        end: +(t + dur).toFixed(2),
        text: c,
      })
      t += dur
    }
  }
  return cues
}

export function toSrt(cues: CaptionCue[]): string {
  const fmt = (s: number) => {
    const ms = Math.floor((s % 1) * 1000)
    const total = Math.floor(s)
    const h = String(Math.floor(total / 3600)).padStart(2, '0')
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
    const sec = String(total % 60).padStart(2, '0')
    return `${h}:${m}:${sec},${String(ms).padStart(3, '0')}`
  }
  return cues
    .map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`)
    .join('\n')
}
