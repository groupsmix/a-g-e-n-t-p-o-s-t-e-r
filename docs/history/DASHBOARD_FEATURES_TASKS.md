# DASHBOARD FEATURES TASKS - VERIFIED END-TO-END
> Verified against the current repo on 2026-06-12.
> Scope: announcements, template manager, feature flags, and dashboard cleanup.
> Canonical operator dashboard: `apps/nexus/apps/web`.
> `apps/dashboard` is the Brain Cockpit, not the money/ops dashboard.
> Each task block below is rewritten to match the repo as it exists today.

---

## Ground Truth

- `apps/nexus/apps/web` is the real operator UI and ships to Cloudflare Pages.
- `apps/nexus/apps/nexus-api` is the Worker API and owns D1/KV/R2-backed dashboard data.
- `apps/dashboard` is a separate Next.js app for memory/identity/proactivity. Do not treat it as the main dashboard.
- Shared NEXUS types come from `@posteragent/types/nexus`, implemented in `packages/types/src/nexus`.
- Root install/build happens from the repo root. Do not assume a separate pnpm workspace inside `apps/nexus`.

---

## PART 0 - REAL BASELINE AND BLOCKERS

### 0.1 Toasts are not broken anymore

Status: already fixed enough to render.

Verified state:
- `apps/nexus/apps/web/src/lib/toast.ts` still uses the custom emitter.
- `apps/nexus/apps/web/src/components/shell/ToastContainer.tsx` exists and subscribes to it.
- `apps/nexus/apps/web/src/app/layout.tsx` already mounts `<ToastContainer />`.

What to do:
- Do not treat "toasts never render" as an open blocker.
- Optional cleanup: migrate to `sonner` only if you want better UX, richer styles, or promise toasts.
- If you migrate, replace the emitter cleanly and delete `ToastContainer.tsx` plus `subscribeToasts` usage.

Definition of done:
- Existing `toast.success()`, `toast.error()`, and `toast.info()` calls still show visible UI after the change.

### 0.2 `apps/dashboard` env instructions in the old doc were wrong

Status: old task was invalid.

Verified state:
- `apps/dashboard/.env.example` only documents `NEXT_PUBLIC_NEXUS_WEB_URL`.
- There is no `apps/dashboard/app/api/trigger/route.ts`.
- There are no `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_TOKEN`, or `GITHUB_REPO` references in `apps/dashboard`.

What to do:
- Remove any instruction that tells an agent to create `apps/dashboard/.env.local` for a missing trigger route.
- Only add `apps/dashboard/.env.local` if you want the Brain Cockpit home page to link to deployed NEXUS via `NEXT_PUBLIC_NEXUS_WEB_URL`.
- Keep GitHub-trigger and repo-default work in the actual package that owns it, not in `apps/dashboard`.

Definition of done:
- No task in this file claims `apps/dashboard` is the deployment target for the operator dashboard.

### 0.3 `NEXT_PUBLIC_API_URL` is still a real deployment risk

Status: still valid, but partially mitigated already.

Verified state:
- `apps/nexus/apps/web/package.json` already injects a production fallback into `pages:build`.
- `apps/nexus/apps/web/src/components/shared/ApiMisconfigBanner.tsx` already warns when the build uses the localhost fallback.
- `apps/nexus/apps/web/next.config.js` still falls back to `http://localhost:8787` for raw local builds.

What to do:
1. Set `NEXT_PUBLIC_API_URL` on the Cloudflare Pages project for NEXUS web.
2. Redeploy with:
   ```bash
   pnpm --filter @nexus/web pages:ship
   ```
3. Do not open a new task to build another warning banner; one already exists.

Definition of done:
- Production NEXUS pages call the deployed Worker API instead of `localhost:8787`.

### 0.4 Broken sidebar links were only partly true

Status: partially fixed already.

