// Prompt Builder - Assembles all layers into final prompts
import { MASTER_SYSTEM_PROMPT } from './master'
import { PERSONAS, getPersona } from './personas'
import { ROLES, getRole } from './roles'
import type { SchemaType } from './schemas'
import { SCHEMAS } from './schemas'

export interface BuilderOptions {
  personaId?: string
  roleId?: string
  domainId?: string
  categoryId?: string
  platformId?: string
  socialChannelId?: string
  winnerPatterns?: string[]
  customInstructions?: string
  schema?: SchemaType
  variables?: Record<string, string>
}

export interface LayeredPrompt {
  fullPrompt: string
  layers: string[]
  schema?: string
}

const DEFAULT_PERSONA = 'marcus_chen'

// Domain prompts
const DOMAIN_PROMPTS: Record<string, string> = {
  pod: `DOMAIN: Print-on-Demand (POD)

Market reality for 2025:
- Etsy has 96 million buyers. 70% browse on mobile.
- The average buyer decides in 2-3 seconds based on thumbnail + title only.
- Hyper-niche identity products massively outperform generic designs.
  "Dog owner" → weak. "Golden Retriever mom who works from home" → strong.
- The best-selling POD products are identity statements, not just designs.
  Buyers are saying: "This is who I am and I want others to know it."
- Text-based designs outperform illustration-heavy designs for new sellers.
  Text is clear on thumbnails. Complex art gets lost at 150px.

POD-specific rules:
- ALWAYS mention: unisex sizing, true-to-size, soft material (if apparel)
- ALWAYS include a size guide CTA: "Check our size chart before ordering"
- Design must work on BOTH light and dark colored products unless specified
- Price formula: Printful cost × 2.5 = minimum. × 3 = healthy margin.
- Best price endings for POD: $24.99, $29.99, $34.99
- Etsy tags for POD: use "[niche] gift" "[niche] shirt" "[identity] tee" "[occasion] present"`,

  'digital-products': `DOMAIN: Digital Products (instant download)

Market reality for 2025:
- Gumroad has $500M+ processed. Average conversion: 2-4% from product page.
- Buyers don't want information. They want transformation. They want the outcome.
  "100-page guide to productivity" → weak
  "The system that helped me reclaim 2 hours every day in 30 days" → strong
- Digital product buyers are sophisticated. They've bought bad products before.
  They are looking for red flags: generic content, AI-written fluff, vague promises.
- Preview images convert. Show a screenshot of actual content pages.
  Describe the interior visually: "You'll get 12 fillable Notion pages with..."
- The best-converting price points: $9, $17, $27, $47, $97
  Never $10, $20, $30 — these feel arbitrary. $27 feels considered.

Digital product rules:
- ALWAYS specify: "Instant download after purchase"
- ALWAYS specify: "Compatible with [free tools]" where relevant
- ALWAYS include what they get (the deliverable) and what they achieve (the outcome)
- For Notion templates: specify "Free Notion account required"
- For PDFs: specify page count and whether it's fillable`,

  'content-media': `DOMAIN: Content & Media

Market reality for 2025:
- Stock media market is saturated. Differentiation is everything.
- Buyers want: authenticity, niche relevance, production quality
- Social media creators need: hooks, variations, platform-specific formats
- Audio content: growing demand for ambient, background, and introspectuve pieces

Content & Media rules:
- ALWAYS specify intended use case
- ALWAYS mention file formats and quality specs
- ALWAYS include licensing clarity (personal vs commercial)`,

  freelance: `DOMAIN: Freelance Services

Market reality for 2025:
- Fiverr/Upwork saturated with generic services.
- Differentiation through hyper-specialization and portfolio quality.
- Buyers want to see: past results, clear process, fast turnaround.

Freelance rules:
- Portfolio samples convert more than feature lists.
- Clear deliverables with exact specs.
- Fast response time expectations.`,
  
  affiliate: `DOMAIN: Affiliate Marketing

Market reality for 2025:
- Commission rates vary: 3% (physical) to 50%+ (digital products).
- Trust is currency. Recommendations must feel authentic.
- Content must provide value first, recommend second.

Affiliate rules:
- Never sound like an advertisement.
- Comparison content converts best.
- Honest pros and cons build trust.`
}

