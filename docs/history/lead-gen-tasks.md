# Lead Generation Tasks - Verified End To End

> Verified against the current repo on 2026-06-12.
> Scope: lead discovery, CRM, and outreach in the stack that actually exists here.
> Canonical operator dashboard: `apps/nexus/apps/web`.
> `apps/dashboard` is the Brain Cockpit, not the money/ops dashboard.
> This project is personal and single-user, not a shared multi-user app.
> This file replaces the old Supabase/Mastra-heavy draft with a repo-aligned plan.

---

## Ground Truth

- `apps/nexus/apps/web` is the real operator UI for leads.
- `apps/nexus/apps/nexus-api` is the Worker API that owns lead and email endpoints.
- `apps/nexus/migrations` is the real schema location; the repo does not use `supabase/migrations/001_leads.sql`.
- Lead storage already exists in D1 via `027_leads.sql` and `034_leads_status.sql`.
- Email campaign storage already exists in D1 via `028_email_campaigns.sql`.
- `apps/dashboard/app/leads/page.tsx` is only a placeholder stub and should not be treated as the main implementation target.
- Root `.env.example` still contains legacy Supabase keys for the old `@repo/*` stack, but the current leads module in NEXUS is D1-backed.
- New lead and outreach features should assume a single private operator, not shared-user workflows, tenancy, or multi-user permissions.

---

## What Is Already Shipped

### Discovery and scoring

Verified current state:
- `apps/nexus/apps/nexus-api/src/services/lead-scanner.ts` already scans public Reddit JSON and HN Algolia.
- The scanner already scores buyer intent heuristically, deduplicates by SHA-1 fingerprint, and upserts into `leads`.
- The current sources are intentionally limited to `reddit` and `hn`.
- Quora, Google Maps, Yelp, LinkedIn, and X are not implemented in the current stack.

### Lead storage

Verified current state:
- `apps/nexus/migrations/027_leads.sql` creates the base `leads` table.
- `apps/nexus/migrations/034_leads_status.sql` adds operator workflow fields like `status`, `engaged_at`, `dismissed_at`, and `operator_note`.
- The current model is "intent-mining CRM-lite", not "company directory with name/email/phone/company/website" yet.

### Operator UI

Verified current state:
- `apps/nexus/apps/web/src/app/leads/page.tsx` is a real leads page.
- It already supports list, KPI strip, filters, manual scan, engage, dismiss, and delete actions.
- It talks to `apps/nexus/apps/web/src/lib/api.ts`, which already exposes `getLeads`, `getLeadStats`, `scanLeads`, `engageLead`, `dismissLead`, and `deleteLead`.

### Email list and campaigns

Verified current state:
- `apps/nexus/apps/nexus-api/src/routes/email.ts` already supports subscribers and campaign CRUD.
- `apps/nexus/apps/web/src/app/email/page.tsx` already provides a real Email Lists UI.
- `apps/nexus/migrations/028_email_campaigns.sql` already creates `email_sends` and `email_events`.

Important limitation:
- The current send path logs a send event and marks the campaign as sent, but it does not integrate with a real provider like Resend yet.
- The current email routes target subscriber campaigns, not one-to-one lead outreach.

### Orchestrator integration

Verified current state:
- `packages/orchestrator/src/handlers/lead-scrape.ts` is still a stub.
- `packages/orchestrator/src/handlers/email-campaign.ts` is still a stub.
- The real shipped implementation currently lives in NEXUS web + Worker, not in those orchestrator handlers.

---

## Why The Old Draft Was Wrong

The previous version of this file was not executable in this repo as written.

Main mismatches:
- It targeted `apps/dashboard` instead of `apps/nexus/apps/web`.
- It assumed Supabase for lead storage, but the real stack uses Cloudflare D1.
- It proposed `supabase/migrations/001_leads.sql`, which does not fit the repo layout.
- It assumed a new Mastra-first leads pipeline, while the current feature already exists inside `apps/nexus/apps/nexus-api`.
- It proposed new packages like `packages/tools/firecrawl.ts` and `packages/workflows/lead-nurture.ts` without checking whether the existing NEXUS implementation should be extended first.
- It treated export, enrichment, outreach, and source expansion as greenfield work, but some adjacent email and lead plumbing is already present.

Rule going forward:
- Extend the existing NEXUS lead stack first.
- Do not build a second lead system beside it unless there is an explicit architecture decision to do so.

---

## Recommended Execution Order

```text
LG-00 -> LG-01 -> LG-02 -> LG-03 -> LG-04 -> LG-05 -> LG-06
```

Meaning:
- `LG-00`: lock the architecture to the existing NEXUS stack
- `LG-01`: harden the current lead data model and API
- `LG-02`: connect real outreach sending
- `LG-03`: bridge leads to outreach workflows
- `LG-04`: add new lead sources
- `LG-05`: add export and operator reporting
- `LG-06`: wire automation and task/orchestrator surfaces

---

## Phase 0 - Architecture Lock

### LG-00 - Keep one canonical leads stack

Goal:
- Make this file and future work target the real operator stack instead of the placeholder or legacy stacks.

