// ============================================================
// AI Registry
// ============================================================
// Verified Models (2026-06-09):
// Anthropic: claude-3-7-sonnet-20250219, claude-3-opus-20240229
// DeepSeek: deepseek-chat, deepseek-reasoner, deepseek-coder
// OpenAI: gpt-4o, gpt-4o-mini
// SiliconFlow: Qwen/Qwen2.5-72B-Instruct, Qwen/Qwen2.5-7B-Instruct, Qwen/Qwen2.5-Coder-32B-Instruct, Doubao-pro-32k, Doubao-lite-32k
// Groq: mistral-7b-8192 (free)
// Google: gemini-1.5-pro

import type { AIRegistryEntry, TaskType } from './types'

export const AI_REGISTRY: Partial<Record<TaskType, AIRegistryEntry[]>> = {
  // Research Tasks
  research_market: [
    { id: 'perplexity-sonar', name: 'sonar', provider: 'perplexity', secretKey: 'PERPLEXITY_API_KEY', rank: 1, isFree: false, why: 'Web-grounded live research with citations — strongest for market scans.', apiModelName: 'sonar', costPer1kIn: 0.001, costPer1kOut: 0.001, maxOutputTokens: 4096, supportsJsonMode: false },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Reasoning fallback when all search APIs fail.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  research_psychology: [
    { id: 'claude', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Best at nuanced human psychology + emotional motivation.', apiModelName: 'claude-3-7-sonnet-20250219', costPer1kIn: 0.003, costPer1kOut: 0.015, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'deepseek-r1', name: 'deepseek-reasoner', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Best reasoning model free. Analyzes emotion patterns.', apiModelName: 'deepseek-reasoner', costPer1kIn: 0.00055, costPer1kOut: 0.00219, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: false, why: 'Strong analytical depth.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  research_keywords: [
    { id: 'qwen-flash', name: 'Qwen/Qwen2.5-7B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 1, isFree: false, why: 'Cheapest keyword cluster reasoning.', apiModelName: 'Qwen/Qwen2.5-7B-Instruct', costPer1kIn: 0.00005, costPer1kOut: 0.00005, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  research_competitors: [
    { id: 'perplexity-sonar', name: 'sonar', provider: 'perplexity', secretKey: 'PERPLEXITY_API_KEY', rank: 1, isFree: false, why: 'Live web research — finds and compares real competitor listings.', apiModelName: 'sonar', costPer1kIn: 0.001, costPer1kOut: 0.001, maxOutputTokens: 4096, supportsJsonMode: false },
    { id: 'qwen-flash', name: 'Qwen/Qwen2.5-7B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 2, isFree: false, why: 'Fast structured extraction.', apiModelName: 'Qwen/Qwen2.5-7B-Instruct', costPer1kIn: 0.00005, costPer1kOut: 0.00005, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: false, why: 'Deeper analysis, identifies content gaps.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  // Content Generation
  generate_long_form: [
    { id: 'gpt', name: 'gpt-4o', provider: 'openai', secretKey: 'OPENAI_API_KEY', rank: 1, isFree: false, why: 'Top-tier long-form structure and flow.', apiModelName: 'gpt-4o', costPer1kIn: 0.005, costPer1kOut: 0.015, maxOutputTokens: 4096, supportsJsonMode: true },
    { id: 'claude', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 2, isFree: false, why: 'Best quality writing — natural, persuasive prose.', apiModelName: 'claude-3-7-sonnet-20250219', costPer1kIn: 0.003, costPer1kOut: 0.015, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: false, why: 'Best free long-form. Avoids robotic patterns.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 4, isFree: false, why: 'Strong long-form, excellent for technical topics.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'doubao-pro', name: 'Doubao-pro-32k', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 5, isFree: false, why: 'ByteDance model. Most human-like narrative.', apiModelName: 'Doubao-pro-32k', costPer1kIn: 0.0008, costPer1kOut: 0.002, maxOutputTokens: 8192, supportsJsonMode: false },
    { id: 'kimi', name: 'moonshot-v1-128k', provider: 'moonshot', secretKey: 'MOONSHOT_API_KEY', rank: 6, isFree: false, why: '10M token context.', apiModelName: 'moonshot-v1-128k', costPer1kIn: 0.008, costPer1kOut: 0.008, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  generate_short_copy: [
    { id: 'gpt', name: 'gpt-4o', provider: 'openai', secretKey: 'OPENAI_API_KEY', rank: 1, isFree: false, why: 'Best at punchy, high-converting hooks and headlines.', apiModelName: 'gpt-4o', costPer1kIn: 0.005, costPer1kOut: 0.015, maxOutputTokens: 4096, supportsJsonMode: true },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Best free persuasive copywriting.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'doubao-pro', name: 'Doubao-pro-32k', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: false, why: 'TikTok AI. Naturally writes viral hooks.', apiModelName: 'Doubao-pro-32k', costPer1kIn: 0.0008, costPer1kOut: 0.002, maxOutputTokens: 8192, supportsJsonMode: false },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 4, isFree: false, why: 'Strong tone adaptation.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'claude', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 5, isFree: false, why: 'Best copywriter in AI world.', apiModelName: 'claude-3-7-sonnet-20250219', costPer1kIn: 0.003, costPer1kOut: 0.015, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  generate_seo_tags: [
    { id: 'qwen-flash', name: 'Qwen/Qwen2.5-7B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 1, isFree: false, why: 'Fastest + most consistent at constrained output.', apiModelName: 'Qwen/Qwen2.5-7B-Instruct', costPer1kIn: 0.00005, costPer1kOut: 0.00005, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Reliable rule-following for SEO constraints.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'mistral-7b', name: 'mistral-7b-8192', provider: 'groq', secretKey: 'GROQ_API_KEY', rank: 3, isFree: true, why: 'Ultra-fast free inference via Groq.', apiModelName: 'mistral-7b-8192', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  generate_code: [
    { id: 'deepseek-coder', name: 'deepseek-coder', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 1, isFree: false, why: 'Purpose-built for software architecture.', apiModelName: 'deepseek-coder', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-coder', name: 'Qwen/Qwen2.5-Coder-32B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 2, isFree: false, why: 'Strong full-stack.', apiModelName: 'Qwen/Qwen2.5-Coder-32B-Instruct', costPer1kIn: 0.0002, costPer1kOut: 0.0002, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'deepseek-r1', name: 'deepseek-reasoner', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: false, why: 'Reasoning first, then code.', apiModelName: 'deepseek-reasoner', costPer1kIn: 0.00055, costPer1kOut: 0.00219, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'claude', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 4, isFree: false, why: 'Best at translating requirements to clean code.', apiModelName: 'claude-3-7-sonnet-20250219', costPer1kIn: 0.003, costPer1kOut: 0.015, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  generate_strategy: [
    { id: 'claude', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Best strategic reasoning + judgment.', apiModelName: 'claude-3-7-sonnet-20250219', costPer1kIn: 0.003, costPer1kOut: 0.015, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'gemini-pro', name: 'gemini-1.5-pro', provider: 'google', secretKey: 'GOOGLE_API_KEY', rank: 2, isFree: false, why: 'Top reasoning benchmark scores.', apiModelName: 'gemini-1.5-pro', costPer1kIn: 0.0035, costPer1kOut: 0.0105, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'deepseek-r1', name: 'deepseek-reasoner', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: false, why: 'Best free reasoning. Matches paid models.', apiModelName: 'deepseek-reasoner', costPer1kIn: 0.00055, costPer1kOut: 0.00219, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 4, isFree: false, why: 'Strong analytical reasoning.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  // Image Generation
  generate_image_prompt: [
    { id: 'flux-pro', name: 'flux-pro', provider: 'fal', secretKey: 'FAL_KEY', rank: 1, isFree: false, why: '#1 text rendering. POD essential.', apiModelName: 'flux-pro', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 4096, supportsJsonMode: false },
    { id: 'ideogram', name: 'ideogram-3', provider: 'ideogram', secretKey: 'IDEOGRAM_API_KEY', rank: 2, isFree: false, why: 'Specialized typography + graphic design.', apiModelName: 'ideogram-3', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 4096, supportsJsonMode: false },
  ],

  generate_image: [
    { id: 'flux-pro', name: 'flux-pro', provider: 'fal', secretKey: 'FAL_KEY', rank: 1, isFree: false, why: '#1 text rendering in images.', apiModelName: 'flux-pro', costPer1kIn: 0, costPer1kOut: 0.05, maxOutputTokens: 0, supportsJsonMode: false },
    { id: 'ideogram', name: 'ideogram-3', provider: 'ideogram', secretKey: 'IDEOGRAM_API_KEY', rank: 2, isFree: false, why: 'Typography + graphic design layouts.', apiModelName: 'ideogram-3', costPer1kIn: 0, costPer1kOut: 0.04, maxOutputTokens: 0, supportsJsonMode: false },
    { id: 'sdxl', name: 'stabilityai/stable-diffusion-xl-base-1.0', provider: 'huggingface', secretKey: 'HF_TOKEN', rank: 3, isFree: true, why: 'Free open-source. Illustration-style.', apiModelName: 'stabilityai/stable-diffusion-xl-base-1.0', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 0, supportsJsonMode: false },
  ],

  // Music Generation
  generate_music_prompt: [
    { id: 'suno', name: 'suno', provider: 'suno', secretKey: 'SUNO_API_KEY', rank: 1, isFree: true, why: 'Best overall audio quality.', apiModelName: 'suno', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 4096, supportsJsonMode: false },
  ],

  generate_music: [
    { id: 'suno', name: 'suno', provider: 'suno', secretKey: 'SUNO_API_KEY', rank: 1, isFree: true, why: 'Best overall audio quality. 50 songs/day free.', apiModelName: 'suno', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 0, supportsJsonMode: false },
    { id: 'udio', name: 'udio-v1', provider: 'huggingface', secretKey: 'HF_TOKEN', rank: 2, isFree: true, why: 'Different sonic character.', apiModelName: 'udio-v1', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 0, supportsJsonMode: false },
    { id: 'musicgen', name: 'facebook/musicgen', provider: 'huggingface', secretKey: 'HF_TOKEN', rank: 3, isFree: true, why: 'Open source. Free. No limits.', apiModelName: 'facebook/musicgen', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 0, supportsJsonMode: false },
  ],

  generate_mockup: [
    { id: 'printful', name: 'printful-mockup', provider: 'printful', secretKey: 'PRINTFUL_API_KEY', rank: 1, isFree: true, why: 'Free. Real product catalog mockups.', apiModelName: 'printful-mockup', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 0, supportsJsonMode: false },
    { id: 'printify', name: 'printify-mockup', provider: 'printify', secretKey: 'PRINTIFY_API_KEY', rank: 2, isFree: true, why: 'Free. Different product catalog.', apiModelName: 'printify-mockup', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 0, supportsJsonMode: false },
  ],

  // Quality & Adaptation
  platform_variation: [
    { id: 'qwen-flash', name: 'Qwen/Qwen2.5-7B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 1, isFree: false, why: 'Fastest at rule-based rewriting.', apiModelName: 'Qwen/Qwen2.5-7B-Instruct', costPer1kIn: 0.00005, costPer1kOut: 0.00005, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Better quality while adapting tone.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'doubao-lite', name: 'Doubao-lite-32k', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: false, why: 'Micro-model. Fast cheap variation.', apiModelName: 'Doubao-lite-32k', costPer1kIn: 0.0002, costPer1kOut: 0.0005, maxOutputTokens: 8192, supportsJsonMode: false },
  ],

  social_adaptation: [
    { id: 'doubao-pro', name: 'Doubao-pro-32k', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 1, isFree: false, why: 'ByteDance. Understands social platform patterns.', apiModelName: 'Doubao-pro-32k', costPer1kIn: 0.0008, costPer1kOut: 0.002, maxOutputTokens: 8192, supportsJsonMode: false },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Best at tone adaptation.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: false, why: 'Strong creative writing for social.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  humanize: [
    { id: 'claude', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Most natural prose — lowest AI-detection score.', apiModelName: 'claude-3-7-sonnet-20250219', costPer1kIn: 0.003, costPer1kOut: 0.015, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'doubao-pro', name: 'Doubao-pro-32k', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 2, isFree: false, why: 'Most human-like conversational output.', apiModelName: 'Doubao-pro-32k', costPer1kIn: 0.0008, costPer1kOut: 0.002, maxOutputTokens: 8192, supportsJsonMode: false },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: false, why: 'Naturally avoids AI writing patterns.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  quality_editor: [
    { id: 'claude', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Best editing quality — precise without losing meaning.', apiModelName: 'claude-3-7-sonnet-20250219', costPer1kIn: 0.003, costPer1kOut: 0.015, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Best free precise editing.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: false, why: 'Strong editor. Catches redundancy.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  quality_buyer_sim: [
    { id: 'gpt', name: 'gpt-4o', provider: 'openai', secretKey: 'OPENAI_API_KEY', rank: 1, isFree: false, why: 'Best at role-playing a skeptical buyer.', apiModelName: 'gpt-4o', costPer1kIn: 0.005, costPer1kOut: 0.015, maxOutputTokens: 4096, supportsJsonMode: true },
    { id: 'deepseek-r1', name: 'deepseek-reasoner', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Reasoning model. Best free at simulating buyer.', apiModelName: 'deepseek-reasoner', costPer1kIn: 0.00055, costPer1kOut: 0.00219, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: false, why: 'Strong at role-play perspective taking.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  quality_competitor: [
    { id: 'claude-opus', name: 'claude-3-opus-20240229', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Most nuanced competitive analysis.', apiModelName: 'claude-3-opus-20240229', costPer1kIn: 0.015, costPer1kOut: 0.075, maxOutputTokens: 4096, supportsJsonMode: true },
    { id: 'deepseek-r1', name: 'deepseek-reasoner', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Reasoning model. Excellent free comparative analysis.', apiModelName: 'deepseek-reasoner', costPer1kIn: 0.00055, costPer1kOut: 0.00219, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: false, why: 'Strong at identifying gaps.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  quality_ceo: [
    { id: 'claude-opus', name: 'claude-3-opus-20240229', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Most nuanced final reviewer — the CEO’s judgment seat.', apiModelName: 'claude-3-opus-20240229', costPer1kIn: 0.015, costPer1kOut: 0.075, maxOutputTokens: 4096, supportsJsonMode: true },
    { id: 'gpt', name: 'gpt-4o', provider: 'openai', secretKey: 'OPENAI_API_KEY', rank: 2, isFree: false, why: 'Strong multi-criteria scoring.', apiModelName: 'gpt-4o', costPer1kIn: 0.005, costPer1kOut: 0.015, maxOutputTokens: 4096, supportsJsonMode: true },
    { id: 'deepseek-r1', name: 'deepseek-reasoner', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 3, isFree: false, why: 'Best free comprehensive multi-criteria review.', apiModelName: 'deepseek-reasoner', costPer1kIn: 0.00055, costPer1kOut: 0.00219, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 4, isFree: false, why: 'Strong checklist following.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  revenue_estimate: [
    { id: 'deepseek-r1', name: 'deepseek-reasoner', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 1, isFree: false, why: 'Reasoning model. Best at numerical market analysis.', apiModelName: 'deepseek-reasoner', costPer1kIn: 0.00055, costPer1kOut: 0.00219, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'claude', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 2, isFree: false, why: 'Disciplined, conservative revenue reasoning.', apiModelName: 'claude-3-7-sonnet-20250219', costPer1kIn: 0.003, costPer1kOut: 0.015, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: false, why: 'Strong analytical reasoning.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  trend_analysis: [
    { id: 'deepseek-r1', name: 'deepseek-reasoner', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 1, isFree: false, why: 'Analyzes trend signals.', apiModelName: 'deepseek-reasoner', costPer1kIn: 0.00055, costPer1kOut: 0.00219, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  pattern_extraction: [
    { id: 'deepseek-r1', name: 'deepseek-reasoner', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 1, isFree: false, why: 'Best at finding patterns.', apiModelName: 'deepseek-reasoner', costPer1kIn: 0.00055, costPer1kOut: 0.00219, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 2, isFree: false, why: 'Strong analytical output.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  parse_document: [
    { id: 'mistral-ocr', name: 'mistral-ocr', provider: 'huggingface', secretKey: 'HF_TOKEN', rank: 1, isFree: true, why: 'Best free OCR.', apiModelName: 'mistral-ocr', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 4096, supportsJsonMode: false },
    { id: 'tesseract', name: 'tesseract', provider: 'local', secretKey: null, rank: 2, isFree: true, why: 'No API key needed.', apiModelName: 'tesseract', costPer1kIn: 0, costPer1kOut: 0, maxOutputTokens: 4096, supportsJsonMode: false },
  ],

  // Browser Automation
  browser_agent: [
    { id: 'claude', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Best at planning complex browser action sequences.', apiModelName: 'claude-3-7-sonnet-20250219', costPer1kIn: 0.003, costPer1kOut: 0.015, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Strong JSON generation + action planning.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: false, why: 'Reliable action sequence generation.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],

  browse_summarize: [
    { id: 'claude', name: 'claude-3-7-sonnet-20250219', provider: 'anthropic', secretKey: 'ANTHROPIC_API_KEY', rank: 1, isFree: false, why: 'Best at understanding page context and summarizing.', apiModelName: 'claude-3-7-sonnet-20250219', costPer1kIn: 0.003, costPer1kOut: 0.015, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'deepseek-v3', name: 'deepseek-chat', provider: 'deepseek', secretKey: 'DEEPSEEK_API_KEY', rank: 2, isFree: false, why: 'Quick, accurate summarization.', apiModelName: 'deepseek-chat', costPer1kIn: 0.00014, costPer1kOut: 0.00028, maxOutputTokens: 8192, supportsJsonMode: true },
    { id: 'qwen-max', name: 'Qwen/Qwen2.5-72B-Instruct', provider: 'siliconflow', secretKey: 'SILICONFLOW_API_KEY', rank: 3, isFree: false, why: 'Strong summary extraction.', apiModelName: 'Qwen/Qwen2.5-72B-Instruct', costPer1kIn: 0.0004, costPer1kOut: 0.0004, maxOutputTokens: 8192, supportsJsonMode: true },
  ],
}

export function getModelsForTask(taskType: TaskType): AIRegistryEntry[] {
  return AI_REGISTRY[taskType] || []
}
