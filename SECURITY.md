# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**). Do not open public issues for
security problems. You should get an initial response within 7 days.

## Supported versions

Only `main` is supported. There are no versioned releases; fixes land on
`main` and deploy from there.

## Security posture (what protects what)

| Surface | Protection |
|---|---|
| `nexus-api` Worker (public) | Auth gate fails closed: no password configured → 503, bootstrap requires `MONEY_MACHINE_TOKEN` bearer when set. Passwords stored as PBKDF2-SHA256 (100k iterations) with per-hash salt and transparent legacy re-hash on login. Sessions are generation-stamped so a password change revokes them all. |
| CORS | Allow-list via `ALLOWED_ORIGINS`; deployed workers with no allow-list fail closed (wildcard only for local dev). |
| Cloudflare Access | `cf-access` middleware mounted globally with explicit public-path exceptions; enforced when `CF_ACCESS_*` secrets are configured. |
| Rate limiting | KV-backed fixed windows (login and route middleware), shared across isolates. |
| Secrets | Never committed. Local dev uses `.env` (gitignored, documented in `.env.example`); Workers use `wrangler secret`; CI uses GitHub Actions secrets. The `secret-scan` workflow runs gitleaks on every push/PR. |
| Platform tokens | Sent in headers/bodies, never in URLs or query strings. |
| CMS uploads | URL/path inputs are validated (host, size, MIME, timeout limits) to prevent SSRF and local file reads. |
| Dependencies | Dependabot (npm + GitHub Actions), grouped minor/patch updates. |

## Known gaps

Tracked openly rather than hidden: prompt-injection hardening for
agent-consumed external content (audit #37), spend caps / cost controls
(audit #44), and moderation gates before publishing (audit #45) are not
implemented yet. See `docs/THREAT_MODEL.md`.

## Hard rules for contributors

- No secrets in code, commits, issues, or workflow files. If a secret
  leaks, rotate it first, then clean history.
- New external inputs (webhooks, uploads, fetch-by-URL) must validate
  host/size/type and time out.
- New routes on `nexus-api` are auth-gated by default; public exceptions
  must be listed explicitly in the `cf-access` mount and justified in the PR.
