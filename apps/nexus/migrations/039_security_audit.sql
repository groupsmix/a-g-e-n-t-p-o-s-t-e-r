-- Migration 039: Security Audit Agent
-- Adds dedicated tables for security scan sessions and individual findings.

-- ── Security scan sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_scans (
  id            TEXT PRIMARY KEY,
  repo_id       TEXT NOT NULL REFERENCES repo_projects(id) ON DELETE CASCADE,
  branch        TEXT NOT NULL DEFAULT 'main',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','failed')),

  -- Totals (populated on completion)
  total_files   INTEGER NOT NULL DEFAULT 0,
  total_findings INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count    INTEGER NOT NULL DEFAULT 0,
  medium_count  INTEGER NOT NULL DEFAULT 0,
  low_count     INTEGER NOT NULL DEFAULT 0,
  info_count    INTEGER NOT NULL DEFAULT 0,

  -- Verdict: pass | warn | fail
  verdict       TEXT,

  -- Free-form AI executive summary
  summary       TEXT,

  error         TEXT,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT,
  FOREIGN KEY (repo_id) REFERENCES repo_projects(id) ON DELETE CASCADE
);

-- ── Individual security findings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_findings (
  id          TEXT PRIMARY KEY,
  scan_id     TEXT NOT NULL REFERENCES security_scans(id) ON DELETE CASCADE,
  repo_id     TEXT NOT NULL,

  -- Classification
  severity    TEXT NOT NULL DEFAULT 'medium'
              CHECK (severity IN ('critical','high','medium','low','info')),
  category    TEXT NOT NULL DEFAULT 'other'
              CHECK (category IN (
                'secret','injection','xss','auth','crypto',
                'config','deps','owasp','insecure-design','other'
              )),

  -- Location
  file_path   TEXT,
  line_number INTEGER,

  -- Content
  title       TEXT NOT NULL,
  description TEXT,
  snippet     TEXT,          -- offending code snippet (max 500 chars)
  suggestion  TEXT,          -- recommended fix

  -- State
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','acknowledged','resolved','false_positive')),

  -- Source of finding: 'pattern' (regex) | 'ai' | 'dep'
  source      TEXT NOT NULL DEFAULT 'ai',

  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (scan_id) REFERENCES security_scans(id) ON DELETE CASCADE
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_security_scans_repo ON security_scans(repo_id);
CREATE INDEX IF NOT EXISTS idx_security_findings_scan ON security_findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_security_findings_severity ON security_findings(severity);
CREATE INDEX IF NOT EXISTS idx_security_findings_status ON security_findings(status);
