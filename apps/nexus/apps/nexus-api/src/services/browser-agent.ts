import puppeteer from '@cloudflare/puppeteer'
import type { Env } from '../env'
import type { BrowserAction } from './browser-actions'

// ---------------------------------------------------------------------------
// Devin-style autonomous browser agent.
//
// One async-generator loop: observe → think → act → repeat. The caller
// (an SSE route) streams every event as it happens so the dashboard
// renders the agent's progress live.
// ---------------------------------------------------------------------------

export interface AgentElement {
  index: number
  tag: string
  text: string
  selector: string
}

export type AgentEventType =
  | 'started'
  | 'observation'
  | 'thinking'
  | 'action'
  | 'frame'
  | 'done'
  | 'error'

export interface AgentEvent {
  type: AgentEventType
  step: number
  goal?: string
  thought?: string
  action?: BrowserAction
  pageTitle?: string
  pageUrl?: string
  elements?: AgentElement[]
  screenshotUrl?: string
  // Inline JPEG data URL for live `frame` events streamed while an action runs.
  // Kept inline (not persisted to R2) so the dashboard renders a near-live
  // video feel without burning storage on every frame.
  screenshotDataUrl?: string
  message?: string
  answer?: string
  error?: string
  totalMs?: number
}

interface AgentDecision {
  thought: string
  done: boolean
  action?: BrowserAction
  answer?: string
}

// Browser-side type aliases so this file does not need a hard dep on
// the heavy puppeteer Page generics.
type AnyPage = Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>>

const DEFAULT_MAX_STEPS = 15
const MAX_ELEMENTS = 40
// How often to capture a live frame while an action runs. 600ms gives ~1.5fps
// which feels live without overwhelming the SSE channel or the Browser
// Rendering session (each screenshot is a billable Browser op).
const FRAME_INTERVAL_MS = 600

export async function* runAgent(
  env: Env,
  goal: string,
  startUrl?: string,
  maxSteps = DEFAULT_MAX_STEPS,
  liveMode = true,
): AsyncGenerator<AgentEvent> {
  if (!env.BROWSER) {
    yield {
      type: 'error',
      step: -1,
      error: 'Browser Rendering is not enabled. Add the [browser] binding on the Workers Paid plan.',
    }
    return
  }

  const startAll = Date.now()
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null

  try {
    yield { type: 'started', step: 0, goal, message: 'Launching headless Chromium…' }

    browser = await puppeteer.launch(env.BROWSER)
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    // If the user gave a starting URL hint, go there. Otherwise let the AI's
    // first action be a navigate.
    const initialUrl = normalizeUrl(startUrl || '')
    if (initialUrl) {
      try {
        await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      } catch (err) {
        yield {
          type: 'error',
          step: 0,
          error: `Could not open ${initialUrl}: ${errorMessage(err)}`,
        }
        return
      }
    }

    const history: Array<{ thought: string; action: BrowserAction; ok: boolean; error?: string }> = []

    for (let step = 1; step <= maxSteps; step++) {
      // OBSERVE — title, URL, interactive elements, screenshot
      const obs = await observe(env, page, step)
      yield obs

      // THINK — single AI call returning the next action
      const decision = await think(env, goal, history, obs)
      if (!decision) {
        yield {
          type: 'error',
          step,
          error: 'The AI did not return a valid decision. Stopping.',
        }
        return
      }

      yield { type: 'thinking', step, thought: decision.thought }

      // DONE
      if (decision.done) {
        yield {
          type: 'done',
          step,
          thought: decision.thought,
          answer: (decision.answer || decision.thought || '').trim() || 'Goal achieved.',
          totalMs: Date.now() - startAll,
        }
        return
      }

      if (!decision.action) {
        yield { type: 'error', step, error: 'AI did not provide an action.' }
        return
      }

      // ACT — execute the action while streaming live JPEG frames so the
      // dashboard sees the browser working in near-real-time. Frames are tiny
      // inline data URLs (no R2 roundtrip per frame).
      type ActSettled = { ok: true } | { ok: false; err: string }
      const actPromise: Promise<ActSettled> = executeOne(page, decision.action)
        .then(() => ({ ok: true as const }))
        .catch((err) => ({ ok: false as const, err: errorMessage(err) }))

      let actResult: ActSettled | null = null
      // Hard cap on frames per action so a hung navigate can't blow the
      // SSE channel or the Browser Rendering quota.
      const MAX_FRAMES_PER_ACTION = 60
      let frameCount = 0
      while (!actResult) {
        const winner = await Promise.race([
          actPromise.then((r) => ({ kind: 'done' as const, r })),
          new Promise<{ kind: 'tick' }>((resolve) =>
            setTimeout(() => resolve({ kind: 'tick' }), FRAME_INTERVAL_MS),
          ),
        ])
        if (winner.kind === 'done') {
          actResult = winner.r
          break
        }
        if (liveMode && frameCount < MAX_FRAMES_PER_ACTION) {
          frameCount++
          const dataUrl = await captureFrame(page).catch(() => null)
          if (dataUrl) {
            yield { type: 'frame', step, screenshotDataUrl: dataUrl }
          }
        }
      }
      // One final frame after the action settles so the user sees the result
      // before the next observe→think cycle starts.
      if (liveMode) {
        const finalFrame = await captureFrame(page).catch(() => null)
        if (finalFrame) yield { type: 'frame', step, screenshotDataUrl: finalFrame }
      }
      const actErr = actResult.ok ? undefined : actResult.err

      history.push({
        thought: decision.thought,
        action: decision.action,
        ok: !actErr,
        error: actErr,
      })

      yield {
        type: 'action',
        step,
        thought: decision.thought,
        action: decision.action,
        error: actErr,
      }
    }

    yield {
      type: 'done',
      step: maxSteps,
      thought: 'Reached the maximum number of steps.',
      answer:
        'I reached the step limit before finishing. Try rephrasing the goal or providing a starting URL.',
      totalMs: Date.now() - startAll,
    }
  } catch (err) {
    yield { type: 'error', step: -1, error: errorMessage(err) }
  } finally {
    try {
      await browser?.close()
    } catch {
      /* noop */
    }
  }
}

