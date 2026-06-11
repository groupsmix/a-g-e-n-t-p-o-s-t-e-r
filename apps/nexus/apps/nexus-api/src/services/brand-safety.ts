// ============================================================
// Brand-safety / moderation gate (audit #45)
// ============================================================
// Deterministic screen that runs before anything is published. The
// pipeline generates content with LLMs at scale and publishes under the
// owner's name — one hallucinated "cures cancer" claim or scammy
// "guaranteed returns" pitch can get an ad account banned or worse.
//
// Design choices:
//   - Pure regex, no API calls: runs in <1ms inside the Worker, cannot
//     flake, and the rules are reviewable in git history.
//   - Phrase-level patterns, not single words: "killer deal" and
//     "shooting a video" must NOT flag. Every pattern below is a phrase
//     that is unambiguous in a commercial-content context.
//   - Fail closed at the publish boundary: a flagged payload is rejected
//     with the specific reasons, so the review queue shows exactly what
//     to fix.

export type BrandSafetyCategory =
  | 'hate'
  | 'violence'
  | 'adult'
  | 'weapons'
  | 'drugs'
  | 'gambling'
  | 'medical-claims'
  | 'financial-claims'

export interface BrandSafetyFlag {
  category: BrandSafetyCategory
  /** Human-readable description of the rule that fired. */
  rule: string
  /** Short excerpt around the match for the review UI. */
  snippet: string
}

export interface BrandSafetyResult {
  pass: boolean
  flags: BrandSafetyFlag[]
}

interface Rule {
  category: BrandSafetyCategory
  rule: string
  re: RegExp
}

const RULES: Rule[] = [
  // ── hate / harassment ────────────────────────────────────────────
  { category: 'hate', rule: 'ethnic/racial supremacy phrasing', re: /\b(white|racial|ethnic)\s+(power|supremacy|purity)\b/i },
  { category: 'hate', rule: 'dehumanising group statement', re: /\b(all|those)\s+\w+s\s+(are|deserve)\s+(vermin|subhuman|extermination)\b/i },
  // ── violence / self-harm ─────────────────────────────────────────
  { category: 'violence', rule: 'incitement to violence', re: /\b(kill|murder|shoot|stab|bomb)\s+(him|her|them|yourself|people)\b/i },
  { category: 'violence', rule: 'self-harm encouragement', re: /\b(kys|kill\s+yourself|end\s+your\s+life)\b/i },
  // ── adult ────────────────────────────────────────────────────────
  { category: 'adult', rule: 'explicit sexual content', re: /\b(porn|xxx|nsfw|explicit\s+sex|onlyfans)\b/i },
  // ── weapons ──────────────────────────────────────────────────────
  { category: 'weapons', rule: 'weapon sales / DIY weapons', re: /\b(ghost\s+gun|3d[\s-]?printed\s+(gun|firearm)|untraceable\s+(gun|firearm|weapon)|buy\s+(a\s+)?(gun|firearm|ammo)\s+online)\b/i },
  // ── drugs ────────────────────────────────────────────────────────
  { category: 'drugs', rule: 'recreational/illegal drug promotion', re: /\b(buy|order|cheap|discount)\s+(weed|cannabis|cocaine|mdma|lsd|steroids|xanax|adderall)\b/i },
  // ── gambling ─────────────────────────────────────────────────────
  { category: 'gambling', rule: 'guaranteed gambling wins', re: /\b(guaranteed|sure[\s-]?fire|never\s+lose)\s+(win(s|ning)?|bet(s|ting)?)\b/i },
  // ── medical claims (FTC/platform-ban territory) ──────────────────
  { category: 'medical-claims', rule: 'cure/treatment claim', re: /\b(cures?|heals?|reverses?)\s+(cancer|diabetes|alzheimer|arthritis|depression|anxiety|any\s+disease)\b/i },
  { category: 'medical-claims', rule: 'miracle remedy claim', re: /\bmiracle\s+(cure|remedy|treatment|pill|supplement)\b/i },
  { category: 'medical-claims', rule: 'unrealistic weight-loss promise', re: /\blose\s+\d+\s*(lbs?|pounds|kg|kilos)\s+in\s+\d+\s*(days?|a\s+week|weeks?)\b/i },
  { category: 'medical-claims', rule: 'false FDA endorsement', re: /\bfda[\s-]approved\b/i },
  // ── financial claims (scam-pattern territory) ────────────────────
  { category: 'financial-claims', rule: 'guaranteed returns claim', re: /\b(guaranteed|risk[\s-]?free)\s+(returns?|profits?|income|roi)\b/i },
  { category: 'financial-claims', rule: 'get-rich-quick pitch', re: /\b(get\s+rich\s+quick|double\s+your\s+money|passive\s+income\s+guaranteed)\b/i },
  { category: 'financial-claims', rule: 'unrealistic earnings promise', re: /\b(make|earn)\s+\$\d{3,}\s*(per|a|\/)\s*(day|hour)\s+(guaranteed|with\s+no\s+(work|effort|experience))\b/i },
]

/** Excerpt ±40 chars around the first match, for the review UI. */
function snippetAround(text: string, re: RegExp): string {
  const m = re.exec(text)
  if (!m) return ''
  const start = Math.max(0, m.index - 40)
  const end = Math.min(text.length, m.index + m[0].length + 40)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

/**
 * Screen a single piece of text. Returns every rule that fires (not just
 * the first) so a review pass can fix everything in one round.
 */
export function screenText(text: string): BrandSafetyResult {
  if (!text) return { pass: true, flags: [] }
  const flags: BrandSafetyFlag[] = []
  for (const { category, rule, re } of RULES) {
    if (re.test(text)) {
      flags.push({ category, rule, snippet: snippetAround(text, re) })
    }
  }
  return { pass: flags.length === 0, flags }
}

/**
 * Screen a publish payload: every text field is checked, flags are
 * aggregated. Used by the quality gate (pre-publish checkpoint) and as a
 * final defence-in-depth check inside the publish adapters themselves.
 */
export function screenFields(
  fields: Record<string, string | string[] | null | undefined>,
): BrandSafetyResult {
  const flags: BrandSafetyFlag[] = []
  for (const [, value] of Object.entries(fields)) {
    const texts = Array.isArray(value) ? value : [value]
    for (const t of texts) {
      if (!t) continue
      flags.push(...screenText(t).flags)
    }
  }
  return { pass: flags.length === 0, flags }
}

/** Render flags as quality-gate issue strings. */
export function flagsToIssues(result: BrandSafetyResult): string[] {
  return result.flags.map(
    (f) => `Brand safety [${f.category}]: ${f.rule} — "${f.snippet}"`,
  )
}
