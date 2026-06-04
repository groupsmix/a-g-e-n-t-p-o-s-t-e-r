# Phase 4, 5, 6 — Agent Roles + Queue + Scoring

## Files to copy / create

| File | Action |
|---|---|
| `nexus/migrations/020_agent_queue.sql` | New migration — run via `wrangler d1 migrations apply nexus-db --remote` |
| `nexus/apps/nexus-api/src/services/job-queue.ts` | New file |
| `nexus/apps/nexus-api/src/services/agents.ts` | New file |
| `nexus/apps/nexus-api/src/routes/queue.ts` | New file |
| `nexus/apps/web/src/app/queue/page.tsx` | New file |
| `queue-index-addendum.txt` | Apply 3 changes to `index.ts` |
| `Sidebar.queue-addendum.txt` | Add nav link to `Sidebar.tsx` |

---

## Phase 4 — Agent Roles

9 agents, each in `agents.ts`. Every agent:
- Takes structured JSON input (from DB, not from another agent directly)
- Makes **one** AI call via `env.AI_WORKER`
- Parses and validates JSON response
- Saves output to `agent_outputs` table
- Updates the `products` table (status, ai_score, etc.)

| Agent | Job | DB outcome |
|---|---|---|
| **Researcher** | Demand, competitors, price range, buyer profile | Stored in `agent_outputs` |
| **Scorer** | 8-category scoring (Phase 6) | Stored in `product_scores` + `products.ai_score` |
| **Builder** | Full product deliverable (1500+ words markdown) | Stored in `products.deliverable_content` |
| **Inspector** | Pass/fail quality check | Updates `products.status` |
| **Publisher** | Publishes to Gumroad if rules allow | Calls existing `publishProductToGumroad` |
| **Marketer** | Twitter thread, email, Instagram, Pinterest, blog | Stored in `agent_outputs` |
| **Analyst** | Revenue verdict, next action | Updates `products.status` → archived if loser |

---

## Phase 5 — Queue System

### New tables (migration 020)

- `automation_jobs` — every unit of work, with status, retries, idempotency key
- `agent_outputs` — structured JSON output from each agent per product
- `product_scores` — 8-category scores per idea (Phase 6)

### Idempotency

Every `publish_job` should be enqueued with an idempotency key:
```ts
await enqueue(env, JOB_TYPES.PUBLISH, { product_id }, {
  productId:      productId,
  idempotencyKey: `publish:${productId}`,  // can never run twice
})
```

### Retry + Dead-letter

- Default: 3 attempts
- After 3 failures → status = `'dead'` (dead-letter queue)
- Dead jobs visible in UI with red badge
- Re-queue from UI: "Retry all failed" button or per-job ↺ button

### API endpoints

| Endpoint | What |
|---|---|
| `GET /api/queue/stats` | Counts by status |
| `GET /api/queue/jobs` | List jobs (filter: status, step) |
| `GET /api/queue/jobs/:id` | Job detail + agent output |
| `POST /api/queue/jobs` | Manually enqueue |
| `POST /api/queue/jobs/:id/requeue` | Retry one job |
| `DELETE /api/queue/jobs/:id` | Cancel pending job |
| `POST /api/queue/run-next` | Execute next pending job immediately |
| `POST /api/queue/requeue-all-failed` | Bulk retry all failed/dead |

### Cron drain

Every daily cron tick runs up to 5 queued jobs (see `queue-index-addendum.txt`).
Increase the `5` limit if you want faster throughput.

---

## Phase 6 — 8-Category Product Scoring

The `score_idea_job` runs the **Scorer agent**, which:
1. Calls the AI with all 8 scoring dimensions
2. Gets back scores + per-dimension reasoning
3. Saves to `product_scores` table
4. Updates `products.ai_score`

### Scoring dimensions (all 0–100)

| Dimension | Weight | What it measures |
|---|---|---|
| `buying_intent` | 20% | Are people likely to pay right now? |
| `pain_level` | 15% | Does it solve a real, specific problem? |
| `competition` | 15% | How open is the market? (100 = wide open) |
| `creation_difficulty` | 10% | Can AI build it well? (100 = easy) |
| `product_clarity` | 10% | Is it easy to explain in one sentence? |
| `platform_fit` | 10% | Does it fit Gumroad/Shopify/Etsy? |
| `risk_level` | 10% | Policy/legal safety (100 = very safe) |
| `uniqueness` | 10% | Different from existing products? |

### Thresholds

| Total score | Recommendation |
|---|---|
| ≥ 70 | `build` — proceed immediately |
| 50–69 | `refine` — narrow or improve the angle |
| < 50 | `skip` — not worth building |

### Querying scores

```sql
-- Top scoreable ideas ready to build
SELECT niche, total_score, recommendation
FROM product_scores
WHERE recommendation = 'build'
ORDER BY total_score DESC
LIMIT 10;
```

---

## How to enqueue the full pipeline for a new niche

```ts
import { enqueue, JOB_TYPES } from './services/job-queue'

// Step 1: research the market
const researchJobId = await enqueue(env, JOB_TYPES.RESEARCH, { niche: 'Notion budget template' })

// Step 2: score it (after research completes)
await enqueue(env, JOB_TYPES.SCORE_IDEA, { niche: 'Notion budget template', opportunity_id: 'opp_xxx' })

// Step 3–8: enqueue automatically when previous step completes
// (wire this in runJob's updateProductFromAgent hook)
```

The cron drain in `index.ts` picks these up and runs them sequentially.
