import { Hono } from 'hono'
import type { Env } from '../env'
import { ProductWorkflow } from '../services/workflow-engine'
import { buildListingPayload } from './publish'
import { publishToPlatform } from '../services/publishers'
import { browse } from '../services/browser'
import { callAISimple } from '../services/shared'
import { safeJson } from '../services/shared'
import { checkNiche } from '../services/niche-dedup'

// ============================================================
// CEO Agent — a conversational, tool-using manager with full control.
// The owner talks to it in plain language; it decides which tool(s) to
// run (query, create, re-run, delete, approve/reject, publish), executes
// them, and reports back. Powered by the same free Groq/failover engine.
// ============================================================

export const agentRoutes = new Hono<{ Bindings: Env }>()

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AgentStep {
  tool: string
  args: Record<string, unknown>
  ok: boolean
  summary: string
  product_id?: string
  screenshot_url?: string
}

const MAX_TURNS = 6

const jsonFromModel = safeJson

async function callAI(env: Env, prompt: string, outputFormat: 'json' | 'text' = 'json'): Promise<string> {
  return callAISimple(env, prompt, { taskType: 'manager_plan', outputFormat })
}

// Final pass: turn whatever the CEO gathered/did this turn into a warm,
// well-formatted written answer. This runs when the model called tools but
// never produced a {"reply"}, so the owner always gets a real message —
// never a bare "Done." status line.
async function composeReply(
  env: Env,
  opts: { message: string; convo: string; overview: string; scratch: string[] },
): Promise<string> {
  const work = opts.scratch.length ? opts.scratch.join('\n') : '(no actions were needed)'
  const prompt = `You are the CEO Manager of NEXUS, an AI digital-product engine, replying to the owner. Be warm, concrete and concise.

Write your reply in clean Markdown so it's easy to read:
- Open with one short sentence answering directly.
- Use **bold** for the key numbers/names.
- Use a numbered list for step-by-step plans, or a bullet list for items.
- Use a short "## Heading" only when it genuinely helps; keep it tight.
- Do NOT output JSON, do NOT mention "tools", and do NOT show raw internal IDs unless the owner asked for them.

LIVE SNAPSHOT:
${opts.overview}

Conversation so far:
${opts.convo || '(new conversation)'}

The owner just said:
"${opts.message}"

What you did / learned this turn:
${work}

Now write your final reply to the owner:`
  const out = await callAI(env, prompt, 'text')
  return (out || '').trim()
}

async function getCatalog(env: Env) {
  const cats = await env.DB.prepare(`
    SELECT c.slug AS category_slug, c.name AS category_name,
           d.slug AS domain_slug, d.name AS domain_name
    FROM categories c JOIN domains d ON c.domain_id = d.id
    WHERE c.is_active = 1 AND d.is_active = 1
    ORDER BY d.name, c.name
  `).all<any>()
  return cats.results || []
}

async function getOverview(env: Env): Promise<string> {
  const counts = await env.DB.prepare(`
    SELECT status, COUNT(*) AS n FROM products GROUP BY status
  `).all<any>()
  const recent = await env.DB.prepare(`
    SELECT id, name, status, ai_score FROM products ORDER BY created_at DESC LIMIT 10
  `).all<any>()
  const byStatus = (counts.results || []).map((r) => `${r.status}: ${r.n}`).join(', ') || 'no products yet'
  const list = (recent.results || [])
    .map((r) => `  - "${r.name || 'Untitled'}" [${(r.id as string).slice(0, 8)}] status=${r.status}${typeof r.ai_score === 'number' ? ` score=${r.ai_score}` : ''}`)
    .join('\n')
  return `Product counts → ${byStatus}\nMost recent products:\n${list || '  (none)'}`
}

const KEY_NAMES = ['GROQ_API_KEY', 'OPENAI_API_KEY', 'FAL_KEY', 'GUMROAD_ACCESS_TOKEN', 'SHOPIFY_STORE', 'SHOPIFY_ADMIN_TOKEN', 'PUBLISH_WEBHOOK_URL']
async function getKeyStatus(env: Env): Promise<string> {
  const out: string[] = []
  for (const k of KEY_NAMES) {
    let set = false
    try {
      const v = await env.CONFIG.get(`secret:${k}`)
      set = Boolean(v)
    } catch {}
    const envVal = (env as unknown as Record<string, unknown>)[k]
    if (!set && typeof envVal === 'string' && envVal.length > 0) set = true
    out.push(`${k}: ${set ? 'set' : 'not set'}`)
  }
  return `${out.join(', ')}. Note: AI text + images already run for free on the built-in engine (Groq + Cloudflare Workers AI) even with no keys set; these keys only add optional providers and real store/social publishing.`
}