// ---------------------------------------------------------------------------
// Observe — capture page state for the AI.
// ---------------------------------------------------------------------------

async function observe(env: Env, page: AnyPage, step: number): Promise<AgentEvent> {
  let title = ''
  let url = ''
  let elements: AgentElement[] = []
  let screenshotKey: string | null = null

  try {
    title = await page.title()
  } catch {
    title = ''
  }
  try {
    url = page.url()
  } catch {
    url = ''
  }
  try {
    elements = await extractElements(page)
  } catch {
    elements = []
  }
  try {
    screenshotKey = await captureScreenshot(env, page)
  } catch {
    screenshotKey = null
  }

  return {
    type: 'observation',
    step,
    pageTitle: title,
    pageUrl: url,
    elements: elements.slice(0, MAX_ELEMENTS),
    screenshotUrl: screenshotKey ? `/api/assets/r2/${screenshotKey}` : undefined,
  }
}

async function extractElements(page: AnyPage): Promise<AgentElement[]> {
  // We run the extractor as a stringified expression — Cloudflare's puppeteer
  // build accepts both. String form sidesteps serialization quirks for complex
  // function bodies and keeps tree-shakers honest.
  const script = `(() => {
    const SELECTORS = 'button, a, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [role="searchbox"], [role="combobox"], [contenteditable="true"]';
    const out = [];
    let idx = 0;
    const all = document.querySelectorAll(SELECTORS);
    for (const el of all) {
      if (out.length >= 50) break;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) === 0) continue;
      if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight + 200 || rect.left > window.innerWidth) continue;

      let selector = '';
      const eltId = el.id || '';
      const testid = el.getAttribute('data-testid');
      const aria = el.getAttribute('aria-label');
      const inputName = el.getAttribute('name');
      const href = el.tagName === 'A' ? el.getAttribute('href') : null;

      if (eltId && /^[a-zA-Z][\\w-]*$/.test(eltId)) {
        selector = '#' + eltId;
      } else if (testid) {
        selector = '[data-testid="' + testid.replace(/"/g, '\\\\"') + '"]';
      } else if (aria) {
        selector = el.tagName.toLowerCase() + '[aria-label="' + aria.replace(/"/g, '\\\\"') + '"]';
      } else if (inputName && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        selector = el.tagName.toLowerCase() + '[name="' + inputName.replace(/"/g, '\\\\"') + '"]';
      } else if (href && href.length < 120 && !href.includes('"')) {
        selector = 'a[href="' + href + '"]';
      }
      if (!selector) continue;

      let text = '';
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        text = el.getAttribute('placeholder') || aria || el.value || inputName || '';
      } else {
        text = (el.innerText || el.textContent || '').trim();
      }
      text = text.slice(0, 80).replace(/\\s+/g, ' ').trim();
      if (!text && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') continue;

      out.push({ index: ++idx, tag: el.tagName.toLowerCase(), text, selector });
    }
    return out;
  })()`

  // @cloudflare/puppeteer's page.evaluate accepts a string expression — the
  // existing browser-actions service uses the same pattern.
  const result = (await page.evaluate(script as never)) as AgentElement[] | undefined
  return Array.isArray(result) ? result : []
}

