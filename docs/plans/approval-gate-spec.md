# NEXUS — Server-Side Approval Gate (SPEC-001)

**Status:** Required before Autopilot or Job Agent is allowed to touch any external adapter.
**Owner:** single operator. **Stack:** Cloudflare Workers (Hono) + D1 + KV + Durable Objects.

**Paste this whole file to your coding agent as the build brief.**

---

## 0. Why this exists (the bug)

The current implementation enforces risk with **frontend regex patterns** (dismissable
warnings) and a **backend system prompt** that "enforces warnings for risky requests."
Both are *soft*. A model can be talked past a prompt, and a frontend check is
cosmetic. Meanwhile **Autopilot** already runs overnight and the repo ships **Gumroad /
Shopify publish adapters**. That means today an agent run can, in principle, reach a
real external side effect without a hard stop. This spec replaces the soft gate with a
**structural** one.

---

## 1. The invariant (load-bearing — everything else serves this)

> **No external or irreversible action executes unless a matching `ApprovalRequest` row
> is in state `approved`, and the action executed is byte-for-byte the action that was
> approved.**

"External or irreversible" = publishes to a real platform, sends to a real client,
spends money, or deletes durable data. Internal actions (draft, research, log, propose,
create an `Idea`-stage item) are never gated.

Two failure modes the soft gate does **not** stop, and this spec must:
1. **Bypass** — agent calls an adapter directly without an approval.
2. **Approval-swap (TOCTOU)** — operator approves "post draft A", agent then publishes
   "draft B". The approval must bind to a *snapshot*, not a moving target.

---

## 2. Architecture: one egress chokepoint

Agents must be **structurally unable** to call a platform adapter. They never import
`gumroad`, `shopify`, `email`, etc. The only way out of the system is one function:

```
agent → executeExternalAction(actionRequest) → [GATE] → adapter
                                                  │
                                   no approval ──┘ → create ApprovalRequest(pending)
                                                     + halt run (awaiting_approval)
```

Enforce this with module boundaries, not discipline:
- Adapters live in `@posteragent/adapters` and **only** `@posteragent/egress` may import
  them. Add an ESLint `no-restricted-imports` rule + a CI check that fails the build if
  any `agent-*` package imports an adapter directly.
- `executeExternalAction` is the *only* exported symbol from `@posteragent/egress`.

---

## 3. Action classification (the gate's lookup table)

| Action | Class | Gated? |
|---|---|---|
| `publish.gumroad`, `publish.shopify`, `publish.blog`, `publish.social` | external | **yes** |
| `send.client`, `send.email` | external | **yes** |
| `spend.*` (ad spend, paid API beyond budget tier, top-ups) | money | **yes + budget check** |
| `delete.durable` (remove published item, drop R2 object) | irreversible | **yes** |
| `draft.*`, `research.*`, `browser.read`, `log.*`, `propose.idea` | internal | no |
| `pipeline.write` limited to `Idea` stage (Discovery Agent) | internal | no |

The class is decided **server-side from the action type**, never from a flag the agent
sets. An agent cannot self-classify an action as internal.

---

## 4. Data model

Extends the `ApprovalRequest` already in the architecture doc with the fields that make
the invariant enforceable:

```
ApprovalRequest
  id
  agent_run_id
  pipeline_item_id (nullable)
  action_type            -- e.g. "publish.gumroad"
  action_payload_json    -- the EXACT payload to be executed (the snapshot)
  payload_hash           -- sha256(action_payload_json), the binding key
  summary                -- human-readable, for the Home "Needs your attention" row
  estimated_cost         -- nullable; required for spend.* and used by budget pre-check
  status                 -- pending | approved | rejected | executed | expired
  idempotency_key        -- uuid; guarantees execute-exactly-once
  reviewer_notes (nullable)
  created_at, resolved_at, executed_at (nullable)

AgentRun (extend existing)
  step_count             -- incremented server-side per Think/Act/Observe
  step_limit             -- per run, enforced server-side
  status                 -- running | awaiting_approval | done | failed | step_limit_reached | budget_exceeded

BudgetLedger            -- one row per spend event (source of truth for the cap)
  id, day (UTC date), action_type, amount, agent_run_id, created_at
```

---

## 5. Enforcement flow

```
1. Agent decides next action → calls executeExternalAction(run_id, action)
2. GATE classifies action.type
     ├─ internal → execute immediately, log, return result
     └─ external/money/irreversible → continue
3. Snapshot: payload_hash = sha256(canonical(action.payload))
4. Look up an ApprovalRequest for (run_id, action_type, payload_hash)
     ├─ none → create ApprovalRequest(pending, snapshot, idempotency_key)
     │         set run.status = awaiting_approval
     │         RETURN control to caller as "halted" (do NOT execute)
     ├─ pending → return "halted" (still waiting)
     ├─ rejected → throw RejectedError; run handler moves item to Draft + attaches notes
     ├─ approved → go to step 5
     └─ executed → return cached result (idempotent replay)
5. For money actions: BUDGET PRE-CHECK (section 6) BEFORE dispatch.
6. Dispatch to adapter with idempotency_key.
7. On success: status=executed, executed_at=now, persist result_ref, write BudgetLedger
   row if money. Log Observe step.
```

