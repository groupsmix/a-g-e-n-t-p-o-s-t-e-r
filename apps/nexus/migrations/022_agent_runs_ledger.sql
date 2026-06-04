-- ============================================================
-- Migration 022: Agent Runs Ledger
-- Purpose: Replace or extend the existing agent queue with a full cost-accountable agent run ledger
-- Dependencies: 020_agent_queue.sql, 021_portfolio_spine.sql
-- ============================================================

-- ── agent_runs ──────────────────────────────────────────────────────────────
-- Full cost-accountable ledger for every AI agent execution
-- Extends (does not duplicate) the existing automation_jobs table
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  venture_id TEXT REFERENCES ventures(id) ON DELETE SET NULL,
  offer_id TEXT REFERENCES offers(id) ON DELETE SET NULL,
  workflow_type TEXT NOT NULL CHECK (workflow_type IN (
    'radar_sweep',
    'opportunity_score',
    'venture_multiply',
    'asset_generate',
    'listing_draft',
    'content_draft',
    'affiliate_draft',
    'distribution',
    'attribution_sync',
    'kill_or_scale',
    'winner_expand',
    'daily_brief'
  )),
  agent_name TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  quality_score REAL,
  output_ref TEXT,  -- R2 storage key for output artifact
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'killed')),
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for querying agent runs by opportunity, status, and model costs
CREATE INDEX IF NOT EXISTS idx_agent_runs_opportunity ON agent_runs(opportunity_id, workflow_type);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_model_cost ON agent_runs(model, cost_cents);
CREATE INDEX IF NOT EXISTS idx_agent_runs_venture ON agent_runs(venture_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_offer ON agent_runs(offer_id);

-- ── prompt_versions ──────────────────────────────────────────────────────────
-- Version control for prompts to track which prompt version was used for each run
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  prompt_name TEXT NOT NULL,
  version TEXT NOT NULL,
  content TEXT NOT NULL,
  model_hint TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(prompt_name, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_name ON prompt_versions(prompt_name);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(active);