// Resolve a loose product reference (full id, 8-char prefix, or name) to a row.
async function resolveProduct(env: Env, ref: string): Promise<any | null> {
  const r = (ref || '').trim()
  if (!r) return null
  const exact = await env.DB.prepare('SELECT id, name, status FROM products WHERE id = ?').bind(r).first<any>()
  if (exact) return exact
  const prefix = await env.DB.prepare('SELECT id, name, status FROM products WHERE id LIKE ? LIMIT 1').bind(`${r}%`).first<any>()
  if (prefix) return prefix
  const byName = await env.DB.prepare('SELECT id, name, status FROM products WHERE name LIKE ? ORDER BY created_at DESC LIMIT 1').bind(`%${r}%`).first<any>()
  return byName || null
}

async function createOneProduct(env: Env, ctx: ExecutionContext, p: any, validSlugs: Set<string>): Promise<AgentStep> {
  const domain_slug = (p.domain_slug || '').trim()
  const category_slug = (p.category_slug || '').trim()
  const label = p.product_name || p.niche || 'product'
  if (!domain_slug || !category_slug || !validSlugs.has(`${domain_slug}/${category_slug}`)) {
    return { tool: 'create_product', args: p, ok: false, summary: `Could not create "${label}" — no matching domain/category slug. Pick from the catalog.` }
  }
  // Shared niche dedup: refuse to start a build for a duplicate / generic
  // niche so the agent loop stops piling up "essentials" rows.
  const guard = await checkNiche(env, p.niche || p.product_name)
  if (!guard.ok) {
    return { tool: 'create_product', args: p, ok: false, summary: `Skipped "${label}": ${guard.reason}` }
  }
  try {
    const domain = await env.DB.prepare('SELECT id FROM domains WHERE slug = ? AND is_active = 1').bind(domain_slug).first<any>()
    const category = await env.DB.prepare('SELECT id FROM categories WHERE slug = ? AND domain_id = ? AND is_active = 1').bind(category_slug, domain.id).first<any>()
    const productId = crypto.randomUUID()
    const runId = crypto.randomUUID()
    const now = new Date().toISOString()
    const userInput = { product_name: p.product_name, niche: p.niche, description: p.description, keywords: p.keywords, let_ai_price: true }
    await env.DB.prepare(`
      INSERT INTO products (id, domain_id, category_id, name, niche, user_input, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)
    `).bind(productId, domain.id, category.id, p.product_name ?? null, p.niche ?? null, JSON.stringify(userInput), now, now).run()
    await env.DB.prepare(`INSERT INTO workflow_runs (id, product_id, status, created_at) VALUES (?, ?, 'queued', ?)`).bind(runId, productId, now).run()
    const engine = new ProductWorkflow(env)
    ctx.waitUntil(engine.run(runId, productId, domain_slug, category_slug, userInput))
    return { tool: 'create_product', args: p, ok: true, product_id: productId, summary: `Dispatched product agent for "${label}" (${domain_slug}/${category_slug}). The 15-step team is building it now.` }
  } catch (err) {
    return { tool: 'create_product', args: p, ok: false, summary: `Failed to start "${label}": ${err instanceof Error ? err.message : 'error'}` }
  }
}

