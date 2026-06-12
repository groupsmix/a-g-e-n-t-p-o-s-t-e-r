# Threat Model

_Last reviewed: 2026-06-10. Update this when adding an entry point or a
new class of secret._

## What we protect (assets)

1. **Platform credentials** — TikTok / Instagram / YouTube / X / LinkedIn /
   Pinterest / Threads tokens. Compromise = attacker posts as the brand.
2. **LLM + service API keys** — Anthropic, OpenAI, ElevenLabs, Replicate,
   Cosmic, Supabase service role, Vercel, Cloudflare. Compromise = spend
   and data exfiltration.
3. **The dashboard** — controls the whole machine (queue, publishing,
   revenue data).
4. **Generated sites and their content** — defacement / SEO poisoning target.
5. **Revenue data** — affiliate and AdSense events in Supabase/D1.

## Entry points and trust boundaries

| Entry point | Exposure | Boundary |
|---|---|---|
| `nexus-api` Worker | Public internet | Auth gate (fail-closed), CF Access, CORS allow-list, KV rate limits |
| `nexus-web` (Pages) | Public internet | Talks to nexus-api; no secrets client-side |
| Cron workflows (daily run, stats pull) | Scheduled, not user-facing | Run with full secrets; inputs are platform APIs + LLM output |
| Trend/content ingestion (Reddit, Google Trends, TikTok) | Third-party data | Tagged untrusted block + instruction firewall in caption and SEO tools | ✅ |
| CMS upload (fetch by URL/path) | Agent-driven | Host/size/MIME/timeout validation (audit #7, fixed) |
| Factory site generator | Agent-driven | Slug sanitization; `execFileSync` with arg arrays; `finally` temp-dir cleanup | ✅ |
| GitHub Actions | Repo collaborators | Secrets scoped to workflows; deploy gated on CI success; secret-scan on every push |

## Top risks and current state

| Risk | Mitigation | State |
|---|---|---|
| Unauthenticated takeover of fresh deploy | Bootstrap fails closed without `MONEY_MACHINE_TOKEN` (503) | ✅ |
| Credential stuffing / brute force | PBKDF2 + KV rate limits + session revocation | ✅ |
| Token leakage via URLs/logs | Tokens moved to headers/bodies; error handler returns `request_id`, never `err.message` | ✅ |
| SSRF via CMS upload | Host/size/MIME/timeout limits; https-only; DNS-checked public hosts | ✅ |
| Prompt injection via trends/comments → agent does attacker's bidding | Tagged untrusted block + instruction firewall in caption and SEO tools | ✅ |
| Runaway LLM/publish spend | `MAX_DAILY_LLM_CALLS` cap with `assertLLMBudget()` gate | ✅ |
| Brand-damaging content published unreviewed | Regex-based brand-safety gate (hate/violence/adult/medical/financial claims) | ✅ |
| Factual claims without sources | `findUnsourcedStats` holds posts for review when stats lack declared sources | ✅ |
| Shell injection in factory | `execFileSync` with arg arrays; `finally` cleanup; slug validation | ✅ |
| Queue double-processing | Atomic claim with run_id/batch_id/claim_token; idempotency keys | ✅ |
| YouTube OOM on large uploads | 256MB cap + chunked resumable upload (10MB chunks) | ✅ |

## Assumptions

- Cloudflare account and GitHub repo access are controlled by the owner;
  collaborators are trusted.
- Supabase service-role key is only used server-side (runner/workflows),
  never shipped to clients.
- The legacy `apps/runner` cron path is being retired in favour of NEXUS;
  legacy publisher risks expire with it (see PR #59's retirement plan).
