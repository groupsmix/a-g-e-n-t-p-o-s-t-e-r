# NEXUS — Final Build Plan (Freelance-First)

**Decided (2026-06-19):**
- **Primary money engine:** Freelance jobs. Briefs in → deliverables out. The **Job
  Agent is the star.** Digital products (Gumroad), POD, and blog are *secondary*
  income streams the Discovery Agent feeds — not the center.
- **Plan shape:** Pragmatic migration map (clean end-state + path from today's repo).
- **Runtime:** Keep the hand-rolled Hono engine, add **Cloudflare Workflows** for
  durability. No framework rewrite.
- **Infra:** Workers **Paid** — Browser Rendering, Durable Objects, Workflows all on.
- **Appetite:** Full rebuild over a quarter (~13 weeks).

---

## 1. What NEXUS becomes (one sentence)

> A single-operator engine where a freelance brief lands, a **Job Agent** researches and
> drafts the deliverable end-to-end, **stops for your approval before anything reaches a
> client**, and a background **Discovery Agent** keeps finding the next gig (and
> side-income product ideas) while you sleep.

The whole product serves one freelance loop:

```
brief lands → Job Agent works it → YOU review/approve → deliver to client → get paid → learn → repeat
                                          ▲
                          (hard stop: nothing reaches a client unattended)
```

---

## 2. What it does — the freelance loop in detail

1. **Intake.** A brief arrives — pasted, forwarded email, or pulled from a freelance
   platform — and becomes a **Job** PipelineItem at stage `Idea`.
2. **Work.** A Job Agent instance takes the brief as its fixed goal and runs
   think → act → observe: researches with the headless browser, drafts the deliverable
   (doc / code / design), iterates. One agent per job; it dies when the job ships.
3. **Stop & review.** When the deliverable is ready it moves to `Review` and raises an
   **ApprovalRequest**. It **never sends to a client on its own.**
4. **Approve.** You approve from Home → the system packages the deliverable (doc/zip)
   and either hands it to you or sends it via the connected channel.
5. **Deliver & record.** Item → `Delivered`. Revenue recorded against the job.
6. **Learn.** The learning loop captures *what made this deliverable get approved* (or
   rejected) and feeds it into the next run.
7. **Meanwhile,** the Discovery Agent runs on a schedule, scanning for new gigs and
   product ideas, dropping `Idea` cards on the board — proposing only, never acting.

---

## 3. The dashboard — what you see

Six nav items. Never more. A new capability is a new `PipelineItem.type`, a new tab, or
a new tool — never a new top-level route.

```
┌─────────────────────────────────────────────────────────────────────┐
│  NEXUS          Home · Pipeline · Growth · Brain · Ops · Settings     │
└─────────────────────────────────────────────────────────────────────┘
```

### HOME — "Am I on top of my jobs?"
```
┌── Revenue (mo) ──┬── Active jobs ──┬── Needs you ──┬── Deadlines (7d) ──┐
│     $X,XXX       │       4         │      2        │        3           │
└──────────────────┴─────────────────┴───────────────┴────────────────────┘

NEEDS YOUR ATTENTION                        DEADLINE RADAR
• "Logo pack" deliverable → Approve/Review  • Brand kit      ⚠ due in 1d
• "Landing copy" blocked, needs brief info  • SEO article      due in 3d
                                            • Code review      due in 5d

BRAIN HIGHLIGHT (one insight)               AGENT ACTIVITY TODAY
"Gigs tagged 'Notion template' approve       12 actions · 3 jobs advanced
 first-try 80% of the time — pursue more."   1 awaiting approval
```
Top row, the approval queue, a deadline radar (red = at risk), exactly one Brain
insight, and today's agent activity. It's a *read model* — it pulls from the other five
pages, it isn't its own data store.

### PIPELINE — one Kanban board, default filter = **Jobs**
```
  IDEA          DRAFT          REVIEW         SCHEDULED      DELIVERED
(new brief)  (agent working) (approve me)   (packaging)    (sent to client)
┌────────┐   ┌────────┐      ┌────────┐     ┌────────┐     ┌────────┐
│Logo pk │   │SEO art │      │Brand kt│     │Notion  │     │Resume  │
│client A│   │client B│      │client C│     │template│     │client E│
│$250 ·3d│   │$120 ·5d│      │$400 ·1d│     │$80     │     │$60 ✓paid│
└────────┘   └────────┘      └────────┘     └────────┘     └────────┘
```
- Filter: **All / Jobs / Products / POD / Blog** — one board, not five pages.
- Every card opens a detail panel = the review/approve surface (no separate route).
- One `PipelineItem` table behind all types, differentiated by a `type` field.
- Job cards carry: client, brief, price, deadline, agent status, deliverable attachment.

### GROWTH — tabs
`Money` (freelance revenue + which gig types pay best, + budget) · `Performance`
(delivery time, first-try approval rate, rejection rate per agent) · `Experiments` ·
`Audience` (lead sources, repeat clients, funnel).

### BRAIN — tabs
`Overview` (what the agents are reasoning about) · `Signals` (gig opportunities + trends
merged) · `Opportunities` (ranked gigs/upsells, each traceable to its signal) ·
`Learning log` (what changed in agent behavior and why — e.g. "stopped over-writing
intros after 3 rejections").

### OPS — tabs (hide behind a toggle for daily use)
`Control` (start/stop/pause agents) · `Queue` (live job runs) · `Logs` (observability +
history, searchable) · `Build` (deploy info, dev-only).

### SETTINGS — sections
`Account` · `Connections` (freelance platforms, Gumroad, storage) · `Automation rules`
(schedules, digest, notifications) · `Developer` (flags, E2E).

---

## 4. Agents

**Job Agent** (the star) — one instance per job, brief as fixed goal. Tools: web_search,
browser_control (headless research), generate_document, code_execution, pipeline_api.
Stops at `Review` + raises ApprovalRequest. **Never sends to a client unattended.** On
reject → back to `Draft` with your notes as new context.

**Discovery Agent** — cron-scheduled, long-running. Read-only browsing, write-only to
`Idea`-stage cards. Finds gigs + product ideas, writes Signals/Opportunities. No approval
gate because nothing leaves the system — it only proposes.

**QA Agent** (later phase) — deterministic Browser Rendering checks against your own
site, plus AI-driven checks where judgment is needed. Writes to Ops → Logs.

---

## 5. Guardrails (build before any agent acts externally)

- **Approval gate, server-side & structural** — see `SPEC-approval-gate.md`. The critical
  freelance action is **`send.client`**; it must halt and bind the approval to a payload
  snapshot (no approve-A-send-B swap).
- **Step limit, budget cap** — enforced server-side (Durable Object counter for budget,
  not KV — you're on Paid, use it).
- **Full Think/Act/Observe logging** → Ops → Logs (this *is* your audit trail).

---

## 6. The build — one quarter, six phases

| Phase | Weeks | Goal | Key deliverables |
|---|---|---|---|
| **0 · Foundation & safety** | 1–2 | Make it safe + fast first | Server-side approval gate (`send.client`); per-run cost logging ON; Tier-1 optimizations (smart placement, compat-date bump, Turbo remote cache, browser-lane split); **execute the legacy-retirement checklist (June 22)** |
| **1 · Freelance core** | 3–5 | One board, jobs first | Unify 5 content tables → one `PipelineItem` + `type`; Pipeline board with freelance lifecycle stages; KV-cached Home read-model oriented to jobs/deadlines/money; brief intake (paste / forward-email → Idea) |
| **2 · Job Agent E2E** | 6–8 | The money-maker | Job Agent on think/act/observe, durable via Cloudflare Workflows; tool registry (search, headless browser, doc-gen, code-exec, pipeline); approval gate wired to `send.client`; deliverable packaging (doc/zip export) |
| **3 · Discovery + side income** | 9–10 | Fill the funnel | Discovery Agent (read-only browse, write-only Idea cards); Brain → Signals → Opportunities; secondary types (products/POD/blog) flowing as side income |
| **4 · Consolidate + learn** | 11–12 | Kill the sprawl | ~70 routes → 6-nav (merge money/metrics ×5 and browser ×4 clusters); Growth/Brain analytics feed back into Job Agent decisions (the real learning loop); QA Agent on Browser Rendering |
| **5 · One stack, polish** | 13 | Finish the migration | Fold Brain Cockpit into D1 / one deploy; long runs fully on Workflows (retire `ctx.waitUntil()` + `SELF`-binding hack); bundle shrink + final hardening |

**Order rule:** don't start a phase before the previous one is stable. Safety (Phase 0)
before any unattended agent. Approval gate before the Job Agent is allowed to send.

---

## 7. Data model (final)

```
PipelineItem
  id, type (job|product|pod|blog|note), stage (idea|draft|review|scheduled|delivered),
  title, brief, content, client_ref (nullable), price (nullable), deadline (nullable),
  deliverable_ref (nullable), created_by (agent_id|"user"), created_at, updated_at

AgentRun
  id, agent_type (job|discovery|qa), status (running|awaiting_approval|done|failed|
  step_limit_reached|budget_exceeded), goal, pipeline_item_id, steps[], step_count,
  step_limit, started_at, finished_at, result_ref

ApprovalRequest
  id, agent_run_id, pipeline_item_id, action_type, action_payload_json, payload_hash,
  summary, estimated_cost, idempotency_key, status (pending|approved|rejected|executed|
  expired), reviewer_notes, created_at, resolved_at, executed_at

Signal / Opportunity
  id, source, summary, score, linked_pipeline_item_id (nullable), created_at

Transaction
  id, type (revenue|spend), amount, source, pipeline_item_id (nullable), created_at

BudgetLedger
  id, day, action_type, amount, agent_run_id, created_at
```

---

## 8. Companion docs (in this folder)

- `SPEC-approval-gate.md` — the structural gate. **Phase 0.**
- `CHECKLIST-legacy-retirement.md` — the June-22 cutover. **Phase 0.**
- `PLAN-pr-triage.md` — clear the 10 open PRs + auto-merge config. **Phase 0, parallel.**
- `PLAN-optimization.md` — the 10 ranked perf/cost wins. **Phase 0 (Tier-1) → ongoing.**

---

## 9. The two rules that keep it from drifting back

1. **A new top-level nav item is never the answer.** New capability = new
   `PipelineItem.type`, new tab, or new tool. If something truly needs a new surface,
   stop and decide deliberately.
2. **Nothing reaches a client (or spends money) without a server-side approval.** Not a
   prompt, not a frontend warning — a row in `ApprovalRequest` that says `approved`,
   bound to the exact payload.
