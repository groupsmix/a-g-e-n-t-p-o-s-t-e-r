-- Freelance job execution engine
-- Strict state machine with CEO orchestration, subagents, revision limits,
-- versioned artifacts, client revision loop, quality scoring, cost/time limits

CREATE TABLE IF NOT EXISTS freelance_jobs (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  title TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('landing_page', 'seo_article', 'copywriting', 'pod_product', 'digital_product')),
  brief TEXT NOT NULL,
  deadline TEXT,
  budget REAL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'intake_review', 'needs_owner_input', 'planning',
    'owner_plan_approval', 'running', 'ceo_reviewing', 'revision_required',
    'human_review_needed', 'final_assembly', 'qa_review',
    'ready_for_owner', 'delivered', 'archived',
    'client_revision_requested', 'revision_in_progress', 'revision_ready'
  )),
  current_stage TEXT,
  priority INTEGER NOT NULL DEFAULT 1,
  missing_info_json TEXT,
  plan_json TEXT,
  final_output TEXT,
  client_message TEXT,
  upsell_suggestion TEXT,
  links_notes TEXT,
  deliverables_required TEXT,
  attachments_json TEXT,
  -- Cost/time limits
  max_ai_calls INTEGER NOT NULL DEFAULT 50,
  ai_calls_used INTEGER NOT NULL DEFAULT 0,
  max_revision_rounds INTEGER NOT NULL DEFAULT 3,
  max_runtime_minutes INTEGER NOT NULL DEFAULT 120,
  -- Quality scoring (CEO fills before owner approval)
  quality_score_json TEXT,
  -- Owner notes to CEO
  owner_notes TEXT,
  -- Client revision feedback
  client_feedback TEXT,
  -- Intake questionnaire answers
  intake_answers_json TEXT,
  -- Profit tracking
  estimated_ai_cost REAL NOT NULL DEFAULT 0,
  actual_time_minutes INTEGER NOT NULL DEFAULT 0,
  profit_score REAL,
  -- Red flags detected
  red_flags_json TEXT,
  -- Scope creep notes
  scope_notes TEXT,
  -- Template source (if created from template)
  template_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS freelance_tasks (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES freelance_jobs(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL CHECK (agent_role IN (
    'ceo', 'research', 'strategy', 'production', 'qa', 'client_comm',
    'trend_niche', 'trademark_risk', 'design_director', 'image_design', 'mockup', 'listing', 'pod_qa'
  )),
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  acceptance_criteria_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'submitted', 'ceo_reviewing',
    'accepted', 'needs_revision', 'blocked',
    'human_review_needed', 'failed'
  )),
  output_json TEXT,
  ceo_review_json TEXT,
  revision_count INTEGER NOT NULL DEFAULT 0,
  max_revisions INTEGER NOT NULL DEFAULT 2,
  depends_on_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  playbook_stage TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every task output is saved as a versioned artifact so nothing is lost
CREATE TABLE IF NOT EXISTS freelance_task_artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES freelance_tasks(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES freelance_jobs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  output_json TEXT NOT NULL,
  ceo_review_json TEXT,
  revision_instructions TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS freelance_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES freelance_jobs(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES freelance_tasks(id) ON DELETE SET NULL,
  actor TEXT NOT NULL CHECK (actor IN (
    'owner', 'ceo', 'research', 'strategy', 'production', 'qa', 'client_comm', 'system',
    'trend_niche', 'trademark_risk', 'design_director', 'image_design', 'mockup', 'listing', 'pod_qa'
  )),
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reusable templates from successful jobs
CREATE TABLE IF NOT EXISTS freelance_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('landing_page', 'seo_article', 'copywriting', 'pod_product', 'digital_product')),
  description TEXT NOT NULL,
  source_job_id TEXT REFERENCES freelance_jobs(id) ON DELETE SET NULL,
  plan_json TEXT NOT NULL,
  intake_answers_json TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Portfolio entries from delivered jobs
CREATE TABLE IF NOT EXISTS freelance_portfolio (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES freelance_jobs(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  title TEXT NOT NULL,
  challenge TEXT NOT NULL,
  approach TEXT NOT NULL,
  result TEXT NOT NULL,
  testimonial_request TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fl_tasks_job ON freelance_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_fl_events_job ON freelance_events(job_id);
CREATE INDEX IF NOT EXISTS idx_fl_jobs_status ON freelance_jobs(status);
CREATE INDEX IF NOT EXISTS idx_fl_artifacts_task ON freelance_task_artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_fl_jobs_deadline ON freelance_jobs(deadline);
CREATE INDEX IF NOT EXISTS idx_fl_templates_type ON freelance_templates(job_type);
CREATE INDEX IF NOT EXISTS idx_fl_portfolio_job ON freelance_portfolio(job_id);
