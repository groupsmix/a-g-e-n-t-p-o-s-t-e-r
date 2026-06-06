-- ============================================================
-- Migration 024: Brain Layer (memory + journal + scratchpad + persona)
-- ============================================================
-- Purpose:
--   The cognitive substrate for every agent in the system.  This is the
--   "is it me?" surface — what the assistant remembers, who it is, what
--   it's focused on right now, and how the owner wants it to behave.
--
--   Implements PHASE 2 of POSTERAGENT_TASKS_V2:
--     • TASK-200 — Memory engine (memory_items + FTS5 mirror)
--     • TASK-201 — Identity / personality layer
--       - SOUL.md is shipped in @posteragent/identity/data/SOUL.md
--         (no schema needed — it's source-controlled markdown)
--       - journal_entries — per-task reflections
--       - now_scratchpad   — ephemeral "what I'm focused on" with TTL
--       - persona_traits   — owner-defined behavioural overrides
--
--   On Cloudflare, embeddings are intentionally JSON arrays inside D1.
--   When @cloudflare/vectorize is wired in (follow-up PR), the FTS5 row
--   stays as the lexical leg and Vectorize takes over the dense leg.
--   The TypeScript MemoryStore interface in @posteragent/memory is
--   already vector-backend agnostic.
-- ============================================================

-- ── memory_items ────────────────────────────────────────────────────────────
-- Single source of truth for everything the brain remembers.
-- Per-type staleness windows are enforced in code (packages/memory/src/store.ts)
-- because Workers don't run pg_cron; a periodic /memory/prune call handles it.
CREATE TABLE IF NOT EXISTS memory_items (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- Memory taxonomy — matches MemoryItemType in @posteragent/types.
  type            TEXT NOT NULL CHECK (type IN (
                    'identity',
                    'preference',
                    'project',
                    'event',
                    'fact'
                  )),

  -- The remembered thing, in prose.  Always natural-language sentences,
  -- not key/value pairs, so the consolidation agent can quote them back.
  content         TEXT NOT NULL,

  -- Where this came from — usually 'task:<task_id>' or 'manual:<user>'.
  source          TEXT NOT NULL DEFAULT 'unknown',

  -- Optional 384-dim embedding stored as JSON array.
  -- Use NULL when the embedding provider is unavailable.
  embedding       TEXT,

  -- Free-form tags for filtering ("brand:nexus", "platform:tiktok", etc.).
  tags            TEXT,            -- JSON array of strings

  -- Staleness — NULL means never expires (identity).
  expires_at      DATETIME,

  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memory_items_type        ON memory_items(type);
CREATE INDEX IF NOT EXISTS idx_memory_items_expires_at  ON memory_items(expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_items_created_at  ON memory_items(created_at DESC);

-- FTS5 virtual table mirrors memory_items.content for lexical search.
-- Triggers keep them in sync; the retriever does FTS + (optional) vector
-- and fuses with Reciprocal Rank Fusion (k=60).
CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts USING fts5(
  content,
  tags,
  content='memory_items',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS memory_items_ai AFTER INSERT ON memory_items BEGIN
  INSERT INTO memory_items_fts(rowid, content, tags)
  VALUES (new.rowid, new.content, COALESCE(new.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS memory_items_ad AFTER DELETE ON memory_items BEGIN
  INSERT INTO memory_items_fts(memory_items_fts, rowid, content, tags)
  VALUES('delete', old.rowid, old.content, COALESCE(old.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS memory_items_au AFTER UPDATE ON memory_items BEGIN
  INSERT INTO memory_items_fts(memory_items_fts, rowid, content, tags)
  VALUES('delete', old.rowid, old.content, COALESCE(old.tags, ''));
  INSERT INTO memory_items_fts(rowid, content, tags)
  VALUES (new.rowid, new.content, COALESCE(new.tags, ''));
END;

-- ── journal_entries ────────────────────────────────────────────────────────
-- Per-task reflections from agents.  Written by BaseAgent.afterRun()
-- (TASK-302) and surfaced in the Brain dashboard (TASK-203).
--
-- A journal entry is the agent saying back to the owner:
--   "Here's what I just did, what I learned, what I'd do differently."
-- These get consolidated into memory_items on a slower cadence.
CREATE TABLE IF NOT EXISTS journal_entries (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id         TEXT,                    -- agent_tasks.id, nullable for free-form
  agent_id        TEXT,                    -- which agent wrote it
  summary         TEXT NOT NULL,           -- 3-sentence reflection
  outcome         TEXT NOT NULL CHECK (outcome IN ('success', 'partial', 'failed', 'noop')),
  learnings       TEXT,                    -- JSON array of strings
  follow_ups      TEXT,                    -- JSON array of suggested next actions
  consolidated    INTEGER NOT NULL DEFAULT 0,  -- 0 until memory consolidation runs
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_task_id      ON journal_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at   ON journal_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_consolidated ON journal_entries(consolidated);

-- ── now_scratchpad ─────────────────────────────────────────────────────────
-- The "what am I focused on right now" surface.  Single logical row
-- per scope, identified by scope key.  Scope keys are typically:
--   • 'global'           — overall focus across all agents
--   • 'agent:<name>'     — per-agent active goal
--   • 'session:<id>'     — short-lived per-session context
--
-- TTL-based expiry (enforced by the brain reader, never trust the
-- field alone): rows older than expires_at are treated as not present.
CREATE TABLE IF NOT EXISTS now_scratchpad (
  scope           TEXT PRIMARY KEY,
  content         TEXT NOT NULL,
  set_by          TEXT,                    -- 'owner' | 'agent:<name>'
  expires_at      DATETIME NOT NULL,       -- absolute, never NULL
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_now_scratchpad_expires_at ON now_scratchpad(expires_at);

-- ── persona_traits ─────────────────────────────────────────────────────────
-- Owner-defined behavioural overrides layered on top of SOUL.md.
-- These are sticky preferences ("never use emojis in formal posts",
-- "always cite sources", "prefer dry tone for finance, warm for content").
-- The identity layer concatenates relevant traits into the agent prompt.
CREATE TABLE IF NOT EXISTS persona_traits (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  scope           TEXT NOT NULL,           -- 'global' | 'agent:<name>' | 'channel:<platform>'
  trait           TEXT NOT NULL,           -- the rule, in prose
  weight          REAL NOT NULL DEFAULT 1.0,  -- ordering hint when truncating
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_persona_traits_scope ON persona_traits(scope, enabled);
