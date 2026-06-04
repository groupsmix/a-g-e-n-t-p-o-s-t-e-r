import type { PlaybookStage } from './types'

export type PodProductType = 'tshirt' | 'hoodie' | 'mug' | 'sticker' | 'poster' | 'tote_bag'
export type PodStyle = 'funny' | 'minimalist' | 'vintage' | 'luxury' | 'cute' | 'bold'
export type PodPlatform = 'etsy' | 'shopify' | 'printful' | 'printify' | 'gelato' | 'redbubble' | 'merch_by_amazon' | 'gumroad'

export type PodAgentRole = 'ceo' | 'trend_niche' | 'trademark_risk' | 'design_director' | 'image_design' | 'mockup' | 'listing' | 'pod_qa'

export interface PodIntakeQuestion {
  field: string
  question: string
  required: boolean
  placeholder: string
}

export const POD_INTAKE_QUESTIONS: PodIntakeQuestion[] = [
  { field: 'niche', question: 'What niche / topic / audience?', required: true, placeholder: 'Dog lovers, gym motivation, teacher appreciation' },
  { field: 'product_type', question: 'What product type?', required: true, placeholder: 'mug, sticker, poster, t-shirt' },
  { field: 'target_buyer', question: 'Who is the ideal buyer?', required: true, placeholder: 'Women 25-35, dog moms, gift buyers' },
  { field: 'style', question: 'Design style?', required: true, placeholder: 'Funny, minimalist, vintage, bold, cute' },
  { field: 'slogans', question: 'Text / slogan ideas (if any)', required: false, placeholder: '"Best Dog Mom Ever", "Gym & Tonic"' },
  { field: 'colors', question: 'Preferred colors', required: false, placeholder: 'Black background with gold text, earth tones' },
  { field: 'platform', question: 'Which platform to sell on?', required: true, placeholder: 'Etsy, Redbubble, Gumroad, Merch by Amazon' },
  { field: 'variations', question: 'How many design variations?', required: false, placeholder: '3-5 variations' },
  { field: 'commercial_use', question: 'Need commercial-use license for assets?', required: false, placeholder: 'Yes — all generated assets must be commercial-use safe' },
]

export const POD_TRADEMARK_BLACKLIST = [
  'nike', 'adidas', 'supreme', 'gucci', 'chanel', 'louis vuitton',
  'disney', 'marvel', 'star wars', 'harry potter', 'pokemon', 'nintendo',
  'nfl', 'nba', 'mlb', 'nhl', 'fifa',
  'coca-cola', 'pepsi', 'starbucks', 'mcdonalds',
  'apple', 'google', 'amazon', 'microsoft', 'meta', 'facebook',
  'taylor swift', 'beyonce', 'drake', 'kanye',
  'batman', 'superman', 'spider-man', 'spiderman', 'avengers',
  'hello kitty', 'sanrio', 'anime',
  'just do it', 'think different', 'i\'m lovin it',
]