async function rerunWorkflow(env: Env, ctx: ExecutionContext, prod: any): Promise<AgentStep> {
  const full = await env.DB.prepare(`
    SELECT p.id, p.name, p.niche, p.user_input, d.slug AS domain_slug, c.slug AS category_slug
    FROM products p JOIN domains d ON p.domain_id = d.id JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).bind(prod.id).first<any>()
  if (!full) return { tool: 'run_workflow', args: { product: prod.id }, ok: false, summary: 'Product not found.' }
  const runId = crypto.randomUUID()
  const now = new Date().toISOString()
  let userInput: Record<string, unknown> = {}
  try { userInput = full.user_input ? JSON.parse(full.user_input) : {} } catch {}
  await env.DB.prepare('UPDATE products SET status = ?, updated_at = ? WHERE id = ?').bind('running', now, full.id).run()
  await env.DB.prepare(`INSERT INTO workflow_runs (id, product_id, status, created_at) VALUES (?, ?, 'queued', ?)`).bind(runId, full.id, now).run()
  const engine = new ProductWorkflow(env)
  ctx.waitUntil(engine.run(runId, full.id, full.domain_slug, full.category_slug, userInput))
  return { tool: 'run_workflow', args: { product: full.id }, ok: true, product_id: full.id, summary: `Re-running the 15-step team on "${full.name || 'Untitled'}".` }
}

async function publishProduct(env: Env, prod: any): Promise<AgentStep> {
  const variants = await env.DB.prepare(`
    SELECT pv.*, pl.url as platform_url, pl.slug as platform_slug, pl.name as platform_name
    FROM platform_variants pv JOIN platforms pl ON pv.platform_id = pl.id
    WHERE pv.product_id = ? AND pv.status != 'published'
  `).bind(prod.id).all<any>()
  const list = variants.results || []
  if (list.length === 0) {
    return { tool: 'publish_product', args: { product: prod.id }, ok: false, summary: `"${prod.name || 'Untitled'}" has no unpublished platform variants to publish.` }
  }
  const results: string[] = []
  let published = 0
  for (const variant of list) {
    try {
      const payload = await buildListingPayload(env, variant)
      const outcome = await publishToPlatform(payload, env)
      if (outcome.status === 'success') {
        const now = new Date().toISOString()
        const url = outcome.url || `${variant.platform_url || '#'}/${variant.id}`
        await env.DB.prepare(`UPDATE platform_variants SET status = 'published', published_at = ?, published_url = ? WHERE id = ?`).bind(now, url, variant.id).run()
        published++
        results.push(`${variant.platform_name}: published`)
      } else {
        results.push(`${variant.platform_name}: ${outcome.error || 'failed'}`)
      }
    } catch (err) {
      results.push(`${variant.platform_name}: ${err instanceof Error ? err.message : 'error'}`)
    }
  }
  if (published === list.length) {
    await env.DB.prepare(`UPDATE products SET status = 'published', updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), prod.id).run()
  }
  return { tool: 'publish_product', args: { product: prod.id }, ok: published > 0, summary: `Publish attempt for "${prod.name || 'Untitled'}": ${results.join('; ')}` }
}