// Category-specific overrides
const CATEGORY_PROMPTS: Record<string, string> = {
  'notion-templates': `CATEGORY: Notion Templates

Key rules:
- Specify: "Compatible with Notion (free account)"
- List the EXACT pages included
- Show the workflow: what they do, in what order, for what outcome
- Price: $9-$47 typical for templates`,
  
  't-shirts': `CATEGORY: T-Shirts

Key rules:
- Hyper-niche identity > generic design
- Text-forward designs work best for new POD sellers
- Must include: material (cotton blend), fit (true to size), care instructions
- Best niches: profession, hobby, identity, pet parent, inside joke`,
  
  'mugs': `CATEGORY: Mugs

Key rules:
- Dishwasher/microwave safe MUST be mentioned
- 11oz or 15oz - specify
- Best for: inside jokes, identity statements, profession humor`,
  
  'stickers': `CATEGORY: Stickers

Key rules:
- Size must be specified
- Material: vinyl, weatherproof
- Best for: hyper-niche identity, brand building
- Common sizes: 2", 3", 4"`,
  
  'hoodies': `CATEGORY: Hoodies

Key rules:
- Material: cotton blend, fleece lined
- Sizes: XS-5XL typically
- Price higher than t-shirts: $39.99-$49.99
- Great for: tight-knit community identity products`
}

// Platform-specific rules
const PLATFORM_PROMPTS: Record<string, string> = {
  etsy: `PLATFORM: Etsy

Rules:
- Title: 140 chars max, primary keyword in first 40
- Tags: 13 tags, each 20 chars max, exact buyer phrases
- Description: HTML-free, mobile-first, scannable
- Etsy banned words: "best seller", "unique design", any competitor names
- Conversion: Add to cart > Reviews > Price anchoring`,
  
  gumroad: `PLATFORM: Gumroad

Rules:
- Title: Clear product name + format
- Description: Transformation-focused, show previews
- Price: $9, $17, $27, $47, $97 — never round numbers
- Gumroad takes 10% but has built-in audience
- Instant delivery is a selling point`,
  
  shopify: `PLATFORM: Shopify

Rules:
- SEO title: 70 chars max
- SEO description: 160 chars max
- Product description: Can use HTML, longer form allowed
- Focus on: brand story, trust signals, social proof`,
  
  amazon: `PLATFORM: Amazon

Rules:
- Title: 200 chars max, brand + product + key features
- Bullets: 5 points, each 200 chars max
- Description: A+ content if available
- Competition is fierce, differentiation critical`,
  
  creative_fabrica: `PLATFORM: Creative Fabrica

Rules:
- Focus on: craft projects, SVG/DXF files
- Show multiple mockups
- List: file formats, dimensions, commercial license included`
}

// Social channel prompts
const SOCIAL_PROMPTS: Record<string, string> = {
  instagram: `CHANNEL: Instagram

Rules:
- Caption: 150-300 chars for feed, longer for carousel
- Hashtags: 5-10, mix of broad and niche
- Hook must hit in first line
- Visual-first: image/video stops the scroll, caption closes`,
  
  tiktok: `CHANNEL: TikTok

Rules:
- Hook: First 3 seconds must stop the scroll
- Trend audio: leverage trending sounds
- Captions: 80-100 chars max
- Hashtags: 3-5 relevant tags
- DIY/tutorial/stitch format converts well`,
  
  pinterest: `CHANNEL: Pinterest

Rules:
- Pin titles: SEO keywords + visual description
- Rich pins: enable for automatic product updates
- Board strategy: group by niche/topic
- Vertical images: 2:3 ratio (1000x1500 ideal)`,

  twitter: `CHANNEL: Twitter/X

Rules:
- Hook: First sentence must create curiosity or controversy
- Length: 100-280 chars for reach
- Thread format: Hook + 3-5 value tweets + CTA
- Hashtags: 1-2 max`,

  youtube: `CHANNEL: YouTube

Rules:
- Thumbnail: Text overlay, emotional hook, contrast colors
- Title: Keyword + hook format
- Description: First 150 chars show in search
- Tags: 5-8 relevant keywords`
}

/**
 * Build a complete layered prompt
 */
