import puppeteer from '@cloudflare/puppeteer'
import type { Env } from '../env'

// Structured deliverable produced by the workflow's deliverable step. Kept
// deliberately simple so the HTML/PDF render is deterministic and clean.
export interface DeliverableSection {
  heading?: string
  content?: string
  checklist?: string[]
  table?: { headers?: string[]; rows?: string[][] }
}

export interface Deliverable {
  cover_title?: string
  cover_subtitle?: string
  intro?: string
  sections?: DeliverableSection[]
  closing?: string
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Render limited inline markdown (**bold**, *italic*) and turn blank lines
// into paragraphs. Everything is escaped first so content can't inject HTML.
function richText(s: string): string {
  const safe = esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
  return safe
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
}

function sectionHtml(s: DeliverableSection): string {
  const parts: string[] = []
  if (s.heading) parts.push(`<h2>${esc(s.heading)}</h2>`)
  if (s.content) parts.push(richText(s.content))
  if (Array.isArray(s.checklist) && s.checklist.length) {
    parts.push(
      `<ul class="check">${s.checklist
        .map((i) => `<li><span class="box"></span><span>${esc(i)}</span></li>`)
        .join('')}</ul>`,
    )
  }
  if (s.table && Array.isArray(s.table.rows) && s.table.rows.length) {
    const headers = Array.isArray(s.table.headers) ? s.table.headers : []
    const thead = headers.length
      ? `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`
      : ''
    const tbody = `<tbody>${s.table.rows
      .map((r) => `<tr>${(Array.isArray(r) ? r : []).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody>`
    parts.push(`<table>${thead}${tbody}</table>`)
  }
  return `<section>${parts.join('\n')}</section>`
}

// Build a clean, print-ready HTML document for the deliverable. `format` is
// the recipe label (Planner, Checklist, …); `brand` is shown in the footer.
export function buildDeliverableHtml(d: Deliverable, format: string, brand = 'NEXUS'): string {
  const title = d.cover_title || 'Your product'
  const sections = Array.isArray(d.sections) ? d.sections.map(sectionHtml).join('\n') : ''
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a2e; margin: 0; line-height: 1.55; font-size: 12px; }
  .cover { padding: 90px 56px 70px; background: linear-gradient(135deg,#6d28d9,#9333ea); color:#fff; }
  .cover .kicker { text-transform: uppercase; letter-spacing: .18em; font-size: 11px; opacity:.85; }
  .cover h1 { font-size: 34px; line-height:1.15; margin: 14px 0 8px; }
  .cover p { font-size: 14px; opacity:.92; margin:0; max-width: 70%; }
  .page { padding: 40px 56px; }
  .intro { font-size: 13px; color:#39394f; border-left: 3px solid #9333ea; padding-left: 14px; margin-bottom: 26px; }
  h2 { font-size: 17px; margin: 26px 0 8px; color:#3b0764; border-bottom:1px solid #eee; padding-bottom:4px; }
  p { margin: 0 0 10px; }
  ul.check { list-style: none; padding: 0; margin: 8px 0 14px; }
  ul.check li { display:flex; gap:9px; align-items:flex-start; margin:6px 0; }
  ul.check .box { width:13px; height:13px; border:1.5px solid #9333ea; border-radius:3px; margin-top:2px; flex:0 0 auto; }
  table { width:100%; border-collapse: collapse; margin: 10px 0 16px; }
  th, td { border:1px solid #d9d9e3; padding:7px 9px; text-align:left; vertical-align:top; }
  th { background:#f5f0ff; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  td { height: 26px; }
  .closing { margin-top: 28px; padding: 16px 18px; background:#f5f0ff; border-radius:10px; font-size:12px; }
  .foot { margin-top: 30px; padding-top: 12px; border-top:1px solid #eee; font-size:10px; color:#8a8aa0; }
  section { break-inside: avoid; }
  </style></head><body>
  <div class="cover">
    <div class="kicker">${esc(format)}</div>
    <h1>${esc(title)}</h1>
    ${d.cover_subtitle ? `<p>${esc(d.cover_subtitle)}</p>` : ''}
  </div>
  <div class="page">
    ${d.intro ? `<div class="intro">${richText(d.intro)}</div>` : ''}
    ${sections}
    ${d.closing ? `<div class="closing">${richText(d.closing)}</div>` : ''}
    <div class="foot">Created by ${esc(brand)} · ${esc(title)}</div>
  </div>
  </body></html>`
}

// Render an HTML string to a PDF using Browser Rendering. Returns null when
// the BROWSER binding isn't available (so callers can fall back to HTML/MD).
export async function renderPdf(env: Env, html: string): Promise<Uint8Array | null> {
  if (!env.BROWSER) return null
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    browser = await puppeteer.launch(env.BROWSER)
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 }).catch(async () => {
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 })
    })
    const pdf = (await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '24px', left: '0', right: '0' },
    })) as Uint8Array
    return pdf
  } catch (err) {
    console.error('[pdf] render failed:', err)
    return null
  } finally {
    try {
      await browser?.close()
    } catch {
      /* noop */
    }
  }
}
