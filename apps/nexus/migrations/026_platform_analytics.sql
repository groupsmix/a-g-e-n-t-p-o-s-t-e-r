-- 026_platform_analytics.sql — TASK-702.
--
-- Daily snapshots of per-post engagement metrics, captured by the
-- @posteragent/agent-analytics collector. Dedupe key is the unique
-- index on (platform, post_id, captured_at) so re-runs are idempotent.

CREATE TABLE IF NOT EXISTS platform_analytics (
  platform     TEXT NOT NULL,
  post_id      TEXT NOT NULL,
  captured_at  TEXT NOT NULL,
  published_at TEXT,
  metrics      TEXT NOT NULL,
  extra        TEXT,
  PRIMARY KEY (platform, post_id, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_platform_analytics_recent
  ON platform_analytics (platform, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_analytics_post
  ON platform_analytics (platform, post_id, captured_at DESC);
