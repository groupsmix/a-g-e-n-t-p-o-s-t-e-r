# Testing Guide

## Overview

The test suite uses **Vitest** across all packages. CI runs the full pipeline on every push to `main` and on all PRs.

```
pnpm test              # run all tests (all packages)
pnpm typecheck         # full TypeScript strict check
pnpm lint              # ESLint (web app)
```

---

## Running Tests Locally

### Prerequisites

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
```

### All tests

```bash
pnpm test
# equivalent: pnpm turbo test
```

### Single package

```bash
pnpm --filter nexus-api test
pnpm --filter @nexus/web test
pnpm --filter @posteragent/orchestrator test
```

### Watch mode

```bash
pnpm --filter nexus-api test -- --watch
```

### Coverage

```bash
pnpm --filter nexus-api test -- --coverage
```

---

## Test Structure

### API Worker (`apps/nexus/apps/nexus-api/`)

```
src/
  routes/
    auth.test.ts            # Auth gate smoke tests
    metrics.test.ts         # Metrics endpoint contract
    publisher-queue.test.ts # Queue round-trip
    workflow.test.ts        # Workflow engine integration
    control-plane.test.ts   # Control plane CRUD
  contract.test.ts          # OpenAPI contract validation
```

Each route test file follows this pattern:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { app } from '../index'
import type { Env } from '../env'

const mockEnv: Env = {
  DB: /* D1 mock */,
  CONFIG: /* KV mock */,
  // ...
}

describe('POST /api/repo-intel/projects', () => {
  it('rejects invalid GitHub URLs', async () => {
    const req = new Request('http://localhost/api/repo-intel/projects', {
      method: 'POST',
      body: JSON.stringify({ url: 'not-a-github-url' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await app.fetch(req, mockEnv)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('valid GitHub')
  })
})
```

### AI Worker (`apps/nexus/apps/nexus-ai/`)

```
src/
  errors.test.ts      # Error handling + retry logic
  failover.test.ts    # Multi-provider failover
  registry.test.ts    # Model registry
```

### Shared Packages

```
packages/orchestrator/   # BaseAgent run lifecycle
packages/types/          # Type guard validation
packages/logger/         # Logger scoping
```

---

## Writing New Tests

### Rule 1 — test the contract, not the implementation

Test what the route returns (status codes, JSON shape), not internal functions.

### Rule 2 — mock at the boundary

Mock `c.env.DB`, `c.env.AI_WORKER`, and `c.env.CONFIG` at the Hono app level using Vitest's `vi.fn()` or a minimal in-memory stub.

### Rule 3 — one assertion per test

Keep tests small and focused. A failing test should immediately identify what broke.

### Example: testing a new route

```typescript
// src/routes/repo-intelligence.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { repoIntelRoutes } from './repo-intelligence'
import type { Env } from '../env'

function makeApp(dbOverrides: Partial<Env['DB']> = {}) {
  const app = new Hono<{ Bindings: Env }>()
  app.route('/api/repo-intel', repoIntelRoutes)
  return app
}

describe('GET /api/repo-intel/projects', () => {
  it('returns empty list when no repos tracked', async () => {
    const app = makeApp()
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
      },
    } as unknown as Env

    const req = new Request('http://localhost/api/repo-intel/projects')
    const res = await app.fetch(req, env)
    expect(res.status).toBe(200)
    const body = await res.json() as { projects: unknown[]; count: number }
    expect(body.count).toBe(0)
    expect(Array.isArray(body.projects)).toBe(true)
  })
})
```

---

## CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs in this order:

```
1. shared-packages    — build + typecheck @posteragent/types, @posteragent/logger
2. lint               — ESLint on all @posteragent/* packages
3. typecheck          — strict tsc on nexus-api, nexus-ai, web, orchestrator, ...
4. test               — vitest across all packages
5. build              — production build (nexus-api esbuild, web next-on-pages)
```

All jobs run on `ubuntu-latest` with Node 22 and `pnpm install --frozen-lockfile`.

---

## E2E Testing (Browser Agent)

The Multi-Agent Coordinator's **Browser Agent** generates E2E test scenarios using AI. These are descriptive plans that can be executed with Hyperbeam (live browser sessions via `/api/browser`).

### Browser agent output format

When the Browser Agent step runs in a multi-agent session, it produces a structured test plan:

```
## E2E Test Plan

### Scenario 1: Authentication Flow
1. Navigate to https://nexus-web-cl2.pages.dev
2. Assert: password gate form is visible
3. Enter dashboard password
4. Assert: redirected to home page
5. Assert: sidebar is rendered

### Scenario 2: Repo Intelligence
1. Navigate to /repo-intel
2. Enter "https://github.com/owner/repo" in the URL field
3. Click "Track Repo"
4. Assert: repo appears in the list
5. Click "Analyze"
6. Assert: project map renders with framework badges
```

### Running browser tests with Hyperbeam

Set `HYPERBEAM_API_KEY` and use the browser routes:

```bash
# Start a browser session
POST /api/hyperbeam/sessions

# Navigate
POST /api/browser-actions/navigate  { "url": "https://nexus-web-cl2.pages.dev" }

# Screenshot for validation
GET  /api/browser-actions/screenshot
```

---

## Coverage Targets

| Package | Target |
|---------|--------|
| `nexus-api` routes | 70% line coverage |
| `nexus-ai` failover | 90% branch coverage |
| `@posteragent/orchestrator` | 80% line coverage |
| `@posteragent/types` | 100% (type guards) |

---

## Common Issues

**`Cannot find module '@posteragent/types'`**
Run `pnpm install --frozen-lockfile` — the workspace symlinks may be stale.

**D1 mock not working**
Use `vi.fn()` for each prepared statement method: `.prepare()`, `.bind()`, `.run()`, `.first()`, `.all()`.

**Test times out on AI worker calls**
The AI worker (`c.env.AI_WORKER.fetch`) must be mocked in unit tests. Only integration tests should call the real worker.
