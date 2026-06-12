# Deployment Security

_Procedures for deploying PosterAgent services safely._

## Pre-deploy checklist

1. **Secrets audit** — Run `scripts/check-secrets.mjs` to verify no secrets
   are committed. Rotate any leaked secret immediately.
2. **Environment parity** — Confirm `.env.example` matches all required
   environment variables. CI enforces this via the `env-check` job.
3. **Migration validation** — Migration filenames must follow the
   `NNN_description.sql` pattern with unique, monotonically increasing
   numbers. CI `migration-discipline` job enforces this automatically.
4. **Dependency review** — Check Dependabot alerts before merging. Do not
   deploy with known high-severity vulnerabilities.

## Cloudflare Workers (`nexus-api`)

| Concern | Control |
|---|---|
| Auth gate | Fails closed: no password → 503. Passwords hashed PBKDF2-SHA256 (100k iterations). |
| CORS | Allow-list via `ALLOWED_ORIGINS`. Production without allow-list → no cross-origin. |
| CF Access | Middleware mounted globally; enforced when `CF_ACCESS_*` secrets present. |
| Rate limits | KV-backed fixed windows, shared across isolates. |
| Secrets | Set via `wrangler secret put`, never in `wrangler.toml` or code. |
| Tokens | Sent in `Authorization` headers only, never in URLs or query strings. |

### Deploy steps

```bash
# 1. Verify CI green on main
# 2. Deploy worker
wrangler deploy --env production
# 3. Run smoke tests against production health endpoint
curl -sf https://api.example.com/health | jq .
# 4. Monitor error rate for 15 minutes
```

## Supabase (legacy queue + data)

| Concern | Control |
|---|---|
| Service role key | Server-side only (runner/workflows), never shipped to clients. |
| Queue claims | Atomic claim pattern with run_id/batch_id/claim_token prevents double-processing. |
| Idempotency | `idempotency_key` column + unique index on queue tables. |
| Dead-letter | Failed items routed to `content_queue_failures`, `publisher_failures`, `workflow_failures` tables. |

### Migration deploy

```bash
# 1. Review migration SQL in apps/nexus/migrations/
# 2. Apply to staging Supabase project first
# 3. Validate with read-only queries
# 4. Apply to production
# 5. Verify row counts and index creation
```

## GitHub Actions

| Concern | Control |
|---|---|
| Secret scope | Secrets scoped to specific workflows; no org-wide secrets. |
| Deploy gate | Deploy only runs after CI passes on `main`. |
| Secret scanning | `secret-scan` workflow runs gitleaks on every push/PR. |
| Permissions | Workflows use `permissions: read-all` unless write is explicitly needed. |

## Network boundaries

- **Workers** are the only internet-facing surface.
- **Supabase** is accessed via service role key from server-side only.
- **Platform APIs** (TikTok, Instagram, YouTube, X, LinkedIn, Threads) are
  called from Workers with tokens in headers.
- **No SSH/database ports** are exposed publicly.

## Post-deploy verification

1. Health check returns 200 with expected shape.
2. Auth gate rejects unauthenticated requests (expect 401/503).
3. CORS preflight from an unlisted origin is rejected.
4. Rate limit triggers after expected threshold.
5. Check Cloudflare logs for anomalous error rates.