Verified state:
- `/affiliate-marketing` and `/ecommerce-retail` are already removed from `Sidebar.tsx`.
- API routes exist for `signals`, `events`, `ventures`, `pipeline`, and `portfolio`.
- Page files for `/content`, `/signals`, `/events`, `/ventures`, `/pipeline`, and `/portfolio` do not exist in `apps/nexus/apps/web/src/app`.
- Those routes are not currently present in the sidebar, so they are not an active nav blocker.

What to do:
- Do not spend time "removing broken links" that are already gone.
- If you add any of those sections back to navigation, build the page first or add a redirect to an existing page.
- If `/content` is meant to exist, define whether it belongs in NEXUS web or Brain Cockpit before building it.

Definition of done:
- No sidebar entry points to a page that does not exist.

### 0.5 Shared-type package references are stale in the old doc

Status: real mismatch to fix before adding new shared dashboard types.

Verified state:
- NEXUS web imports types from `@posteragent/types/nexus`.
- `apps/nexus/apps/web/next.config.js` currently transpiles `@nexus/types`, which does not match the actual package name used in the repo.

What to do:
- Before adding new cross-app types for announcements/templates/flags, update the NEXUS web transpile list to include the real package name.
- Keep new dashboard-facing shared types under `packages/types/src/nexus`, not under a fictional `apps/nexus/packages/types` path.

Definition of done:
- New shared type imports compile from `@posteragent/types/nexus` without adding one-off local duplicates.

---

## PART 1 - ANNOUNCEMENT SYSTEM

## Goal
A persistent, dismissible banner at the top of NEXUS web for operator-facing messages such as daily-run results, warnings, or manual notices.

## Architecture
- Backend store: Cloudflare KV via the existing `CONFIG` binding.
- API home: `apps/nexus/apps/nexus-api/src/routes/announcements.ts`
- Shared types: `packages/types/src/nexus`
- Frontend shell: `apps/nexus/apps/web/src/components/shell`
- Frontend API client: `apps/nexus/apps/web/src/lib/api.ts`

## Task 1.1 - Backend route

Build `announcementRoutes` in `apps/nexus/apps/nexus-api/src/routes/announcements.ts` with:
- `GET /api/announcements` -> active announcement or `null`
- `POST /api/announcements` -> create/replace active announcement
- `DELETE /api/announcements` -> clear active announcement
- `PATCH /api/announcements/dismiss` -> dismiss current announcement

Implementation notes:
- Reuse the existing Worker `Env` type from `src/env.ts`.
- Store exactly one active announcement in `CONFIG`, for example under `active_announcement`.
- Validate the shape before writing to KV.
- Register the route in `apps/nexus/apps/nexus-api/src/index.ts` with `api.route('/announcements', announcementRoutes)`.

Definition of done:
- Worker returns and mutates announcement state through all four endpoints.

## Task 1.2 - Shared types

Add a real shared NEXUS type for announcements.

Suggested shape:
```ts
export interface Announcement {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  created_at: string
  dismissible: boolean
  active: boolean
}
```

Implementation notes:
- Put the type in `packages/types/src/nexus`, export it from `packages/types/src/nexus/index.ts`, and consume it through `@posteragent/types/nexus`.
- Do not add this to `packages/types/src/index.ts`, which is for broader non-NEXUS types.

Definition of done:
- Worker and web use the same `Announcement` type import.

## Task 1.3 - Frontend banner

Build `apps/nexus/apps/web/src/components/shell/AnnouncementBanner.tsx`.

Requirements:
- Fetch the active announcement on mount.
- Respect a local dismissal cache keyed by announcement id.
- Render different icon/color states for info/success/warning/error.
- Call the dismiss endpoint when the user dismisses a dismissible banner.

Implementation notes:
- Extend `apps/nexus/apps/web/src/lib/api.ts`; there is no `src/lib/api-types.ts` file in this app.
- Mount the banner inside `AppShell.tsx` above the main page content.
- Keep this separate from transient toast notifications.

Definition of done:
- A published announcement appears across NEXUS pages until cleared or dismissed.

