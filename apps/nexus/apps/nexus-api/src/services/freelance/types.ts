export type JobStatus =
  | 'draft'
  | 'intake_review'
  | 'needs_owner_input'
  | 'planning'
  | 'owner_plan_approval'
  | 'running'
  | 'ceo_reviewing'
  | 'revision_required'
  | 'human_review_needed'
  | 'final_assembly'
  | 'qa_review'
  | 'ready_for_owner'
  | 'delivered'
  | 'archived'
  | 'client_revision_requested'
  | 'revision_in_progress'
  | 'revision_ready'

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'submitted'
  | 'ceo_reviewing'
  | 'accepted'
  | 'needs_revision'
  | 'blocked'
  | 'human_review_needed'
  | 'failed'

export type AgentRole = 'ceo' | 'research' | 'strategy' | 'production' | 'qa' | 'client_comm' | 'trend_niche' | 'trademark_risk' | 'design_director' | 'image_design' | 'mockup' | 'listing' | 'pod_qa'
export type Actor = AgentRole | 'owner' | 'system'
export type JobType = 'landing_page' | 'seo_article' | 'copywriting' | 'pod_product' | 'digital_product'

export interface FreelanceJob {
  id: string
  client_name: string
  title: string
  job_type: JobType
  brief: string
  deadline: string | null
  budget: number | null
  status: JobStatus
  current_stage: string | null
  priority: number
  missing_info_json: string | null
  plan_json: string | null
  final_output: string | null
  client_message: string | null
  upsell_suggestion: string | null
  links_notes: string | null
  deliverables_required: string | null
  attachments_json: string | null
  max_ai_calls: number
  ai_calls_used: number
  max_revision_rounds: number
  max_runtime_minutes: number
  quality_score_json: string | null
  owner_notes: string | null
  client_feedback: string | null
  intake_answers_json: string | null
  estimated_ai_cost: number
  actual_time_minutes: number
  profit_score: number | null
  red_flags_json: string | null
  scope_notes: string | null
  template_id: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface FreelanceTask {
  id: string
  job_id: string
  agent_role: AgentRole
  title: string
  instructions: string
  acceptance_criteria_json: string | null
  status: TaskStatus
  output_json: string | null
  ceo_review_json: string | null
  revision_count: number
  max_revisions: number
  depends_on_json: string | null
  sort_order: number
  playbook_stage: string | null
  created_at: string
  updated_at: string
}

export interface TaskArtifact {
  id: string
  task_id: string
  job_id: string
  version: number
  output_json: string
  ceo_review_json: string | null
  revision_instructions: string | null
  created_at: string
}

export interface FreelanceEvent {
  id: string
  job_id: string
  task_id: string | null
  actor: Actor
  event_type: string
  message: string
  metadata_json: string | null
  created_at: string
}

export interface AgentOutput {
  summary: string
  deliverable: string
  assumptions: string[]
  risks: string[]
  missing_info: string[]
  confidence: number
  needs_owner_input: boolean
  sources: string[]
}

export interface CeoReview {
  decision: 'accepted' | 'needs_revision' | 'blocked' | 'human_review_needed'
  score: number
  passed_checks: string[]
  failed_checks: string[]
  revision_instructions: string
  owner_warning: string
}

export interface QualityScore {
  brief_match: number
  completeness: number
  originality: number
  client_readiness: number
  risk_level: number
  overall: number
  notes: string
}

export interface JobPlan {
  approach: string
  tasks: Array<{
    agent_role: AgentRole
    title: string
    instructions: string
    acceptance_criteria: string[]
    depends_on: string[]
    playbook_stage: string
  }>
  estimated_steps: number
  estimated_ai_calls: number
  risks: string[]
}

// ── Playbook definitions per job type ────────────────────────

export interface PlaybookStage {
  name: string
  agent_role: AgentRole
  title: string
  default_criteria: string[]
  instructions_template: string
}

export const PLAYBOOKS: Record<JobType, PlaybookStage[]> = {
  landing_page: [
    {
      name: 'research',
      agent_role: 'research',
      title: 'Market & Client Research',
      default_criteria: [
        'Includes competitor analysis (min 3 competitors)',
        'Identifies target audience with specifics',
        'References are linked / sourced',
      ],
      instructions_template:
        'Research the client\'s market, competitors, and target audience for a landing page project. Include specific competitor URLs, audience demographics, and key messaging angles. Every claim must include a source.',
    },
    {
      name: 'strategy',
      agent_role: 'strategy',
      title: 'Wireframe & Page Strategy',
      default_criteria: [
        'Page sections defined (hero, benefits, social proof, CTA)',
        'Messaging hierarchy clear',
        'CTA strategy specific, not generic',
      ],
      instructions_template:
        'Create a wireframe outline and messaging strategy for the landing page. Define each section (hero, benefits, social proof, testimonials, CTA), the copy angle, and the conversion goal. Be specific to this client — no generic templates.',
    },
    {
      name: 'copy',
      agent_role: 'production',
      title: 'Landing Page Copy',
      default_criteria: [
        'All wireframe sections have copy',
        'Headlines are specific and benefit-driven',
        'No generic AI filler phrases',
        'CTA text is action-oriented',
        'Copy matches client brand voice',
      ],
      instructions_template:
        'Write the full landing page copy based on the wireframe strategy. Include: headline, subheadline, hero body, benefit sections, social proof placeholders, and CTA blocks. Write in the client\'s voice — no generic filler.',
    },
    {
      name: 'build',
      agent_role: 'production',
      title: 'HTML/CSS Build',
      default_criteria: [
        'Responsive layout works on mobile and desktop',
        'All copy from previous stage included',
        'Clean semantic HTML',
        'No placeholder content',
      ],
      instructions_template:
        'Build the landing page as clean, responsive HTML/CSS. Use the approved copy. Output complete, deployable HTML with inline or embedded styles. No frameworks needed — clean semantic code.',
    },
    {
      name: 'qa',
      agent_role: 'qa',
      title: 'QA Review',
      default_criteria: [
        'All deliverables present',
        'Copy matches client brief',
        'No placeholder text',
        'No AI-sounding generic phrases',
        'Responsive layout verified',
      ],
      instructions_template:
        'Review the final landing page against the original client brief. Check: all sections present, copy quality, responsiveness, no placeholders, brief alignment. Score each criterion.',
    },
    {
      name: 'package',
      agent_role: 'client_comm',
      title: 'Client Delivery Package',
      default_criteria: [
        'Delivery message is professional',
        'Lists what was completed',
        'Notes any assumptions',
        'Includes optional upsell',
      ],
      instructions_template:
        'Prepare the client delivery package: a short professional delivery message, list of what was completed, assumptions made, and one optional upsell suggestion for follow-up work.',
    },
  ],

  seo_article: [
    {
      name: 'keyword_research',
      agent_role: 'research',
      title: 'Keyword & Topic Research',
      default_criteria: [
        'Primary keyword identified with search intent',
        'Secondary keywords listed (min 5)',
        'Competitor articles analyzed (min 3)',
        'Sources linked',
      ],
      instructions_template:
        'Research keywords and topics for the SEO article. Identify primary keyword, search intent, secondary keywords, and analyze top-ranking competitor articles. Include sources for all data.',
    },
    {
      name: 'outline',
      agent_role: 'strategy',
      title: 'Article Outline',
      default_criteria: [
        'H2/H3 structure defined',
        'Word count target set',
        'Key points per section listed',
        'Internal/external linking strategy noted',
      ],
      instructions_template:
        'Create a detailed article outline with H2/H3 structure, estimated word count per section, key points to cover, and linking strategy. Base structure on what\'s ranking well for the target keyword.',
    },
    {
      name: 'draft',
      agent_role: 'production',
      title: 'Article Draft',
      default_criteria: [
        'Follows approved outline structure',
        'Meets word count target',
        'Natural keyword integration (no stuffing)',
        'Original examples and insights',
        'No AI filler phrases',
      ],
      instructions_template:
        'Write the full SEO article following the approved outline. Use the target keyword naturally. Include original examples, data, and insights. Write like a domain expert — no generic padding.',
    },
    {
      name: 'edit',
      agent_role: 'production',
      title: 'Edit & Polish',
      default_criteria: [
        'Grammar and flow checked',
        'Transitions between sections smooth',
        'Introduction hooks the reader',
        'Conclusion has clear CTA',
      ],
      instructions_template:
        'Edit and polish the article draft. Fix flow, transitions, grammar. Strengthen the intro hook and conclusion CTA. Ensure the piece reads naturally and provides genuine value.',
    },
    {
      name: 'seo_check',
      agent_role: 'qa',
      title: 'SEO & Quality Check',
      default_criteria: [
        'Primary keyword in title, H1, first paragraph',
        'Meta description written',
        'Image alt text suggestions included',
        'No keyword stuffing',
        'Readability score acceptable',
      ],
      instructions_template:
        'Run SEO quality checks on the article. Verify keyword placement, write meta description, suggest image alt text, check readability. Flag any issues.',
    },
    {
      name: 'package',
      agent_role: 'client_comm',
      title: 'Client Delivery Package',
      default_criteria: [
        'Article delivered in clean format',
        'SEO notes included',
        'Delivery message professional',
        'Upsell suggestion included',
      ],
      instructions_template:
        'Package the final article with SEO notes, meta description, and a professional delivery message for the client. Include one upsell suggestion.',
    },
  ],

  copywriting: [
    {
      name: 'market_research',
      agent_role: 'research',
      title: 'Market & Product Research',
      default_criteria: [
        'Product/service understood clearly',
        'Target buyer persona defined',
        'Competitor listings analyzed (min 3)',
        'Sources included',
      ],
      instructions_template:
        'Research the product/service, target buyers, and competitor listings. Define the unique value proposition and key selling points. Include sources.',
    },
    {
      name: 'title_options',
      agent_role: 'strategy',
      title: 'Title & Angle Options',
      default_criteria: [
        'Minimum 3 title options provided',
        'Each title has a different angle',
        'Titles are specific, not generic',
      ],
      instructions_template:
        'Create at least 3 title/headline options with different angles (benefit-driven, curiosity, urgency, social proof). Each should be specific to this product — not template-y.',
    },
    {
      name: 'description',
      agent_role: 'production',
      title: 'Product Description & Copy',
      default_criteria: [
        'Uses chosen title/angle',
        'Features and benefits clearly separated',
        'Scannable format (bullets, headers)',
        'Matches brand voice',
        'No filler or generic claims',
      ],
      instructions_template:
        'Write the full product description using the approved title/angle. Include: compelling intro, feature/benefit breakdown, use cases, and call to action. Write for the target buyer — specific, not generic.',
    },
    {
      name: 'tags_metadata',
      agent_role: 'production',
      title: 'Tags & Metadata',
      default_criteria: [
        'Platform-appropriate tags generated',
        'Category selected correctly',
        'Pricing position justified',
      ],
      instructions_template:
        'Generate platform-appropriate tags, select the correct category, and justify the pricing position based on competitor analysis. Format for the target platform.',
    },
    {
      name: 'qa',
      agent_role: 'qa',
      title: 'QA Review',
      default_criteria: [
        'All deliverables present (title, description, tags)',
        'No placeholder content',
        'Copy quality verified',
        'Brief alignment checked',
      ],
      instructions_template:
        'Review all copy deliverables against the original client brief. Check completeness, quality, brief alignment, and flag any issues.',
    },
    {
      name: 'package',
      agent_role: 'client_comm',
      title: 'Client Delivery Package',
      default_criteria: [
        'All copy neatly formatted',
        'Delivery message professional',
        'Assumptions noted',
        'Upsell suggestion included',
      ],
      instructions_template:
        'Package all copy deliverables with a professional delivery message, list of what was completed, assumptions, and one upsell suggestion.',
    },
  ],

  pod_product: [], // defined in pod-types.ts, injected at runtime
  digital_product: [], // defined in digital-product-types.ts, injected at runtime
}

// ── Valid state transitions ─────────────────────────────────

export const VALID_JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['intake_review'],
  intake_review: ['needs_owner_input', 'planning'],
  needs_owner_input: ['intake_review'],
  planning: ['owner_plan_approval'],
  owner_plan_approval: ['running', 'planning'],
  running: ['ceo_reviewing', 'human_review_needed'],
  ceo_reviewing: ['running', 'revision_required', 'final_assembly', 'human_review_needed'],
  revision_required: ['running'],
  human_review_needed: ['running', 'archived'],
  final_assembly: ['qa_review'],
  qa_review: ['ready_for_owner', 'revision_required'],
  ready_for_owner: ['delivered', 'revision_required'],
  delivered: ['archived', 'client_revision_requested'],
  archived: [],
  client_revision_requested: ['revision_in_progress'],
  revision_in_progress: ['ceo_reviewing'],
  revision_ready: ['delivered', 'ready_for_owner'],
}

