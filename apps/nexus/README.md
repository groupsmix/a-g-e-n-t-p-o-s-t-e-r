# NEXUS — AI Product Engine

Solo-owner dashboard for building, scoring, and publishing digital products with AI.

## Stack

| Layer | Service |
|-------|---------|
| Frontend | Next.js 14 + Tailwind + shadcn/ui → Cloudflare Pages |
| API | Hono.js → Cloudflare Worker (`nexus-api`) |
| AI Router | Cloudflare Worker (`nexus-ai`) — multi-provider failover |
| Database | Cloudflare D1 (SQLite) |
| Cache / Auth | Cloudflare KV (`nexus-config`) |
| File Storage | Cloudflare R2 (`nexus-assets`) |
| Live Browser | Hyperbeam (free tier, 1 concurrent session) |

## Live URLs

| What | URL |
|------|-----|
| Dashboard | https://nexus-web-cl2.pages.dev |
| API | https://nexus-api.professional-inbox-simo.workers.dev |
| Health | https://nexus-api.professional-inbox-simo.workers.dev/health |

Dashboard password: set via the `/api/auth/setup` endpoint on first visit.

## Secrets

Every feature is gated behind its credential. Missing credential = feature disabled (never faked).

| Secret | Where | Unlocks |
|--------|-------|---------|
| `DEEPSEEK_API_KEY` | Worker secret | Primary AI model |
| `GROQ_API_KEY` | Worker secret | Fast AI failover |
| `GUMROAD_ACCESS_TOKEN` | Worker secret or KV `secret:*` | Publish to Gumroad |
| `SHOPIFY_STORE` + `SHOPIFY_ADMIN_TOKEN` | Worker secret | Publish to Shopify |
| `HYPERBEAM_API_KEY` | Worker secret + GitHub secret | Live browser panel |
| `CF_ACCOUNT_ID` + `CF_API_TOKEN` | Worker secret | Cloudflare Images |
| `PUBLISH_WEBHOOK_URL` | Worker secret | Generic publish (Zapier/Make) |

Set via: `wrangler secret put <KEY> --name nexus-api`

## Migrations

Canonical location: `nexus/migrations/`. The API's `wrangler.toml` points here via `migrations_dir = "../../migrations"`.

**Apply locally:**
```bash
pnpm db:migrate          # runs wrangler d1 migrations apply nexus-db --local
```

**Apply to production:**
```bash
cd apps/nexus-api && wrangler d1 migrations apply nexus-db --remote
```

**Rollback:** D1 has no built-in rollback. Write a reverse migration as a new numbered file. Never rename or delete an already-applied migration — D1 tracks them by filename in `d1_migrations`.

**Naming:** Files are `NNN_description.sql`, strictly sequential. No duplicate numbers.

## Deploy

Auto-deploy is configured via `.github/workflows/deploy.yml`. Every push to `main`:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (web app)
3. `pnpm test` (vitest)
4. `pnpm typecheck`
5. `pnpm --filter web pages:build` (next-on-pages)
6. `wrangler deploy` × 2 (nexus-ai, nexus-api)
7. `wrangler pages deploy` (frontend)
8. `wrangler d1 migrations apply nexus-db --remote`

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HYPERBEAM_API_KEY`.

**Manual deploy:**
```bash
cd apps/nexus-ai  && wrangler deploy
cd apps/nexus-api && wrangler deploy
cd apps/web       && pnpm pages:build && wrangler pages deploy .vercel/output/static --project-name nexus-web
```

## Development

```bash
pnpm install
pnpm dev              # starts all 3 apps via turbo
# or individually:
pnpm --filter nexus-api dev    # http://localhost:8787
pnpm --filter nexus-ai dev     # http://localhost:8788
pnpm --filter web dev          # http://localhost:3000
```

## Testing

```bash
pnpm test             # runs vitest across all packages
pnpm typecheck        # TypeScript strict check (5 packages)
pnpm lint             # ESLint (web app)
```

Tests live next to source: `src/**/*.test.ts`. Vitest config excludes `dist/` and `.wrangler/`.

## Project Layout

```
nexus/
├── apps/
│   ├── nexus-api/       # Main API worker (Hono, D1, KV, R2)
│   ├── nexus-ai/        # AI failover router (25+ models)
│   └── web/             # Next.js frontend (Pages)
├── packages/
│   ├── types/           # Shared TypeScript types
│   └── prompts/         # Prompt templates
├── migrations/          # D1 migrations (canonical)
└── setup/               # One-click Cloudflare setup scripts
```

## Domains

6 business verticals, each with categories:

1. **Digital Products** — `/digital`
2. **Print on Demand** — `/print-on-demand`
3. **Content & Media** — `/content`
4. **Freelance Services** — `/freelance-services`
5. **Affiliate Marketing** — `/affiliate-marketing`
6. **E-Commerce & Retail** — `/ecommerce-retail` (includes Dropshipping)

## Architecture Notes

- **Auth model:** Single owner password, hashed with SHA-256 + salt, stored in KV. Session tokens (24h TTL) in KV. Rate-limited login (5 attempts/60s per IP).
- **AI failover:** `nexus-ai` tries providers in priority order (DeepSeek → Groq → Workers AI). Each call has a hard deadline with retry logic.
- **Publishing:** Each platform adapter is gated behind its credential. Missing credential = `{ status: "failed", error: "... not configured" }`. Never fakes success.
- **Safety:** CEO chat has dual-layer risk detection — frontend regex patterns show dismissable warnings, backend system prompt enforces warnings for risky requests.
- **Autopilot:** Cron-driven product builder that runs overnight. Quality gates block bad products.
- **Learning loop:** Syncs Gumroad sales, extracts winning patterns, feeds them back into product generation.
