import { Hono } from 'hono'
import type { Env } from '../env'
import type { ActionResult } from '@posteragent/types/nexus'
import { ProductWorkflow } from '../services/workflow-engine'
import { callAISimple, safeJson } from '../services/shared'
import { executeAction, type LiveAction, type LiveActionType } from '../services/action-executor'
import { checkNiche } from '../services/niche-dedup'


interface ManagerMessage {
  role: 'user' | 'assistant'
  content: string
}


interface PlannedProduct {
  domain_slug?: string
  category_slug?: string
  product_name?: string
  niche?: string
  description?: string
  keywords?: string
}


interface ManagerAction {
  type: 'create_product' | 'note' | 'browse' | 'list_product' | 'check_sales' | 'create_pod' | 'run_campaign' | 'analyze_niche'
  domain_slug?: string
  category_slug?: string
  product_name?: string
  niche?: string
  description?: string
  product_id?: string
  workflow_id?: string
  status?: 'started' | 'failed'
  detail?: string
  url?: string
  instruction?: string
  platform?: string
}


const safeParse = safeJson


async function callAI(env: Env, prompt: string): Promise<string> {
  return callAISimple(env, prompt, { taskType: 'manager_plan', outputFormat: 'json' })
}


// POST /manager/chat — the CEO Manager. Interprets a goal, plans products,
// kicks off the agents (workflows), and reports back.
// T14: same short-circuit logic as in agent.ts — when the user asks a
// "read" question and there's no data, skip the LLM call entirely. The
// frontend (CEO page) calls both /manager/chat and /agent/agent in
// parallel; without this guard, /manager/chat would still spend a model
// call just to say "no data".
const EMPTY_READ_PATTERNS: RegExp[] = [
  /\b(sold|sales|revenue|earn(ed|ing)?|income|profit)\b/i,
  /\b(best|top|highest|leading)\s+(seller|sellers|product|products|performer)/i,
  /\b(list|show|see|view|browse)\s+(my\s+|the\s+|all\s+)?(products?|catalog|inventory)\b/i,
  /\b(what|which)\s+products?\b/i,
  /\b(performance|status|overview|dashboard|stats|summary)\b/i,
  /\bhow\s+(many|much)\b/i,
]

const ACTION_INTENT_PATTERNS: RegExp[] = [
  /\b(create|build|make|generate|dispatch|spin\s*up|start|launch|run|kick\s*off)\b/i,
  /\b(approve|reject|delete|publish|retry|re-?run)\b/i,
  /\b(scrape|browse|fetch|search\s+the\s+web|visit)\b/i,
]

function isEmptyReadQuestion(message: string): boolean {
  if (ACTION_INTENT_PATTERNS.some((re) => re.test(message))) return false
  return EMPTY_READ_PATTERNS.some((re) => re.test(message))
}