export function buildPrompt(options: BuilderOptions): LayeredPrompt {
  const layers: string[] = []
  let prompt = ''

  // Layer 0: Persona
  const personaId = options.personaId || DEFAULT_PERSONA
  const persona = getPersona(personaId) || PERSONAS[DEFAULT_PERSONA]
  prompt += `=== PERSONA ===\n${persona.prompt}\n\n`
  layers.push(`persona:${personaId}`)

  // Layer 1: Master
  prompt += `=== MASTER RULES ===\n${MASTER_SYSTEM_PROMPT}\n\n`
  layers.push('master')

  // Layer 2: Role
  if (options.roleId) {
    const role = getRole(options.roleId) || ROLES[options.roleId]
    if (role) {
      prompt += `=== ROLE: ${role.name} ===\n${role.prompt}\n\n`
      layers.push(`role:${options.roleId}`)
    }
  }

  // Layer 3: Domain
  if (options.domainId) {
    const domainPrompt = DOMAIN_PROMPTS[options.domainId]
    if (domainPrompt) {
      prompt += `=== DOMAIN CONTEXT ===\n${domainPrompt}\n\n`
      layers.push(`domain:${options.domainId}`)
    }
  }

  // Layer 4: Category
  if (options.categoryId) {
    const categoryPrompt = CATEGORY_PROMPTS[options.categoryId]
    if (categoryPrompt) {
      prompt += `=== CATEGORY CONTEXT ===\n${categoryPrompt}\n\n`
      layers.push(`category:${options.categoryId}`)
    }
  }

  // Layer 5: Platform
  if (options.platformId) {
    const platformPrompt = PLATFORM_PROMPTS[options.platformId]
    if (platformPrompt) {
      prompt += `=== PLATFORM CONTEXT ===\n${platformPrompt}\n\n`
      layers.push(`platform:${options.platformId}`)
    }
  }

  // Layer 5b: Social Channel
  if (options.socialChannelId) {
    const socialPrompt = SOCIAL_PROMPTS[options.socialChannelId]
    if (socialPrompt) {
      prompt += `=== SOCIAL CHANNEL CONTEXT ===\n${socialPrompt}\n\n`
      layers.push(`social:${options.socialChannelId}`)
    }
  }

  // Layer 6: Winner Patterns
  if (options.winnerPatterns && options.winnerPatterns.length > 0) {
    prompt += `=== YOUR WINNING PATTERNS ===\n`
    prompt += `Learned from ${options.winnerPatterns.length} approved products:\n`
    options.winnerPatterns.forEach((pattern, i) => {
      prompt += `${i + 1}. ${pattern}\n`
    })
    prompt += `\nApply these patterns. They are proven for your specific market.\n\n`
    layers.push('winner_patterns')
  }

  // Layer 7: Task/Custom Instructions
  if (options.customInstructions) {
    prompt += `=== TASK ===\n${options.customInstructions}\n\n`
    layers.push('task')
  }

  // Layer 8: Output Schema
  let schema: string | undefined
  if (options.schema && SCHEMAS[options.schema]) {
    schema = JSON.stringify(SCHEMAS[options.schema], null, 2)
    prompt += `=== OUTPUT SCHEMA (REQUIRED) ===\n${schema}\n\n`
    prompt += `You MUST return valid JSON matching this exact schema. No additional text.`
    layers.push('schema')
  }

  // Substitute variables
  if (options.variables) {
    Object.entries(options.variables).forEach(([key, value]) => {
      prompt = prompt.replace(new RegExp(`\\[${key}\\]`, 'g'), value)
    })
  }

  return {
    fullPrompt: prompt.trim(),
    layers,
    schema
  }
}

/**
 * Build a simple prompt without layers
 */
export function buildSimplePrompt(
  instructions: string,
  schema?: SchemaType,
  variables?: Record<string, string>
): LayeredPrompt {
  let prompt = instructions
  
  let schemaStr: string | undefined
  if (schema && SCHEMAS[schema]) {
    schemaStr = JSON.stringify(SCHEMAS[schema], null, 2)
    prompt += `\n\n=== OUTPUT SCHEMA (REQUIRED) ===\n${schemaStr}\n\n`
    prompt += `You MUST return valid JSON matching this exact schema. No additional text.`
  }

  if (variables) {
    Object.entries(variables).forEach(([key, value]) => {
      prompt = prompt.replace(new RegExp(`\\[${key}\\]`, 'g'), value)
    })
  }

  return {
    fullPrompt: prompt.trim(),
    layers: ['simple'],
    schema: schemaStr
  }
}

// Export domain/category/platform prompts for external use
export {
  DOMAIN_PROMPTS,
  CATEGORY_PROMPTS,
  PLATFORM_PROMPTS,
  SOCIAL_PROMPTS
}
