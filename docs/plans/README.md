# NEXUS plans & specs

Owner-level plan for the freelance-first NEXUS build. Generated during the
2026-06-19 architecture review.

| Doc | Purpose |
|---|---|
| [NEXUS-final-plan.md](./NEXUS-final-plan.md) | The master plan: freelance-first end-state, dashboard, and the quarter roadmap (6 phases). |
| [approval-gate-spec.md](./approval-gate-spec.md) | Server-side, structural approval gate. Critical guarded action = `send.client`. **Phase 0.** |
| [legacy-retirement-checklist.md](./legacy-retirement-checklist.md) | The `@repo` cron cutover. Retire on a green checklist, not the calendar date. **Phase 0.** |
| [pr-triage.md](./pr-triage.md) | The open-PR triage + Dependabot auto-merge policy. |
| [optimization.md](./optimization.md) | 10 ranked cost/perf/architecture optimizations. |

**Two rules that keep it from drifting:**
1. A new top-level nav item is never the answer (new `PipelineItem.type` / tab / tool instead).
2. Nothing reaches a client or spends money without a server-side `ApprovalRequest` = `approved`, bound to the exact payload.