async function captureScreenshot(env: Env, page: AnyPage): Promise<string | null> {
  try {
    const buf = (await page.screenshot({ type: 'png', fullPage: false })) as Uint8Array
    const key = `agent-screenshots/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
    await env.ASSETS.put(key, buf, { httpMetadata: { contentType: 'image/png' } })
    return key
  } catch {
    return null
  }
}

// Lightweight frame for live streaming. JPEG at ~quality 60 keeps each frame
// around 30-60KB. Returned as a data URL so the SSE consumer can stick it
// straight into an <img src>.
async function captureFrame(page: AnyPage): Promise<string | null> {
  try {
    const buf = (await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false })) as Uint8Array
    // Base64 encode without pulling in Node's Buffer (Workers don't have it
    // unless we ask for nodejs_compat — we do, but staying portable).
    let binary = ''
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
    const b64 = btoa(binary)
    return `data:image/jpeg;base64,${b64}`
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Think — one AI call → one decision.
// ---------------------------------------------------------------------------

async function think(
  env: Env,
  goal: string,
  history: Array<{ thought: string; action: BrowserAction; ok: boolean; error?: string }>,
  obs: AgentEvent,
): Promise<AgentDecision | null> {
  const elementsBlock = (obs.elements || []).length
    ? (obs.elements || [])
        .map((e) => `[${e.index}] <${e.tag}> "${e.text}" selector=\`${e.selector}\``)
        .join('\n')
    : '(no clickable elements found — the page may still be loading or empty)'

  const historyBlock = history.length
    ? history
        .map((h, i) => {
          const status = h.ok ? '✓' : '✗'
          const errSuffix = h.error ? ` (error: ${h.error})` : ''
          return `Step ${i + 1}: ${h.thought}\n  → ${formatAction(h.action)} ${status}${errSuffix}`
        })
        .join('\n')
    : '(no actions taken yet)'

  const prompt = `You are an autonomous browser agent driving a real Chromium. You observe the page after every action and decide the SINGLE next thing to do. You complete the user's goal step by step.

USER GOAL: ${goal}

CURRENT PAGE
- Title: ${obs.pageTitle || '(none)'}
- URL: ${obs.pageUrl || '(none)'}

INTERACTIVE ELEMENTS ON SCREEN
${elementsBlock}

PRIOR ACTIONS
${historyBlock}

ALLOWED ACTIONS (pick exactly one)
- { "type": "navigate", "url": "https://…" }
- { "type": "click", "selector": "…" }           // MUST be one of the selectors above
- { "type": "type", "selector": "…", "value": "…" }
- { "type": "select", "selector": "…", "value": "…" }
- { "type": "scroll", "value": "600" }            // pixels, can be negative
- { "type": "wait", "waitMs": 1500 }
- { "type": "done" }                              // include "answer" when done

RULES
1. If the goal can be answered from what you see now, return action "done" and put the final answer in "answer".
2. Use only selectors listed in INTERACTIVE ELEMENTS for click/type/select.
3. If an earlier action failed, do NOT repeat it. Try a different selector or scroll first.
4. Keep moving. If you can't make progress in 2 more steps, return "done" with an honest answer about what's blocking you.
5. Don't try to log in, sign up, or solve CAPTCHAs.

Respond with strict JSON only (no markdown fences):
{
  "thought": "one-sentence reasoning",
  "action": { "type": "...", ...fields },
  "answer": "(only when action.type === 'done')"
}`

  try {
    const req = new Request('https://nexus-ai/task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskType: 'browser_agent',
        prompt,
        outputFormat: 'json',
        timeoutMs: 60_000,
      }),
    })
    const res = await env.AI_WORKER.fetch(req)
    if (!res.ok) return null
    const data = (await res.json()) as { output?: string }
    const raw = (data.output || '').trim()
    return parseDecision(raw)
  } catch {
    return null
  }
}

