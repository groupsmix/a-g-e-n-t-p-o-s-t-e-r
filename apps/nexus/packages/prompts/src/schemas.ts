// Output Schemas - Layer 8
// Exact JSON structures expected from AI calls

export const SCHEMAS = {
  // Market Research Output
  marketResearch: {
    type: 'object',
    properties: {
      primary_keyword: { type: 'string', description: 'Main search term buyers use' },
      secondary_keywords: { type: 'array', items: { type: 'string' }, description: '5-10 related terms' },
      price_range: { type: 'object', properties: { min: { type: 'number' }, max: { type: 'number' }, optimal: { type: 'number' } } },
      demand_level: { type: 'string', enum: ['low', 'medium', 'high', 'trending'] },
      competition_level: { type: 'string', enum: ['low', 'medium', 'high', 'saturated'] },
      top_sellers: { type: 'array', items: { type: 'object' }, properties: { title: { type: 'string' }, price: { type: 'number' }, monthly_sales: { type: 'number' } } },
      gap_opportunity: { type: 'string', description: 'What no competitor does that you could' },
      buyer_psychology: { type: 'string', description: 'One sentence on what buyers want' }
    },
    required: ['primary_keyword', 'price_range', 'demand_level', 'competition_level']
  },

  // Psychology Research Output
  psychologyResearch: {
    type: 'object',
    properties: {
      before_state: { type: 'array', items: { type: 'string' }, description: 'Emotional states before purchase' },
      after_state: { type: 'array', items: { type: 'string' }, description: 'Emotional states after purchase' },
      trigger_words: { type: 'array', items: { type: 'string' }, description: 'Phrases that appear in 3+ reviews' },
      objections: { type: 'array', items: { type: 'string' }, description: 'Doubts buyers had before buying' },
      identity_signal: { type: 'string', description: 'What owning this says about buyer' },
      transformation_frame: { type: 'string', description: 'The before/after narrative' }
    },
    required: ['before_state', 'after_state', 'trigger_words', 'identity_signal']
  },

  // SEO Tags Output
  seoTags: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'SEO-optimized title under 140 chars' },
      tags: { type: 'array', items: { type: 'string' }, description: '10-13 exact buyer phrases, max 20 chars each' },
      primary_keyword: { type: 'string' },
      secondary_keywords: { type: 'array', items: { type: 'string' } }
    },
    required: ['title', 'tags', 'primary_keyword']
  },

  // Generated Content Output
  generatedContent: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Product title' },
      description: { type: 'string', description: 'Full product description' },
      price: { type: 'number', description: 'Suggested price in USD' },
      hook: { type: 'string', description: 'First line that stops the scroll' },
      benefits: { type: 'array', items: { type: 'string' } },
      cta: { type: 'string', description: 'Call to action' }
    },
    required: ['title', 'description', 'price', 'hook']
  },

  // Edited Content Output
  editedContent: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      changes_made: { type: 'number', description: 'Count of edits' }
    },
    required: ['title', 'description']
  },

  // Buyer Simulation Output
  buyerFeedback: {
    type: 'object',
    properties: {
      first_impression: { type: 'string' },
      first_question: { type: 'string' },
      decision: { type: 'string', enum: ['click', 'scroll'] },
      decision_reason: { type: 'string' },
      one_thing_to_fix: { type: 'string'},
      price_reaction: { type: 'string' }
    },
    required: ['first_impression', 'decision']
  },

  // Competitor Analysis Output
  competitorAnalysis: {
    type: 'object',
    properties: {
      differentiation: { type: 'string' },
      unique_angle: { type: 'string' },
      click_winner: { type: 'string', description: 'Which listing gets clicked first' },
      keyword_opportunities: { type: 'array', items: { type: 'string' } },
      winning_change: { type: 'string' }
    },
    required: ['differentiation', 'click_winner']
  },

  // Revenue Estimate Output
  revenueEstimate: {
    type: 'object',
    properties: {
      min_monthly: { type: 'number' },
      max_monthly: { type: 'number' },
      expected_monthly: { type: 'number' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      reasoning: { type: 'string' }
    },
    required: ['min_monthly', 'max_monthly', 'expected_monthly']
  },

  // CEO Review Output
  ceoReview: {
    type: 'object',
    properties: {
      overall_score: { type: 'number' },
      approved: { type: 'boolean' },
      scores: {
        type: 'object',
        properties: {
          title: { type: 'number' },
          description: { type: 'number' },
          seo: { type: 'number' },
          price: { type: 'number' },
          platform_fit: { type: 'number' },
          human_quality: { type: 'number' },
          competitive_position: { type: 'number' },
          overall_readiness: { type: 'number' }
        }
      },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            criterion: { type: 'string' },
            score: { type: 'number' },
            problem: { type: 'string' },
            fix: { type: 'string' }
          }
        }
      },
      competitor_gap: { type: ['string', 'null'] },
      strongest_element: { type: 'string' },
      revised_sections: {
        type: 'object',
        properties: {
          title: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
          tags: { type: ['array', 'null'] }
        }
      }
    },
    required: ['overall_score', 'approved', 'scores']
  },

  // Image Generation Output
  imageGeneration: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed FLUX/Midjourney prompt' },
      style: { type: 'string', enum: ['text-forward', 'illustration', 'photo', 'graphic'] },
      colors: { type: 'array', items: { type: 'string' } },
      mood: { type: 'string' }
    },
    required: ['prompt', 'style']
  },

  // Social Content Output
  socialContent: {
    type: 'object',
    properties: {
      caption: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' } },
      hook: { type: 'string' },
      thread: { type: 'array', items: { type: 'string' }, description: 'Thread tweets/posts' }
    },
    required: ['caption', 'hashtags']
  }
}

export type SchemaType = keyof typeof SCHEMAS