## Task 1.4 - Manager page

Create `apps/nexus/apps/web/src/app/manager/announcements/page.tsx`.

Requirements:
- Textarea for message
- Select for type
- Dismissible toggle
- Publish button
- Clear button
- Success/error toast feedback

Implementation notes:
- Reuse page-shell patterns already used in manager pages under `src/app/manager/*`.
- Add a sidebar entry only after the page exists.

Definition of done:
- Operator can publish and clear announcements from the dashboard.

## Task 1.5 - Automation source

Post announcements automatically from the content pipeline.

Verified context:
- The legacy daily cron entry still exists at `apps/runner/src/run-daily.ts`.
- The future workflow path also exists at `packages/workflows/src/daily-run-workflow.ts`.

What to do:
- Pick exactly one source of truth for auto-announcements during the transition period.
- If the legacy cron is still the active producer, post from `apps/runner/src/run-daily.ts`.
- When that job is retired, move the integration into `packages/workflows/src/daily-run-workflow.ts`.
- Use `NEXUS_API_URL` for the Worker base URL.

Definition of done:
- Daily run completion creates one announcement, not duplicate banners from parallel pipelines.

---

## PART 2 - TEMPLATE MANAGER

## Goal
A CRUD dashboard for reusable video/poster templates backed by NEXUS data and connected to the existing Remotion generator package.

## Verified current state
- `packages/generators/src/video/remotion/compositions` already exists.
- `packages/generators/src/video/remotion/Root.tsx` already registers 8 compositions.
- There is no NEXUS `templates` DB table yet.
- There is no `templates` Worker route yet.
- There is no `/templates` page in NEXUS web yet.
- Existing migrations already go through `034_leads_status.sql`, so `033_templates.sql` would be wrong.

## Task 2.1 - D1 schema

Create a new migration at:
- `apps/nexus/migrations/035_templates.sql`

Tables to add:
- `templates`
- `poster_templates`
- `caption_templates`

Implementation notes:
- Use the old draft schema as a starting point, but number the migration correctly.
- Keep JSON blobs explicit (`TEXT` storing JSON) and document which fields are parsed by the app.
- Add indexes for the common list filters (`type`, `niche`, `active`, `platform`).

Definition of done:
- Remote D1 contains the template tables and indexes.

## Task 2.2 - Worker routes

Create `apps/nexus/apps/nexus-api/src/routes/templates.ts` with endpoints for:
- list with filters and pagination
- get by id
- create
- update
- soft delete / deactivate
- increment use count
- trigger generation from a selected template

Implementation notes:
- Register with `api.route('/templates', templateRoutes)`.
- Add shared request/response types under `packages/types/src/nexus` if multiple consumers need them.
- Reuse current Worker patterns for pagination and JSON parsing rather than inventing a second API style.

Definition of done:
- `GET /api/templates` and `POST /api/templates` work end to end.

## Task 2.3 - Remotion library expansion

Optional but valuable: import additional MIT-licensed Remotion compositions from a reference repo.

Reference repo:
- `reactvideoeditor/remotion-templates`

Implementation notes:
- Clone reference repos into local `ref/` only; the root README already reserves that folder for untracked references.
- Copy only the compositions you can support cleanly, not necessarily all 81 in one shot.
- Register each imported composition in `packages/generators/src/video/remotion/Root.tsx`.
- Keep composition ids stable because the DB will reference them.

Definition of done:
- Generator package builds with the new compositions enabled.

## Task 2.4 - Seed script

Create a template seed script only after the schema and route exist.

Implementation notes:
- Place it under `apps/nexus/apps/nexus-api/src/scripts/seed-templates.ts`.
- Seed the compositions that actually exist in `packages/generators`, not a guessed list.
- Prefer idempotent inserts or upserts so reruns are safe.

Definition of done:
- Template records exist for every supported composition you want exposed in the dashboard.

## Task 2.5 - `/templates` page

