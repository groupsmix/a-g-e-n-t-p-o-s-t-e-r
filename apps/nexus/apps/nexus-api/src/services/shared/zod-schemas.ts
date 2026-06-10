import { z } from 'zod'

export const researchMarketSchema = z.object({
  demand_signal: z.string(),
  top_competitors: z.array(
    z.object({
      name: z.string(),
      price: z.number(),
    })
  ),
  price_range: z.object({
    low: z.number(),
    high: z.number(),
    avg: z.number(),
  }),
  hooks: z.array(z.string()),
})

export const researchPsychologySchema = z.object({
  pains: z.array(z.string()),
  desires: z.array(z.string()),
  emotional_triggers: z.array(z.string()),
  voice: z.object({
    tone: z.string(),
    style: z.string(),
  }),
})

export const researchKeywordsSchema = z.object({
  primary: z.array(z.string()),
  long_tail: z.array(z.string()),
  question_keywords: z.array(z.string()),
})

export const generateSeoSchema = z.object({
  meta_title: z.string(),
  meta_description: z.string(),
  tags: z.array(z.string()),
})

export const generateTitleVariantsSchema = z.object({
  titles: z.array(z.string()),
})
