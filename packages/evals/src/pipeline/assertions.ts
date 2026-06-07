/**
 * Reusable Assertion constructors. Each returns an Assertion ready to
 * plug into a Scenario.
 *
 *   containsText('engagement', 0.5)   output must mention 'engagement'
 *   containsAll(['x','y'], 0.5)       all keywords present
 *   matchesRegex(/^\{/, 0.3)          JSON-shaped reply
 *   shorterThan(280, 0.2)             length cap
 *   notHallucinated(['allow'], 0.4)   never mentions blocked terms
 *   shapeMatches({ id: 'string' }, 0.4)  duck-typed shape check
 */

import type { Assertion } from '../types'

export function containsText(needle: string, weight = 1): Assertion<string> {
  return {
    label: `contains "${needle}"`,
    weight,
    score: (out) => (typeof out === 'string' && out.toLowerCase().includes(needle.toLowerCase()) ? 1 : 0),
  }
}

export function containsAll(needles: string[], weight = 1): Assertion<string> {
  return {
    label: `contains all of [${needles.join(', ')}]`,
    weight,
    score: (out) => {
      if (typeof out !== 'string') return 0
      const hits = needles.filter((n) => out.toLowerCase().includes(n.toLowerCase())).length
      return hits / Math.max(1, needles.length)
    },
  }
}

export function matchesRegex(re: RegExp, weight = 1): Assertion<string> {
  return {
    label: `matches ${re}`,
    weight,
    score: (out) => (typeof out === 'string' && re.test(out) ? 1 : 0),
  }
}

export function shorterThan(maxChars: number, weight = 1): Assertion<string> {
  return {
    label: `<= ${maxChars} chars`,
    weight,
    score: (out) => (typeof out === 'string' ? (out.length <= maxChars ? 1 : 0) : 0),
  }
}

export function notHallucinated(forbidden: string[], weight = 1): Assertion<string> {
  return {
    label: `not hallucinated (no [${forbidden.join(', ')}])`,
    weight,
    score: (out) => {
      if (typeof out !== 'string') return 0
      return forbidden.some((f) => out.toLowerCase().includes(f.toLowerCase())) ? 0 : 1
    },
  }
}

export function shapeMatches(shape: Record<string, string>, weight = 1): Assertion<unknown> {
  // Duck-typed: every key in shape must exist on output with the right typeof.
  return {
    label: `shape { ${Object.keys(shape).join(', ')} }`,
    weight,
    score: (out) => {
      if (!out || typeof out !== 'object') return 0
      const o = out as Record<string, unknown>
      const total = Object.keys(shape).length
      if (total === 0) return 1
      let hits = 0
      for (const [k, t] of Object.entries(shape)) {
        if (typeof o[k] === t) hits += 1
      }
      return hits / total
    },
  }
}