// ── Safety / human-only boundaries ──────────────────────────

export const HUMAN_ONLY_ACTIONS = [
  'send_client_message',
  'submit_final_delivery',
  'accept_risky_work',
  'enter_credentials',
  'approve_invoice',
] as const

export const SAFETY_KEYWORDS = [
  'scraping', 'scrape', 'crawl',
  'spam', 'mass email', 'bulk outreach',
  'fake review', 'fake account',
  'copyright infringement', 'pirated',
  'credential', 'password collection',
  'illegal', 'terms of service violation',
]

// ── Intake questionnaires per job type ───────────────────────

export interface IntakeQuestion {
  field: string
  question: string
  required: boolean
  placeholder: string
}

export const INTAKE_QUESTIONS: Record<JobType, IntakeQuestion[]> = {
  landing_page: [
    { field: 'offer', question: 'What is the offer / product / service?', required: true, placeholder: 'SaaS project management tool for remote teams' },
    { field: 'customer', question: 'Who is the target customer?', required: true, placeholder: 'Small business owners, remote teams, 25-45 years old' },
    { field: 'action', question: 'What action should visitors take?', required: true, placeholder: 'Sign up for free trial / Book a demo / Buy now' },
    { field: 'examples_like', question: 'Examples of pages you like (URLs)', required: false, placeholder: 'https://example.com, https://competitor.com' },
    { field: 'examples_hate', question: 'Examples of pages you dislike', required: false, placeholder: 'https://bad-example.com — too cluttered' },
    { field: 'brand_tone', question: 'Brand tone / voice', required: false, placeholder: 'Professional but friendly, not corporate' },
    { field: 'unique_selling', question: 'What makes this different from competitors?', required: true, placeholder: 'Only tool with built-in async video' },
    { field: 'existing_assets', question: 'Existing brand assets (logo, colors, fonts)?', required: false, placeholder: 'Logo attached, colors: #1a1a2e, #16213e' },
  ],
  seo_article: [
    { field: 'topic', question: 'What topic / keyword should the article target?', required: true, placeholder: 'best project management tools for small teams' },
    { field: 'audience', question: 'Who reads this article?', required: true, placeholder: 'Small business owners searching for PM solutions' },
    { field: 'goal', question: 'What should the reader do after reading?', required: true, placeholder: 'Sign up for our tool / Contact us / Learn more' },
    { field: 'word_count', question: 'Target word count?', required: false, placeholder: '1500-2000 words' },
    { field: 'competitors', question: 'Competitor articles to outrank (URLs)', required: false, placeholder: 'https://competitor-blog.com/article' },
    { field: 'brand_tone', question: 'Writing tone / style?', required: false, placeholder: 'Expert, data-driven, conversational' },
    { field: 'internal_links', question: 'Internal pages to link to?', required: false, placeholder: 'https://mysite.com/features, https://mysite.com/pricing' },
  ],
  copywriting: [
    { field: 'product', question: 'What is the product / service?', required: true, placeholder: 'Handmade leather wallet, minimalist design' },
    { field: 'platform', question: 'Which platform is this for?', required: true, placeholder: 'Etsy / Gumroad / Amazon / Shopify / Website' },
    { field: 'target_buyer', question: 'Who is the ideal buyer?', required: true, placeholder: 'Men 25-40, interested in minimalism and quality' },
    { field: 'price_point', question: 'Price point / range?', required: false, placeholder: '$45-65' },
    { field: 'key_features', question: 'Key features / selling points?', required: true, placeholder: 'Full grain leather, RFID blocking, slim profile' },
    { field: 'competitor_listings', question: 'Competitor listing URLs', required: false, placeholder: 'https://etsy.com/listing/competitor' },
    { field: 'brand_tone', question: 'Brand voice / tone?', required: false, placeholder: 'Premium, understated, quality-focused' },
  ],
  pod_product: [], // defined in pod-types.ts, uses POD_INTAKE_QUESTIONS
  digital_product: [], // defined in digital-product-types.ts
}

