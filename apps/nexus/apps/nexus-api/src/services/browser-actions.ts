import puppeteer from '@cloudflare/puppeteer'
import type { Env } from '../env'

// ---------------------------------------------------------------------------
// Action Types & Interfaces
// ---------------------------------------------------------------------------

export type ActionType =
  | 'click'
  | 'type'
  | 'select'
  | 'scroll'
  | 'wait'
  | 'screenshot'
  | 'navigate'
  | 'fillForm'

export interface BrowserAction {
  type: ActionType
  selector?: string
  value?: string
  url?: string
  waitMs?: number
  /** Key-value pairs for fillForm — maps selector → value */
  fields?: Record<string, string>
}

export interface ActionResult {
  action: ActionType
  ok: boolean
  message?: string
  screenshotKey?: string
  durationMs: number
}

export interface ExecutionResult {
  ok: boolean
  results: ActionResult[]
  totalMs: number
  error?: string
}

export interface MultiStepFlow {
  name: string
  platform: string
  steps: BrowserAction[]
  variables: Record<string, string>
}

// ---------------------------------------------------------------------------
// Core executor — runs a sequence of browser actions
// ---------------------------------------------------------------------------

const NAV_TIMEOUT = 30_000

export async function executeBrowserActions(
  env: Env,
  actions: BrowserAction[],
  variables?: Record<string, string>,
): Promise<ExecutionResult> {
  if (!env.BROWSER) {
    return {
      ok: false,
      results: [],
      totalMs: 0,
      error: 'Browser Rendering is not enabled. Add the [browser] binding on the Workers Paid plan.',
    }
  }

  const startAll = Date.now()
  const results: ActionResult[] = []
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null

  try {
    browser = await puppeteer.launch(env.BROWSER)
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    for (const action of actions) {
      const t0 = Date.now()
      try {
        const resolved = resolveAction(action, variables)
        await runSingleAction(page, env, resolved, results, t0)
      } catch (err) {
        results.push({
          action: action.type,
          ok: false,
          message: err instanceof Error ? err.message : 'action_failed',
          durationMs: Date.now() - t0,
        })
        // Continue executing remaining actions — callers can inspect per-step results.
      }
    }

    return { ok: results.every((r) => r.ok), results, totalMs: Date.now() - startAll }
  } catch (err) {
    return {
      ok: false,
      results,
      totalMs: Date.now() - startAll,
      error: err instanceof Error ? err.message : 'browser_launch_failed',
    }
  } finally {
    try { await browser?.close() } catch { /* noop */ }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function interpolate(text: string, vars?: Record<string, string>): string {
  if (!vars) return text
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`)
}

function resolveAction(action: BrowserAction, vars?: Record<string, string>): BrowserAction {
  return {
    ...action,
    selector: action.selector ? interpolate(action.selector, vars) : undefined,
    value: action.value ? interpolate(action.value, vars) : undefined,
    url: action.url ? interpolate(action.url, vars) : undefined,
    fields: action.fields
      ? Object.fromEntries(
          Object.entries(action.fields).map(([k, v]) => [interpolate(k, vars), interpolate(v, vars)]),
        )
      : undefined,
  }
}

async function runSingleAction(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>>,
  env: Env,
  action: BrowserAction,
  results: ActionResult[],
  t0: number,
): Promise<void> {
  switch (action.type) {
    case 'navigate': {
      if (!action.url) throw new Error('navigate requires a url')
      await page.goto(action.url, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT }).catch(async () => {
        await page.goto(action.url!, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
      })
      results.push({ action: 'navigate', ok: true, message: `Navigated to ${action.url}`, durationMs: Date.now() - t0 })
      break
    }

    case 'click': {
      if (!action.selector) throw new Error('click requires a selector')
      await page.waitForSelector(action.selector, { timeout: 10_000 })
      await page.click(action.selector)
      results.push({ action: 'click', ok: true, message: `Clicked ${action.selector}`, durationMs: Date.now() - t0 })
      break
    }

    case 'type': {
      if (!action.selector) throw new Error('type requires a selector')
      await page.waitForSelector(action.selector, { timeout: 10_000 })
      await page.click(action.selector, { clickCount: 3 }) // select existing content
      await page.type(action.selector, action.value ?? '')
      results.push({ action: 'type', ok: true, message: `Typed into ${action.selector}`, durationMs: Date.now() - t0 })
      break
    }

    case 'select': {
      if (!action.selector) throw new Error('select requires a selector')
      await page.waitForSelector(action.selector, { timeout: 10_000 })
      await page.select(action.selector, action.value ?? '')
      results.push({ action: 'select', ok: true, message: `Selected ${action.value} in ${action.selector}`, durationMs: Date.now() - t0 })
      break
    }

    case 'scroll': {
      const distance = parseInt(action.value ?? '500', 10)
      await page.evaluate(`window.scrollBy(0, ${distance})`)
      results.push({ action: 'scroll', ok: true, message: `Scrolled ${distance}px`, durationMs: Date.now() - t0 })
      break
    }

    case 'wait': {
      const ms = action.waitMs ?? 1000
      await new Promise((r) => setTimeout(r, ms))
      results.push({ action: 'wait', ok: true, message: `Waited ${ms}ms`, durationMs: Date.now() - t0 })
      break
    }

    case 'screenshot': {
      const shot = (await page.screenshot({ type: 'png', fullPage: false })) as Uint8Array
      const key = `browser-actions/${crypto.randomUUID()}.png`
      await env.ASSETS.put(key, shot, { httpMetadata: { contentType: 'image/png' } })
      results.push({ action: 'screenshot', ok: true, screenshotKey: key, message: 'Screenshot captured', durationMs: Date.now() - t0 })
      break
    }

    case 'fillForm': {
      if (!action.fields || Object.keys(action.fields).length === 0) {
        throw new Error('fillForm requires a fields map')
      }
      for (const [sel, val] of Object.entries(action.fields)) {
        await page.waitForSelector(sel, { timeout: 10_000 })
        await page.click(sel, { clickCount: 3 })
        await page.type(sel, val)
      }
      results.push({
        action: 'fillForm',
        ok: true,
        message: `Filled ${Object.keys(action.fields).length} field(s)`,
        durationMs: Date.now() - t0,
      })
      break
    }

    default:
      throw new Error(`Unknown action type: ${(action as BrowserAction).type}`)
  }
}

// ---------------------------------------------------------------------------
// Pre-built platform flows — templates with placeholder variables
// ---------------------------------------------------------------------------

export function listOnEtsy(product: Record<string, string>): MultiStepFlow {
  return {
    name: 'list-on-etsy',
    platform: 'etsy',
    variables: {
      title: product.title ?? '',
      description: product.description ?? '',
      price: product.price ?? '',
      tags: product.tags ?? '',
    },
    steps: [
      { type: 'navigate', url: 'https://www.etsy.com/your/shops/me/tools/listings/create' },
      { type: 'wait', waitMs: 2000 },
      { type: 'screenshot' },
      { type: 'fillForm', fields: {
        'input[name="title"], #listing-edit-title input': '{{title}}',
      }},
      { type: 'type', selector: 'textarea[name="description"], .description-editor textarea', value: '{{description}}' },
      { type: 'type', selector: 'input[name="price"], #listing-edit-price input', value: '{{price}}' },
      { type: 'type', selector: 'input[name="tags"], #listing-edit-tags input', value: '{{tags}}' },
      { type: 'screenshot' },
      { type: 'wait', waitMs: 1000 },
    ],
  }
}

export function listOnCreativeMarket(product: Record<string, string>): MultiStepFlow {
  return {
    name: 'list-on-creative-market',
    platform: 'creative_market',
    variables: {
      title: product.title ?? '',
      description: product.description ?? '',
      price: product.price ?? '',
      category: product.category ?? '',
    },
    steps: [
      { type: 'navigate', url: 'https://creativemarket.com/sell/products/new' },
      { type: 'wait', waitMs: 2000 },
      { type: 'screenshot' },
      { type: 'type', selector: 'input[name="name"], #product-name', value: '{{title}}' },
      { type: 'type', selector: 'textarea[name="description"], #product-description', value: '{{description}}' },
      { type: 'type', selector: 'input[name="price"], #product-price', value: '{{price}}' },
      { type: 'screenshot' },
      { type: 'wait', waitMs: 1000 },
    ],
  }
}

export function listOnPayhip(product: Record<string, string>): MultiStepFlow {
  return {
    name: 'list-on-payhip',
    platform: 'payhip',
    variables: {
      title: product.title ?? '',
      description: product.description ?? '',
      price: product.price ?? '',
    },
    steps: [
      { type: 'navigate', url: 'https://payhip.com/dashboard/products/new' },
      { type: 'wait', waitMs: 2000 },
      { type: 'screenshot' },
      { type: 'type', selector: 'input[name="title"], #product-title', value: '{{title}}' },
      { type: 'type', selector: 'textarea[name="description"], #product-description', value: '{{description}}' },
      { type: 'type', selector: 'input[name="price"], #product-price', value: '{{price}}' },
      { type: 'screenshot' },
      { type: 'wait', waitMs: 1000 },
    ],
  }
}

export function checkGumroadSales(): MultiStepFlow {
  return {
    name: 'check-gumroad-sales',
    platform: 'gumroad',
    variables: {},
    steps: [
      { type: 'navigate', url: 'https://app.gumroad.com/dashboard' },
      { type: 'wait', waitMs: 3000 },
      { type: 'screenshot' },
      { type: 'navigate', url: 'https://app.gumroad.com/dashboard/sales' },
      { type: 'wait', waitMs: 2000 },
      { type: 'screenshot' },
    ],
  }
}
