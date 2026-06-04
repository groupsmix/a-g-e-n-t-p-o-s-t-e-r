// ============================================================
// Storage Layer: D1 Query Helpers
// ============================================================
// Provides typed query functions for all D1 operations.
//
// SQL SECURITY AUDIT (completed):
// - All user-supplied values are passed via .bind() with ? placeholders
// - Dynamic SET clauses use whitelisted field names from internal arrays, never raw user input
// - Column name interpolation in ab-testing routes is gated by strict allowlist validation
// - No string concatenation of user input into SQL query strings detected
// ============================================================

import type { D1Database } from '@cloudflare/workers-types'

export interface D1Helper {
  prepare: D1Database['prepare']
  exec: D1Database['exec']
  dump: D1Database['dump']
}

// ============================================================
// Domain Queries
// ============================================================

export async function getAllDomains(db: D1Database, activeOnly = true) {
  const query = activeOnly
    ? 'SELECT * FROM domains WHERE is_active = 1 ORDER BY sort_order ASC'
    : 'SELECT * FROM domains ORDER BY sort_order ASC'
  const result = await db.prepare(query).all()
  return result.results
}

export async function getDomainBySlug(db: D1Database, slug: string) {
  const result = await db.prepare('SELECT * FROM domains WHERE slug = ?').bind(slug).first()
  return result
}

export async function getDomainById(db: D1Database, id: string) {
  const result = await db.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first()
  return result
}

export async function createDomain(
  db: D1Database,
  data: { name: string; slug: string; description?: string; icon?: string; color?: string }
) {
  const id = generateId()
  await db
    .prepare(
      `INSERT INTO domains (id, name, slug, description, icon, color)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, data.name, data.slug, data.description || null, data.icon || null, data.color || '#6366f1')
    .run()
  return getDomainById(db, id)
}

export async function updateDomain(
  db: D1Database,
  id: string,
  data: Record<string, unknown>
) {
  const allowedFields = ['name', 'slug', 'description', 'icon', 'color', 'sort_order', 'is_active']
  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`)
      values.push(value)
    }
  }

  if (updates.length === 0) return null

  updates.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)

  await db
    .prepare(`UPDATE domains SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()

  return getDomainById(db, id)
}

export async function deleteDomain(db: D1Database, id: string) {
  await db.prepare('DELETE FROM domains WHERE id = ?').bind(id).run()
}

// ============================================================
// Category Queries
// ============================================================

export async function getCategoriesByDomain(db: D1Database, domainId: string, activeOnly = true) {
  const query = activeOnly
    ? 'SELECT * FROM categories WHERE domain_id = ? AND is_active = 1 ORDER BY sort_order ASC'
    : 'SELECT * FROM categories WHERE domain_id = ? ORDER BY sort_order ASC'
  const result = await db.prepare(query).bind(domainId).all()
  return result.results
}

export async function getCategoryBySlug(db: D1Database, domainId: string, slug: string) {
  const result = await db
    .prepare('SELECT * FROM categories WHERE domain_id = ? AND slug = ?')
    .bind(domainId, slug)
    .first()
  return result
}

export async function createCategory(
  db: D1Database,
  domainId: string,
  data: { name: string; slug: string; description?: string; icon?: string }
) {
  const id = generateId()
  await db
    .prepare(
      `INSERT INTO categories (id, domain_id, name, slug, description, icon)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, domainId, data.name, data.slug, data.description || null, data.icon || null)
    .run()
  return db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first()
}

export async function deleteCategory(db: D1Database, id: string) {
  await db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run()
}

// ============================================================
// Product Queries
// ============================================================

