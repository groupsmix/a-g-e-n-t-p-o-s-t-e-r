import { Hono } from 'hono'
import type { Env } from '../env'
import {
  executeBrowserActions,
  listOnEtsy,
  listOnCreativeMarket,
  listOnPayhip,
  checkGumroadSales,
  type BrowserAction,
  type MultiStepFlow,
} from '../services/browser-actions'
import {
  getPlatformStatus,
  listOnPlatform,
  listOnAllPlatforms,
  getSupportedPlatforms,
} from '../services/multi-platform'

export const browserActionRoutes = new Hono<{ Bindings: Env }>()

// ---------------------------------------------------------------------------
// POST /browser/actions — execute a raw sequence of browser actions
// ---------------------------------------------------------------------------
browserActionRoutes.post('/actions', async (c) => {
  const body = await c.req.json<{ actions?: BrowserAction[] }>().catch(() => ({} as { actions?: BrowserAction[] }))
  if (!body.actions || !Array.isArray(body.actions) || body.actions.length === 0) {
    return c.json({ error: 'actions array is required and must not be empty' }, 400)
  }

  const result = await executeBrowserActions(c.env, body.actions)
  return c.json(result, result.ok ? 200 : 502)
})

// ---------------------------------------------------------------------------
// GET /browser/flows — list available pre-built flows
// ---------------------------------------------------------------------------
const FLOW_BUILDERS: Record<string, (product: Record<string, string>) => MultiStepFlow> = {
  'list-on-etsy': listOnEtsy,
  'list-on-creative-market': listOnCreativeMarket,
  'list-on-payhip': listOnPayhip,
  'check-gumroad-sales': () => checkGumroadSales(),
}

browserActionRoutes.get('/flows', (c) => {
  const flows = Object.entries(FLOW_BUILDERS).map(([name, builder]) => {
    const sample = builder({})
    return {
      name,
      platform: sample.platform,
      stepCount: sample.steps.length,
      variables: Object.keys(sample.variables),
    }
  })
  return c.json({ flows })
})

// ---------------------------------------------------------------------------
// POST /browser/flows/:name/execute — execute a named flow with variables
// ---------------------------------------------------------------------------
browserActionRoutes.post('/flows/:name/execute', async (c) => {
  const name = c.req.param('name')
  const builder = FLOW_BUILDERS[name]
  if (!builder) {
    return c.json({ error: `Unknown flow: ${name}` }, 404)
  }

  const body = await c.req.json<{ variables?: Record<string, string> }>().catch(() => ({} as { variables?: Record<string, string> }))
  const variables = body.variables ?? {}
  const flow = builder(variables)

  const result = await executeBrowserActions(c.env, flow.steps, { ...flow.variables, ...variables })
  return c.json({ flow: flow.name, platform: flow.platform, ...result }, result.ok ? 200 : 502)
})

// ---------------------------------------------------------------------------
// GET /platforms/status — get status of all configured platforms
// ---------------------------------------------------------------------------
browserActionRoutes.get('/platforms/status', async (c) => {
  const statuses = await getPlatformStatus(c.env)
  return c.json({ platforms: statuses })
})

// ---------------------------------------------------------------------------
// POST /platforms/:name/list — list a product on a specific platform
// ---------------------------------------------------------------------------
browserActionRoutes.post('/platforms/:name/list', async (c) => {
  const platformName = c.req.param('name')
  const platforms = getSupportedPlatforms()
  if (!platforms[platformName]) {
    return c.json({ error: `Unknown platform: ${platformName}` }, 404)
  }

  const body = await c.req.json<{ product?: Record<string, string> }>().catch(() => ({} as { product?: Record<string, string> }))
  if (!body.product) {
    return c.json({ error: 'product object is required' }, 400)
  }

  const result = await listOnPlatform(c.env, body.product, platformName)
  return c.json(result, result.ok ? 200 : 502)
})

// ---------------------------------------------------------------------------
// POST /platforms/list-all — list a product on multiple platforms
// ---------------------------------------------------------------------------
browserActionRoutes.post('/platforms/list-all', async (c) => {
  const body = await c.req.json<{ product?: Record<string, string>; platforms?: string[] }>().catch(() => ({} as { product?: Record<string, string>; platforms?: string[] }))
  if (!body.product) {
    return c.json({ error: 'product object is required' }, 400)
  }
  const keys = body.platforms ?? Object.keys(getSupportedPlatforms())
  const results = await listOnAllPlatforms(c.env, body.product, keys)
  return c.json({ results })
})

// ---------------------------------------------------------------------------
// GET /platforms/listings — get listing history from D1
// ---------------------------------------------------------------------------
browserActionRoutes.get('/platforms/listings', async (c) => {
  const productId = c.req.query('product_id')
  let query = 'SELECT * FROM platform_listings ORDER BY created_at DESC LIMIT 100'
  const binds: string[] = []
  if (productId) {
    query = 'SELECT * FROM platform_listings WHERE product_id = ? ORDER BY created_at DESC LIMIT 100'
    binds.push(productId)
  }
  try {
    const stmt = binds.length ? c.env.DB.prepare(query).bind(...binds) : c.env.DB.prepare(query)
    const rows = await stmt.all()
    return c.json({ listings: rows.results })
  } catch {
    return c.json({ listings: [] })
  }
})
