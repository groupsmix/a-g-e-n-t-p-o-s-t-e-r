// ============================================================
// Quality Gate System — inspired by ECC's de-sloppify pattern
// ============================================================
// Three checkpoints: pre-publish, pre-build, and post-build.
// Each returns a pass/fail verdict with specific issues.

import { scoreProduct, scoreNiche, type NicheScore } from './product-scorer'

export interface QualityResult {
  pass: boolean
  issues: string[]
  score: number
}

// ============================================================
// Slop / placeholder detection (T4 reject filter)
// ============================================================
// Catches the three failure modes the owner kept seeing land in the review
// queue: leftover template placeholders (`[INSERT NICHE]`, `{{topic}}`),
// literal "Untitled"-style names, and doubled words ("the the", "best best")
// from LLM repetition. Any hit is a quality issue → the gate fails → the
// product is rejected / held instead of shipped.

// Names that are placeholders rather than real titles.
const PLACEHOLDER_NAMES = new Set([
  'untitled', 'untitled product', 'untitled draft', 'unnamed',
  '(unnamed)', '(unnamed product)', 'new product', 'draft', 'tbd',
  'n/a', 'na', 'none', '-', '—', 'product', 'title', 'product title',
])

// Bracketed / templated placeholder tokens left in by the generator.
const PLACEHOLDER_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\{\{[^}]*\}\}/, label: 'mustache placeholder ({{…}})' },
  { re: /\{[\w][\w .\-]*\}/, label: 'brace placeholder ({…})' },
  { re: /<[a-zA-Z][\w .\-]*>/, label: 'angle-bracket placeholder (<…>)' },
  {
    re: /\[[^\]]*\b(insert|your|topic|niche|audience|name|product|keyword|placeholder|todo|tbd|xxx|tk|tktk|fill|example|category|brand)\b[^\]]*\]/i,
    label: 'bracket placeholder ([…])',
  },
  { re: /\[[A-Z][A-Z0-9 _\-]{2,}\]/, label: 'ALL-CAPS bracket placeholder ([…])' },
  { re: /\b(lorem ipsum|tktk|tbd|todo)\b/i, label: 'draft marker (lorem ipsum / TKTK / TBD / TODO)' },
]

// Consecutive duplicated word, e.g. "the the", "best best guide".
const DOUBLED_WORD = /\b([a-z]{2,})\s+\1\b/i

/**
 * Inspect a product's text for placeholder/slop patterns. Returns a list of
 * human-readable issues (empty when clean). Exported so the review/reject
 * paths and the autopilot harvester can share one definition.
 */
export function detectSlop(input: { name?: string | null; description?: string | null }): string[] {
  const issues: string[] = []
  const name = (input.name ?? '').trim()
  const description = (input.description ?? '').trim()

  // 1. Placeholder / "Untitled" name.
  if (name && PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    issues.push(`Title is a placeholder ("${name}")`)
  }

  // 2. Bracketed / templated placeholders in name or description.
  for (const field of [name, description]) {
    if (!field) continue
    for (const { re, label } of PLACEHOLDER_PATTERNS) {
      if (re.test(field)) {
        issues.push(`Unfilled ${label} left in content`)
        break // one placeholder issue per field is enough
      }
    }
  }

  // 3. Doubled words in name or description.
  for (const [fieldName, field] of [['title', name], ['description', description]] as const) {
    const m = field.match(DOUBLED_WORD)
    if (m) {
      issues.push(`Doubled word in ${fieldName} ("${m[1]} ${m[1]}")`)
    }
  }

  return issues
}

interface PrePublishProduct {
  name?: string | null
  description?: string | null
  deliverable_url?: string | null
  price?: number | null
  tags?: string | string[] | null
  image_url?: string | null
}

export function checkPrePublish(product: PrePublishProduct): QualityResult {
  const issues: string[] = []

  if (!product.name || product.name.trim().length < 3) {
    issues.push('Missing or too-short product title')
  }

  if (!product.description || product.description.trim().length < 30) {
    issues.push('Missing or too-short description (need at least 30 chars)')
  }

  if (!product.deliverable_url) {
    issues.push('No deliverable PDF attached')
  }

  const productScore = scoreProduct(product)
  if (productScore.total < 60) {
    issues.push(`Content quality score too low (${productScore.total}/100, need 60+)`)
  }

  if (product.price === null || product.price === undefined || product.price <= 0) {
    issues.push('Price not set or is zero')
  }

  // Reject filter: brackets / Untitled / doubled words (T4).
  issues.push(...detectSlop(product))

  const pass = issues.length === 0
  return { pass, issues, score: productScore.total }
}

interface PreBuildNiche {
  niche: string
}

export function checkPreBuild(input: PreBuildNiche): QualityResult {
  const issues: string[] = []

  if (!input.niche || input.niche.trim().length < 3) {
    issues.push('Niche description is empty or too short')
    return { pass: false, issues, score: 0 }
  }

  const nicheResult: NicheScore = scoreNiche(input.niche)

  if (nicheResult.total < 35) {
    issues.push(`Niche score too low (${nicheResult.total}/100) — ${nicheResult.recommendation}`)
  }

  if (nicheResult.gap < 30) {
    issues.push('Niche appears oversaturated (gap score < 30)')
  }

  const pass = issues.length === 0
  return { pass, issues, score: nicheResult.total }
}

interface PostBuildProduct {
  name?: string | null
  description?: string | null
  deliverable_url?: string | null
  price?: number | null
  tags?: string | string[] | null
  image_url?: string | null
  status?: string
}

export function checkPostBuild(product: PostBuildProduct): QualityResult {
  const issues: string[] = []

  const productScore = scoreProduct(product)

  if (!product.deliverable_url && !product.image_url) {
    issues.push('No deliverable or image asset generated')
  }

  if (productScore.total < 50) {
    issues.push(`Product quality below threshold (${productScore.total}/100, need 50+)`)
  }

  if (!product.name || product.name.trim().length < 3) {
    issues.push('Product name is missing or too short')
  }

  if (!product.description || product.description.trim().length < 50) {
    issues.push('Description is missing or too thin (need 50+ chars)')
  }

  const tags = Array.isArray(product.tags)
    ? product.tags
    : typeof product.tags === 'string' && product.tags.length
      ? product.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : []
  if (tags.length < 3) {
    issues.push('Fewer than 3 tags — SEO will suffer')
  }

  // Reject filter: brackets / Untitled / doubled words (T4). Catches slop
  // before it ever reaches the review queue.
  issues.push(...detectSlop(product))

  const pass = issues.length === 0
  return { pass, issues, score: productScore.total }
}
