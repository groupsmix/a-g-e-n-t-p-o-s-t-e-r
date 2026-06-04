import type { PlaybookStage } from './types'

export type DigitalProductCategory =
  | 'template'
  | 'guide_ebook'
  | 'worksheet_planner'
  | 'business_asset'
  | 'content_pack'

export type DigitalProductFormat =
  | 'notion'
  | 'google_sheets'
  | 'canva'
  | 'pdf'
  | 'doc'
  | 'spreadsheet'
  | 'bundle'

export interface DigitalProductIntakeQuestion {
  field: string
  question: string
  required: boolean
  placeholder: string
}

export const DIGITAL_PRODUCT_INTAKE_QUESTIONS: DigitalProductIntakeQuestion[] = [
  { field: 'category', question: 'Product category?', required: true, placeholder: 'Template / Guide / Worksheet / Business Asset / Content Pack' },
  { field: 'niche', question: 'What niche or audience?', required: true, placeholder: 'Freelancers, small business owners, real estate agents, coaches' },
  { field: 'pain_point', question: 'What problem does this solve?', required: true, placeholder: 'Clients struggle to onboard new customers — no organized process' },
  { field: 'product_idea', question: 'Product idea / name', required: true, placeholder: 'Freelancer Client Onboarding Kit' },
  { field: 'format', question: 'Format (Notion, Google Sheets, Canva, PDF, etc)?', required: true, placeholder: 'Notion template + PDF checklist' },
  { field: 'included_files', question: 'What files/pages should be included?', required: false, placeholder: 'Welcome doc, intake form, project tracker, invoice template' },
  { field: 'target_price', question: 'Target price range?', required: false, placeholder: '$9-$29' },
  { field: 'platform', question: 'Sell on which platform?', required: true, placeholder: 'Gumroad / Etsy / Shopify' },
  { field: 'competitor_examples', question: 'Competitor products to beat (URLs)', required: false, placeholder: 'https://gumroad.com/competitor-product' },
  { field: 'unique_angle', question: 'What makes this different from competitors?', required: false, placeholder: 'Built from real freelance experience, not generic templates' },
]

export const DIGITAL_PRODUCT_PLAYBOOK: PlaybookStage[] = [
  {
    name: 'niche_validation',
    agent_role: 'research',
    title: 'Niche & Market Validation',
    default_criteria: [
      'Target buyer clearly identified with specifics',
      'Pain point validated with evidence',
      'Competitor products analyzed (min 3)',
      'Price range established with market data',
      'Saturation/opportunity score assessed',
      'Sources included',
    ],
    instructions_template:
      'Research the digital product niche: who buys this, what specific pain it solves, competitor products with prices and reviews, market saturation level. Include URLs as evidence. Assess if this product can compete.',
  },
  {
    name: 'product_concept',
    agent_role: 'strategy',
    title: 'Product Concept & Strategy',
    default_criteria: [
      'Product name is specific and compelling',
      'Clear promise/outcome for buyer',
      'Target buyer persona defined',
      'Format chosen with justification',
      'List of included files/pages specified',
      'Differentiation from competitors clear',
    ],
    instructions_template:
      'Define the product concept: name, buyer promise, format, included files/sections, and what makes it different from competitors. The product must be a TOOL (usable), not just content (readable). Be specific about deliverables.',
  },
  {
    name: 'outline_structure',
    agent_role: 'strategy',
    title: 'Outline & Structure',
    default_criteria: [
      'Complete table of contents / module list',
      'Each section has clear purpose',
      'Deliverables are specific and actionable',
      'Structure is logical and user-friendly',
      'No filler sections — every part adds value',
    ],
    instructions_template:
      'Create the complete product outline: table of contents, modules/pages/sections, and exact deliverables for each part. Every section must serve a purpose. No padding. Structure should make the product easy to use immediately.',
  },
  {
    name: 'content_production',
    agent_role: 'production',
    title: 'Content Production',
    default_criteria: [
      'Actual usable content created, not just descriptions',
      'Content is specific to niche, not generic',
      'No AI filler phrases or placeholder text',
      'Instructions are clear for end user',
      'Content is actionable and practical',
      'Fills the approved outline completely',
    ],
    instructions_template:
      'Create the REAL product content — not marketing copy, not an outline, the actual downloadable product content. Every section must contain usable, actionable, niche-specific material. A buyer should be able to use this immediately. No generic AI content.',
  },
  {
    name: 'design_packaging',
    agent_role: 'production',
    title: 'Design & Packaging',
    default_criteria: [
      'Cover image concept described',
      'Preview pages/screenshots planned',
      'Professional formatting specified',
      'Template styling consistent',
      'File format correct for platform',
    ],
    instructions_template:
      'Design the product packaging: cover image description, preview page mockups, formatting/styling guidelines, and file preparation specs. The product should look professional and sell well in thumbnails.',
  },
  {
    name: 'quality_review',
    agent_role: 'qa',
    title: 'Quality Review',
    default_criteria: [
      'Product is useful enough to justify the price',
      'Content is specific to niche, not generic',
      'No AI filler phrases or vague sections',
      'No missing sections from outline',
      'Easy to use without additional explanation',
      'Clear instructions included',
      'Would pass a refund test — buyer gets real value',
    ],
    instructions_template:
      'Review the complete product against quality criteria. Key question: would you pay for this? Check: usefulness, niche specificity, completeness, ease of use, no AI filler, clear instructions. Flag anything that feels generic or incomplete.',
  },
  {
    name: 'listing_creation',
    agent_role: 'production',
    title: 'Listing Creation',
    default_criteria: [
      'Title is SEO-optimized and specific',
      'Description sells the outcome, not the format',
      'Bullet benefits are concrete',
      'Tags/keywords are platform-appropriate',
      'Price justified with market comparison',
      'FAQ addresses common objections',
      'Refund policy note included',
    ],
    instructions_template:
      'Write the complete product listing: SEO title, benefit-focused description, bullet points, tags/keywords, price justification, FAQ (min 3 questions), and refund policy note. Format for the target platform.',
  },
  {
    name: 'package',
    agent_role: 'client_comm',
    title: 'Final Package',
    default_criteria: [
      'Downloadable file list complete',
      'Preview images described',
      'Listing copy ready to paste',
      'Customer instructions included',
      'Upsell ideas listed',
      'Owner approval requested',
    ],
    instructions_template:
      'Prepare the final upload package: downloadable files list, preview images, listing copy, customer welcome/instructions, and 2-3 upsell product ideas. This is for owner review before publishing.',
  },
]

