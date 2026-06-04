// ============================================================
// Product & Niche Scoring — inspired by agent-factory patterns
// ============================================================
// Evaluates niches (before building) and products (after building)
// so the system can prioritise high-potential work.

export interface NicheScore {
  demand: number
  gap: number
  priceRange: number
  volume: number
  total: number
  recommendation: string
}

export interface ProductScore {
  titleScore: number
  descriptionScore: number
  completeness: number
  priceScore: number
  total: number
}

// ---- Niche scoring ----

const HIGH_DEMAND_KEYWORDS = [
  'template', 'planner', 'printable', 'checklist', 'workbook',
  'guide', 'toolkit', 'spreadsheet', 'tracker', 'journal',
  'resume', 'budget', 'meal plan', 'social media', 'canva',
]

const SATURATED_NICHES = [
  'generic planner', 'basic resume', 'simple budget',
  'motivational quotes', 'blank journal',
]

export function scoreNiche(niche: string): NicheScore {
  const lower = niche.toLowerCase()

  let demand = 40
  for (const kw of HIGH_DEMAND_KEYWORDS) {
    if (lower.includes(kw)) { demand += 12; break }
  }
  if (lower.split(/\s+/).length >= 3) demand += 10
  if (lower.length > 30) demand += 5
  demand = Math.min(100, demand)

  let gap = 65
  for (const sat of SATURATED_NICHES) {
    if (lower.includes(sat)) { gap -= 30; break }
  }
  if (lower.split(/\s+/).length >= 4) gap += 10
  gap = Math.max(0, Math.min(100, gap))

  let priceRange = 50
  const priceSignals = ['premium', 'professional', 'advanced', 'complete', 'bundle', 'toolkit']
  for (const sig of priceSignals) {
    if (lower.includes(sig)) { priceRange += 15; break }
  }
  priceRange = Math.min(100, priceRange)

  let volume = 45
  const volumeSignals = ['daily', 'weekly', 'monthly', 'recurring', 'subscription', 'series']
  for (const sig of volumeSignals) {
    if (lower.includes(sig)) { volume += 20; break }
  }
  volume = Math.min(100, volume)

  const total = Math.round(demand * 0.3 + gap * 0.25 + priceRange * 0.25 + volume * 0.2)

  let recommendation: string
  if (total >= 75) recommendation = 'Strong niche — proceed with high confidence.'
  else if (total >= 55) recommendation = 'Decent potential — refine the angle or add a differentiator.'
  else if (total >= 35) recommendation = 'Weak niche — consider pivoting or narrowing focus.'
  else recommendation = 'Very low potential — skip or radically rethink.'

  return { demand, gap, priceRange, volume, total, recommendation }
}

// ---- Product scoring ----

const BANNED_TITLE_WORDS = [
  'best', 'ultimate', 'amazing', 'incredible', 'awesome', 'perfect',
]

export function scoreProduct(product: {
  name?: string | null
  description?: string | null
  tags?: string | string[] | null
  price?: number | null
  deliverable_url?: string | null
  image_url?: string | null
}): ProductScore {
  let titleScore = 0
  const name = product.name || ''
  if (name.length >= 10 && name.length <= 80) titleScore += 40
  else if (name.length > 0) titleScore += 15
  if (name.length > 0 && !BANNED_TITLE_WORDS.some((w) => name.toLowerCase().includes(w))) titleScore += 20
  if (name.length > 20) titleScore += 15
  const wordCount = name.split(/\s+/).filter(Boolean).length
  if (wordCount >= 3 && wordCount <= 12) titleScore += 25
  titleScore = Math.min(100, titleScore)

  let descriptionScore = 0
  const desc = product.description || ''
  if (desc.length >= 200) descriptionScore += 35
  else if (desc.length >= 50) descriptionScore += 15
  if (desc.length >= 500) descriptionScore += 20
  const sentences = desc.split(/[.!?]+/).filter((s) => s.trim().length > 3)
  if (sentences.length >= 3) descriptionScore += 15
  if (desc.includes('\n') || desc.includes('#')) descriptionScore += 10
  const bannedCheck = ['game-changer', 'revolutionary', 'cutting-edge', 'seamlessly', 'leverage']
  const descLower = desc.toLowerCase()
  const slopCount = bannedCheck.filter((b) => descLower.includes(b)).length
  descriptionScore -= slopCount * 8
  descriptionScore = Math.max(0, Math.min(100, descriptionScore))

  let completeness = 0
  if (name) completeness += 20
  if (desc.length >= 50) completeness += 20
  const tags = Array.isArray(product.tags)
    ? product.tags
    : typeof product.tags === 'string' && product.tags.length
      ? product.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : []
  if (tags.length >= 3) completeness += 20
  if (product.price !== null && product.price !== undefined && product.price > 0) completeness += 20
  if (product.deliverable_url || product.image_url) completeness += 20
  completeness = Math.min(100, completeness)

  let priceScore = 0
  const price = product.price ?? 0
  if (price > 0) priceScore += 30
  if (price >= 3 && price <= 50) priceScore += 40
  else if (price > 50 && price <= 100) priceScore += 25
  else if (price > 0) priceScore += 10
  if (price > 0 && price % 1 !== 0) priceScore += 10
  if (price >= 5 && price <= 30) priceScore += 20
  priceScore = Math.min(100, priceScore)

  const total = Math.round(
    titleScore * 0.2 + descriptionScore * 0.3 + completeness * 0.3 + priceScore * 0.2,
  )

  return { titleScore, descriptionScore, completeness, priceScore, total }
}