export async function getProducts(
  db: D1Database,
  filters: {
    status?: string
    domain_id?: string
    graveyard?: boolean
    limit?: number
    offset?: number
  } = {}
) {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.graveyard) {
    conditions.push('status = ?')
    params.push('graveyard')
  } else if (filters.status) {
    conditions.push('status = ?')
    params.push(filters.status)
  }

  if (filters.domain_id) {
    conditions.push('domain_id = ?')
    params.push(filters.domain_id)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = filters.limit || 50
  const offset = filters.offset || 0

  const result = await db
    .prepare(
      `SELECT p.*, d.name as domain_name, d.slug as domain_slug, 
              c.name as category_name, c.slug as category_slug
       FROM products p
       JOIN domains d ON p.domain_id = d.id
       JOIN categories c ON p.category_id = c.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all()

  return result.results
}

export async function getProductById(db: D1Database, id: string) {
  const result = await db
    .prepare(
      `SELECT p.*, d.name as domain_name, d.slug as domain_slug,
              c.name as category_name, c.slug as category_slug
       FROM products p
       JOIN domains d ON p.domain_id = d.id
       JOIN categories c ON p.category_id = c.id
       WHERE p.id = ?`
    )
    .bind(id)
    .first()
  return result
}

export async function createProduct(
  db: D1Database,
  data: {
    domain_id: string
    category_id: string
    language?: string
    niche?: string
    name?: string
    user_input?: Record<string, unknown>
  }
) {
  const id = generateId()
  await db
    .prepare(
      `INSERT INTO products (id, domain_id, category_id, language, niche, name, user_input, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`
    )
    .bind(
      id,
      data.domain_id,
      data.category_id,
      data.language || 'en',
      data.niche || null,
      data.name || null,
      data.user_input ? JSON.stringify(data.user_input) : null
    )
    .run()
  return getProductById(db, id)
}

export async function updateProduct(
  db: D1Database,
  id: string,
  data: Record<string, unknown>
) {
  const allowedFields = [
    'name', 'niche', 'language', 'user_input', 'status', 'ai_score',
    'revenue_estimate', 'winner_patterns', 'graveyard_at', 'graveyard_reason', 'resurface_at'
  ]
  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`)
      values.push(typeof value === 'object' ? JSON.stringify(value) : value)
    }
  }

  if (updates.length === 0) return null

  updates.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)

  await db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  return getProductById(db, id)
}

export async function deleteProduct(db: D1Database, id: string) {
  await db.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
}

// ============================================================
// Workflow Run Queries
// ============================================================

export async function createWorkflowRun(db: D1Database, productId: string) {
  const id = generateId()
  await db
    .prepare('INSERT INTO workflow_runs (id, product_id, status) VALUES (?, ?, ?)')
    .bind(id, productId, 'queued')
    .run()

  // Create default steps — aligned with the 15 canonical STEPS in workflow-engine.ts.
  const steps = [
    { name: 'research_market', type: 'research_market', order: 1 },
    { name: 'research_psychology', type: 'research_psychology', order: 2 },
    { name: 'research_keywords', type: 'research_keywords', order: 3 },
    { name: 'generate_content', type: 'generate_long_form', order: 4 },
    { name: 'generate_assets', type: 'generate_image_prompt', order: 5 },
    { name: 'generate_seo', type: 'generate_seo_tags', order: 6 },
    { name: 'generate_title_variants', type: 'generate_short_copy', order: 7 },
    { name: 'quality_editor', type: 'quality_editor', order: 8 },
    { name: 'quality_buyer_sim', type: 'quality_buyer_sim', order: 9 },
    { name: 'quality_competitor', type: 'quality_competitor', order: 10 },
    { name: 'humanize', type: 'humanize', order: 11 },
    { name: 'revenue_estimate', type: 'revenue_estimate', order: 12 },
    { name: 'generate_platform_variants', type: 'platform_variation', order: 13 },
    { name: 'generate_social_content', type: 'social_adaptation', order: 14 },
    { name: 'quality_ceo', type: 'quality_ceo', order: 15 },
  ]

  for (const step of steps) {
    const stepId = generateId()
    await db
      .prepare(
        `INSERT INTO workflow_steps (id, run_id, step_name, step_type, step_order, status)
         VALUES (?, ?, ?, ?, ?, 'waiting')`
      )
      .bind(stepId, id, step.name, step.type, step.order)
      .run()
  }

  await db
    .prepare('UPDATE workflow_runs SET total_steps = ? WHERE id = ?')
    .bind(steps.length, id)
    .run()

  return db.prepare('SELECT * FROM workflow_runs WHERE id = ?').bind(id).first()
}

export async function getWorkflowRun(db: D1Database, id: string) {
  const run = await db.prepare('SELECT * FROM workflow_runs WHERE id = ?').bind(id).first()
  if (!run) return null

  const steps = await db
    .prepare('SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY step_order ASC')
    .bind(id)
    .all()

  return { ...run, steps: steps.results }
}