export const DIGITAL_PRODUCT_AGENT_PROMPTS: Record<string, string> = {
  market_research: `You are the Market Research Agent for digital products. You find buyer pain points, analyze competitor products, and validate niche demand.
Every claim must include evidence (Gumroad/Etsy listings, reviews, search trends).
Return structured JSON only with sources array populated.`,

  product_strategist: `You are the Product Strategist Agent. You decide product angles, structures, and differentiation.
Products must be TOOLS (usable), not just content (readable). A template, tracker, or worksheet is better than a generic guide.
Return structured JSON only.`,

  content_creator: `You are the Content Agent. You create the REAL downloadable product content.
Not marketing copy. Not outlines. The actual product.
Every section must be usable, actionable, and niche-specific. No AI filler. No generic advice.
A buyer should be able to use this immediately after download.
Return structured JSON only.`,

  template_designer: `You are the Template/Design Agent. You format products professionally.
Specify exact formatting, styling, colors, fonts, and layout.
Templates should look premium and be easy to customize.
Return structured JSON only.`,

  listing_writer: `You are the Listing Agent for digital product platforms (Gumroad, Etsy, Shopify).
Write copy that sells the OUTCOME, not the format. Buyers want results, not pages.
Use platform-specific SEO (Etsy tags, Gumroad descriptions, etc).
Return structured JSON only.`,

  product_qa: `You are the Digital Product QA Agent. You verify products are worth paying for.
Reject anything that is: generic AI content, vague guidance, incomplete, or missing sections.
The refund test: would a buyer feel they got real value? If not, reject.
Return structured JSON only.`,
}

export const DIGITAL_PRODUCT_QUALITY_CHECKLIST = [
  'Is the product a usable TOOL, not just content?',
  'Is it specific to the target niche?',
  'Would a buyer get immediate value?',
  'Are instructions clear without external help?',
  'Is every section actionable, not just informational?',
  'Does it justify the price point?',
  'No AI filler, placeholder text, or generic advice?',
  'Would it pass a refund test?',
]

export const STARTER_PRODUCT_IDEAS = [
  { name: 'Freelancer Client Onboarding Kit', category: 'business_asset' as const, niche: 'freelancers', format: 'notion' as const },
  { name: 'Small Business Social Media Content Calendar', category: 'template' as const, niche: 'small business', format: 'google_sheets' as const },
  { name: 'Notion Freelance CRM Template', category: 'template' as const, niche: 'freelancers', format: 'notion' as const },
  { name: 'Etsy Seller Product Listing Checklist', category: 'worksheet_planner' as const, niche: 'etsy sellers', format: 'pdf' as const },
  { name: 'AI Prompt Pack for Real Estate Agents', category: 'content_pack' as const, niche: 'real estate', format: 'pdf' as const },
  { name: 'Google Sheets Profit Tracker', category: 'template' as const, niche: 'small business', format: 'google_sheets' as const },
  { name: '30-Day Marketing Plan Workbook', category: 'worksheet_planner' as const, niche: 'marketing', format: 'pdf' as const },
]

export const DIGITAL_PRODUCT_UPSELLS: string[] = [
  'Bundle pack: combine 3-5 related products at discounted price',
  'Premium version: add advanced sections, video walkthroughs, or coaching calls',
  'Niche variation: same template adapted for different industries',
  'Update subscription: quarterly refresh with new data/trends',
  'Done-for-you service: offer to customize the template for individual buyers',
]
