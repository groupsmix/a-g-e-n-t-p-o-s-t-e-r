-- ============================================================
-- Seed: agent_tasks demo data for local dashboard development
-- ============================================================
-- Apply after migrations 001-023.  Safe to re-run; uses fixed IDs
-- so repeated applies will fail the PRIMARY KEY constraint —
-- delete the rows first if you want to reseed:
--
--   wrangler d1 execute nexus --local --command \
--     "DELETE FROM agent_tasks WHERE id LIKE 'seed-%';"
-- ============================================================

INSERT INTO agent_tasks (
  id, type, status, payload, result,
  estimated_cost_usd, actual_cost_usd, model_used,
  input_tokens, output_tokens,
  agent_id, origin,
  started_at, finished_at, duration_ms
) VALUES
  (
    'seed-001', 'research', 'done',
    '{"topic":"ai poster aesthetic trends 2026","depth":"deep"}',
    '{"summary":"Y2K revival peaking on Pinterest; brutalist type leading on Twitter; gradient mesh fading on IG."}',
    0.04, 0.038, 'claude-sonnet-4',
    2840, 1120,
    'trend-agent', 'dashboard',
    datetime('now','-12 minutes'), datetime('now','-11 minutes'), 56000
  ),
  (
    'seed-002', 'generate-image', 'done',
    '{"prompt":"y2k chrome poster, neon mauve","model":"flux-pro-1.1"}',
    '{"r2_key":"posters/seed-002.png","width":2400,"height":3600}',
    0.05, 0.05, 'flux-pro-1.1',
    NULL, NULL,
    'poster-agent', 'autopilot',
    datetime('now','-9 minutes'), datetime('now','-8 minutes'), 41200
  ),
  (
    'seed-003', 'write', 'running',
    '{"format":"thread","platform":"twitter","topic":"why brutalist is back"}',
    NULL,
    0.02, NULL, 'claude-sonnet-4',
    NULL, NULL,
    'copywriter', 'dashboard',
    datetime('now','-2 minutes'), NULL, NULL
  ),
  (
    'seed-004', 'build-site', 'queued',
    '{"niche":"minimal poster shop","template":"factory-default"}',
    NULL,
    0.18, NULL, NULL,
    NULL, NULL,
    NULL, 'dashboard',
    NULL, NULL, NULL
  ),
  (
    'seed-005', 'publish', 'failed',
    '{"platform":"instagram","content_id":"c-2026-06-06-04"}',
    NULL,
    0.00, 0.00, NULL,
    NULL, NULL,
    'publisher', 'schedule',
    datetime('now','-26 minutes'), datetime('now','-25 minutes'), 8400
  ),
  (
    'seed-006', 'lead-scrape', 'done',
    '{"platform":"twitter","query":"need help with branding","limit":50}',
    '{"leads_found":17,"high_fit":4}',
    0.03, 0.027, 'gpt-4o-mini',
    1800, 640,
    'lead-hunter', 'autopilot',
    datetime('now','-1 hour'), datetime('now','-59 minutes'), 71000
  );

-- Set realistic error message on the failed publish (separate UPDATE so
-- the CHECK constraint approves the empty-error row first, then we patch).
UPDATE agent_tasks
   SET error = 'instagram graph api 400: token expired'
 WHERE id = 'seed-005';