**The approval UI never re-invokes the agent.** Approval flips the row to `approved`;
a *separate* executor (a Workflow step or queue consumer) performs the dispatch against
the **snapshotted payload**. This is what closes the approval-swap hole — the agent
cannot mutate the payload between approval and execution because execution reads the
frozen `action_payload_json`, not live agent state.

---

## 6. Budget cap — use D1/DO, NOT KV

KV is **eventually consistent**; two concurrent runs can both read "under budget" and
both spend, racing past the cap. Enforce the daily ceiling with one of:

- **D1 transaction**: `SELECT SUM(amount) FROM BudgetLedger WHERE day=? ` then conditional
  insert in the same transaction; reject if `sum + estimated_cost > cap`.
- **Durable Object** as a single-threaded counter per `day` key (preferred — serializes
  all spend decisions, no race by construction). This is exactly what the Agents SDK /
  Durable Objects are good at.

```ts
// pre-check, server-side, atomic
const ok = await budgetDO.tryReserve({ day, amount: action.estimated_cost });
if (!ok) { run.status = "budget_exceeded"; throw new BudgetExceededError(); }
```

Cap value lives in Settings → Automation rules and is read server-side, never trusted
from the client.

---

## 7. Step limit

`run.step_count` increments **server-side** on every Think/Act/Observe. When
`step_count >= step_limit`, the runtime stops the loop and sets
`status = step_limit_reached`. The limit is not a prompt instruction — the loop driver
enforces it so a misbehaving model literally cannot iterate forever.

---

## 8. Audit

Every gate decision (classified-internal, halted-for-approval, approved-executed,
rejected, budget-blocked, step-limit) writes a structured log line keyed by
`agent_run_id`. This *is* Ops → Logs; do not build a separate "History" feature.

---

## 9. Gateway skeleton (TypeScript, illustrative)

```ts
// @posteragent/egress — the ONLY module that imports adapters
import { adapters } from "@posteragent/adapters";

const GATED = new Set([
  "publish.gumroad","publish.shopify","publish.blog","publish.social",
  "send.client","send.email","delete.durable",
]);
const isMoney = (t: string) => t.startsWith("spend.");

export async function executeExternalAction(runId: string, action: Action, env: Env) {
  const gated = GATED.has(action.type) || isMoney(action.type);
  if (!gated) return runInternal(action, env);          // draft/research/log/propose

  const hash = await sha256(canonicalJSON(action.payload));
  let ar = await db.findApproval(env, { runId, type: action.type, hash });

  if (!ar) {
    ar = await db.createApproval(env, {
      runId, type: action.type, payloadJson: canonicalJSON(action.payload),
      hash, summary: summarize(action), idempotencyKey: crypto.randomUUID(),
      estimatedCost: action.estimatedCost ?? null, status: "pending",
    });
    await db.setRunStatus(env, runId, "awaiting_approval");
    return { halted: true, approvalId: ar.id };          // agent stops here
  }
  if (ar.status === "pending")  return { halted: true, approvalId: ar.id };
  if (ar.status === "rejected") throw new RejectedError(ar.reviewerNotes);
  if (ar.status === "executed") return cachedResult(ar);  // idempotent replay

  // status === "approved"
  if (isMoney(action.type)) {
    const ok = await budgetDO(env).tryReserve({ day: utcDay(), amount: ar.estimatedCost });
    if (!ok) { await db.setRunStatus(env, runId, "budget_exceeded"); throw new BudgetExceededError(); }
  }
  // execute the SNAPSHOT, not live agent state
  const result = await adapters[action.type](JSON.parse(ar.payloadJson), {
    idempotencyKey: ar.idempotencyKey,
  });
  await db.markExecuted(env, ar.id, result);
  return result;
}
```

---

## 10. Acceptance criteria (the gate isn't done until all pass)

- [ ] CI fails if any `agent-*` package imports an adapter directly (import-boundary test).
- [ ] Unit: an external action with **no** approval row returns `{halted:true}` and
      **never** calls the adapter (assert adapter spy not called).
- [ ] Unit: approval bound to payload A; agent attempts payload B → new pending request,
      B is **not** executed under A's approval (approval-swap blocked).
- [ ] Unit: approved action dispatched twice → adapter called **once** (idempotency).
- [ ] Concurrency: two runs racing the budget cap → total spend never exceeds cap.
- [ ] Loop: a run that never converges stops at `step_limit_reached`, not infinite.
- [ ] E2E: Autopilot overnight run produces a `pending` approval and ships **nothing**
      externally until the operator approves from Home → "Needs your attention".
- [ ] Every path above appears in Ops → Logs, queryable by `agent_run_id`.

---

## 11. Build order

1. Egress module + import-boundary CI rule (cheap, do first — it makes bypass impossible
   while you build the rest).
2. `ApprovalRequest` snapshot fields + create/find/approve/reject/markExecuted.
3. Wire Autopilot + Job Agent publish/spend calls through `executeExternalAction`.
4. Budget DO + step-limit counter.
5. Home "Needs your attention" approve/reject actions bound to `approvalId`.
6. The full acceptance test suite. Do not enable unattended Autopilot until green.
