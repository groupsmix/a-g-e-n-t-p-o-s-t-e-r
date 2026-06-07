-- 025_publish_jobs.sql — TASK-700 publish_jobs queue + TASK-603 podcast_episodes.
--
-- publish_jobs is consumed by @posteragent/agent-publisher's D1JobStore
-- (idempotency-keyed scheduled queue + drain).  podcast_episodes is the
-- backing table for the dashboard's RSS feed renderer (TASK-603).

CREATE TABLE IF NOT EXISTS publish_jobs (
  idempotency_key TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  publish_at TEXT,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_publish_jobs_due
  ON publish_jobs (status, publish_at);

CREATE INDEX IF NOT EXISTS idx_publish_jobs_platform
  ON publish_jobs (platform, status);


CREATE TABLE IF NOT EXISTS podcast_episodes (
  guid TEXT PRIMARY KEY,
  show TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT NOT NULL,
  duration_sec INTEGER,
  artwork_url TEXT,
  episode_number INTEGER,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_show
  ON podcast_episodes (show, published_at DESC);