export async function updateWorkflowStep(
  db: D1Database,
  runId: string,
  stepName: string,
  data: {
status?: string
    ai_model_used?: string
    ai_models_tried?: string[]
    input_data?: unknown
    output_data?: unknown
    tokens_used?: number
    cost_usd?: number
    error?: string
  }
) {
  const updates: string[] = []
  const values: unknown[] = []

  if (data.status) {
    updates.push('status = ?')
    values.push(data.status)

    if (data.status === 'running') {
      updates.push('started_at = ?')
      values.push(new Date().toISOString())
    } else if (data.status === 'completed' || data.status === 'failed') {
      updates.push('completed_at = ?')
      values.push(new Date().toISOString())
    }
  }

  if (data.ai_model_used) {
    updates.push('ai_model_used = ?')
    values.push(data.ai_model_used)
  }

  if (data.ai_models_tried) {
    updates.push('ai_models_tried = ?')
    values.push(JSON.stringify(data.ai_models_tried))
  }

  if (data.input_data !== undefined) {
    updates.push('input_data = ?')
    values.push(typeof data.input_data === 'string' ? data.input_data : JSON.stringify(data.input_data))
  }

  if (data.output_data !== undefined) {
    updates.push('output_data = ?')
    values.push(typeof data.output_data === 'string' ? data.output_data : JSON.stringify(data.output_data))
  }

  if (data.tokens_used !== undefined) {
    updates.push('tokens_used = ?')
    values.push(data.tokens_used)
  }

  if (data.cost_usd !== undefined) {
    updates.push('cost_usd = ?')
    values.push(data.cost_usd)
  }

  if (data.error) {
    updates.push('error = ?')
    values.push(data.error)
  }

  if (updates.length === 0) return

  values.push(runId, stepName)

  await db
    .prepare(`UPDATE workflow_steps SET ${updates.join(', ')} WHERE run_id = ? AND step_name = ?`)
    .bind(...values)
    .run()

  // Update workflow run status
  await db
    .prepare('UPDATE workflow_runs SET current_step = ?, updated_at = ? WHERE id = ?')
    .bind(stepName, new Date().toISOString(), runId)
    .run()
}

export async function completeWorkflowRun(db: D1Database, id: string, status: 'completed' | 'failed', error?: string) {
  await db
    .prepare('UPDATE workflow_runs SET status = ?, completed_at = ?, error = ? WHERE id = ?')
    .bind(status, new Date().toISOString(), error || null, id)
    .run()
}

// ============================================================
// Review Queries
// ============================================================

