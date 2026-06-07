/**
 * Stage 3 — package the written units into a deliverable bundle.
 *
 * Output is a list of ProductAsset blobs the storefront adapter can
 * upload. We avoid heavy binary formats (no PDF generation) — every
 * asset is text/markdown/json so the worker can ship them as-is and
 * a downstream tool can convert to PDF if needed.
 *
 * Bundle conventions per kind:
 *   ebook         → README.md (TOC) + chapter-XX.md per unit
 *   prompt-pack   → README.md + prompts.json (uniform array) + per-prompt .md
 *   template-pack → README.md + templates/<slug>.md per unit
 *   mini-course   → README.md + course.json + lesson-XX.md per unit
 */

import type { PackagedProduct, ProductAsset, ProductBrief, ProductOutline } from '../types.js'
import type { UnitBody } from './writer.js'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function makeReadme(outline: ProductOutline): ProductAsset {
  const toc = outline.units.map((u, i) => `${i + 1}. ${u.title}`).join('\n')
  return {
    filename: 'README.md',
    mime: 'text/markdown',
    body: `# ${outline.title}\n\n${outline.summary}\n\n## Contents\n\n${toc}\n`,
  }
}

function buildSalesCopy(brief: ProductBrief, outline: ProductOutline): string {
  const bullets = outline.units.slice(0, 6).map((u) => `- ${u.title}`).join('\n')
  return [
    `# ${outline.title}`,
    '',
    outline.summary,
    '',
    `**Format:** ${brief.kind} · **Length:** ${outline.units.length} units`,
    '',
    `## What's inside`,
    '',
    bullets,
    '',
    `## Who it's for`,
    '',
    brief.audience ?? 'Anyone serious about ' + brief.topic + '.',
    '',
  ].join('\n')
}

export function packageProduct(
  brief: ProductBrief,
  outline: ProductOutline,
  units: UnitBody[],
): PackagedProduct {
  const assets: ProductAsset[] = [makeReadme(outline)]
  switch (outline.kind) {
    case 'ebook': {
      units.forEach((u, i) => {
        assets.push({
          filename: `chapter-${pad(i + 1)}-${slugify(u.title)}.md`,
          mime: 'text/markdown',
          body: `# ${u.title}\n\n${u.body}\n`,
        })
      })
      break
    }
    case 'prompt-pack': {
      const json = units.map((u) => ({ title: u.title, prompt: u.body }))
      assets.push({
        filename: 'prompts.json',
        mime: 'application/json',
        body: JSON.stringify(json, null, 2),
      })
      units.forEach((u) => {
        assets.push({
          filename: `prompts/${slugify(u.title)}.md`,
          mime: 'text/markdown',
          body: `# ${u.title}\n\n${u.body}\n`,
        })
      })
      break
    }
    case 'template-pack': {
      units.forEach((u) => {
        assets.push({
          filename: `templates/${slugify(u.title)}.md`,
          mime: 'text/markdown',
          body: `# ${u.title}\n\n${u.body}\n`,
        })
      })
      break
    }
    case 'mini-course': {
      const course = {
        title: outline.title,
        summary: outline.summary,
        lessons: units.map((u, i) => ({ id: pad(i + 1), title: u.title })),
      }
      assets.push({
        filename: 'course.json',
        mime: 'application/json',
        body: JSON.stringify(course, null, 2),
      })
      units.forEach((u, i) => {
        assets.push({
          filename: `lesson-${pad(i + 1)}-${slugify(u.title)}.md`,
          mime: 'text/markdown',
          body: `# Lesson ${i + 1}: ${u.title}\n\n${u.body}\n`,
        })
      })
      break
    }
  }
  return {
    brief,
    outline,
    salesCopy: buildSalesCopy(brief, outline),
    assets,
  }
}
