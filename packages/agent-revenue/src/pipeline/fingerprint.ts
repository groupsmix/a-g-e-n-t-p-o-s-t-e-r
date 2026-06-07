/**
 * Stable IDs for revenue events. We use a 32-bit FNV-1a hash because
 * it's deterministic, dependency-free, and good enough for dedupe in
 * a single store. Anything that needs cryptographic strength should
 * not use this.
 */

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return ('00000000' + hash.toString(16)).slice(-8)
}

export function revenueId(source: string, externalId: string): string {
  return `rev_${fnv1a(`${source}|${externalId}`)}`
}
