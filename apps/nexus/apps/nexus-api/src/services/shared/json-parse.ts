/**
 * Shared JSON-from-model parser — handles the common cases where AI models
 * wrap JSON in ```json fences, add prose around it, or return slightly
 * malformed output. One implementation for the whole codebase.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeJson<T = any>(raw: unknown): T | null {
  if (typeof raw !== 'string') return raw as T | null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Fast path: clean JSON.
  try {
    return JSON.parse(trimmed) as T
  } catch {
    /* fall through */
  }

  // Strip ```json ... ``` fences and retry.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as T
    } catch {
      /* fall through */
    }
  }

  // Extract the first balanced { … } object.
  const candidate = fenced ? fenced[1] : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T
    } catch {
      /* fall through */
    }
  }

  return null
}
