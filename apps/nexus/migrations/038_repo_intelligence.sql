-- Migration 038: Repository Intelligence & Multi-Agent Coordinator
-- Adds tables for repo tracking, code operations, doc generation, and agent sessions

-- Tracked repositories
CREATE TABLE IF NOT EXISTS repo_projects (
  id           TEXT PRIMARY KEY,
  url          TEXT NOT NULL,
  owner        TEXT NOT NULL,
  name         TEXT NOT NULL,
  branch       TEXT NOT NULL DEFAULT 'main',
  description  TEXT,
  language     TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'error')),
  last_analyzed_at TEXT,
  project_map  TEXT,  -- JSON blob: file tree, architecture, deps
  metadata     TEXT,  -- JSON blob: stars, topics, license, etc
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent sessions (multi-agent coordinator)
CREATE TABLE IF NOT EXISTS agent_sessions (
  id           TEXT PRIMARY KEY,
  repo_id      TEXT REFERENCES repo_projects(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL DEFAULT 'full' CHECK (session_type IN ('full', 'code-only', 'doc-only', 'test-only', 'review-only')),
  task_prompt  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'running', 'needs_review', 'done', 'failed', 'cancelled')),
  plan         TEXT,   -- JSON: array of agent steps
  current_step INTEGER NOT NULL DEFAULT 0,
  result       TEXT,   -- JSON: final result summary
  error        TEXT,
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual agent step logs within a session
CREATE TABLE IF NOT EXISTS session_steps (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  step_index   INTEGER NOT NULL,
  agent_type   TEXT NOT NULL CHECK (agent_type IN ('planner', 'code', 'documentation', 'testing', 'review', 'browser')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  input        TEXT,   -- JSON
  output       TEXT,   -- JSON
  error        TEXT,
  started_at   TEXT,
  completed_at TEXT
);

-- Codebase operations audit log
CREATE TABLE IF NOT EXISTS code_operations (
  id           TEXT PRIMARY KEY,
  repo_id      TEXT REFERENCES repo_projects(id) ON DELETE SET NULL,
  session_id   TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  op_type      TEXT NOT NULL CHECK (op_type IN ('read', 'create', 'update', 'delete', 'commit', 'pull_request', 'analyze')),
  file_path    TEXT,
  commit_sha   TEXT,
  pr_number    INTEGER,
  pr_url       TEXT,
  summary      TEXT,
  payload      TEXT,   -- JSON: operation details
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Documentation generations
CREATE TABLE IF NOT EXISTS doc_generations (
  id           TEXT PRIMARY KEY,
  repo_id      TEXT NOT NULL REFERENCES repo_projects(id) ON DELETE CASCADE,
  session_id   TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  doc_type     TEXT NOT NULL CHECK (doc_type IN ('readme', 'architecture', 'api', 'testing', 'changelog', 'project_structure', 'custom')),
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  committed    INTEGER NOT NULL DEFAULT 0,
  commit_sha   TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Safety audit log (every destructive action)
CREATE TABLE IF NOT EXISTS safety_audit_log (
  id           TEXT PRIMARY KEY,
  session_id   TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  action_type  TEXT NOT NULL,
  target       TEXT,
  approved     INTEGER NOT NULL DEFAULT 0,
  details      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_repo_projects_status ON repo_projects(status);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_repo ON agent_sessions(repo_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_session_steps_session ON session_steps(session_id, step_index);
CREATE INDEX IF NOT EXISTS idx_code_operations_repo ON code_operations(repo_id, created_at);
CREATE INDEX IF NOT EXISTS idx_doc_generations_repo ON doc_generations(repo_id, doc_type);
