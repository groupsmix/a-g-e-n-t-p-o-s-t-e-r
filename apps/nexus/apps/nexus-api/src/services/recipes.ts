// ============================================================
// Product "recipes" — the concrete format a deliverable takes
// ============================================================
// Borrowed from how printable/template generators ship a real, usable file
// (a planner, a checklist, a prompt pack) instead of a vague brief. Each
// recipe tells the deliverable writer what STRUCTURE to produce so the output
// is something a buyer can actually open and use.

export interface Recipe {
  format: string
  // Extra instruction appended to the deliverable prompt to shape structure.
  instruction: string
}

const RECIPES: Record<string, Recipe> = {
  planner: {
    format: 'Planner',
    instruction:
      'Produce a usable PLANNER: dated/period sections (e.g. weekly or monthly), each with fill-in fields, prompts, and small tables the buyer writes into. Include at least one table per section (use the "table" field). Keep instructional text short — the value is the structure they fill in.',
  },
  checklist: {
    format: 'Checklist',
    instruction:
      'Produce an actionable CHECKLIST: grouped sections, each with a "checklist" array of concrete, do-this-now items (verbs first). Add one or two sentences of context per group, no filler.',
  },
  template: {
    format: 'Template',
    instruction:
      'Produce a fill-in TEMPLATE: ready-to-copy blocks with clearly marked placeholders in [brackets], plus a short "how to use" note per block. The buyer should be able to paste a block and swap the brackets.',
  },
  prompt_pack: {
    format: 'Prompt Pack',
    instruction:
      'Produce a PROMPT PACK: sections by use-case, each with 4-8 copy-paste prompts. Each prompt must be specific and self-contained with [placeholders] for the user to fill. No meta commentary.',
  },
  guide: {
    format: 'Guide',
    instruction:
      'Produce a practical GUIDE: chapters that teach the buyer to get a concrete result, with at least one worked example and one checklist or table they can act on. Substance over throat-clearing.',
  },
  workbook: {
    format: 'Workbook',
    instruction:
      'Produce a WORKBOOK: short teaching per section followed by exercises the buyer completes (prompts + fill-in fields + a table). Each section ends with a checklist of what they should now have done.',
  },
}

// The format keys a user can force from the dashboard, with friendly labels.
export const RECIPE_OPTIONS: { key: string; label: string }[] = Object.entries(RECIPES).map(
  ([key, r]) => ({ key, label: r.format }),
)

// Look up a recipe by its key (e.g. 'prompt_pack'). Returns null for unknown
// keys so callers can fall back to keyword-matching.
export function getRecipe(key: string | null | undefined): Recipe | null {
  if (!key) return null
  return RECIPES[key] ?? null
}

// Pick a recipe from the domain/category/niche. Keyword-matched with a
// sensible default so every product gets a concrete, usable format.
export function pickRecipe(domainSlug: string, categorySlug: string, niche: string): Recipe {
  const hay = `${domainSlug} ${categorySlug} ${niche}`.toLowerCase()
  const has = (...words: string[]) => words.some((w) => hay.includes(w))

  if (has('prompt', 'gpt', 'midjourney', 'ai art')) return RECIPES.prompt_pack
  if (has('planner', 'calendar', 'schedule', 'journal', 'tracker', 'budget')) return RECIPES.planner
  if (has('checklist', 'audit', 'sop', 'process', 'launch', 'onboarding')) return RECIPES.checklist
  if (has('template', 'swipe', 'script', 'email', 'resume', 'cover letter', 'contract', 'proposal')) return RECIPES.template
  if (has('workbook', 'course', 'lesson', 'exercise', 'worksheet')) return RECIPES.workbook
  return RECIPES.guide
}
