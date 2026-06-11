import { Hono } from 'hono'
import type { Env } from '../env'
import { browse } from '../services/browser'
import { executeBrowserActions, type BrowserAction } from '../services/browser-actions'


// ---------------------------------------------------------------------------
// POST /browser/assist — natural-language → browser plan → execute → answer.
// The AI translates the goal into a sequence of BrowserActions, we run them in
// a real headless browser, then optionally summarize the final page against
// the goal. This is what powers the "AI Assistant" tab in the dashboard.
// ---------------------------------------------------------------------------

type AssistAction = BrowserAction & { rationale?: string }


interface AssistPlan {
  rationale: string
  actions: AssistAction[]
  finalQuestion?: string
}

export const browserRoutes = new Hono<{ Bindings: Env }>()

// GET /browser/status — whether the headless browser is available.
  .get('/status', (c) => {
  return c.json({ enabled: !!c.env.BROWSER })
})


// POST /browser/run — open a URL in a real headless browser, read it, and
// capture a screenshot. Optionally summarize the page toward a goal via the AI.
  .post('/run', async (c) => {
  const body = await c.req.json<{ url?: string; instruction?: string }>().catch(
    () => ({}) as { url?: string; instruction?: string }
  )
  const url = (body.url || '').trim()
  const instruction = (body.instruction || '').trim()
  if (!url) return c.json({ error: 'url is required' }, 400)

  const result = await browse(c.env, url)
  if (!result.ok) {
    return c.json({ ok: false, url: result.url, error: result.error }, result.error?.includes('not enabled') ? 503 : 502)
  }

  const screenshotUrl = result.screenshotKey ? `/api/assets/r2/${result.screenshotKey}` : null

  let summary: string | null = null
  if (instruction && result.text) {
    try {
      const prompt = `You browsed this web page. Use ONLY its content to answer the request — do not invent anything not present.

REQUEST: ${instruction}

PAGE TITLE: ${result.title || '(none)'}
PAGE URL: ${result.finalUrl || result.url}
PAGE TEXT (truncated):
${result.text}

Answer concisely in plain language.`
      const req = new Request('https://nexus-ai/task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'browse_summarize', prompt, outputFormat: 'text', timeoutMs: 60000 }),
      })
      const res = await c.env.AI_WORKER.fetch(req)
      if (res.ok) {
        const data = (await res.json()) as { output?: string }
        summary = (data.output || '').trim() || null
      }
    } catch {
      summary = null
    }
  }

  return c.json({
    ok: true,
    url: result.url,
    finalUrl: result.finalUrl,
    title: result.title,
    summary,
    text: result.text?.slice(0, 2000) ?? '',
    screenshotUrl,
  })
})


  .post('/assist', async (c) => {
  if (!c.env.BROWSER) {
    return c.json({
      ok: false,
      error: 'Browser Rendering is not enabled. Add the [browser] binding on the Workers Paid plan.',
    }, 503)
  }

  const body = await c.req
    .json<{ goal?: string; startUrl?: string }>()
    .catch(() => ({} as { goal?: string; startUrl?: string }))

  const goal = (body.goal || '').trim()
  const startUrl = (body.startUrl || '').trim()
  if (!goal) return c.json({ ok: false, error: 'goal is required' }, 400)

  // 1) Ask the AI to plan the steps.
  const planPrompt = buildPlanPrompt(goal, startUrl)
  const plan = await requestPlan(c.env, planPrompt)
  if (!plan) {
    return c.json({ ok: false, error: 'The AI could not produce a plan. Try rephrasing the goal.' }, 502)
  }

  // 2) Execute the plan. We always end with a screenshot so the UI shows the
  //    final state even if the model forgot to add one.
  const stripped: BrowserAction[] = plan.actions.map(({ rationale: _r, ...rest }) => rest)
  const lastIsScreenshot = stripped[stripped.length - 1]?.type === 'screenshot'
  const actionsToRun: BrowserAction[] = lastIsScreenshot ? stripped : [...stripped, { type: 'screenshot' }]

  const execution = await executeBrowserActions(c.env, actionsToRun)

  // 3) Map step results back to plan rationales + URLs for screenshots.
  const steps = execution.results.map((res, i) => {
    const planned = plan.actions[i]
    return {
      index: i,
      action: res.action,
      ok: res.ok,
      message: res.message,
      rationale: planned?.rationale,
      selector: planned?.selector ?? null,
      value: planned?.value ?? null,
      url: planned?.url ?? null,
      screenshotUrl: res.screenshotKey ? `/api/assets/r2/${res.screenshotKey}` : null,
      durationMs: res.durationMs,
    }
  })

  // 4) If a finalQuestion was provided AND we actually navigated, do a quick
  //    summarize pass on the final page so the user gets a direct answer.
  let answer: string | null = null
  const lastNav = [...plan.actions].reverse().find((a) => a.type === 'navigate' && a.url)
  if (plan.finalQuestion && lastNav?.url && execution.ok) {
    try {
      const finalPage = await browse(c.env, lastNav.url)
      if (finalPage.ok && finalPage.text) {
        const qPrompt = `You just operated a browser toward this goal: "${goal}".

QUESTION: ${plan.finalQuestion}

FINAL PAGE TITLE: ${finalPage.title || '(none)'}
FINAL PAGE URL: ${finalPage.finalUrl || finalPage.url}
FINAL PAGE TEXT (truncated):
${finalPage.text}

Answer concisely in plain language, citing only what's in the page text.`
        const req = new Request('https://nexus-ai/task', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskType: 'browse_summarize', prompt: qPrompt, outputFormat: 'text', timeoutMs: 60000 }),
        })
        const res = await c.env.AI_WORKER.fetch(req)
        if (res.ok) {
          const data = (await res.json()) as { output?: string }
          answer = (data.output || '').trim() || null
        }
      }
    } catch {
      // Non-fatal — we still return the plan + steps.
    }
  }

  return c.json({
    ok: execution.ok,
    goal,
    rationale: plan.rationale,
    steps,
    answer,
    totalMs: execution.totalMs,
    error: execution.error,
  })
})


