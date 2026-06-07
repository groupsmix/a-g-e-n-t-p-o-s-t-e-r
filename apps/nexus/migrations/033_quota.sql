-- 033_quota.sql — TASK-1102.

CREATE TABLE IF NOT EXISTS quota_policies (
  provider     TEXT NOT NULL,
  action       TEXT NOT NULL DEFAULT '*',
  limit_n      INTEGER NOT NULL,
  window_ms    INTEGER NOT NULL,
  daily_limit  INTEGER,
  cooldown_ms  INTEGER,
  PRIMARY KEY (provider, action)
);

CREATE TABLE IF NOT EXISTS quota_state (
  provider     TEXT NOT NULL,
  action       TEXT NOT NULL DEFAULT '*',
  state_json   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (provider, action)
);
