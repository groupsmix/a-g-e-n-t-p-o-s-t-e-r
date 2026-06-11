// Untrusted-content wrapping (audit #37).
//
// Scraped winner patterns, trend titles, competitor copy, and anything else
// that originates OUTSIDE this codebase can carry prompt-injection payloads
// ("ignore all previous instructions and …"). Every such string must pass
// through `wrapUntrusted()` before it is concatenated into a prompt, so the
// model sees it inside explicit data-only markers that the master prompt
// (rule 8) tells it never to obey.
//
// The wrapper also strips any marker look-alikes from the content itself so
// a malicious string can't fake an early "end of untrusted block".

export const UNTRUSTED_OPEN = '<<<UNTRUSTED_DATA'
export const UNTRUSTED_CLOSE = '<<<END_UNTRUSTED_DATA>>>'

/** Remove sequences that could spoof our block markers. */
function neutralizeMarkers(text: string): string {
  // Collapse any 3+ run of < or > so neither our markers nor HTML-ish
  // pseudo-tags like <<<system>>> survive verbatim.
  return text.replace(/<{3,}/g, '<<').replace(/>{3,}/g, '>>')
}

/**
 * Wrap one piece of external text in data-only markers.
 *
 * @param label short description of the source, e.g. "winner-pattern" or
 *              "trend-title" — shows up in the prompt so failures are
 *              debuggable from logs.
 */
export function wrapUntrusted(label: string, content: string): string {
  const safeLabel = label.replace(/[^a-zA-Z0-9 _.:/-]/g, '').slice(0, 60)
  const safeContent = neutralizeMarkers(content)
  return `${UNTRUSTED_OPEN} source="${safeLabel}">>>\n${safeContent}\n${UNTRUSTED_CLOSE}`
}

/** Convenience for lists (winner patterns, scraped titles, …). */
export function wrapUntrustedList(label: string, items: string[]): string {
  return items
    .map((item, i) => wrapUntrusted(`${label}[${i}]`, item))
    .join('\n')
}