// ── Red flag thresholds ─────────────────────────────────────

export interface RedFlag {
  type: string
  severity: 'warning' | 'critical'
  message: string
}

export const RED_FLAG_CHECKS = {
  min_budget: { landing_page: 100, seo_article: 50, copywriting: 30, pod_product: 0, digital_product: 0 },
  min_deadline_hours: 12,
  max_brief_length_for_unclear: 50,
}

// ── Upsell suggestions per job type ─────────────────────────

export const UPSELL_SUGGESTIONS: Record<JobType, string[]> = {
  landing_page: [
    'Email welcome sequence (5 emails) to nurture leads from the landing page',
    'A/B test variant of the landing page with different hero messaging',
    '3 social media ad creatives driving traffic to the landing page',
    'Thank-you / confirmation page for post-conversion',
    'Monthly landing page performance report with optimization suggestions',
  ],
  seo_article: [
    'Cluster of 3 supporting articles to boost topical authority',
    'Social media posts to promote the article across platforms',
    'Email newsletter featuring the article for existing subscribers',
    'Infographic summarizing key points from the article',
    'Monthly content refresh to maintain search rankings',
  ],
  copywriting: [
    'Product photography shot list and creative direction',
    'Social media product launch posts (5 platforms)',
    'Email launch sequence announcing the product',
    'Comparison chart vs competitor products',
    'Seasonal listing updates (holiday, back-to-school, etc.)',
  ],
  pod_product: [
    'Design collection: 10 variations in the same niche across products',
    'Brand pack: color palette, font, tone, design rules for winning niche',
    'Expand to additional platforms (Redbubble, Merch by Amazon, Shopify)',
    'Seasonal collection: holiday/event-themed variations',
    'Matching product bundle: mug + sticker + poster set',
  ],
  digital_product: [
    'Bundle pack: combine 3-5 related products at discounted price',
    'Premium version: add advanced sections, video walkthroughs',
    'Niche variation: same template adapted for different industries',
    'Update subscription: quarterly refresh with new data/trends',
    'Done-for-you service: offer to customize the template for buyers',
  ],
}

// ── Portfolio / case study structure ─────────────────────────

export interface PortfolioEntry {
  job_id: string
  client_name: string
  job_type: JobType
  title: string
  challenge: string
  approach: string
  result: string
  testimonial_request: string
  created_at: string
}