export async function createReview(
  db: D1Database,
  data: {
    product_id: string
    run_id?: string
    ai_score?: number
    section_scores?: Record<string, number>
    decision?: string
    feedback?: string
    revised_sections?: Record<string, unknown>
  }
) {
  const id = generateId()
  await db
    .prepare(
      `INSERT INTO reviews (id, product_id, run_id, ai_score, section_scores, decision, feedback, revised_sections)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.product_id,
      data.run_id || null,
      data.ai_score || null,
      data.section_scores ? JSON.stringify(data.section_scores) : null,
      data.decision || null,
      data.feedback || null,
      data.revised_sections ? JSON.stringify(data.revised_sections) : null
    )
    .run()
  return db.prepare('SELECT * FROM reviews WHERE id = ?').bind(id).first()
}

export async function getReviewsByProduct(db: D1Database, productId: string) {
  const result = await db
    .prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY reviewed_at DESC')
    .bind(productId)
    .all()
  return result.results
}

// ============================================================
// Asset Queries
// ============================================================

export async function getAssetsByProduct(db: D1Database, productId: string) {
  const result = await db
    .prepare('SELECT * FROM assets WHERE product_id = ? ORDER BY created_at DESC')
    .bind(productId)
    .all()
  return result.results
}

export async function createAsset(
  db: D1Database,
  data: {
    product_id: string
    step_id?: string
    asset_type: string
    r2_key?: string
    cf_image_id?: string
    cdn_url?: string
    filename?: string
    mime_type?: string
    file_size_bytes?: number
    metadata?: Record<string, unknown>
  }
) {
  const id = generateId()
  await db
    .prepare(
      `INSERT INTO assets (id, product_id, step_id, asset_type, r2_key, cf_image_id, cdn_url, filename, mime_type, file_size_bytes, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.product_id,
      data.step_id || null,
      data.asset_type,
      data.r2_key || null,
      data.cf_image_id || null,
      data.cdn_url || null,
      data.filename || null,
      data.mime_type || null,
      data.file_size_bytes || null,
      data.metadata ? JSON.stringify(data.metadata) : null
    )
    .run()
  return db.prepare('SELECT * FROM assets WHERE id = ?').bind(id).first()
}

export async function deleteAsset(db: D1Database, id: string) {
  const asset = await db.prepare('SELECT * FROM assets WHERE id = ?').bind(id).first()
  if (asset) {
    await db.prepare('DELETE FROM assets WHERE id = ?').bind(id).run()
  }
  return asset
}

export async function getAssetKeysByProduct(db: D1Database, productId: string) {
  const result = await db
    .prepare('SELECT r2_key, cf_image_id FROM assets WHERE product_id = ?')
    .bind(productId)
    .all()
  return result.results
}

// ============================================================
// Platform Variant Queries
// ============================================================

export async function getPlatformVariants(db: D1Database, productId: string) {
  const result = await db
    .prepare(
      `SELECT pv.*, p.name as platform_name, p.slug as platform_slug
       FROM platform_variants pv
       JOIN platforms p ON pv.platform_id = p.id
       WHERE pv.product_id = ?`
    )
    .bind(productId)
    .all()
  return result.results
}

export async function createPlatformVariant(
  db: D1Database,
  data: {
    product_id: string
    platform_id: string
    title?: string
    description?: string
    tags?: string[]
    price?: number
    currency?: string
    additional_data?: Record<string, unknown>
  }
) {
  const id = generateId()
  await db
    .prepare(
      `INSERT INTO platform_variants (id, product_id, platform_id, title, description, tags, price, currency, additional_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.product_id,
      data.platform_id,
      data.title || null,
      data.description || null,
      data.tags ? JSON.stringify(data.tags) : null,
      data.price || null,
      data.currency || 'USD',
      data.additional_data ? JSON.stringify(data.additional_data) : null
    )
    .run()
  return db.prepare('SELECT * FROM platform_variants WHERE id = ?').bind(id).first()
}

export async function updatePlatformVariant(
  db: D1Database,
  id: string,
  data: Record<string, unknown>
) {
  const allowedFields = ['title', 'description', 'tags', 'price', 'currency', 'additional_data', 'status', 'published_at', 'published_url']
  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`)
      values.push(typeof value === 'object' ? JSON.stringify(value) : value)
    }
  }

  if (updates.length === 0) return null

  updates.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)

  await db.prepare(`UPDATE platform_variants SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  return db.prepare('SELECT * FROM platform_variants WHERE id = ?').bind(id).first()
}

// ============================================================
// Social Variant Queries
// ============================================================

export async function getSocialVariants(db: D1Database, productId: string) {
  const result = await db
    .prepare(
      `SELECT sv.*, sc.name as channel_name, sc.slug as channel_slug
       FROM social_variants sv
       JOIN social_channels sc ON sv.channel_id = sc.id
       WHERE sv.product_id = ?`
    )
    .bind(productId)
    .all()
  return result.results
}

export async function createSocialVariant(
  db: D1Database,
  data: {
    product_id: string
    channel_id: string
    content: Record<string, unknown>
  }
) {
  const id = generateId()
  await db
    .prepare(
      'INSERT INTO social_variants (id, product_id, channel_id, content) VALUES (?, ?, ?, ?)'
    )
    .bind(id, data.product_id, data.channel_id, JSON.stringify(data.content))
    .run()
  return db.prepare('SELECT * FROM social_variants WHERE id = ?').bind(id).first()
}

// ============================================================
// Settings Queries
// ============================================================

export async function getSetting(db: D1Database, key: string) {
  const result = await db.prepare('SELECT * FROM settings WHERE key = ?').bind(key).first()
  return result?.value
}

export async function getAllSettings(db: D1Database) {
  const result = await db.prepare('SELECT * FROM settings').all()
  const settings: Record<string, string> = {}
  for (const row of result.results) {
    settings[row.key as string] = row.value as string
  }
  return settings
}

export async function updateSetting(db: D1Database, key: string, value: string) {
  await db
    .prepare(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    )
    .bind(key, value, new Date().toISOString())
    .run()
}

// ============================================================
// Trend & Winner Queries
// ============================================================

export async function getTrendAlerts(db: D1Database, status?: string, limit = 20) {
  const query = status
    ? 'SELECT ta.*, d.name as domain_name FROM trend_alerts ta LEFT JOIN domains d ON ta.domain_id = d.id WHERE ta.status = ? ORDER BY ta.detected_at DESC LIMIT ?'
    : 'SELECT ta.*, d.name as domain_name FROM trend_alerts ta LEFT JOIN domains d ON ta.domain_id = d.id ORDER BY ta.detected_at DESC LIMIT ?'

  const params = status ? [status, limit] : [limit]
  const result = await db.prepare(query).bind(...params).all()
  return result.results
}

export async function createTrendAlert(
  db: D1Database,
  data: {
    domain_id?: string
    trend_keyword: string
    trend_score?: number
    demand_window?: string
    source?: string
    suggested_niche?: string
  }
) {
  const id = generateId()
  await db
    .prepare(
      `INSERT INTO trend_alerts (id, domain_id, trend_keyword, trend_score, demand_window, source, suggested_niche)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.domain_id || null,
      data.trend_keyword,
      data.trend_score || null,
      data.demand_window || null,
      data.source || null,
      data.suggested_niche || null
    )
    .run()
  return db.prepare('SELECT * FROM trend_alerts WHERE id = ?').bind(id).first()
}