Create `apps/nexus/apps/web/src/app/templates/page.tsx`.

Requirements:
- stats row
- filter bar
- card/grid or table view
- preview action
- edit action
- generate-now action
- deactivate/reactivate action
- add-template flow

Implementation notes:
- Reuse the CRUD/table patterns already present in `products`, `manager/*`, and related list pages.
- Add the sidebar entry only after the page ships.

Definition of done:
- Operator can browse, edit, and trigger templates from NEXUS web.

---

## PART 3 - FEATURE FLAGS

## Goal
Simple operator-controlled toggles and numeric limits stored in Cloudflare KV and consumed by both the UI and generation pipeline.

## Verified current state
- There is no generic feature-flag route yet.
- There is no `/manager/flags` page yet.
- `apps/nexus/apps/web/src/app/autopilot/page.tsx` has local status toggles, but not a shared flag system.
- The proposed helper path `packages/config/src/flags-client.ts` does not exist yet.

## Task 3.1 - KV-backed API

Create `apps/nexus/apps/nexus-api/src/routes/flags.ts`.

Requirements:
- canonical defaults object in code
- `GET /api/flags`
- `GET /api/flags/:key`
- `PATCH /api/flags/:key`
- `POST /api/flags/reset`

Suggested first-pass flags:
- `daily_run_enabled`
- `site_generation_enabled`
- `video_generation_enabled`
- `poster_generation_enabled`
- `voiceover_enabled`
- `dry_run_mode`
- `auto_publish_tiktok`
- `auto_publish_instagram_reels`
- `auto_publish_instagram_feed`
- `auto_publish_youtube_shorts`
- `auto_publish_twitter`
- `auto_publish_pinterest`
- `auto_publish_linkedin`
- `auto_publish_threads`
- `max_posts_per_day`
- `max_videos_per_day`
- `max_sites_per_week`
- `max_blog_posts_per_day`

Implementation notes:
- Store overrides in `CONFIG` KV and merge them over code defaults on read.
- Register the route in the Worker index.

Definition of done:
- Flags can be read and updated through the Worker API.

## Task 3.2 - Shared types and client hooks

Build the shared frontend contract.

Implementation notes:
- Add NEXUS shared types for feature flags under `packages/types/src/nexus`.
- Extend `apps/nexus/apps/web/src/lib/api.ts` with `getFlags`, `getFlag`, `setFlag`, and `resetFlags`.
- Create a `FlagsProvider` in `apps/nexus/apps/web/src/components/shell/FlagsProvider.tsx`.
- Expose small hooks such as `useFlagsContext()` and `useFeatureIsOn()`.

Definition of done:
- NEXUS web can read flags once and update them centrally.

## Task 3.3 - Layout integration

Wrap the NEXUS layout with the flags provider.

Implementation notes:
- Mount the provider in `apps/nexus/apps/web/src/app/layout.tsx`.
- Keep the provider client-only and avoid breaking the existing shell/auth flow.

Definition of done:
- Any page can read feature flags without implementing its own fetch-on-mount.

## Task 3.4 - Flags UI

Create `apps/nexus/apps/web/src/app/manager/flags/page.tsx`.

Requirements:
- grouped sections
- boolean toggles
- numeric inputs
- descriptions for each flag
- reset-to-defaults action
- instant persistence

Implementation notes:
- Add a sidebar item under the manager section only after the page exists.
- Reuse page header/body primitives from `AppShell.tsx`.

Definition of done:
- Operator can flip flags from the dashboard and see the current values immediately.

## Task 3.5 - Pipeline wiring

Wire the flags into the runtime systems that matter.

Verified target files:
- `packages/workflows/src/daily-run-workflow.ts`
- `packages/publishers/src/publisher-factory.ts`
- optionally `apps/runner/src/run-daily.ts` while the legacy cron remains active