function parseDecision(raw: string): AgentDecision | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try {
    const obj = JSON.parse(cleaned) as {
      thought?: string
      action?: { type?: string; selector?: string; value?: string; url?: string; waitMs?: number; fields?: Record<string, string> }
      answer?: string
    }
    if (!obj || typeof obj.thought !== 'string' || !obj.action || typeof obj.action.type !== 'string') {
      return null
    }
    if (obj.action.type === 'done') {
      return {
        thought: obj.thought,
        done: true,
        answer: typeof obj.answer === 'string' ? obj.answer : undefined,
      }
    }
    return {
      thought: obj.thought,
      done: false,
      action: obj.action as BrowserAction,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Act — execute one action on the live page.
// ---------------------------------------------------------------------------

async function executeOne(page: AnyPage, action: BrowserAction): Promise<void> {
  switch (action.type) {
    case 'navigate': {
      if (!action.url) throw new Error('navigate requires url')
      await page.goto(normalizeUrl(action.url), { waitUntil: 'domcontentloaded', timeout: 30_000 })
      return
    }
    case 'click': {
      if (!action.selector) throw new Error('click requires selector')
      await page.waitForSelector(action.selector, { timeout: 10_000 })
      await page.click(action.selector)
      // brief settle for SPA route changes / animations
      await wait(600)
      return
    }
    case 'type': {
      if (!action.selector) throw new Error('type requires selector')
      await page.waitForSelector(action.selector, { timeout: 10_000 })
      try {
        // triple-click to select existing text, then overwrite
        await page.click(action.selector, { clickCount: 3 })
      } catch {
        /* noop */
      }
      await page.type(action.selector, action.value || '', { delay: 30 })
      return
    }
    case 'select': {
      if (!action.selector) throw new Error('select requires selector')
      await page.select(action.selector, action.value || '')
      return
    }
    case 'scroll': {
      const distance = parseInt(action.value || '600', 10) || 600
      await page.evaluate(`window.scrollBy(0, ${distance})`)
      await wait(300)
      return
    }
    case 'wait': {
      await wait(action.waitMs || 1000)
      return
    }
    case 'screenshot': {
      // no-op here — every observation captures a screenshot already
      return
    }
    case 'fillForm': {
      if (!action.fields) return
      for (const [selector, value] of Object.entries(action.fields)) {
        try {
          await page.waitForSelector(selector, { timeout: 5_000 })
          await page.click(selector, { clickCount: 3 })
          await page.type(selector, value, { delay: 25 })
        } catch {
          /* keep going */
        }
      }
      return
    }
    default:
      throw new Error(`unknown action type: ${(action as { type: string }).type}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAction(a: BrowserAction): string {
  switch (a.type) {
    case 'navigate':
      return `navigate ${a.url}`
    case 'click':
      return `click ${a.selector}`
    case 'type':
      return `type "${truncate(a.value || '', 40)}" → ${a.selector}`
    case 'select':
      return `select ${a.value} → ${a.selector}`
    case 'scroll':
      return `scroll ${a.value}px`
    case 'wait':
      return `wait ${a.waitMs}ms`
    case 'screenshot':
      return `screenshot`
    case 'fillForm':
      return `fill form (${Object.keys(a.fields || {}).length} fields)`
    default:
      return (a as { type: string }).type
  }
}

function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown_error'
}