agentRoutes.post('/agent', async (c) => {
  const body = await c.req.json<{ message?: string; history?: ChatMessage[] }>()
  const message = (body.message || '').trim()
  const history = Array.isArray(body.history) ? body.history.slice(-8) : []
  if (!message) return c.json({ error: 'message is required' }, 400)

  const cats = await getCatalog(c.env)
  const catalog = cats.map((r) => `${r.domain_slug}/${r.category_slug} (${r.domain_name} → ${r.category_name})`)
  const validSlugs = new Set(cats.map((r) => `${r.domain_slug}/${r.category_slug}`))

  const overview = await getOverview(c.env)
  const convo = history.map((m) => `${m.role === 'user' ? 'CEO' : 'You'}: ${m.content}`).join('\n')

  const steps: AgentStep[] = []
  const scratch: string[] = []
  const executed = new Set<string>()
  let reply = ''

  const systemPrompt = `You are the CEO Manager of NEXUS, an AI digital-product engine. You have FULL control and you talk to the owner like a capable chief of staff: warm, brief, action-oriented.

You operate by choosing TOOLS. Each turn, respond with ONLY a JSON object — either a tool call or a final reply.

TOOLS:
- {"tool":"list_products","args":{"status":"<optional: running|pending_review|approved|rejected|published>","query":"<optional name search>"}}
- {"tool":"create_products","args":{"products":[{"domain_slug":"","category_slug":"","product_name":"","niche":"","description":"one line","keywords":"comma,separated"}]}}  // up to 5, slugs MUST be from the catalog
- {"tool":"run_workflow","args":{"product":"<id, id-prefix, or name>"}}  // (re)build a product with the agent team
- {"tool":"approve_product","args":{"product":"<ref>"}}
- {"tool":"reject_product","args":{"product":"<ref>","reason":"<short>"}}
- {"tool":"delete_product","args":{"product":"<ref>"}}
- {"tool":"publish_product","args":{"product":"<ref>"}}
- {"tool":"key_status","args":{}}  // which provider API keys are configured
- {"tool":"browse_web","args":{"url":"https://...","instruction":"<what to find on the page>"}}  // open a real web page in a headless browser, read it, and screenshot it
- {"tool":"update_settings","args":{"key":"<setting_key>","value":"<new_value>"}}  // update a dashboard setting
- {"tool":"reorder_sidebar","args":{"sections":[{"title":"...","items":[{"to":"/path","label":"Label"}]}]}}  // rearrange sidebar sections
- {"tool":"manage_domain","args":{"action":"create|update|delete","slug":"...","name":"...","categories":[]}}  // CRUD domains & categories
- {"tool":"manage_schedule","args":{"action":"create|update|delete|toggle","id":"...","schedule":{"name":"...","task_type":"product|blog","frequency":"daily|weekly","topic":"..."}}}  // manage scheduled tasks
- {"tool":"bulk_action","args":{"action":"approve_all|reject_all|delete_all","filter":{"status":"...","domain":"..."}}}  // batch-update products
- {"tool":"change_theme","args":{"theme":"dark|light|auto"}}  // switch dashboard theme
- {"tool":"export_data","args":{"type":"products|sales|analytics","format":"csv|json"}}  // generate a data export
- {"tool":"dashboard_layout","args":{"layout":"compact|expanded|minimal"}}  // change dashboard layout density

When you have enough to answer, respond with: {"reply":"<your message to the owner>"}

RULES:
- Use the live snapshot below to answer simple questions directly with a {"reply"} — don't call a tool you don't need.
- Only use catalog slugs. If none fit the owner's request, say so in your reply and suggest creating a domain/category.
- Never invent product IDs; reference products by name or the 8-char id shown.
- Be decisive: if the owner clearly wants action, take it, then report what you did.

SAFETY — CRITICAL:
If the owner asks you to do something that could get them banned, fined, or in legal trouble, you MUST warn them BEFORE executing. Risky actions include:
- Scraping websites (Google Maps, LinkedIn, Facebook, Instagram, etc.) — violates their Terms of Service, can result in IP bans, account suspension, or lawsuits.
- Mass/bulk emailing without consent — violates CAN-SPAM (US) and GDPR (EU), can get their domain blacklisted permanently.
- Fake reviews, fake accounts, or impersonation — platform bans and potential legal action.
- Copyright infringement — using others' content, images, or designs without permission.
- Automated social media spam — mass following, mass DMing, bot comments — results in account suspension.
- Selling counterfeit or trademarked items — legal liability and platform bans.
- Harvesting personal data without consent — GDPR fines up to 4% of revenue.

When you detect a risky request, respond with a {"reply"} that:
1. Starts with "⚠️ RISK WARNING:" 
2. Explains what could happen (ban, fine, legal trouble)
3. Suggests a LEGAL alternative that achieves the same goal
4. Asks the owner to confirm if they still want to proceed
Do NOT execute the risky action unless the owner explicitly confirms after the warning.

CATALOG (valid domain/category slugs):
${catalog.length ? catalog.join('\n') : '(none configured yet)'}

LIVE SNAPSHOT:
${overview}`

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const prompt = `${systemPrompt}

Conversation so far:
${convo || '(new conversation)'}

Actions you have already taken this turn:
${scratch.length ? scratch.join('\n') : '(none yet)'}

The owner just said:
"${message}"

Respond with ONLY one JSON object (a tool call or a final {"reply"}).`

      const out = await callAI(c.env, prompt)
      const parsed = jsonFromModel(out)
      if (!parsed) { reply = out.trim() || 'Done.'; break }
      if (typeof parsed.reply === 'string' && !parsed.tool) { reply = parsed.reply; break }

      const tool = String(parsed.tool || '')
      const args = (parsed.args && typeof parsed.args === 'object') ? parsed.args : {}

      // Never run the same tool+args twice — prevents duplicate creates/deletes
      // and stops the model from looping on a read it already has.
      const sig = `${tool}:${JSON.stringify(args)}`
      if (executed.has(sig)) {
        // The model is repeating a tool it already ran — it has nothing new to
        // do, so stop looping and synthesize the final answer below.
        break
      }
      executed.add(sig)

      if (tool === 'list_products') {
        const status = typeof args.status === 'string' ? args.status : null
        const query = typeof args.query === 'string' ? args.query : null
        let sql = 'SELECT id, name, status, ai_score FROM products'
        const where: string[] = []
        const binds: unknown[] = []
        if (status) { where.push('status = ?'); binds.push(status) }
        if (query) { where.push('name LIKE ?'); binds.push(`%${query}%`) }
        if (where.length) sql += ' WHERE ' + where.join(' AND ')
        sql += ' ORDER BY created_at DESC LIMIT 20'
        const rows = await c.env.DB.prepare(sql).bind(...binds).all<any>()
        const found = rows.results || []
        // Full detail (with ids) goes to the model's scratchpad; the action
        // card shown to the owner stays short and readable.
        const detail = found.map((r) => `"${r.name || 'Untitled'}" [${(r.id as string).slice(0, 8)}] ${r.status}${typeof r.ai_score === 'number' ? ` (${r.ai_score})` : ''}`).join('; ') || 'no matching products'
        const cardSummary = found.length
          ? `Found ${found.length} product${found.length > 1 ? 's' : ''}: ${found.slice(0, 5).map((r) => r.name || 'Untitled').join(', ')}${found.length > 5 ? `, +${found.length - 5} more` : ''}.`
          : 'No matching products.'
        steps.push({ tool, args, ok: true, summary: cardSummary })
        scratch.push(`list_products → ${detail}`)
        continue
      }

      if (tool === 'create_products') {
        const products = Array.isArray(args.products) ? args.products.slice(0, 5) : []
        if (products.length === 0) { scratch.push('create_products → no products specified'); steps.push({ tool, args, ok: false, summary: 'No products specified.' }); continue }
        for (const p of products) {
          const step = await createOneProduct(c.env, c.executionCtx, p, validSlugs)
          steps.push(step)
          scratch.push(`create_product → ${step.summary}`)
        }
        continue
      }

      if (tool === 'key_status') {
        const summary = await getKeyStatus(c.env)
        steps.push({ tool, args, ok: true, summary })
        scratch.push(`key_status → ${summary}`)
        continue
      }

      if (tool === 'browse_web') {
        const url = typeof args.url === 'string' ? args.url : ''
        const instruction = typeof args.instruction === 'string' ? args.instruction : ''
        if (!url) {
          steps.push({ tool, args, ok: false, summary: 'No URL given to browse.' })
          scratch.push('browse_web → no url')
          continue
        }
        const r = await browse(c.env, url)
        if (!r.ok) {
          steps.push({ tool, args, ok: false, summary: `Could not open ${url}: ${r.error}` })
          scratch.push(`browse_web → failed: ${r.error}`)
          continue
        }
        const screenshotUrl = r.screenshotKey ? `/api/assets/r2/${r.screenshotKey}` : undefined
        const snippet = (r.text || '').slice(0, 4000)
        steps.push({ tool, args, ok: true, summary: `Opened ${r.title || url} and captured a screenshot.`, screenshot_url: screenshotUrl })
        scratch.push(`browse_web ${url}${instruction ? ` (goal: ${instruction})` : ''} → title: "${r.title || ''}"; page text: ${snippet || '(empty)'}`)
        continue
      }

      // Tools that operate on a single existing product.
      if (['run_workflow', 'approve_product', 'reject_product', 'delete_product', 'publish_product'].includes(tool)) {
        const ref = typeof args.product === 'string' ? args.product : ''
        const prod = await resolveProduct(c.env, ref)
        if (!prod) {
          const summary = `No product matched "${ref}".`
          steps.push({ tool, args, ok: false, summary })
          scratch.push(`${tool} → ${summary}`)
          continue
        }
        let step: AgentStep
        if (tool === 'run_workflow') {
          step = await rerunWorkflow(c.env, c.executionCtx, prod)
        } else if (tool === 'approve_product') {
          const now = new Date().toISOString()
          await c.env.DB.prepare('UPDATE products SET status = ?, updated_at = ? WHERE id = ?').bind('approved', now, prod.id).run()
          step = { tool, args, ok: true, product_id: prod.id, summary: `Approved "${prod.name || 'Untitled'}".` }
        } else if (tool === 'reject_product') {
          const now = new Date().toISOString()
          const reason = typeof args.reason === 'string' ? args.reason : 'Rejected by CEO'
          await c.env.DB.prepare(`UPDATE products SET status = 'rejected', graveyard_at = ?, graveyard_reason = ?, updated_at = ? WHERE id = ?`).bind(now, reason, now, prod.id).run()
          step = { tool, args, ok: true, product_id: prod.id, summary: `Rejected "${prod.name || 'Untitled'}" → ${reason}.` }
        } else if (tool === 'delete_product') {
          const assets = await c.env.DB.prepare('SELECT r2_key FROM assets WHERE product_id = ?').bind(prod.id).all<any>()
          await Promise.allSettled([
            c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(prod.id).run(),
            ...(assets.results || []).map((a: any) => (a.r2_key ? c.env.ASSETS.delete(a.r2_key) : Promise.resolve())),
            c.env.CONFIG.delete(`product:${prod.id}`),
          ])
          step = { tool, args, ok: true, summary: `Deleted "${prod.name || 'Untitled'}" and its files.` }
        } else {
          step = await publishProduct(c.env, prod)
        }
        steps.push(step)
        scratch.push(`${tool} → ${step.summary}`)
        continue
      }

      // ---------- update_settings ----------
      if (tool === 'update_settings') {
        const key = typeof args.key === 'string' ? args.key : ''
        const value = args.value
        if (!key) { scratch.push('update_settings → no key'); steps.push({ tool, args, ok: false, summary: 'No setting key provided.' }); continue }
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
        const now = new Date().toISOString()
        await c.env.DB.prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
        ).bind(key, stringValue, now, stringValue, now).run()
        const summary = `Updated setting "${key}" to "${stringValue}".`
        steps.push({ tool, args, ok: true, summary })
        scratch.push(`update_settings → ${summary}`)
        continue
      }

      // ---------- reorder_sidebar ----------
      if (tool === 'reorder_sidebar') {
        const sections = Array.isArray(args.sections) ? args.sections : []
        if (sections.length === 0) { scratch.push('reorder_sidebar → empty'); steps.push({ tool, args, ok: false, summary: 'No sections provided.' }); continue }
        const now = new Date().toISOString()
        const val = JSON.stringify(sections)
        await c.env.DB.prepare(
          `INSERT INTO user_preferences (id, key, value, updated_at) VALUES (lower(hex(randomblob(8))), 'sidebar_order', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
        ).bind(val, now, val, now).run()
        steps.push({ tool, args, ok: true, summary: `Sidebar reordered with ${sections.length} section(s).` })
        scratch.push(`reorder_sidebar → saved ${sections.length} sections`)
        continue
      }

      // ---------- manage_domain ----------
      if (tool === 'manage_domain') {
        const action = typeof args.action === 'string' ? args.action : ''
        const slug = typeof args.slug === 'string' ? args.slug : ''
        const name = typeof args.name === 'string' ? args.name : ''
        const categories = Array.isArray(args.categories) ? args.categories : []
        const now = new Date().toISOString()
        let summary = ''
        if (action === 'create') {
          if (!slug || !name) { summary = 'Need slug and name to create a domain.'; steps.push({ tool, args, ok: false, summary }); scratch.push(`manage_domain → ${summary}`); continue }
          const id = crypto.randomUUID()
          await c.env.DB.prepare(`INSERT INTO domains (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).bind(id, name, slug, now, now).run()
          for (const cat of categories) {
            const catName = typeof cat === 'string' ? cat : (cat as Record<string, unknown>).name as string ?? ''
            const catSlug = typeof cat === 'string' ? cat.toLowerCase().replace(/[^a-z0-9]+/g, '-') : (cat as Record<string, unknown>).slug as string ?? catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            if (catName) await c.env.DB.prepare(`INSERT INTO categories (id, domain_id, name, slug, created_at) VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?)`).bind(id, catName, catSlug, now).run()
          }
          await c.env.CONFIG.delete('config:domains')
          summary = `Created domain "${name}" (${slug})${categories.length ? ` with ${categories.length} categories` : ''}.`
        } else if (action === 'update') {
          if (!slug) { summary = 'Need slug to update.'; steps.push({ tool, args, ok: false, summary }); scratch.push(`manage_domain → ${summary}`); continue }
          const sets: string[] = ['updated_at = ?']; const vals: unknown[] = [now]
          if (name) { sets.push('name = ?'); vals.push(name) }
          vals.push(slug)
          await c.env.DB.prepare(`UPDATE domains SET ${sets.join(', ')} WHERE slug = ?`).bind(...vals).run()
          await c.env.CONFIG.delete('config:domains')
          summary = `Updated domain "${slug}".`
        } else if (action === 'delete') {
          if (!slug) { summary = 'Need slug to delete.'; steps.push({ tool, args, ok: false, summary }); scratch.push(`manage_domain → ${summary}`); continue }
          await c.env.DB.prepare('DELETE FROM domains WHERE slug = ?').bind(slug).run()
          await c.env.CONFIG.delete('config:domains')
          summary = `Deleted domain "${slug}".`
        } else {
          summary = `Unknown action "${action}". Use create, update, or delete.`
          steps.push({ tool, args, ok: false, summary }); scratch.push(`manage_domain → ${summary}`); continue
        }
        steps.push({ tool, args, ok: true, summary })
        scratch.push(`manage_domain → ${summary}`)
        continue
      }

      // ---------- manage_schedule ----------
      if (tool === 'manage_schedule') {
        const action = typeof args.action === 'string' ? args.action : ''
        const id = typeof args.id === 'string' ? args.id : ''
        const sched = (args.schedule && typeof args.schedule === 'object') ? args.schedule as Record<string, unknown> : {}
        const now = new Date().toISOString()
        let summary = ''
        if (action === 'create') {
          const name = typeof sched.name === 'string' ? sched.name : 'Untitled Schedule'
          const newId = crypto.randomUUID()
          const taskType = sched.task_type === 'product' ? 'product' : 'blog'
          const frequency = sched.frequency === 'weekly' ? 'weekly' : 'daily'
          await c.env.DB.prepare(
            `INSERT INTO schedules (id, name, task_type, topic, instructions, frequency, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
          ).bind(newId, name, taskType, typeof sched.topic === 'string' ? sched.topic : null, typeof sched.instructions === 'string' ? sched.instructions : null, frequency, now).run()
          summary = `Created schedule "${name}" (${frequency}).`
        } else if (action === 'toggle') {
          if (!id) { summary = 'Need schedule id to toggle.'; steps.push({ tool, args, ok: false, summary }); scratch.push(`manage_schedule → ${summary}`); continue }
          const row = await c.env.DB.prepare('SELECT active FROM schedules WHERE id = ?').bind(id).first<{ active: number }>()
          const newVal = row ? (row.active ? 0 : 1) : 1
          await c.env.DB.prepare('UPDATE schedules SET active = ? WHERE id = ?').bind(newVal, id).run()
          summary = `Toggled schedule ${id.slice(0, 8)} to ${newVal ? 'active' : 'paused'}.`
        } else if (action === 'update') {
          if (!id) { summary = 'Need schedule id to update.'; steps.push({ tool, args, ok: false, summary }); scratch.push(`manage_schedule → ${summary}`); continue }
          const sets: string[] = []; const vals: unknown[] = []
          if (typeof sched.name === 'string') { sets.push('name = ?'); vals.push(sched.name) }
          if (typeof sched.topic === 'string') { sets.push('topic = ?'); vals.push(sched.topic) }
          if (typeof sched.frequency === 'string') { sets.push('frequency = ?'); vals.push(sched.frequency) }
          if (sets.length) { vals.push(id); await c.env.DB.prepare(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run() }
          summary = `Updated schedule ${id.slice(0, 8)}.`
        } else if (action === 'delete') {
          if (!id) { summary = 'Need schedule id to delete.'; steps.push({ tool, args, ok: false, summary }); scratch.push(`manage_schedule → ${summary}`); continue }
          await c.env.DB.prepare('DELETE FROM schedules WHERE id = ?').bind(id).run()
          summary = `Deleted schedule ${id.slice(0, 8)}.`
        } else {
          summary = `Unknown action "${action}".`; steps.push({ tool, args, ok: false, summary }); scratch.push(`manage_schedule → ${summary}`); continue
        }
        steps.push({ tool, args, ok: true, summary })
        scratch.push(`manage_schedule → ${summary}`)
        continue
      }

      // ---------- bulk_action ----------
      if (tool === 'bulk_action') {
        const action = typeof args.action === 'string' ? args.action : ''
        const filter = (args.filter && typeof args.filter === 'object') ? args.filter as Record<string, unknown> : {}
        const now = new Date().toISOString()
        let where = '1=1'; const binds: unknown[] = []
        if (typeof filter.status === 'string') { where += ' AND status = ?'; binds.push(filter.status) }
        if (typeof filter.domain === 'string') {
          where += ' AND domain_id IN (SELECT id FROM domains WHERE slug = ?)'; binds.push(filter.domain)
        }
        let summary = ''
        if (action === 'approve_all') {
          const r = await c.env.DB.prepare(`UPDATE products SET status = 'approved', updated_at = ? WHERE ${where}`).bind(now, ...binds).run()
          summary = `Approved ${r.meta.changes} product(s).`
        } else if (action === 'reject_all') {
          const r = await c.env.DB.prepare(`UPDATE products SET status = 'rejected', graveyard_at = ?, graveyard_reason = 'Bulk rejected by CEO', updated_at = ? WHERE ${where}`).bind(now, now, ...binds).run()
          summary = `Rejected ${r.meta.changes} product(s).`
        } else if (action === 'delete_all') {
          const r = await c.env.DB.prepare(`DELETE FROM products WHERE ${where}`).bind(...binds).run()
          summary = `Deleted ${r.meta.changes} product(s).`
        } else {
          summary = `Unknown bulk action "${action}".`; steps.push({ tool, args, ok: false, summary }); scratch.push(`bulk_action → ${summary}`); continue
        }
        steps.push({ tool, args, ok: true, summary })
        scratch.push(`bulk_action → ${summary}`)
        continue
      }

      // ---------- change_theme ----------
      if (tool === 'change_theme') {
        const theme = typeof args.theme === 'string' ? args.theme : 'dark'
        const now = new Date().toISOString()
        await c.env.DB.prepare(
          `INSERT INTO user_preferences (id, key, value, updated_at) VALUES (lower(hex(randomblob(8))), 'theme', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
        ).bind(theme, now, theme, now).run()
        steps.push({ tool, args, ok: true, summary: `Theme changed to "${theme}".` })
        scratch.push(`change_theme → ${theme}`)
        continue
      }

      // ---------- export_data ----------
      if (tool === 'export_data') {
        const dataType = typeof args.type === 'string' ? args.type : 'products'
        const format = typeof args.format === 'string' ? args.format : 'json'
        let rows: Record<string, unknown>[] = []
        if (dataType === 'products') {
          const r = await c.env.DB.prepare('SELECT id, name, niche, status, ai_score, created_at FROM products ORDER BY created_at DESC LIMIT 500').all<Record<string, unknown>>()
          rows = r.results ?? []
        } else if (dataType === 'sales' || dataType === 'analytics') {
          const r = await c.env.DB.prepare('SELECT id, name, status, ai_score, revenue_estimate, created_at FROM products WHERE status = \'published\' ORDER BY created_at DESC LIMIT 500').all<Record<string, unknown>>()
          rows = r.results ?? []
        }
        let content: string
        if (format === 'csv' && rows.length) {
          const headers = Object.keys(rows[0])
          const csvRows = rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
          content = [headers.join(','), ...csvRows].join('\n')
        } else {
          content = JSON.stringify(rows, null, 2)
        }
        const key = `exports/${dataType}_${Date.now()}.${format}`
        await c.env.ASSETS.put(key, content, { httpMetadata: { contentType: format === 'csv' ? 'text/csv' : 'application/json' } })
        const downloadUrl = `/api/assets/r2/${key}`
        steps.push({ tool, args, ok: true, summary: `Exported ${rows.length} ${dataType} rows as ${format.toUpperCase()}: ${downloadUrl}` })
        scratch.push(`export_data → ${rows.length} rows → ${downloadUrl}`)
        continue
      }

      // ---------- dashboard_layout ----------
      if (tool === 'dashboard_layout') {
        const layout = typeof args.layout === 'string' ? args.layout : 'expanded'
        const now = new Date().toISOString()
        await c.env.DB.prepare(
          `INSERT INTO user_preferences (id, key, value, updated_at) VALUES (lower(hex(randomblob(8))), 'dashboard_layout', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
        ).bind(layout, now, layout, now).run()
        steps.push({ tool, args, ok: true, summary: `Dashboard layout set to "${layout}".` })
        scratch.push(`dashboard_layout → ${layout}`)
        continue
      }

      // Unknown tool — stop and let the model summarize.
      scratch.push(`Unknown tool "${tool}". Wrap up with a reply.`)
    }
  } catch (err) {
    return c.json({
      reply: 'I hit a snag reaching the AI engine. Try again in a moment.',
      steps,
      error: err instanceof Error ? err.message : 'agent_error',
    })
  }

  // The model ran tools but never wrote a final {"reply"} — compose a proper,
  // formatted written answer from what it did so the owner never sees a bare
  // "Done." status line.
  if (!reply) {
    try {
      reply = await composeReply(c.env, { message, convo, overview, scratch })
    } catch {
      reply = ''
    }
  }
  if (!reply) {
    reply = steps.length
      ? `Done. ${steps.filter((s) => s.ok).length}/${steps.length} action(s) completed.`
      : 'Understood.'
  }

  // Collapse duplicate action cards (e.g. the model ran list_products a few
  // times) so the owner sees a clean, de-duped list of what happened.
  const seenCards = new Set<string>()
  const cleanSteps = steps.filter((s) => {
    const k = `${s.tool}:${s.summary}`
    if (seenCards.has(k)) return false
    seenCards.add(k)
    return true
  })
  return c.json({ reply, steps: cleanSteps })
})
