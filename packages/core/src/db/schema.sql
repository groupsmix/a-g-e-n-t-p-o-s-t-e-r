-- Content items waiting to be generated or published
CREATE TABLE content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('poster', 'video_short', 'video_reel', 'video_story', 'carousel')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'publishing', 'published', 'failed')),
  niche TEXT NOT NULL,
  topic TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  platform_targets TEXT[] NOT NULL DEFAULT '{}',
  source_url TEXT,
  metadata JSONB DEFAULT '{}',
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ
);

CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_queue_id UUID REFERENCES content_queue(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'audio', 'caption', 'script', 'thumbnail')),
  url TEXT NOT NULL,
  cdn_url TEXT,
  cosmic_object_id TEXT,
  duration_seconds FLOAT,
  width INTEGER,
  height INTEGER,
  file_size_bytes BIGINT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE published_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_queue_id UUID REFERENCES content_queue(id),
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram_feed', 'instagram_reels', 'instagram_story', 'youtube_shorts', 'youtube', 'twitter', 'linkedin', 'pinterest', 'threads')),
  platform_post_id TEXT,
  platform_url TEXT,
  caption TEXT,
  hashtags TEXT[],
  status TEXT DEFAULT 'published',
  views BIGINT DEFAULT 0,
  likes BIGINT DEFAULT 0,
  comments BIGINT DEFAULT 0,
  shares BIGINT DEFAULT 0,
  saves BIGINT DEFAULT 0,
  click_throughs BIGINT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  published_at TIMESTAMPTZ DEFAULT NOW(),
  last_stats_updated_at TIMESTAMPTZ
);

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche TEXT NOT NULL,
  domain TEXT UNIQUE,
  vercel_project_id TEXT,
  cosmic_bucket_slug TEXT UNIQUE,
  status TEXT DEFAULT 'building' CHECK (status IN ('building', 'live', 'paused', 'archived')),
  affiliate_program TEXT CHECK (affiliate_program IN ('amazon', 'impact', 'shareasale', 'gumroad', 'custom')),
  affiliate_tag TEXT,
  monthly_views BIGINT DEFAULT 0,
  monthly_revenue_cents BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_at TIMESTAMPTZ
);

CREATE TABLE site_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT CHECK (content_type IN ('landing', 'blog_post', 'product_review', 'comparison', 'listicle', 'faq')),
  cosmic_object_id TEXT,
  published BOOLEAN DEFAULT FALSE,
  seo_score INTEGER,
  affiliate_links JSONB DEFAULT '[]',
  views BIGINT DEFAULT 0,
  conversions BIGINT DEFAULT 0,
  revenue_cents BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('amazon', 'adsense', 'gumroad', 'impact', 'shareasale', 'direct')),
  site_id UUID REFERENCES sites(id),
  published_post_id UUID REFERENCES published_posts(id),
  amount_cents BIGINT NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trend_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  niche TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  hashtags TEXT[] NOT NULL,
  topics JSONB NOT NULL DEFAULT '[]',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '6 hours'
);

CREATE INDEX idx_content_queue_status ON content_queue(status);
CREATE INDEX idx_content_queue_scheduled ON content_queue(scheduled_at);
CREATE INDEX idx_published_posts_platform ON published_posts(platform);
CREATE INDEX idx_published_posts_published_at ON published_posts(published_at);
CREATE INDEX idx_sites_niche ON sites(niche);
CREATE INDEX idx_revenue_events_date ON revenue_events(event_date);
CREATE INDEX idx_trend_cache_niche_platform ON trend_cache(niche, platform);
