-- ============================================================
-- NEXUS Database Migration 002: AI Registry
-- ============================================================

INSERT OR IGNORE INTO ai_models (
  id, name, provider, api_key_secret_name, task_types, rank,
  is_free_tier, max_tokens, supports_streaming, context_window,
  cost_per_1m_tokens, notes
) VALUES

-- SEARCH/RESEARCH MODELS
('tavily', 'Tavily Search', 'tavily', 'TAVILY_API_KEY',
 '["research_market","research_competitors","trend_analysis"]', 1,
 1, 4000, 0, 8000, 0, 'Built for AI agents. Returns clean structured web data.'),

('exa', 'Exa Neural Search', 'exa', 'EXA_API_KEY',
 '["research_market","research_keywords","trend_analysis"]', 2,
 1, 4000, 0, 5000, 0, 'Finds by meaning. Discovers emerging niches.'),

('serpapi', 'SerpAPI', 'serpapi', 'SERPAPI_KEY',
 '["research_market","research_keywords","research_competitors"]', 3,
 1, 4000, 0, 8000, 0, 'Raw Google results. Reliable trend backup.'),

-- TEXT GENERATION - FREE
('deepseek-v3', 'DeepSeek-V3', 'deepseek', 'DEEPSEEK_API_KEY',
 '["generate_long_form","generate_short_copy","generate_code","quality_editor","platform_variation","social_adaptation","humanize"]', 1,
 1, 64000, 1, 128000, 0.27, 'Best free long-form. Avoids robotic patterns naturally.'),

('deepseek-r1', 'DeepSeek-R1', 'deepseek', 'DEEPSEEK_API_KEY',
 '["research_psychology","generate_strategy","quality_buyer_sim","quality_competitor","quality_ceo","revenue_estimate","pattern_extraction"]', 1,
 1, 64000, 0, 128000, 0.55, 'Best reasoning model free.'),

('qwen-max', 'Qwen 3.5 Max', 'siliconflow', 'SILICONFLOW_API_KEY',
 '["generate_long_form","generate_short_copy","research_psychology","generate_strategy","quality_editor","quality_buyer_sim","quality_competitor","social_adaptation"]', 1,
 1, 32000, 1, 32000, 0.20, 'Strong analytical depth.'),

('qwen-flash', 'Qwen 3.5 Flash', 'siliconflow', 'SILICONFLOW_API_KEY',
 '["generate_seo_tags","platform_variation","research_keywords"]', 1,
 1, 8000, 1, 32000, 0.05, 'Fastest constrained output.'),

('doubao-pro', 'Doubao 1.5 Pro', 'siliconflow', 'SILICONFLOW_API_KEY',
 '["generate_long_form","generate_short_copy","social_adaptation","humanize"]', 1,
 1, 32000, 1, 32000, 0.10, 'ByteDance model. Human-like narrative.'),

('doubao-lite', 'Doubao 1.5 Lite', 'siliconflow', 'SILICONFLOW_API_KEY',
 '["platform_variation","social_adaptation"]', 2,
 1, 8000, 1, 32000, 0.02, 'Micro-model. Fast cheap variations.'),

('kimi', 'Kimi k1.5', 'moonshot', 'MOONSHOT_API_KEY',
 '["generate_long_form","generate_code"]', 1,
 1, 128000, 1, 1000000, 0.12, '10M token context.'),

-- TEXT GENERATION - PAID
('claude', 'Claude Sonnet 4.5', 'anthropic', 'ANTHROPIC_API_KEY',
 '["generate_long_form","generate_short_copy","generate_code","research_psychology","quality_editor","quality_buyer_sim","humanize"]', 1,
 0, 200000, 1, 200000, 3.00, 'Best quality writing. Lowest AI-detection.'),

('claude-opus', 'Claude Opus 4.6', 'anthropic', 'ANTHROPIC_API_KEY',
 '["generate_strategy","quality_competitor","quality_ceo"]', 1,
 0, 200000, 1, 200000, 15.00, 'Deep nuanced strategic thinking.'),

('gpt5', 'GPT-5.4', 'openai', 'OPENAI_API_KEY',
 '["generate_long_form","generate_code","generate_strategy","quality_ceo"]', 1,
 0, 128000, 1, 128000, 2.50, 'Top-tier long-form.'),

('gemini-pro', 'Gemini 3.1 Pro', 'google', 'GOOGLE_API_KEY',
 '["generate_strategy","research_keywords"]', 1,
 0, 32000, 1, 1000000, 0.125, '#1 reasoning benchmarks.'),

-- FREE INFERENCE
('mistral-7b', 'Mistral 7B', 'groq', 'GROQ_API_KEY',
 '["generate_seo_tags","platform_variation","parse_document"]', 1,
 1, 8000, 0, 32000, 0, 'Ultra-fast via Groq.'),

('llama4', 'Llama 4 Scout', 'fireworks', 'FIREWORKS_API_KEY',
 '["generate_seo_tags","generate_code"]', 1,
 1, 32000, 1, 10000000, 0, '10M context.'),

('phi4', 'Phi-4', 'huggingface', 'HF_TOKEN',
 '["generate_strategy","revenue_estimate"]', 1,
 1, 4000, 0, 4000, 0, 'Punches above weight on logic.'),

-- IMAGE GENERATION
('flux-pro', 'FLUX.1 Pro', 'fal', 'FAL_API_KEY',
 '["generate_image","generate_image_prompt"]', 1,
 1, 0, 0, 0, 0, '#1 text rendering.'),

('ideogram', 'Ideogram 3.0', 'ideogram', 'IDEOGRAM_API_KEY',
 '["generate_image","generate_image_prompt"]', 1,
 0, 0, 0, 0, 0, 'Typography + graphic design.'),

('sdxl', 'SDXL', 'huggingface', 'HF_TOKEN',
 '["generate_image","generate_mockup"]', 1,
 1, 0, 0, 0, 0, 'Free open-source.'),

('cogview3', 'CogView-3', 'siliconflow', 'SILICONFLOW_API_KEY',
 '["generate_image"]', 1,
 1, 0, 0, 0, 0, 'Strong artistic quality.'),

-- MUSIC GENERATION
('suno', 'Suno', 'suno', 'SUNO_API_KEY',
 '["generate_music","generate_music_prompt"]', 1,
 1, 0, 0, 0, 0, 'Best audio quality. 50 songs/day free.'),

('udio', 'Udio', 'huggingface', 'HF_TOKEN',
 '["generate_music","generate_music_prompt"]', 1,
 1, 0, 0, 0, 0, 'Different sonic character.'),

('musicgen', 'MusicGen', 'huggingface', 'HF_TOKEN',
 '["generate_music"]', 1,
 1, 0, 0, 0, 0, 'Open source. Free. No limits.'),

-- MOCKUP SERVICES
('printful', 'Printful Mockup', 'printful', 'PRINTFUL_API_KEY',
 '["generate_mockup"]', 1,
 1, 0, 0, 0, 0, 'Free real product mockups.'),

('printify', 'Printify Mockup', 'printify', 'PRINTIFY_API_KEY',
 '["generate_mockup"]', 2,
 1, 0, 0, 0, 0, 'Free different catalog.'),

-- DOCUMENT PARSING
('mistral-ocr', 'Mistral OCR', 'huggingface', 'HF_TOKEN',
 '["parse_document"]', 1,
 1, 0, 0, 0, 0, 'Best free OCR.'),

('tesseract', 'Tesseract', 'local', NULL,
 '["parse_document"]', 2,
 1, 0, 0, 0, 0, 'No API key needed. Always available.');
