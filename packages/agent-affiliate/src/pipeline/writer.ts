/**
 * Review-post drafter. Template fallback runs without any LLM so the
 * pipeline always emits a publishable draft; the AnthropicReviewWriter
 * adapter upgrades it to a richer version when configured.
 */

import type { AffiliateAlert, ReviewDraft, ReviewWriterAdapter, TrackedProduct } from '../types'

function moneyFmt(n: number, currency: string): string {
  if (currency === 'USD') return `$${n.toFixed(2)}`
  if (currency === 'EUR') return `€${n.toFixed(2)}`
  return `${n.toFixed(2)} ${currency}`
}

export function fallbackDraft(product: TrackedProduct, alert: AffiliateAlert): ReviewDraft {
  const s = alert.snapshot
  const lines: string[] = []
  if (alert.kind === 'price-drop' && alert.prior) {
    lines.push(
      `${product.title} just dropped to ${moneyFmt(s.price, s.currency)} (${alert.delta_pct}% off ${moneyFmt(alert.prior.price, alert.prior.currency)}).`,
    )
    lines.push(
      `If you've been on the fence in the ${product.niche} space, this is the cheapest I've tracked it.`,
    )
  } else if (alert.kind === 'new-release') {
    lines.push(`Just spotted a new release: ${product.title}.`)
    lines.push(`Worth a look for anyone tracking the ${product.niche} space.`)
  } else if (alert.kind === 'back-in-stock') {
    lines.push(`${product.title} is back in stock at ${moneyFmt(s.price, s.currency)}.`)
  } else if (alert.kind === 'rating-jump') {
    lines.push(
      `${product.title} just jumped to ${s.rating?.toFixed(1)}★ (${alert.delta_pct}% over the prior reading).`,
    )
  } else {
    lines.push(`${product.title} update.`)
  }
  lines.push('')
  lines.push(`→ ${product.affiliate_url}`)
  return {
    product_id: product.id,
    alert_kind: alert.kind,
    title: titleFor(alert, product),
    body: lines.join('\n'),
    affiliate_url: product.affiliate_url,
    generated_at: alert.generated_at,
  }
}

function titleFor(alert: AffiliateAlert, product: TrackedProduct): string {
  switch (alert.kind) {
    case 'price-drop':
      return `Deal alert: ${product.title} (${alert.delta_pct}% off)`
    case 'new-release':
      return `New release: ${product.title}`
    case 'back-in-stock':
      return `${product.title} is back in stock`
    case 'rating-jump':
      return `${product.title} ratings just climbed`
  }
}

export async function draftReview(
  product: TrackedProduct,
  alert: AffiliateAlert,
  writer?: ReviewWriterAdapter,
): Promise<ReviewDraft> {
  if (!writer) return fallbackDraft(product, alert)
  try {
    return await writer.draft({ product, alert })
  } catch {
    return fallbackDraft(product, alert)
  }
}
