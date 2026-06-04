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

  const pass = issues.length === 0
  return { pass, issues, score: productScore.total }
}