export const POD_PLAYBOOK: PlaybookStage[] = [
  {
    name: 'niche_research',
    agent_role: 'research',
    title: 'Niche & Trend Research',
    default_criteria: [
      'Target buyer persona defined with specifics',
      'Trend angle identified (seasonal, evergreen, viral)',
      'Competitor examples analyzed (min 3 listings)',
      'Price range established',
      'Saturation / risk level assessed',
      'Sources included',
    ],
    instructions_template:
      'Research the POD niche: who buys this, current trends, competitor listings with prices, saturation level. Include specific Etsy/Redbubble URLs as evidence. Assess if this niche is worth entering.',
  },
  {
    name: 'design_brief',
    agent_role: 'strategy',
    title: 'Design Brief & Direction',
    default_criteria: [
      'Exact product type and dimensions specified',
      'Buyer emotion / appeal defined',
      'Minimum 5 slogan/text options',
      'Visual style clearly described',
      'Color palette defined',
      'Print requirements noted (DPI, transparency, bleed)',
    ],
    instructions_template:
      'Create a detailed design brief: product specs, buyer emotion, 5+ slogan options, visual style direction, color palette, and technical print requirements. Be specific — a designer should be able to execute from this brief alone.',
  },
  {
    name: 'trademark_check',
    agent_role: 'qa',
    title: 'Trademark & Copyright Check',
    default_criteria: [
      'All slogans checked against trademark databases',
      'No brand names, celebrity names, or copyrighted characters',
      'No sports team references',
      'No Disney/Marvel/anime/game characters',
      'No copyrighted quotes or trademarked slogans',
      'Clear to proceed flag',
    ],
    instructions_template:
      'Check every slogan, phrase, and design concept for trademark/copyright issues. Flag anything containing brand names, celebrity names, sports teams, copyrighted characters, or trademarked slogans. POD accounts get banned fast for IP violations. Be thorough.',
  },
  {
    name: 'design_generation',
    agent_role: 'production',
    title: 'Design Generation',
    default_criteria: [
      'Design prompts match approved brief',
      'Minimum 3 design variations',
      'Text is readable and well-positioned',
      'Transparent background or correct format',
      'Correct resolution for print',
      'No copyrighted elements',
    ],
    instructions_template:
      'Generate design prompts and create 3 design variations based on the approved brief. Each variation should have a different angle (text layout, color scheme, or style). Describe each design in detail. Include exact prompts for AI image generation.',
  },
  {
    name: 'design_qa',
    agent_role: 'qa',
    title: 'Design QA Review',
    default_criteria: [
      'Text is readable at print size',
      'No trademark/copyright issues',
      'Suitable for printing (resolution, colors, bleed)',
      'Not too generic or AI-looking',
      'Background/transparency correct',
      'Correct aspect ratio for product',
    ],
    instructions_template:
      'Review all designs against quality and legal criteria. Check: text readability at print size, trademark safety, print suitability, originality (not generic AI art), background handling, and aspect ratio. Flag any issues.',
  },
  {
    name: 'mockup_generation',
    agent_role: 'production',
    title: 'Mockup Generation',
    default_criteria: [
      'Product mockup shows design on actual product',
      'Multiple angles/views if applicable',
      'Professional presentation quality',
      'Colors accurate to design',
    ],
    instructions_template:
      'Create product mockup descriptions: how the design looks on the actual product (t-shirt, mug, poster, etc). Describe each mockup scene. Include dimensions, placement, and lifestyle context for listing photos.',
  },
  {
    name: 'listing_creation',
    agent_role: 'production',
    title: 'Listing Copy & Tags',
    default_criteria: [
      'Platform-optimized title with keywords',
      'Compelling description with features and benefits',
      'Correct number of tags for platform',
      'Price suggestion with justification',
      'Platform-specific formatting',
    ],
    instructions_template:
      'Write the full product listing: SEO title, description, tags, price suggestion, and category. Format for the target platform. Include relevant keywords naturally. Make the description sell the emotion, not just the product.',
  },
  {
    name: 'package',
    agent_role: 'client_comm',
    title: 'Upload Package',
    default_criteria: [
      'All design files listed',
      'Mockup images listed',
      'Listing copy ready to paste',
      'Upload checklist complete',
      'Owner approval requested',
    ],
    instructions_template:
      'Prepare the final upload package: list all design files, mockup images, listing copy, tags, pricing, and a step-by-step upload checklist for the platform. This is for owner review before publishing.',
  },
]

export const POD_AGENT_PROMPTS: Record<string, string> = {
  trend_niche: `You are the Trend/Niche Agent for print-on-demand. You find profitable buyer angles, trending niches, and validate market demand.
Every claim must include evidence (Etsy listings, search trends, competitor URLs).
Return structured JSON only with sources array populated.`,

  trademark_risk: `You are the Trademark/Risk Agent. You check designs, slogans, and concepts for IP violations.
You must reject anything containing: brand names, celebrity names, sports teams, Disney/Marvel/anime/game characters, copyrighted quotes, or trademarked slogans.
POD accounts get banned instantly for IP violations. Be extremely strict.
Return structured JSON only.`,

  design_director: `You are the Design Director Agent. You create detailed design briefs and AI image generation prompts.
Your briefs must be specific enough that any designer or AI tool can execute them without guessing.
Include exact: dimensions, colors (hex), typography direction, layout, mood, and print specs.
Return structured JSON only.`,

  image_design: `You are the Image/Design Agent. You create design variations and AI generation prompts.
Each design must be: original, print-ready, readable at product size, and commercially safe.
Never include copyrighted characters, brand logos, or trademarked phrases.
Return structured JSON only.`,

  mockup: `You are the Mockup Agent. You create product preview descriptions and mockup specifications.
Describe exactly how the design appears on the product in a lifestyle setting.
Return structured JSON only.`,

  listing: `You are the Listing Agent for POD platforms. You write SEO-optimized titles, descriptions, and tags.
Use platform-specific formatting (Etsy: 13 tags max, title under 140 chars; Redbubble: different tag rules).
Write copy that sells emotion and value, not just product specs.
Return structured JSON only.`,

  pod_qa: `You are the POD QA Agent. You check everything: print readiness, trademark safety, listing quality, and platform compliance.
Reject anything with: brand names, celebrity refs, copyrighted material, low-res designs, or generic AI output.
Be extremely strict — one IP violation can get an entire shop banned.
Return structured JSON only.`,
}

// ── Print file specifications per product type ──────────────

export interface PrintSpec {
  width: number
  height: number
  dpi: number
  format: string
  notes: string
}