export const managerRoutes = new Hono<{ Bindings: Env }>()

  .post('/chat', async (c) => {
  const body = await c.req.json<{ message?: string; history?: ManagerMessage[] }>()
  const message = (body.message || '').trim()
  const history = Array.isArray(body.history) ? body.history.slice(-8) : []
  if (!message) return c.json({ error: 'message is required' }, 400)

  // T14: empty-data short-circuit. A single COUNT is cheap and saves a
  // full model round-trip on the most common cold-start prompts.
  if (isEmptyReadQuestion(message)) {
    const totalRow = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM products').first<any>()
    const total = Number(totalRow?.n ?? 0)
    if (total === 0) {
      return c.json({
        reply: "There's no data yet — once you create your first product I'll have something real to report. Try \"Create a product about productivity\" to get started.",
        actions: [],
        action_results: [],
        short_circuited: true,
      })
    }
  }

  // Give the model the real domains/categories so it picks valid slugs.
  const cats = await c.env.DB.prepare(`
    SELECT c.slug AS category_slug, c.name AS category_name,
           d.slug AS domain_slug, d.name AS domain_name
    FROM categories c JOIN domains d ON c.domain_id = d.id
    WHERE c.is_active = 1 AND d.is_active = 1
    ORDER BY d.name, c.name
  `).all<any>()
  const catalog = (cats.results || []).map(
    (r) => `${r.domain_slug}/${r.category_slug} (${r.domain_name} → ${r.category_name})`
  )

  const convo = history.map((m) => `${m.role === 'user' ? 'CEO' : 'Manager'}: ${m.content}`).join('\n')

  const prompt = `You are the CEO Manager of NEXUS, an AI product-creation engine. The owner gives you goals; you plan the work and dispatch product-creation agents (each runs a 15-step pipeline that researches, writes copy, generates an image, prices, and scores a digital product).

Available domain/category slots (use EXACTLY these slugs):
${catalog.length ? catalog.join('\n') : '(none configured yet)'}

Conversation so far:
${convo || '(new conversation)'}

The CEO just said:
"${message}"

Decide what to do. If the CEO wants product(s) created, plan up to 5 concrete products. Only use slugs from the list above; if none fit, leave them empty and explain in your reply.

Respond with ONLY a JSON object:
{
  "reply": "<short, friendly manager response describing what you're doing>",
  "products": [
    { "domain_slug": "...", "category_slug": "...", "product_name": "...", "niche": "...", "description": "<one line brief>", "keywords": "comma,separated" }
  ]
}
If no products should be created, return "products": [].`

  let reply = ''
  let planned: PlannedProduct[] = []
  try {
    const out = await callAI(c.env, prompt)
    const parsed = safeParse(out)
    if (parsed) {
      reply = typeof parsed.reply === 'string' ? parsed.reply : ''
      planned = Array.isArray(parsed.products) ? parsed.products : []
    } else {
      reply = out.trim()
    }
  } catch (err) {
    return c.json({
      reply: 'I could not reach the AI engine just now. Please try again in a moment.',
      actions: [],
      error: err instanceof Error ? err.message : 'ai_error',
    })
  }

  const validSlugs = new Set((cats.results || []).map((r) => `${r.domain_slug}/${r.category_slug}`))
  const actions: ManagerAction[] = []

  for (const p of planned.slice(0, 5)) {
    const domain_slug = (p.domain_slug || '').trim()
    const category_slug = (p.category_slug || '').trim()
    const base: ManagerAction = {
      type: 'create_product',
      domain_slug,
      category_slug,
      product_name: p.product_name,
      niche: p.niche,
      description: p.description,
    }

    if (!domain_slug || !category_slug || !validSlugs.has(`${domain_slug}/${category_slug}`)) {
      actions.push({ ...base, status: 'failed', detail: 'No matching domain/category — create one under Domains first.' })
      continue
    }

    // Niche dedup guard — refuse to spin up a duplicate / generic build
    // from a manager-planned action. Same shared check the autopilot
    // loop uses.
    const guard = await checkNiche(c.env, p.niche || p.product_name)
    if (!guard.ok) {
      actions.push({ ...base, status: 'failed', detail: guard.reason })
      continue
    }

    try {
      const domain = await c.env.DB.prepare('SELECT id FROM domains WHERE slug = ? AND is_active = 1').bind(domain_slug).first<any>()
      const category = await c.env.DB.prepare('SELECT id FROM categories WHERE slug = ? AND domain_id = ? AND is_active = 1').bind(category_slug, domain.id).first<any>()
      const productId = crypto.randomUUID()
      const runId = crypto.randomUUID()
      const now = new Date().toISOString()
      const userInput = {
        product_name: p.product_name,
        niche: p.niche,
        description: p.description,
        keywords: p.keywords,
        let_ai_price: true,
      }

      await c.env.DB.prepare(`
        INSERT INTO products (id, domain_id, category_id, name, niche, user_input, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)
      `).bind(productId, domain.id, category.id, p.product_name ?? null, p.niche ?? null, JSON.stringify(userInput), now, now).run()

      await c.env.DB.prepare(`
        INSERT INTO workflow_runs (id, product_id, status, created_at) VALUES (?, ?, 'queued', ?)
      `).bind(runId, productId, now).run()

      const engine = new ProductWorkflow(c.env)
      c.executionCtx.waitUntil(engine.run(runId, productId, domain_slug, category_slug, userInput))

      actions.push({ ...base, product_id: productId, workflow_id: runId, status: 'started' })
    } catch (err) {
      actions.push({ ...base, status: 'failed', detail: err instanceof Error ? err.message : 'start_error' })
    }
  }

  const started = actions.filter((a) => a.status === 'started').length
  if (!reply) {
    reply = started > 0
      ? `On it — I've dispatched ${started} product agent${started > 1 ? 's' : ''}. They're running now; check the Products page in a minute.`
      : 'Understood.'
  }

  // Execute live actions for new action types
  const liveActionTypes: LiveActionType[] = ['browse', 'list_product', 'check_sales', 'create_pod', 'run_campaign', 'analyze_niche']
  const actionResults: ActionResult[] = []
  for (const a of actions) {
    if (liveActionTypes.includes(a.type as LiveActionType)) {
      const liveAction: LiveAction = {
        type: a.type as LiveActionType,
        url: a.url,
        instruction: a.instruction,
        niche: a.niche,
        product_id: a.product_id,
        platform: a.platform,
      }
      const result = await executeAction(liveAction, c.env)
      actionResults.push(result)
    }
  }

  return c.json({ reply, actions, action_results: actionResults })
})
