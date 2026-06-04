-- Daily digest storage: persists each generated morning report so the owner
-- can view history. The `data` column holds the full Digest JSON blob.
CREATE TABLE IF NOT EXISTS digests (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL UNIQUE,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
