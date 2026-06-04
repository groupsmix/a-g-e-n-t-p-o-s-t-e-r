# NEXUS — Live Deployment (Cloudflare, free tier)

NEXUS runs entirely on Cloudflare's free tier with real AI (no paid providers).

## Live services

| Component | URL | Notes |
|---|---|---|
| Dashboard | https://nexus-web-cl2.pages.dev | Cloudflare Pages (`nexus-web` project) |
| API | https://nexus-api.professional-inbox-simo.workers.dev | Worker + D1 + KV + R2 |
| AI | https://nexus-ai.professional-inbox-simo.workers.dev | Worker + Workers AI binding |

## AI providers (all free)

- **Text:** Groq free tier (`llama-3.3-70b-versatile`); falls back to Cloudflare
  Workers AI (`@cf/meta/llama-3.1-8b-instruct`, no key) and finally to offline
  templates. Real AI sets `products.generated_offline = 0`.
- **Images:** Cloudflare Workers AI FLUX (`@cf/black-forest-labs/flux-1-schnell`),
  stored in R2, served at `/api/assets/r2/products/<id>.jpg`.

## Secrets

Set on the `nexus-ai` worker:

```bash
cd apps/nexus-ai
wrangler secret put GROQ_API_KEY   # free: https://console.groq.com/keys
```

Optional, set on the `nexus-api` worker to enable real publishing:

```bash
cd apps/nexus-api
wrangler secret put GUMROAD_ACCESS_TOKEN   # free: https://app.gumroad.com/settings/advanced
```

Without a publishing token the Publish center returns an honest error and the
product stays unpublished (never a fake success).

## Deploy / redeploy

```bash
# Workers (run from each app dir)
cd apps/nexus-ai  && wrangler deploy
cd apps/nexus-api && wrangler deploy

# Remote D1 migrations
cd apps/nexus-api && wrangler d1 migrations apply nexus-db --remote

# Dashboard (Cloudflare Pages)
cd apps/web
NEXT_PUBLIC_API_URL=https://nexus-api.professional-inbox-simo.workers.dev pnpm pages:build
pnpm pages:deploy
```

Dynamic routes already declare `export const runtime = 'edge'`, so
`@cloudflare/next-on-pages` builds without extra configuration.

## Auth

`wrangler` uses the Cloudflare global API key via env vars:

```bash
export CLOUDFLARE_EMAIL=...      # account email
export CLOUDFLARE_API_KEY=...    # global API key
```