What to keep true:
- Build new lead features in `apps/nexus/apps/web` and `apps/nexus/apps/nexus-api`.
- Keep schema changes in `apps/nexus/migrations`.
- Treat `apps/dashboard/app/leads/page.tsx` as informational only unless the ADR changes.
- Do not add Supabase-only lead storage for a feature that already exists in D1.

Definition of done:
- No task in this file points new core lead work at `apps/dashboard`.
- No task in this file assumes Supabase is the primary store for NEXUS leads.

---

## Phase 1 - Harden The Existing Lead Module

### LG-01 - Normalize the lead data model for real outreach

Current gap:
- The existing `leads` table is good for intent-mining posts, but not yet for direct outreach operations.

What to build:
- Extend the D1 lead schema with outreach-oriented fields only where they genuinely fit the current model.

Suggested additions:
- `contact_email`
- `contact_name`
- `company_name`
- `company_domain`
- `source_type`
- `last_contacted_at`
- `contact_status`
- `enrichment_json`

Recommended files:
- create next migration in `apps/nexus/migrations/`
- update Worker route typing in `apps/nexus/apps/nexus-api/src/routes/leads.ts`
- update API client contract in `apps/nexus/apps/web/src/lib/api.ts`

Implementation notes:
- Keep backward compatibility with the current Reddit/HN post-style leads.
- Do not replace `fingerprint` or the existing score fields.
- Prefer nullable enrichment fields over a destructive table redesign.

Definition of done:
- Existing leads UI still works.
- New schema can hold both "post lead" and "contactable lead" records.

### LG-02 - Add note editing and richer operator actions

Current gap:
- The leads page supports engage, dismiss, and delete, but not deeper CRM actions.

What to build:
- Add update routes and UI for operator notes and contact workflow status.

Recommended files:
- `apps/nexus/apps/nexus-api/src/routes/leads.ts`
- `apps/nexus/apps/web/src/app/leads/page.tsx`

Suggested actions:
- update note
- mark contacted
- mark qualified
- mark disqualified
- restore dismissed lead

Definition of done:
- Operators can manage a lead through a basic pipeline without editing the DB manually.

---

## Phase 2 - Real Outreach Delivery

### LG-03 - Replace the fake send path with a real email provider

Current gap:
- `apps/nexus/apps/nexus-api/src/routes/email.ts` logs sends and updates status, but does not actually deliver email.

What to build:
- A real provider-backed send path using Resend first.

Recommended files:
- `apps/nexus/apps/nexus-api/src/routes/email.ts`
- optionally extract provider logic into `apps/nexus/apps/nexus-api/src/services/email-provider.ts`
- update root `.env.example`

Implementation notes:
- Add `RESEND_API_KEY=` to root `.env.example`.
- Use Worker secrets for deployment, not just local env files.
- Write canonical send records into `email_sends`.
- Append provider events into `email_events` as webhooks become available.
- Keep the current "draft -> sent" workflow, but make it reflect real delivery.

Definition of done:
- Sending a campaign produces a real provider request and a real row in `email_sends`.

### LG-04 - Split subscriber campaigns from direct lead outreach

Current gap:
- The repo has newsletter/list campaigns, but not a clean one-to-one lead outreach path.

What to build:
- A separate lead outreach flow instead of overloading the subscriber campaign model.

Recommended approach:
- Keep `email_campaigns` for subscriber broadcasts.
- Add lead-specific send records or a `lead_outreach` table if needed.
- Connect outreach records back to `leads.fingerprint`.

Recommended files:
- next migration in `apps/nexus/migrations/`
- `apps/nexus/apps/nexus-api/src/routes/leads.ts`
- `apps/nexus/apps/web/src/app/leads/page.tsx`

Definition of done:
- Operators can send outreach to an individual lead without pretending that the lead is a newsletter subscriber.

---

## Phase 3 - Source Expansion

### LG-05 - Add Firecrawl only if it extends the current NEXUS scanner

Current gap:
- The old draft treated Firecrawl as the foundation.
- In this repo, Firecrawl is optional source expansion, not the starting point.

What to build:
- Add Firecrawl as a new scanning backend only after the existing D1 + Worker flow is preserved.

Recommended files:
- `apps/nexus/apps/nexus-api/src/services/lead-scanner.ts`
- or a new sibling service such as `apps/nexus/apps/nexus-api/src/services/lead-sources/firecrawl.ts`
- root `.env.example`

Implementation notes:
- Add `FIRECRAWL_API_KEY=` only when the integration lands.
- Preserve the current `runLeadScan()` entrypoint.
- Return the same normalized lead shape regardless of source.
- Start with one high-value source first, not Quora + Maps + Yelp all at once.

Practical order:
1. Quora or forums via Firecrawl
2. Google Maps or Yelp business discovery
3. browser-assisted sources only if public APIs and Firecrawl are not enough

Definition of done:
- New sources enter the existing `leads` table through the same scoring and dedupe pipeline.

### LG-06 - Add enrichment as a NEXUS service, not a random package

