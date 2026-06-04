import type { D1Database } from '@cloudflare/workers-types'

// ============================================================
// Attribution Service
// Purpose: Track clicks and conversions for attribution
// ============================================================

interface TrackedLinkRow {
  id: string
  offer_id: string
  channel: string
  slug: string
  destination_url: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  created_at: string
}

// ── Generate short code ────────────────────────────────────────

export function generateShortCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// ── Create tracked link ────────────────────────────────────────

export async function createTrackedLink(
  db: D1Database,
  input: {
    offer_id: string
    channel: string
    destination_url: string
    campaign?: string
    source?: string
    medium?: string
    content?: string
    term?: string
  }
) {
  let shortCode: string
  let attempts = 0
  const maxAttempts = 10

  // Generate unique short code
  do {
    shortCode = generateShortCode()
    attempts++
    const existing = await db
      .prepare('SELECT id FROM tracked_links WHERE slug = ?')
      .bind(shortCode)
      .first<{ id: string }>()
    if (!existing) break
  } while (attempts < maxAttempts)

  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique short code')
  }

  const id = crypto.randomUUID().replace(/-/g, '')

  await db.prepare(`
    INSERT INTO tracked_links (
      id, offer_id, channel, slug, destination_url,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.offer_id,
    input.channel,
    shortCode,
    input.destination_url,
    input.source ?? null,
    input.medium ?? null,
    input.campaign ?? null,
    input.content ?? null,
    input.term ?? null,
  ).run()

  const link = await db.prepare('SELECT * FROM tracked_links WHERE id = ?')
    .bind(id)
    .first<TrackedLinkRow>()

  return mapTrackedLinkRow(link!)
}

// ── Record click ───────────────────────────────────────────────

export async function recordClick(
  db: D1Database,
  shortCode: string,
  externalEventId?: string,
  metadata?: Record<string, unknown>
) {
  // Get the tracked link
  const link = await db
    .prepare('SELECT * FROM tracked_links WHERE slug = ?')
    .bind(shortCode)
    .first<TrackedLinkRow>()

  if (!link) {
    throw new Error('Tracked link not found')
  }

  // Create economic event for the click
  const eventId = crypto.randomUUID().replace(/-/g, '')

  // Use INSERT OR IGNORE to prevent duplicate clicks when external_event_id is provided
  if (externalEventId) {
    await db.prepare(`
      INSERT OR IGNORE INTO economic_events (
        id, offer_id, tracked_link_id, event_type, amount_cents,
        currency, category, external_event_id, external_provider, metadata, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      eventId,
      link.offer_id,
      link.id,
      'click',
      0,
      'USD',
      'click',
      externalEventId,
      'attribution',
      JSON.stringify(metadata ?? {}),
    ).run()
  } else {
    await db.prepare(`
      INSERT INTO economic_events (
        id, offer_id, tracked_link_id, event_type, amount_cents,
        currency, category, external_event_id, external_provider, metadata, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      eventId,
      link.offer_id,
      link.id,
      'click',
      0,
      'USD',
      'click',
      null,
      'attribution',
      JSON.stringify(metadata ?? {}),
    ).run()
  }

  return { success: true, link_id: link.id, event_id: eventId }
}

// ── Record conversion ───────────────────────────────────────────

export async function recordConversion(
  db: D1Database,
  shortCode: string,
  amountCents: number,
  externalEventId?: string,
  metadata?: Record<string, unknown>
) {
  // Get the tracked link
  const link = await db
    .prepare('SELECT * FROM tracked_links WHERE slug = ?')
    .bind(shortCode)
    .first<TrackedLinkRow>()

  if (!link) {
    throw new Error('Tracked link not found')
  }

  // Create economic event for the conversion (purchase)
  const eventId = crypto.randomUUID().replace(/-/g, '')

  // Use INSERT OR IGNORE to prevent duplicate conversions when external_event_id is provided
  if (externalEventId) {
    await db.prepare(`
      INSERT OR IGNORE INTO economic_events (
        id, offer_id, tracked_link_id, event_type, amount_cents,
        currency, category, external_event_id, external_provider, metadata, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      eventId,
      link.offer_id,
      link.id,
      'revenue',
      amountCents,
      'USD',
      'purchase',
      externalEventId,
      'attribution',
      JSON.stringify(metadata ?? {}),
    ).run()
  } else {
    await db.prepare(`
      INSERT INTO economic_events (
        id, offer_id, tracked_link_id, event_type, amount_cents,
        currency, category, external_event_id, external_provider, metadata, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      eventId,
      link.offer_id,
      link.id,
      'revenue',
      amountCents,
      'USD',
      'purchase',
      null,
      'attribution',
      JSON.stringify(metadata ?? {}),
    ).run()
  }

  return { success: true, link_id: link.id, event_id: eventId }
}

// ── Get tracked link stats ─────────────────────────────────────

export async function getTrackedLinkStats(db: D1Database, linkId: string) {
  const eventsResult = await db
    .prepare(`
      SELECT 
        event_type,
        SUM(amount_cents) as total_amount_cents,
        COUNT(*) as count
      FROM economic_events
      WHERE tracked_link_id = ?
      GROUP BY event_type
    `)
    .bind(linkId)
    .all<{ event_type: string; total_amount_cents: number; count: number }>()

  const stats = (eventsResult.results ?? []).reduce((acc, row) => {
    acc[row.event_type] = {
      total_cents: row.total_amount_cents,
      count: row.count,
    }
    return acc
  }, {} as Record<string, { total_cents: number; count: number }>)

  return stats
}

// ── Helper: Map tracked link row ───────────────────────────────

function mapTrackedLinkRow(row: TrackedLinkRow) {
  return {
    id: row.id,
    offer_id: row.offer_id,
    channel: row.channel,
    slug: row.slug,
    destination_url: row.destination_url,
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.utm_campaign,
    utm_content: row.utm_content,
    utm_term: row.utm_term,
    created_at: row.created_at,
  }
}
