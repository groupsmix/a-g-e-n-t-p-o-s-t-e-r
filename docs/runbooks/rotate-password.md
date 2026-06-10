# Runbook — rotate the access-gate password

The whole dashboard + API sits behind one shared password (see
`apps/nexus/apps/nexus-api/src/middleware/access-gate.ts`). There are two
modes; check which one you're in first:

```bash
curl -s https://<your-worker>/api/auth/status
# { "protected": true }  → a password is configured (env or KV)
```

## Mode A — password pinned by the `ACCESS_PASSWORD` secret (recommended)

The secret is authoritative; the runtime change flow is disabled (409).

```bash
cd apps/nexus/apps/nexus-api
wrangler secret put ACCESS_PASSWORD   # paste the new password (≥16 chars)
```

The gate picks up the new value on the next worker boot (the secret put
triggers a redeploy). Existing sessions remain valid until their 24 h TTL —
to kill them immediately, call `POST /api/auth/logout-all` with a valid
bearer token, or bump the `session_generation` KV key by hand.

## Mode B — password stored in KV (dashboard bootstrap flow)

Change it through the API with the current password:

```bash
curl -X POST https://<your-worker>/api/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"current":"<old password>","password":"<new password, ≥16 chars>"}'
```

A successful change **revokes every outstanding session automatically**
(generation bump, audit 1.5) and returns a fresh token.

## Locked out?

Delete the KV key directly: Cloudflare dashboard → Workers → KV →
`CONFIG` namespace → delete `access_hash`. The gate then fails closed
(403 `setup_required`) until you re-bootstrap via `POST /api/auth/setup`
with the `MONEY_MACHINE_TOKEN` bearer.

## Notes

- Hashes are PBKDF2-SHA256 (100k iterations, per-hash salt). Legacy
  SHA-256 hashes from before audit 1.3 upgrade themselves on the next
  successful login — no manual migration.
- Minimum password length is 16 characters.