Current gap:
- The old draft proposed `packages/tools/email-sleuth.ts`, but the current lead engine lives in the Worker.

What to build:
- Domain and contact enrichment in NEXUS-compatible code.

Recommended files:
- `apps/nexus/apps/nexus-api/src/services/lead-enrichment.ts`
- `apps/nexus/apps/nexus-api/src/routes/leads.ts`
- next migration in `apps/nexus/migrations/`

Possible enrichment steps:
- extract company domain from detected URLs
- infer contact name where available
- generate candidate emails
- store confidence and evidence

Important note:
- Raw SMTP probing may be unreliable and can create operational risk.
- Prefer a conservative enrichment design with explicit confidence scoring and clear operator review.

Definition of done:
- Leads can be enriched without forcing a separate package architecture.

---

## Phase 4 - Operator UX And Export

### LG-07 - Add CSV export to the real leads page

Current gap:
- The old draft targeted `apps/dashboard`; the real leads page is already in NEXUS web.

What to build:
- Export the filtered leads view from `apps/nexus/apps/web/src/app/leads/page.tsx`.

Recommended files:
- `apps/nexus/apps/web/src/app/leads/page.tsx`
- optionally `apps/nexus/apps/web/src/components/leads/LeadExport.tsx`

Implementation notes:
- Start with CSV first.
- Use the active filter state already on the page.
- XLSX can come later if operators actually need it.

Definition of done:
- Operators can export the current filtered leads set without leaving the page.

### LG-08 - Add reporting for lead-to-outreach outcomes

Current gap:
- The current UI shows lead counts, but not outreach conversion visibility.

What to build:
- KPI and history views that connect leads, sends, and outcomes.

Suggested metrics:
- contacted
- replied
- qualified
- dismissed
- top converting source
- top converting intent bucket

Recommended files:
- `apps/nexus/apps/web/src/app/leads/page.tsx`
- possibly `apps/nexus/apps/nexus-api/src/routes/leads.ts`

Definition of done:
- Operators can see whether new scanning volume is producing useful outreach outcomes.

---

## Phase 5 - Automation And Task Wiring

### LG-09 - Connect the NEXUS lead system to real automation surfaces

Current gap:
- The UI exists, but automation ownership is split between NEXUS and old stubs.

What to build:
- A clear automation entrypoint for lead scanning and outreach follow-up.

Recommended targets:
- keep NEXUS Worker routes as the source of truth
- optionally add scheduled calls from the active automation system
- update `packages/orchestrator/src/handlers/lead-scrape.ts` only if that orchestrator path is still meant to own execution
- update `packages/orchestrator/src/handlers/email-campaign.ts` only if it should trigger the existing NEXUS email system

Decision rule:
- Do not build duplicate business logic in both the Worker and orchestrator.
- One layer should orchestrate; one layer should implement.

Definition of done:
- Scheduled lead scanning and outreach use one execution path, not parallel competing implementations.

---

## Environment Variables To Add Only When Needed

These are not all required today. Add them when the corresponding work lands.

```env
# Real outbound campaign sending
RESEND_API_KEY=

# Optional new source expansion
FIRECRAWL_API_KEY=
```

Notes:
- Keep these in the root `.env.example`.
- Production deployment should use Worker/Pages secrets where appropriate.
- Do not add Google Sheets, Supabase, or other provider keys until the code path exists in this repo.

---

## Clean Checklist

```text
ARCHITECTURE
[x] Confirm `apps/nexus/apps/web` is the canonical leads UI
[x] Confirm `apps/nexus/apps/nexus-api` owns lead and email routes
[x] Confirm D1 migrations already exist for leads and email campaigns
[x] Confirm `apps/dashboard/app/leads/page.tsx` is still a placeholder
[x] Remove the old Supabase-first assumptions from this file

PHASE 1 - EXISTING STACK HARDENING
[ ] Add a forward-compatible lead enrichment/contact schema
[ ] Add richer lead status and note editing actions

PHASE 2 - OUTREACH
[ ] Integrate a real email provider for campaign delivery
[ ] Add a distinct one-to-one lead outreach path

PHASE 3 - SOURCE EXPANSION
[ ] Add Firecrawl only as an extension of the existing NEXUS scanner
[ ] Add enrichment logic inside NEXUS services

PHASE 4 - OPERATOR UX
[ ] Add CSV export to the real leads page
[ ] Add lead-to-outreach reporting

PHASE 5 - AUTOMATION
[ ] Decide whether NEXUS or orchestrator owns scan scheduling
[ ] Replace stub handlers only if they are still part of the chosen execution path
```

---

## Notes For Future Agents

- If a lead task points at `apps/dashboard`, treat it as stale unless the ADR has changed.
- If a lead task assumes Supabase, re-check whether it is actually meant for the legacy `@repo/*` stack instead of NEXUS.
- If you need a new lead source, extend `lead-scanner.ts` or add a sibling source service before inventing a new parallel package tree.
- If you need outreach, separate subscriber broadcasts from direct lead outreach early.
- If you touch automation, decide who owns execution before implementing more code in both NEXUS and the orchestrator.