export async function updateTrendAlert(db: D1Database, id: string, data: { status?: string; dismissed_at?: string; workflow_id?: string }) {
  const updates: string[] = []
  const values: unknown[] = []

  if (data.status) {
    updates.push('status = ?')
    values.push(data.status)
  }
  if (data.dismissed_at) {
    updates.push('dismissed_at = ?')
    values.push(data.dismissed_at)
  }
  if (data.workflow_id) {
    updates.push('workflow_id = ?')
    values.push(data.workflow_id)
  }

  if (updates.length === 0) return

  values.push(id)
  await db.prepare(`UPDATE trend_alerts SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
}

export async function getWinnerPatterns(db: D1Database, domainId?: string, minConfidence = 0.3) {
  const query = domainId
    ? 'SELECT * FROM winner_patterns WHERE domain_id = ? AND confidence >= ? ORDER BY confidence DESC'
    : 'SELECT * FROM winner_patterns WHERE confidence >= ? ORDER BY confidence DESC'

  const params = domainId ? [domainId, minConfidence] : [minConfidence]
  const result = await db.prepare(query).bind(...params).all()
  return result.results
}

export async function createWinnerPattern(
  db: D1Database,
  data: {
    domain_id?: string
    category_id?: string
    pattern_type: string
    pattern_value: Record<string, unknown>
  }
) {
  const id = generateId()
  await db
    .prepare(
      `INSERT INTO winner_patterns (id, domain_id, category_id, pattern_type, pattern_value)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.domain_id || null,
      data.category_id || null,
      data.pattern_type,
      JSON.stringify(data.pattern_value)
    )
    .run()
  return db.prepare('SELECT * FROM winner_patterns WHERE id = ?').bind(id).first()
}

// ============================================================
// Platform & Social Channel Queries
// ============================================================

export async function getAllPlatforms(db: D1Database, activeOnly = true) {
  const query = activeOnly
    ? 'SELECT * FROM platforms WHERE is_active = 1 ORDER BY sort_order ASC'
    : 'SELECT * FROM platforms ORDER BY sort_order ASC'
  const result = await db.prepare(query).all()
  return result.results
}

export async function getAllSocialChannels(db: D1Database, activeOnly = true) {
  const query = activeOnly
    ? 'SELECT * FROM social_channels WHERE is_active = 1 ORDER BY sort_order ASC'
    : 'SELECT * FROM social_channels ORDER BY sort_order ASC'
  const result = await db.prepare(query).all()
  return result.results
}

// ============================================================
// AI Model Queries
// ============================================================

export async function getAllAIModels(db: D1Database) {
  const result = await db.prepare('SELECT * FROM ai_models ORDER BY rank ASC').all()
  return result.results
}

export async function getAIModelById(db: D1Database, id: string) {
  const result = await db.prepare('SELECT * FROM ai_models WHERE id = ?').bind(id).first()
  return result
}

export async function updateAIModel(db: D1Database, id: string, data: Record<string, unknown>) {
  const allowedFields = ['status', 'rate_limit_reset_at', 'daily_limit_reset_at', 'last_used_at', 'total_calls', 'total_failures']
  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`)
      values.push(value)
    }
  }

  if (updates.length === 0) return null

  updates.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)

  await db.prepare(`UPDATE ai_models SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  return getAIModelById(db, id)
}

// ============================================================
// Utility Functions
// ============================================================

function generateId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
