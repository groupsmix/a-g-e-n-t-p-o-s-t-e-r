-- ============================================================
-- Migration 021: Portfolio Spine
-- Purpose: Add core portfolio entity graph to D1 without breaking existing tables
-- Target Model: opportunity → many ventures → many offers → attributed events
-- ============================================================

-- ── signals ────────────────────────────────────────────────────────────
-- Source of truth for demand - raw signals from various sources
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source_type TEXT NOT NULL CHECK (source_type IN ('search_trend', 'competitor_gap', 'marketplace_data', 'ai_radar', 'buyer_feedback')),
  source_ref TEXT,
  title TEXT NOT NULL,
  extracted_audience TEXT,
  extracted_problem TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  demand_score REAL DEFAULT 0,
  freshness_score REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'raw' CHECK (status IN ('raw', 'scored', 'linked', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_source_type ON signals(source_type);
CREATE INDEX IF NOT EXISTS idx_signals_demand_score ON signals(demand_score DESC);

-- ── ventures ───────────────────────────────────────────────────────────
-- One per vertical per opportunity - the business unit for each revenue stream
CREATE TABLE IF NOT EXISTS ventures (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  vertical TEXT NOT NULL CHECK (vertical IN ('digital', 'pod', 'content', 'affiliate', 'freelance', 'ecommerce')),
  strategy TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'building', 'testing', 'live', 'scaling', 'mutating', 'killed', 'archived')),
  budget_cap_cents INTEGER NOT NULL DEFAULT 0,
  test_quota_clicks INTEGER NOT NULL DEFAULT 100,
  signal_id TEXT REFERENCES signals(id),
  ai_cost_cents INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  profit_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ventures_opportunity ON ventures(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_ventures_status ON ventures(status);
CREATE INDEX IF NOT EXISTS idx_ventures_vertical ON ventures(vertical);
CREATE INDEX IF NOT EXISTS idx_ventures_signal ON ventures(signal_id);

-- ── offers ─────────────────────────────────────────────────────────────
-- Specific listing (price + platform + variant) for each venture
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  venture_id TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  platform_id TEXT REFERENCES platforms(id),
  title TEXT,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  variant_type TEXT,
  variant_data TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'closed')),
  published_at TEXT,
  external_listing_id TEXT,
  external_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offers_venture ON offers(venture_id);
CREATE INDEX IF NOT EXISTS idx_offers_platform ON offers(platform_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_external ON offers(external_listing_id);

-- ── tracked_links ──────────────────────────────────────────────────────
-- Attribution anchor - created before any traffic is sent
CREATE TABLE IF NOT EXISTS tracked_links (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  destination_url TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tracked_links_offer ON tracked_links(offer_id);
CREATE INDEX IF NOT EXISTS idx_tracked_links_slug ON tracked_links(slug);
CREATE INDEX IF NOT EXISTS idx_tracked_links_channel ON tracked_links(channel);

-- ── economic_events ─────────────────────────────────────────────────────
-- Every money movement (revenue, cost, fee, refund)
CREATE TABLE IF NOT EXISTS economic_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  tracked_link_id TEXT REFERENCES tracked_links(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('revenue', 'cost', 'fee', 'refund', 'commission')),
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  category TEXT,
  external_event_id TEXT,
  external_provider TEXT,
  metadata TEXT DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_economic_events_offer ON economic_events(offer_id);
CREATE INDEX IF NOT EXISTS idx_economic_events_link ON economic_events(tracked_link_id);
CREATE INDEX IF NOT EXISTS idx_economic_events_type ON economic_events(event_type);
CREATE INDEX IF NOT EXISTS idx_economic_events_occurred ON economic_events(occurred_at DESC);

-- ── asset_library ────────────────────────────────────────────────────────
-- Reusable generated assets with performance tags
CREATE TABLE IF NOT EXISTS asset_library (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  venture_id TEXT REFERENCES ventures(id) ON DELETE SET NULL,
  offer_id TEXT REFERENCES offers(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'copy', 'video', 'audio', 'document', 'template')),
  file_path TEXT,
  cdn_url TEXT,
  prompt_used TEXT,
  ai_model_used TEXT,
  tags TEXT DEFAULT '[]',
  performance_score REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_asset_library_venture ON asset_library(venture_id);
CREATE INDEX IF NOT EXISTS idx_asset_library_offer ON asset_library(offer_id);
CREATE INDEX IF NOT EXISTS idx_asset_library_type ON asset_library(asset_type);
CREATE INDEX IF NOT EXISTS idx_asset_library_performance ON asset_library(performance_score DESC);

-- ── allocator_actions ────────────────────────────────────────────────────
-- Machine decisions with reasons for capital allocation
CREATE TABLE IF NOT EXISTS allocator_actions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  venture_id TEXT NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('kill', 'mutate', 'expand', 'scale')),
  reason TEXT NOT NULL,
  confidence REAL DEFAULT 0,
  data_before TEXT DEFAULT '{}',
  data_after TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_allocator_actions_venture ON allocator_actions(venture_id);
CREATE INDEX IF NOT EXISTS idx_allocator_actions_type ON allocator_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_allocator_actions_created ON allocator_actions(created_at DESC);

-- ── Backfill existing opportunities with signal reference if possible ─────
-- This is a safe migration that doesn't break existing data
-- Future tasks will migrate linked_product_id to the new venture/offer model