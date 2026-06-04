-- Local demo seed. Not auto-applied by migrations; run manually with
--   wrangler d1 execute nexus-db --local --file=./migrations/seed_demo.sql

INSERT OR IGNORE INTO domains (id, name, slug, description, icon, color, sort_order) VALUES
  ('dom-digital',   'Digital Products',  'digital',   'Downloadable goods',       '💾', '#6366f1', 1),
  ('dom-physical',  'Physical Products', 'physical',  'Physical inventory',       '📦', '#14b8a6', 2),
  ('dom-content',   'Content',           'content',   'Articles, ebooks, courses','📝', '#f59e0b', 3);

INSERT OR IGNORE INTO categories (id, domain_id, name, slug, description, icon, sort_order) VALUES
  ('cat-tpl', 'dom-digital',  'Templates',   'templates', 'Notion / Figma / Canva', '🧩', 1),
  ('cat-crs', 'dom-digital',  'Courses',     'courses',   'Video or email courses', '🎓', 2),
  ('cat-tsh', 'dom-physical', 'T-shirts',    'tshirts',   'POD apparel',            '👕', 1),
  ('cat-eb',  'dom-content',  'Ebooks',      'ebooks',    'PDF ebooks',             '📖', 1);

INSERT OR IGNORE INTO platforms (id, name, slug, url, title_max_chars, description_max, tag_count, tag_max_chars, audience, tone, is_active, sort_order) VALUES
  ('pf-etsy',    'Etsy',         'etsy',    'https://etsy.com',    140, 1024, 13, 20, 'craft+gift buyers',       'warm',      1, 1),
  ('pf-gumroad', 'Gumroad',      'gumroad', 'https://gumroad.com',  70, 2048, 10, 24, 'indie / prosumer buyers', 'direct',    1, 2),
  ('pf-shop',    'Shopify',      'shopify', 'https://shopify.com', 100, 5000, 12, 24, 'own-store customers',     'polished',  1, 3);

INSERT OR IGNORE INTO social_channels (id, name, slug, caption_max_chars, hashtag_count, tone, is_active, sort_order) VALUES
  ('sc-ig',    'Instagram', 'instagram', 2200, 15, 'visual',     1, 1),
  ('sc-tt',    'TikTok',    'tiktok',    2200,  8, 'hooky',      1, 2),
  ('sc-x',     'X/Twitter', 'x',          280,  2, 'punchy',     1, 3);
