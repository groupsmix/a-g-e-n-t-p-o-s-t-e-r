// ============================================================
// AI Registry
// ============================================================
// Defines all AI models by task type with failover rankings.

import type { AIRegistryEntry, TaskType } from './types'

// ============================================================
// Registry by Task Type
// ============================================================

export const AI_REGISTRY: Record<TaskType, AIRegistryEntry[]> = {
  // Research Tasks
  research_market: [
    { id: 'perplexity-sonar', name: 'Perplexity Sonar', provider: 'perplexity', secretKey: 'PERPLEXITY_API_KEY', rank: 1, isFree: false, why: 'Web-grounded live research with citations — strongest for market scans.', apiModelName: 'sonar' },
    { id: 'tavily', name: 'Tavily Search', provider: 'tavily', secretKey: 'TAVILY_API_KEY', rank: 2, isFree: true, why: 'Built for AI agents. Returns clean structured web data.', apiModelName: 'tavily-search' },
    { id: 'exa', name: 'Exa Neural', provider: 'exa', secretKey: 'EXA_API_KEY', rank: 2, isFree: true, why: 'Finds by meaning. Discovers emerging niches.', apiModelName: 'exa-neural' },
    { id: 'serpapi', name: 'SerpAPI', provider: 'serpapi', secretKey: 'SERPAPI_KEY', rank: 3, isFree: true, why: 'Raw Google results. Reliable trend backup.', apiModelName: 'serpapi' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 4, isFree: true, why: 'Reasoning fallback when all search APIs fail.', apiModelName: 'deepseek-chat' },
  ],

  research_psychology: [
    { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Best at nuanced human psychology + emotional motivation.', apiModelName: 'claude-sonnet-4-20250514' },
    { id: 'deepseek-r1', name: 'DeepSeek-R1', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: true, why: 'Best reasoning model free. Analyzes emotion patterns.', apiModelName: 'deepseek-reasoner' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'Strong analytical depth.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],

  research_keywords: [
    { id: 'dataforseo', name: 'DataForSEO', provider: 'serpapi', secretKey: 'DATAFORSEO_KEY', rank: 1, isFree: true, why: 'Most accurate keyword volume + difficulty data.', apiModelName: 'dataforseo' },
    { id: 'serpapi', name: 'SerpAPI', provider: 'serpapi', secretKey: 'SERPAPI_KEY', rank: 2, isFree: true, why: 'See exactly what pages rank.', apiModelName: 'serpapi' },
    { id: 'exa', name: 'Exa Neural', provider: 'exa', secretKey: 'EXA_API_KEY', rank: 3, isFree: true, why: 'Semantic keyword discovery.', apiModelName: 'exa-neural' },
    { id: 'qwen-flash', name: 'Qwen 3.5 Flash', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 4, isFree: true, why: 'Cheapest keyword cluster reasoning.', apiModelName: 'Qwen/Qwen2.5-7B-Instruct' },
  ],

  research_competitors: [
    { id: 'perplexity-sonar', name: 'Perplexity Sonar', provider: 'perplexity', secretKey: 'PERPLEXITY_API_KEY', rank: 1, isFree: false, why: 'Live web research — finds and compares real competitor listings.', apiModelName: 'sonar' },
    { id: 'tavily', name: 'Tavily Search', provider: 'tavily', secretKey: 'TAVILY_API_KEY', rank: 2, isFree: true, why: 'Scrapes competitor listings cleanly.', apiModelName: 'tavily-search' },
    { id: 'qwen-flash', name: 'Qwen 3.5 Flash', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 2, isFree: true, why: 'Fast structured extraction.', apiModelName: 'Qwen/Qwen2.5-7B-Instruct' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: true, why: 'Deeper analysis, identifies content gaps.', apiModelName: 'deepseek-chat' },
  ],

  // Content Generation
  generate_long_form: [
    { id: 'gpt', name: 'GPT (OpenAI)', provider: 'openai', secretKey: 'OPENAI_API_KEY', rank: 1, isFree: false, why: 'Top-tier long-form structure and flow.', apiModelName: 'gpt-4o' },
    { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 2, isFree: false, why: 'Best quality writing — natural, persuasive prose.', apiModelName: 'claude-sonnet-4-20250514' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: true, why: 'Best free long-form. Avoids robotic patterns.', apiModelName: 'deepseek-chat' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 2, isFree: true, why: 'Strong long-form, excellent for technical topics.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
    { id: 'doubao-pro', name: 'Doubao 1.5 Pro', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'ByteDance model. Most human-like narrative.', apiModelName: 'Doubao-pro-32k' },
    { id: 'kimi', name: 'Kimi k1.5', provider: 'moonshot', secretKey: 'MOONSHOT_API_KEY', rank: 4, isFree: true, why: '10M token context.', apiModelName: 'moonshot-v1-128k' },
    { id: 'claude', name: 'Claude Sonnet 4.5', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 5, isFree: false, why: 'Best quality writing.', apiModelName: 'claude-sonnet-4-20250514' },
  ],

  generate_short_copy: [
    { id: 'gpt', name: 'GPT (OpenAI)', provider: 'openai', secretKey: 'OPENAI_API_KEY', rank: 1, isFree: false, why: 'Best at punchy, high-converting hooks and headlines.', apiModelName: 'gpt-4o' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: true, why: 'Best free persuasive copywriting.', apiModelName: 'deepseek-chat' },
    { id: 'doubao-pro', name: 'Doubao 1.5 Pro', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 2, isFree: true, why: 'TikTok AI. Naturally writes viral hooks.', apiModelName: 'Doubao-pro-32k' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'Strong tone adaptation.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
    { id: 'claude', name: 'Claude Sonnet 4.5', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 4, isFree: false, why: 'Best copywriter in AI world.', apiModelName: 'claude-sonnet-4-20250514' },
  ],

  generate_seo_tags: [
    { id: 'qwen-flash', name: 'Qwen 3.5 Flash', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 1, isFree: true, why: 'Fastest + most consistent at constrained output.', apiModelName: 'Qwen/Qwen2.5-7B-Instruct' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: true, why: 'Reliable rule-following for SEO constraints.', apiModelName: 'deepseek-chat' },
    { id: 'mistral-7b', name: 'Mistral 7B', provider: 'groq', secretKey: 'GROQ_API_KEY', rank: 3, isFree: true, why: 'Ultra-fast free inference via Groq.', apiModelName: 'mistral-7b-8192' },
  ],

  generate_code: [
    { id: 'deepseek-coder', name: 'DeepSeek-Coder-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 1, isFree: true, why: 'Purpose-built for software architecture.', apiModelName: 'deepseek-coder' },
    { id: 'qwen-coder', name: 'Qwen 3.5 Coder', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 2, isFree: true, why: 'Strong full-stack. Next.js/Cloudflare fluent.', apiModelName: 'Qwen/Qwen2.5-Coder-32B-Instruct' },
    { id: 'deepseek-r1', name: 'DeepSeek-R1', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: true, why: 'Reasoning first, then code.', apiModelName: 'deepseek-reasoner' },
    { id: 'claude', name: 'Claude Sonnet 4.5', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 4, isFree: false, why: 'Best at translating requirements to clean code.', apiModelName: 'claude-sonnet-4-20250514' },
  ],

  generate_strategy: [
    { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Best strategic reasoning + judgment.', apiModelName: 'claude-sonnet-4-20250514' },
    { id: 'gemini-pro', name: 'Gemini Pro', provider: 'google', secretKey: 'GOOGLE_API_KEY', rank: 2, isFree: false, why: 'Top reasoning benchmark scores.', apiModelName: 'gemini-1.5-pro' },
    { id: 'deepseek-r1', name: 'DeepSeek-R1', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: true, why: 'Best free reasoning. Matches paid models.', apiModelName: 'deepseek-reasoner' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 4, isFree: true, why: 'Strong analytical reasoning.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],

  // Image Generation
  generate_image_prompt: [
    { id: 'flux-pro', name: 'FLUX.1 Pro', provider: 'fal', secretKey: 'FAL_KEY', rank: 1, isFree: false, why: '#1 text rendering. POD essential.', apiModelName: 'flux-pro' },
    { id: 'ideogram', name: 'Ideogram 3.0', provider: 'ideogram', secretKey: 'IDEOGRAM_API_KEY', rank: 2, isFree: false, why: 'Specialized typography + graphic design.', apiModelName: 'ideogram-3' },
  ],

  generate_image: [
    { id: 'flux-pro', name: 'FLUX.1 Pro', provider: 'fal', secretKey: 'FAL_KEY', rank: 1, isFree: false, why: '#1 text rendering in images.', apiModelName: 'flux-pro' },
    { id: 'ideogram', name: 'Ideogram 3.0', provider: 'ideogram', secretKey: 'IDEOGRAM_API_KEY', rank: 2, isFree: false, why: 'Typography + graphic design layouts.', apiModelName: 'ideogram-3' },
    { id: 'sdxl', name: 'SDXL', provider: 'huggingface', secretKey: 'HF_TOKEN', rank: 3, isFree: true, why: 'Free open-source. Illustration-style.', apiModelName: 'stabilityai/stable-diffusion-xl-base-1.0' },
  ],

  // Music Generation
  generate_music_prompt: [
    { id: 'suno', name: 'Suno', provider: 'suno', secretKey: 'SUNO_API_KEY', rank: 1, isFree: true, why: 'Best overall audio quality.', apiModelName: 'suno' },
  ],

  generate_music: [
    { id: 'suno', name: 'Suno', provider: 'suno', secretKey: 'SUNO_API_KEY', rank: 1, isFree: true, why: 'Best overall audio quality. 50 songs/day free.', apiModelName: 'suno' },
    { id: 'udio', name: 'Udio', provider: 'huggingface', secretKey: 'HF_TOKEN', rank: 2, isFree: true, why: 'Different sonic character.', apiModelName: 'udio-v1' },
    { id: 'musicgen', name: 'MusicGen', provider: 'huggingface', secretKey: 'HF_TOKEN', rank: 3, isFree: true, why: 'Open source. Free. No limits.', apiModelName: 'facebook/musicgen' },
  ],

  generate_mockup: [
    { id: 'printful', name: 'Printful Mockup', provider: 'printful', secretKey: 'PRINTFUL_API_KEY', rank: 1, isFree: true, why: 'Free. Real product catalog mockups.', apiModelName: 'printful-mockup' },
    { id: 'printify', name: 'Printify Mockup', provider: 'printify', secretKey: 'PRINTIFY_API_KEY', rank: 2, isFree: true, why: 'Free. Different product catalog.', apiModelName: 'printify-mockup' },
  ],

  // Quality & Adaptation
  platform_variation: [
    { id: 'qwen-flash', name: 'Qwen 3.5 Flash', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 1, isFree: true, why: 'Fastest at rule-based rewriting.', apiModelName: 'Qwen/Qwen2.5-7B-Instruct' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: true, why: 'Better quality while adapting tone.', apiModelName: 'deepseek-chat' },
    { id: 'doubao-lite', name: 'Doubao 1.5 Lite', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'Micro-model. Fast cheap variation.', apiModelName: 'Doubao-lite-32k' },
  ],

  social_adaptation: [
    { id: 'doubao-pro', name: 'Doubao 1.5 Pro', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 1, isFree: true, why: 'ByteDance. Understands social platform patterns.', apiModelName: 'Doubao-pro-32k' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: true, why: 'Best at tone adaptation.', apiModelName: 'deepseek-chat' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'Strong creative writing for social.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],

  humanize: [
    { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Most natural prose — lowest AI-detection score.', apiModelName: 'claude-sonnet-4-20250514' },
    { id: 'doubao-pro', name: 'Doubao 1.5 Pro', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 2, isFree: true, why: 'Most human-like conversational output.', apiModelName: 'Doubao-pro-32k' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: true, why: 'Naturally avoids AI writing patterns.', apiModelName: 'deepseek-chat' },
  ],

  quality_editor: [
    { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Best editing quality — precise without losing meaning.', apiModelName: 'claude-sonnet-4-20250514' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: true, why: 'Best free precise editing.', apiModelName: 'deepseek-chat' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'Strong editor. Catches redundancy.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],

  quality_buyer_sim: [
    { id: 'gpt', name: 'GPT (OpenAI)', provider: 'openai', secretKey: 'OPENAI_API_KEY', rank: 1, isFree: false, why: 'Best at role-playing a skeptical buyer.', apiModelName: 'gpt-4o' },
    { id: 'deepseek-r1', name: 'DeepSeek-R1', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: true, why: 'Reasoning model. Best free at simulating buyer.', apiModelName: 'deepseek-reasoner' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'Strong at role-play perspective taking.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],

  quality_competitor: [
    { id: 'claude-opus', name: 'Claude Opus', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Most nuanced competitive analysis.', apiModelName: 'claude-opus-4-20250514' },
    { id: 'deepseek-r1', name: 'DeepSeek-R1', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: true, why: 'Reasoning model. Excellent free comparative analysis.', apiModelName: 'deepseek-reasoner' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'Strong at identifying gaps.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],

  quality_ceo: [
    { id: 'claude-opus', name: 'Claude Opus', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Most nuanced final reviewer — the CEO’s judgment seat.', apiModelName: 'claude-opus-4-20250514' },
    { id: 'gpt', name: 'GPT (OpenAI)', provider: 'openai', secretKey: 'OPENAI_API_KEY', rank: 2, isFree: false, why: 'Strong multi-criteria scoring.', apiModelName: 'gpt-4o' },
    { id: 'deepseek-r1', name: 'DeepSeek-R1', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: true, why: 'Best free comprehensive multi-criteria review.', apiModelName: 'deepseek-reasoner' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 4, isFree: true, why: 'Strong checklist following.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],

  revenue_estimate: [
    { id: 'deepseek-r1', name: 'DeepSeek-R1', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 1, isFree: true, why: 'Reasoning model. Best at numerical market analysis.', apiModelName: 'deepseek-reasoner' },
    { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 2, isFree: false, why: 'Disciplined, conservative revenue reasoning.', apiModelName: 'claude-sonnet-4-20250514' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'Strong analytical reasoning.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],

  trend_analysis: [
    { id: 'tavily', name: 'Tavily Search', provider: 'tavily', secretKey: 'TAVILY_API_KEY', rank: 1, isFree: true, why: 'Freshest web data for trend detection.', apiModelName: 'tavily-search' },
    { id: 'exa', name: 'Exa Neural', provider: 'exa', secretKey: 'EXA_API_KEY', rank: 2, isFree: true, why: 'Semantic trend discovery.', apiModelName: 'exa-neural' },
    { id: 'deepseek-r1', name: 'DeepSeek-R1', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: true, why: 'Analyzes trend signals.', apiModelName: 'deepseek-reasoner' },
  ],

  pattern_extraction: [
    { id: 'deepseek-r1', name: 'DeepSeek-R1', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 1, isFree: true, why: 'Best at finding patterns.', apiModelName: 'deepseek-reasoner' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 2, isFree: true, why: 'Strong analytical output.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],

  parse_document: [
    { id: 'mistral-ocr', name: 'Mistral OCR', provider: 'huggingface', secretKey: 'HF_TOKEN', rank: 1, isFree: true, why: 'Best free OCR.', apiModelName: 'mistral-ocr' },
    { id: 'tesseract', name: 'Tesseract', provider: 'local', secretKey: null, rank: 2, isFree: true, why: 'No API key needed.', apiModelName: 'tesseract' },
  ],

  // Browser Automation
  browser_agent: [
    { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Best at planning complex browser action sequences.', apiModelName: 'claude-sonnet-4-20250514' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: true, why: 'Strong JSON generation + action planning.', apiModelName: 'deepseek-chat' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'Reliable action sequence generation.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],

  browse_summarize: [
    { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Best at understanding page context and summarizing.', apiModelName: 'claude-sonnet-4-20250514' },
    { id: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: true, why: 'Quick, accurate summarization.', apiModelName: 'deepseek-chat' },
    { id: 'qwen-max', name: 'Qwen 3.5 Max', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: true, why: 'Strong summary extraction.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct' },
  ],
}

export function getModelsForTask(taskType: TaskType): AIRegistryEntry[] {
  return AI_REGISTRY[taskType] || []
}