Implementation notes:
- Either create `packages/config/src/flags-client.ts` intentionally, or colocate the helper in an existing package. Do not keep a doc reference to a package that does not exist.
- Check `daily_run_enabled` at the top of daily-run execution.
- Check per-platform `auto_publish_*` flags before publishing.
- Respect numeric caps before queuing expensive work.
- Keep `dry_run_mode` behavior consistent between legacy and NEXUS workflow paths.

Definition of done:
- Toggling a flag in the dashboard changes the next run behavior without code edits or redeploys.

---

## PART 4 - OPTIONAL UI UPGRADES

These are useful, but they are not blockers for announcements/templates/flags.

### 4.1 shadcn/ui
- Good fit for dialogs, tables, selects, sheets, badges, and progress bars.
- Install into `apps/nexus/apps/web` only if you are ready to standardize UI primitives there.

### 4.2 TanStack Table
- Worth adding when `/templates` or other list-heavy pages need sorting/filtering/pagination.
- Prefer one reusable `DataTable` component under `apps/nexus/apps/web/src/components/ui`.

### 4.3 TanStack Query
- Worth adding when multiple NEXUS pages still rely on manual `useEffect + fetch` patterns.
- Do not migrate pages blindly; start with the busiest data-heavy views.

### 4.4 Zustand
- Worth adding if NEXUS web grows real shared client state beyond local component state.
- Do not add a store just to mirror one page-local toggle.

### 4.5 Reference repos
- Clone references under local `ref/` only.
- Do not import directly from reference clones into production code.

---

## PART 5 - CLEAN CHECKLIST

```text
PART 0 - BASELINE
[x] Confirm NEXUS web is the canonical dashboard
[x] Confirm `apps/dashboard` is Brain Cockpit only
[x] Confirm custom toast currently renders via `ToastContainer`
[x] Confirm affiliate/ecommerce sidebar links are already removed
[ ] Fix stale shared-type package references before adding new dashboard types
[ ] Ensure Cloudflare Pages has `NEXT_PUBLIC_API_URL` set correctly

PART 1 - ANNOUNCEMENTS
[ ] Add `announcementRoutes` to the Worker
[ ] Add shared `Announcement` type under `packages/types/src/nexus`
[ ] Extend NEXUS web API client with announcement methods
[ ] Build `AnnouncementBanner` and mount it in `AppShell`
[ ] Build `/manager/announcements`
[ ] Post automated announcements from exactly one active pipeline path

PART 2 - TEMPLATE MANAGER
[ ] Add `035_templates.sql` migration in `apps/nexus/migrations`
[ ] Add `templateRoutes` to the Worker
[ ] Add shared template types as needed
[ ] Expand Remotion compositions in `packages/generators` if desired
[ ] Create an idempotent seed script
[ ] Build `/templates` and add it to the sidebar

PART 3 - FEATURE FLAGS
[ ] Add `flagRoutes` to the Worker
[ ] Add shared flag types under `packages/types/src/nexus`
[ ] Extend the NEXUS web API client with flag methods
[ ] Build `FlagsProvider` and mount it in layout
[ ] Build `/manager/flags`
[ ] Wire flags into workflows, publishers, and any still-active legacy runner path

PART 4 - OPTIONAL UI IMPROVEMENTS
[ ] Add shadcn/ui primitives if the new pages need them
[ ] Add TanStack Table if the template page needs richer tabular UX
[ ] Add TanStack Query for high-value NEXUS pages, not as a blanket rewrite
[ ] Add Zustand only if real shared client state emerges
```

---

## Notes For Future Agents

- If a task mentions `apps/dashboard` as the main dashboard, treat that instruction as stale unless the ADR has changed.
- If a task mentions `apps/nexus/packages/types`, correct it to `packages/types/src/nexus`.
- If a task says the toast UI is missing, re-check `ToastContainer.tsx` before changing anything.
- If a task says to create `033_templates.sql`, renumber it based on the latest migration already in the repo.
- If both legacy cron and NEXUS workflows can emit the same side effect, choose one owner to avoid duplicate automation.
