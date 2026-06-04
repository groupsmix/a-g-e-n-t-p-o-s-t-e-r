-- ============================================================
-- Migration 013: Add missing indexes on foreign-key columns
-- ============================================================
-- Ensures all FK columns used in JOINs / WHERE clauses are indexed for
-- fast lookups. Existing indexes (created in 001) are skipped by IF NOT EXISTS.

-- products.category_id (FK → categories)
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- platform_variants.platform_id (FK → platforms)
CREATE INDEX IF NOT EXISTS idx_platform_variants_platform ON platform_variants(platform_id);

-- social_variants.product_id (FK → products)
CREATE INDEX IF NOT EXISTS idx_social_variants_product ON social_variants(product_id);

-- social_variants.channel_id (FK → social_channels)
CREATE INDEX IF NOT EXISTS idx_social_variants_channel ON social_variants(channel_id);

-- reviews.run_id (FK → workflow_runs)
CREATE INDEX IF NOT EXISTS idx_reviews_run ON reviews(run_id);

-- title_variants.product_id (FK → products)
CREATE INDEX IF NOT EXISTS idx_title_variants_product ON title_variants(product_id);

-- trend_alerts.domain_id (FK → domains)
CREATE INDEX IF NOT EXISTS idx_trends_domain ON trend_alerts(domain_id);

-- winner_patterns.domain_id (FK → domains)
CREATE INDEX IF NOT EXISTS idx_winners_domain ON winner_patterns(domain_id);

-- winner_patterns.category_id (FK → categories)
CREATE INDEX IF NOT EXISTS idx_winners_category ON winner_patterns(category_id);

-- deliveries.schedule_id (FK → schedules)
CREATE INDEX IF NOT EXISTS idx_deliveries_schedule ON deliveries(schedule_id);

-- deliveries.product_id (FK → products)
CREATE INDEX IF NOT EXISTS idx_deliveries_product ON deliveries(product_id);

-- autopilot_log.product_id (FK → products)
CREATE INDEX IF NOT EXISTS idx_autopilot_product ON autopilot_log(product_id);

-- workflow_steps.step_name (queried by name in updates)
CREATE INDEX IF NOT EXISTS idx_steps_name ON workflow_steps(step_name);
