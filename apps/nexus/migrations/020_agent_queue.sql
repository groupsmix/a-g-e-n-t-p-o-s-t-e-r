-- ============================================================
-- Migration 020: Agent Queue System + 8-Category Scoring
-- Phase 4 (Agent Roles), Phase 5 (Queue), Phase 6 (Scoring)
-- ============================================================

-- ── automation_jobs ────────────────────────────────────────────────────────
-- Every unit of automation work is a row here. Supports retry, dead-letter,
-- and idempotency so the system cannot accidentally publish the same product
-- twice, even if it crashes and restarts mid-run.

CREATE TABLE IF NOT EXISTS automation_jobs (
  job_id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  product_id      TEXT,                          -- linked product (nullable for research jobs)
  opportunity_id  TEXT,                          -- linked opportunity (nullable)
  step_name       TEXT NOT NULL,                 -- see job type constants below
  idempotency_key TEXT UNIQUE,                   -- prevents duplicate execution on retry
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','done','failed','dead')),
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  priority        INTEGER NOT NULL DEFAULT 5,    -- 1 (highest) – 10 (lowest)
  last_error      TEXT,
  payload         TEXT NOT NULL DEFAULT '{}',    -- JSON input for the agent
  result          TEXT,                          -- JSON output from the agent (set on done)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  scheduled_for   TEXT NOT NULL DEFAULT (datetime('now')),  -- delayed scheduling
  started_at      TEXT,
  finished_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status       ON automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_step         ON automation_jobs(step_name);
CREATE INDEX IF NOT EXISTS idx_jobs_product      ON automation_jobs(product_id);
CREATE INDEX IF NOT EXISTS idx_jobs_idem         ON automation_jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled    ON automation_jobs(scheduled_for, status, priority);

-- ── agent_outputs ──────────────────────────────────────────────────────────
-- Each agent run saves its structured JSON output here for later agents to
-- read. This is the inter-agent "shared memory" — no live chatting between
-- agents; they communicate through the database.

CREATE TABLE IF NOT EXISTS agent_outputs (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_id      TEXT NOT NULL REFERENCES automation_jobs(job_id) ON DELETE CASCADE,
  product_id  TEXT,
  agent_name  TEXT NOT NULL,   -- 'researcher' | 'scorer' | 'builder' | 'copywriter' |
                                --  'designer' | 'inspector' | 'publisher' | 'marketer' | 'analyst'
  output      TEXT NOT NULL,   -- structured JSON (agent-specific schema)
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_outputs_product ON agent_outputs(product_id, agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_job     ON agent_outputs(job_id);

-- ── product_scores ─────────────────────────────────────────────────────────
-- 8-category AI scoring for every idea before it is built.
-- Weights: buying_intent 20%, pain_level 15%, competition 15%,
--          creation_difficulty 10%, product_clarity 10%, platform_fit 10%,
--          risk_level 10% (higher = safer), uniqueness 10%.

CREATE TABLE IF NOT EXISTS product_scores (
  id                         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  product_id                 TEXT,
  opportunity_id             TEXT,
  niche                      TEXT NOT NULL,
  -- 8 dimensions (0–100 each)
  score_buying_intent        INTEGER DEFAULT 0 CHECK (score_buying_intent        BETWEEN 0 AND 100),
  score_pain_level           INTEGER DEFAULT 0 CHECK (score_pain_level           BETWEEN 0 AND 100),
  score_competition          INTEGER DEFAULT 0 CHECK (score_competition          BETWEEN 0 AND 100),
  score_creation_difficulty  INTEGER DEFAULT 0 CHECK (score_creation_difficulty  BETWEEN 0 AND 100),
  score_product_clarity      INTEGER DEFAULT 0 CHECK (score_product_clarity      BETWEEN 0 AND 100),
  score_platform_fit         INTEGER DEFAULT 0 CHECK (score_platform_fit         BETWEEN 0 AND 100),
  score_risk_level           INTEGER DEFAULT 0 CHECK (score_risk_level           BETWEEN 0 AND 100),
  score_uniqueness           INTEGER DEFAULT 0 CHECK (score_uniqueness           BETWEEN 0 AND 100),
  -- weighted total stored so it can be indexed
  total_score                INTEGER DEFAULT 0,
  -- per-dimension reasoning
  reasoning                  TEXT DEFAULT '{}',   -- JSON { dimension: "why this score" }
  recommendation             TEXT DEFAULT 'skip'  -- 'build' | 'refine' | 'skip'
                               CHECK (recommendation IN ('build','refine','skip')),
  scored_by                  TEXT DEFAULT 'ai'    -- 'ai' | 'manual'
                               CHECK (scored_by IN ('ai','manual')),
  created_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scores_product     ON product_scores(product_id);
CREATE INDEX IF NOT EXISTS idx_scores_opportunity ON product_scores(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_scores_total       ON product_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_niche       ON product_scores(niche);
