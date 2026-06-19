# Approval-gate scaffold (DRAFT - not wired in)

This folder is a **proposal**, intentionally placed outside any package/tsconfig
so it does not affect the build or CI. It sketches the structural egress gate
described in `docs/plans/approval-gate-spec.md`.

## The invariant
> No external/irreversible action executes unless a matching `ApprovalRequest`
> is `approved`, and the executed payload is byte-for-byte the approved one.

For the **freelance-first** system the critical guarded action is **`send.client`**
(plus `publish.*`, `spend.*`, `delete.durable`).

## Why a single chokepoint
Agents must be *structurally unable* to import platform adapters. The only way
out of the system is `executeExternalAction()`. Enforce with an ESLint
`no-restricted-imports` rule + a CI check that fails if any `agent-*` package
imports an adapter directly.

## Next steps to land this for real
1. Move `egress.ts` into a real `@posteragent/egress` package; make it the only
   module allowed to import `@posteragent/adapters`.
2. Add the `ApprovalRequest` snapshot columns (payload_hash, idempotency_key) via
   a D1 migration.
3. Route Autopilot + Job Agent `send.client` / `publish.*` calls through it.
4. Budget cap on a Durable Object counter (not KV - KV is eventually consistent).
5. Wire the acceptance tests from the spec. Do not enable unattended agents until green.
