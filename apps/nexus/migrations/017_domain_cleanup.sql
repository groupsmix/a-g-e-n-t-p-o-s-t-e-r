-- Domain cleanup: consolidate to 6 core domains
-- Migrate existing product references, deactivate old domains, seed categories

-- Step 1: Update existing domains to match new naming
UPDATE domains SET name = 'Digital Products', description = 'Downloadable digital goods', icon = '📦', color = '#6366f1', sort_order = 1, is_active = 1
  WHERE id = 'dom-digital';
UPDATE domains SET name = 'Content & Media', description = 'Articles, videos, social content', icon = '🎬', color = '#ec4899', sort_order = 3, is_active = 1
  WHERE id = 'dom-content';

-- Step 2: Insert new domains that don't exist yet
INSERT OR IGNORE INTO domains (id, name, slug, description, icon, color, sort_order, is_active) VALUES
  ('dom-pod',         'Print on Demand (POD)',   'print-on-demand',      'Custom-printed products via Printify', '👕', '#8b5cf6', 2, 1),
  ('dom-freelance',   'Freelance Services',      'freelance-services',   'Service-based offerings', '💼', '#14b8a6', 4, 1),
  ('dom-affiliate',   'Affiliate Marketing',     'affiliate-marketing',  'Promote products for commission', '🔗', '#f59e0b', 5, 1),
  ('dom-ecommerce',   'E-Commerce & Retail',     'ecommerce-retail',     'Online retail and dropshipping', '🛒', '#22c55e', 6, 1);

-- Step 3: Migrate orphaned products to Digital Products
UPDATE products SET domain_id = 'dom-digital' WHERE domain_id NOT IN ('dom-digital','dom-pod','dom-content','dom-freelance','dom-affiliate','dom-ecommerce');

-- Step 4: Deactivate old domains (soft delete — preserves FK integrity)
UPDATE domains SET is_active = 0 WHERE id NOT IN ('dom-digital','dom-pod','dom-content','dom-freelance','dom-affiliate','dom-ecommerce');

-- Step 5: Seed categories for all 6 domains
-- Digital Products
INSERT OR IGNORE INTO categories (id, domain_id, name, slug, description, icon, sort_order) VALUES
  ('cat-templates',    'dom-digital', 'Templates',         'templates',      'Notion, Figma, Canva templates',   '🧩', 1),
  ('cat-ebooks',       'dom-digital', 'Ebooks',            'ebooks',         'PDF ebooks and guides',            '📖', 2),
  ('cat-courses',      'dom-digital', 'Courses',           'courses',        'Video or email courses',           '🎓', 3),
  ('cat-printables',   'dom-digital', 'Printables',        'printables',     'Planners, checklists, worksheets', '🖨️', 4),
  ('cat-software',     'dom-digital', 'Software & Tools',  'software-tools', 'Apps, plugins, scripts',           '💻', 5),
  ('cat-audio',        'dom-digital', 'Audio & Music',     'audio-music',    'Beats, sound effects, music',      '🎵', 6);

-- Print on Demand
INSERT OR IGNORE INTO categories (id, domain_id, name, slug, description, icon, sort_order) VALUES
  ('cat-tshirts',      'dom-pod', 'T-Shirts',      'tshirts',      'Custom printed t-shirts',        '👕', 1),
  ('cat-hoodies',      'dom-pod', 'Hoodies',       'hoodies',      'Custom printed hoodies',         '🧥', 2),
  ('cat-mugs',         'dom-pod', 'Mugs',          'mugs',         'Custom printed mugs',            '☕', 3),
  ('cat-posters',      'dom-pod', 'Posters',       'posters',      'Wall art and poster prints',     '🖼️', 4),
  ('cat-totebags',     'dom-pod', 'Tote Bags',     'tote-bags',    'Custom printed tote bags',       '👜', 5),
  ('cat-phonecases',   'dom-pod', 'Phone Cases',   'phone-cases',  'Custom phone cases',             '📱', 6),
  ('cat-stickers',     'dom-pod', 'Stickers',      'stickers',     'Custom sticker designs',         '🏷️', 7);

-- Content & Media
INSERT OR IGNORE INTO categories (id, domain_id, name, slug, description, icon, sort_order) VALUES
  ('cat-articles',     'dom-content', 'Articles & Blogs', 'articles',     'Blog posts and written content',   '📝', 1),
  ('cat-video',        'dom-content', 'Video Content',    'video',        'YouTube, TikTok, Reels',           '🎥', 2),
  ('cat-social',       'dom-content', 'Social Media',     'social',       'Platform-native social posts',     '📱', 3),
  ('cat-newsletters',  'dom-content', 'Newsletters',      'newsletters',  'Email newsletter content',         '📧', 4),
  ('cat-graphics',     'dom-content', 'Graphics',         'graphics',     'Social graphics and thumbnails',   '🎨', 5);

-- Freelance Services
INSERT OR IGNORE INTO categories (id, domain_id, name, slug, description, icon, sort_order) VALUES
  ('cat-design',       'dom-freelance', 'Design',           'design',       'Logo, brand, UI/UX design',       '🎨', 1),
  ('cat-writing',      'dom-freelance', 'Writing',          'writing',      'Copywriting, ghostwriting',       '✍️', 2),
  ('cat-development',  'dom-freelance', 'Development',      'development',  'Web, app, automation dev',        '👨‍💻', 3),
  ('cat-consulting',   'dom-freelance', 'Consulting',       'consulting',   'Business and strategy consulting','💡', 4),
  ('cat-marketing-svc','dom-freelance', 'Marketing',        'marketing-svc','Social media and ad management',  '📣', 5);

-- Affiliate Marketing
INSERT OR IGNORE INTO categories (id, domain_id, name, slug, description, icon, sort_order) VALUES
  ('cat-saas',         'dom-affiliate', 'SaaS & Software',  'saas',         'Software affiliate programs',     '💻', 1),
  ('cat-hosting',      'dom-affiliate', 'Hosting & Domains','hosting',      'Web hosting and domain affiliates','🌐', 2),
  ('cat-ai-tools',     'dom-affiliate', 'AI Tools',         'ai-tools',     'AI product affiliate programs',   '🤖', 3),
  ('cat-finance',      'dom-affiliate', 'Finance',          'finance',      'Fintech and finance affiliates',  '💰', 4);

-- E-Commerce & Retail (includes Dropshipping)
INSERT OR IGNORE INTO categories (id, domain_id, name, slug, description, icon, sort_order) VALUES
  ('cat-dropshipping', 'dom-ecommerce', 'Dropshipping',     'dropshipping', 'Source and sell without inventory','📦', 1),
  ('cat-shopify',      'dom-ecommerce', 'Shopify Stores',   'shopify',      'Shopify-based online stores',     '🛍️', 2),
  ('cat-amazon',       'dom-ecommerce', 'Amazon FBA',       'amazon-fba',   'Fulfillment by Amazon products',  '📦', 3),
  ('cat-handmade',     'dom-ecommerce', 'Handmade & Crafts','handmade',     'Etsy-style handmade goods',       '🧶', 4),
  ('cat-wholesale',    'dom-ecommerce', 'Wholesale',        'wholesale',    'Bulk buying and reselling',       '🏭', 5);
