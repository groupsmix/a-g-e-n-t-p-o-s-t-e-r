-- ============================================================
-- NEXUS Database Migration 005: Social Channels
-- ============================================================
-- Seeds default social media channel configurations.
-- These can be customized via the Social Manager.
-- ============================================================

INSERT OR IGNORE INTO social_channels (
  id, name, slug, caption_max_chars, hashtag_count, tone,
  format, content_types, posting_mode, sort_order
) VALUES

-- SHORT-FORM VIDEO
('social-instagram', 'Instagram', 'instagram',
 2200, 30,
 'Visual, lifestyle, aspirational',
 'Square (1:1) or Vertical (4:5)',
 '["reel", "carousel", "story", "post"]',
 'manual', 1),

('social-tiktok', 'TikTok', 'tiktok',
 2200, 100,
 'Casual, authentic, trendy',
 'Vertical (9:16)',
 '["video", "stitch", " duet"]',
 'manual', 2),

('social-youtube-shorts', 'YouTube Shorts', 'youtube-shorts',
 3000, 15,
 'Entertaining, informative, hook-driven',
 'Vertical (9:16)',
 '["short", "shorts"]',
 'manual', 3),

('social-facebook', 'Facebook', 'facebook',
 5000, 30,
 'Community, conversational, shareable',
 'Square (1:1) or Video (16:9)',
 '["video", "post", "live"]',
 'manual', 4),

-- SOCIAL NETWORKING
('social-twitter', 'Twitter / X', 'twitter',
 280, 3,
 'Conversational, provocative, newsworthy',
 'Text + media (16:9 or 1:1)',
 '["tweet", "thread", "reply"]',
 'manual', 5),

('social-linkedin', 'LinkedIn', 'linkedin',
 3000, 5,
 'Professional, thought leadership, B2B',
 'Text + image (1200x627)',
 '["post", "article"]',
 'manual', 6),

('social-threads', 'Threads', 'threads',
 500, 5,
 'Casual, conversational, community',
 'Text + image (1:1)',
 '["thread", "post"]',
 'manual', 7),

-- VISUAL PLATFORMS
('social-pinterest', 'Pinterest', 'pinterest',
 500, 20,
 ' aspirational, how-to, visual discovery',
 'Vertical (2:3)',
 '["pin", "idea_pin"]',
 'manual', 8),

('social-reddit', 'Reddit', 'reddit',
 40000, 0,
 'Authentic, community-aware, value-first',
 'Text or Link',
 '["post", "comment"]',
 'manual', 9),

-- CONTENT PLATFORMS
('social-youtube', 'YouTube', 'youtube',
 5000, 15,
 'Informative, entertaining, evergreen',
 'Horizontal (16:9)',
 '["video", "short", "live"]',
 'manual', 10),

('social-medium', 'Medium', 'medium',
 30000, 5,
 'Thoughtful, long-form, expertise-driven',
 'Article',
 '["article", "story"]',
 'manual', 11),

('social-substack', 'Substack', 'substack',
 90000, 0,
 'Newsletter-style, personal, recurring',
 'Email article',
 '["newsletter", "post"]',
 'manual', 12),

-- MESSAGING & COMMUNITY
('social-discord', 'Discord', 'discord',
 2000, 0,
 'Community, real-time, exclusive',
 'Rich embed',
 '["message", "announcement"]',
 'manual', 13),

('social-telegram', 'Telegram', 'telegram',
 4096, 10,
 'Direct, newsworthy, value-forward',
 'Text + media',
 '["message", "poll"]',
 'manual', 14);
