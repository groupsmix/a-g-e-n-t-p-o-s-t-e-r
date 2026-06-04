import puppeteer from '@cloudflare/puppeteer'
import type { Env } from '../env'

export interface BrowseResult {
  ok: boolean
  url: string
  finalUrl?: string
  title?: string
  text?: string
  screenshotKey?: string
  error?: string
}

const MAX_TEXT = 8000
const NAV_TIMEOUT = 30000

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

// Drive a real headless browser: open a URL, read the page, and capture a
// screenshot to R2. Requires the BROWSER binding (Workers Paid plan); degrades
// to a clear error when it isn't available so the rest of the app keeps working.
export async function browse(env: Env, rawUrl: string): Promise<BrowseResult> {
  const url = normalizeUrl(rawUrl)
  if (!env.BROWSER) {
    return { ok: false, url, error: 'Browser Rendering is not enabled. Add the [browser] binding on the Workers Paid plan.' }
  }

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    browser = await puppeteer.launch(env.BROWSER)
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(url, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT }).catch(async () => {
      // networkidle can hang on chatty pages — fall back to domcontentloaded.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
    })

    const title = await page.title().catch(() => '')
    // Evaluated as a string so this file needs no DOM lib types; runs in the page.
    const rawText = await page
      .evaluate('document.body ? document.body.innerText : ""')
      .catch(() => '')
    const text = (typeof rawText === 'string' ? rawText : '').slice(0, MAX_TEXT)
    const finalUrl = page.url()

    const shot = (await page.screenshot({ type: 'png', fullPage: false })) as Uint8Array
    const screenshotKey = `browser/${crypto.randomUUID()}.png`
    await env.ASSETS.put(screenshotKey, shot, { httpMetadata: { contentType: 'image/png' } })

    return { ok: true, url, finalUrl, title, text, screenshotKey }
  } catch (err) {
    return { ok: false, url, error: err instanceof Error ? err.message : 'browse_failed' }
  } finally {
    try {
      await browser?.close()
    } catch {
      /* noop */
    }
  }
}