function buildPlanPrompt(goal: string, startUrl: string): string {
  return `You are an AI browser operator. Translate the user's goal into a short JSON plan that a headless Chromium can execute.

USER GOAL: ${goal}
${startUrl ? `STARTING URL HINT: ${startUrl}` : ''}

You may only use these action types:
- navigate: { "type": "navigate", "url": "https://..." }
- click:    { "type": "click", "selector": "css selector" }
- type:     { "type": "type", "selector": "css selector", "value": "text" }
- select:   { "type": "select", "selector": "css selector", "value": "option value" }
- scroll:   { "type": "scroll", "value": "600" }   // pixels
- wait:     { "type": "wait", "waitMs": 1500 }
- screenshot: { "type": "screenshot" }
- fillForm: { "type": "fillForm", "fields": { "selector": "value", ... } }

Rules:
1. Start with a "navigate" action. Use the starting URL hint if given; otherwise infer the best URL from the goal.
2. Prefer ROBUST CSS selectors: prefer [name=...], [aria-label=...], [data-testid=...], stable ids — avoid brittle nth-child.
3. Insert a "screenshot" action after every meaningful state change so the user sees progress.
4. Keep the plan SHORT — 2 to 8 actions. Do not try to log in or solve CAPTCHAs.
5. If the goal is a question about a page, end the plan with "screenshot" and provide a "finalQuestion" the system will answer from the final page text.
6. Each action MAY include a "rationale" string explaining what it accomplishes for the user.

Respond ONLY with a JSON object of this shape — no prose, no markdown fences:
{
  "rationale": "<one sentence summarizing the approach>",
  "actions": [ { "type": "...", "rationale": "...", ...fields } ],
  "finalQuestion": "<optional question for the final page>"
}`
}


async function requestPlan(env: Env, prompt: string): Promise<AssistPlan | null> {
  try {
    const req = new Request('https://nexus-ai/task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        taskType: 'browser_agent',
        prompt,
        outputFormat: 'json',
        timeoutMs: 60000,
      }),
    })
    const res = await env.AI_WORKER.fetch(req)
    if (!res.ok) return null
    const data = (await res.json()) as { output?: string }
    const raw = (data.output || '').trim()
    if (!raw) return null
    const parsed = safeParsePlan(raw)
    if (!parsed) return null
    return parsed
  } catch {
    return null
  }
}


function safeParsePlan(raw: string): AssistPlan | null {
  // Strip ``` fences if the model added them.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const obj = JSON.parse(cleaned) as Partial<AssistPlan>
    if (!obj || !Array.isArray(obj.actions)) return null
    return {
      rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
      actions: obj.actions.filter((a): a is AssistAction => !!a && typeof a.type === 'string'),
      finalQuestion: typeof obj.finalQuestion === 'string' ? obj.finalQuestion : undefined,
    }
  } catch {
    return null
  }
}
