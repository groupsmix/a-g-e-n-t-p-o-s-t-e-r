-- Opportunity Radar: trend prediction & scored opportunities
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  trend_name TEXT NOT NULL,
  target_buyer TEXT NOT NULL,
  product_idea TEXT NOT NULL,
  why_it_sells TEXT NOT NULL,
  evidence TEXT DEFAULT '[]',        -- JSON array of { source, url, snippet }
  competition_level TEXT DEFAULT 'medium' CHECK (competition_level IN ('low','medium','high','saturated')),
  urgency TEXT DEFAULT 'medium' CHECK (urgency IN ('low','medium','high','urgent')),
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low','medium','high')),
  suggested_format TEXT NOT NULL CHECK (suggested_format IN ('freelance','digital_product','pod','content')),
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),

  -- Scoring breakdown (0-100 total)
  score_demand INTEGER DEFAULT 0 CHECK (score_demand BETWEEN 0 AND 20),
  score_competition_gap INTEGER DEFAULT 0 CHECK (score_competition_gap BETWEEN 0 AND 15),
  score_buyer_urgency INTEGER DEFAULT 0 CHECK (score_buyer_urgency BETWEEN 0 AND 15),
  score_ease INTEGER DEFAULT 0 CHECK (score_ease BETWEEN 0 AND 15),
  score_monetization INTEGER DEFAULT 0 CHECK (score_monetization BETWEEN 0 AND 15),
  score_timing INTEGER DEFAULT 0 CHECK (score_timing BETWEEN 0 AND 10),
  score_safety INTEGER DEFAULT 0 CHECK (score_safety BETWEEN 0 AND 10),
  total_score INTEGER GENERATED ALWAYS AS (
    score_demand + score_competition_gap + score_buyer_urgency +
    score_ease + score_monetization + score_timing + score_safety
  ) STORED,

  -- Niche and category
  niche TEXT,
  category TEXT,
  source_signals TEXT DEFAULT '[]',  -- JSON array of signal sources (google_trends, tiktok, etc.)

  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new','watchlist','approved','in_progress','completed','dismissed')),
  is_guess INTEGER DEFAULT 0,        -- 1 = AI speculation, 0 = backed by evidence

  -- Linked job/product (when approved and work starts)
  linked_job_id TEXT,
  linked_product_id TEXT,

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT                     -- trend expiry date
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_total_score ON opportunities(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_format ON opportunities(suggested_format);
CREATE INDEX IF NOT EXISTS idx_opportunities_niche ON opportunities(niche);