export const PRINT_SPECS: Record<PodProductType, PrintSpec> = {
  tshirt: { width: 4500, height: 5400, dpi: 300, format: 'PNG (transparent)', notes: 'Transparent background required. Design area centered.' },
  hoodie: { width: 4500, height: 5400, dpi: 300, format: 'PNG (transparent)', notes: 'Same as t-shirt. Keep design away from zipper area.' },
  mug: { width: 4800, height: 2000, dpi: 300, format: 'PNG', notes: 'Wraparound design. Check supplier template for handle placement.' },
  sticker: { width: 3000, height: 3000, dpi: 300, format: 'PNG (transparent) or SVG', notes: 'Transparent background. Leave 1/8" bleed. Cut-safe border.' },
  poster: { width: 7200, height: 10800, dpi: 300, format: 'PNG or PDF', notes: 'High-res vertical orientation. 18x24 inches at 300 DPI.' },
  tote_bag: { width: 4500, height: 4500, dpi: 300, format: 'PNG (transparent)', notes: 'Square design area. Keep design centered and readable.' },
}

// ── Platform-specific rules ─────────────────────────────────

export interface PlatformRules {
  name: string
  max_title_length: number
  max_tags: number
  max_description_length: number
  image_requirements: string
  fee_percent: number
  notes: string
}

export const PLATFORM_RULES: Record<PodPlatform, PlatformRules> = {
  etsy: { name: 'Etsy', max_title_length: 140, max_tags: 13, max_description_length: 10000, image_requirements: 'Min 5 images, first image is thumbnail', fee_percent: 6.5, notes: 'Listing fee $0.20. Renews every 4 months.' },
  shopify: { name: 'Shopify', max_title_length: 255, max_tags: 250, max_description_length: 50000, image_requirements: 'Recommended 2048x2048', fee_percent: 2.9, notes: 'Monthly plan required. Custom domain recommended.' },
  printful: { name: 'Printful', max_title_length: 200, max_tags: 0, max_description_length: 5000, image_requirements: 'Per product template', fee_percent: 0, notes: 'Base cost + shipping. No listing fees.' },
  printify: { name: 'Printify', max_title_length: 200, max_tags: 0, max_description_length: 5000, image_requirements: 'Per product template', fee_percent: 0, notes: 'Free plan: 5 stores. Premium: unlimited.' },
  gelato: { name: 'Gelato', max_title_length: 200, max_tags: 0, max_description_length: 5000, image_requirements: 'Per product template', fee_percent: 0, notes: 'Local production in 32 countries. Lower shipping.' },
  redbubble: { name: 'Redbubble', max_title_length: 150, max_tags: 15, max_description_length: 5000, image_requirements: 'Min 7632x6480 for all products', fee_percent: 0, notes: 'Set your own markup. Default ~20%.' },
  merch_by_amazon: { name: 'Merch by Amazon', max_title_length: 60, max_tags: 2, max_description_length: 2000, image_requirements: '4500x5400 PNG transparent', fee_percent: 0, notes: 'Invitation only. Tiered: start at 10 designs.' },
  gumroad: { name: 'Gumroad', max_title_length: 255, max_tags: 5, max_description_length: 50000, image_requirements: 'Cover image + gallery', fee_percent: 10, notes: 'Best for digital download designs/bundles.' },
}

// ── Product research scoring ────────────────────────────────

export interface ProductResearchScore {
  demand: number
  competition: number
  uniqueness: number
  buyer_emotion: number
  trademark_risk: number
  production_difficulty: number
  expected_margin: number
  overall: number
  recommendation: 'proceed' | 'caution' | 'reject'
  notes: string
}

// ── Pricing / margin calculator ─────────────────────────────

export interface PodMarginCalc {
  base_cost: number
  shipping: number
  platform_fee_percent: number
  selling_price: number
  platform_fee_amount: number
  profit: number
  margin_percent: number
}

export function calculatePodMargin(
  baseCost: number,
  shipping: number,
  platformFeePercent: number,
  sellingPrice: number,
): PodMarginCalc {
  const platformFeeAmount = sellingPrice * (platformFeePercent / 100)
  const profit = sellingPrice - baseCost - shipping - platformFeeAmount
  const marginPercent = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0

  return {
    base_cost: baseCost,
    shipping,
    platform_fee_percent: platformFeePercent,
    selling_price: sellingPrice,
    platform_fee_amount: Math.round(platformFeeAmount * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    margin_percent: Math.round(marginPercent * 10) / 10,
  }
}

// ── Design collection structure ─────────────────────────────

export interface DesignCollection {
  id: string
  name: string
  niche: string
  style: PodStyle
  designs: string[]
  products: PodProductType[]
  brand_pack: BrandPack | null
  created_at: string
}

export interface BrandPack {
  niche: string
  color_palette: string[]
  font_style: string
  tone: string
  design_rules: string[]
  slogan_patterns: string[]
}
