# API Documentation

**Base URL (production):** `https://nexus-api.professional-inbox-simo.workers.dev`
**Base URL (local dev):** `http://localhost:8787`

## Authentication

All endpoints (except `/health`) require an `x-access-token` header with the dashboard password, or a valid Cloudflare Access JWT (`CF-Access-Jwt-Assertion` header).

```
x-access-token: <your-dashboard-password>
```

---

## Repository Intelligence — `/api/repo-intel`

Track and analyze GitHub repositories. Requires `github_token` in Settings to access private repos or write operations.

### GET `/api/repo-intel/projects`
List all tracked repositories.

**Response:**
```json
{ "projects": [{ "id": "uuid", "owner": "org", "name": "repo", "branch": "main", "status": "active", "last_analyzed_at": "2026-06-12T..." }], "count": 1 }
```

### POST `/api/repo-intel/projects`
Add a GitHub repository to track.

**Body:**
```json
{ "url": "https://github.com/owner/repo", "branch": "main" }
```

**Response:** `201` with the created project record.

### POST `/api/repo-intel/projects/:id/analyze`
Trigger full codebase analysis — indexes file tree, detects frameworks/stack, reads key config files, fetches repo metadata.

**Response:**
```json
{ "ok": true, "project_map": { "files": [...], "frameworks": ["Next.js", "Hono"], "dependencies": {}, "metadata": { "stars": 42 } }, "analyzed_at": "..." }
```

### GET `/api/repo-intel/projects/:id/tree`
Get the full file tree from GitHub (live, recursive).

### GET `/api/repo-intel/projects/:id/commits`
Get commit history. Query params: `per_page` (default 20), `page`.

### GET `/api/repo-intel/operations`
Audit log of all repository intelligence operations. Query: `repo_id`, `limit`.

---

## Code Operations — `/api/code-ops`

Read, write, and manage files in tracked repos via GitHub API. All writes require `github_token`.

### GET `/api/code-ops/:repoId/files`
List directory contents. Query: `path` (default: root), `ref` (branch/sha).

### GET `/api/code-ops/:repoId/files/*path`
Read a file's decoded content.

**Response:**
```json
{ "path": "src/index.ts", "content": "...", "sha": "abc123", "size": 1024 }
```

### PUT `/api/code-ops/:repoId/files/*path`
Create or update a file (triggers a GitHub commit).

**Body:**
```json
{ "content": "file content here", "message": "chore: update index.ts", "sha": "existing-sha-if-updating", "branch": "main" }
```

**Response:**
```json
{ "ok": true, "commit_sha": "abc123", "path": "src/index.ts" }
```

### DELETE `/api/code-ops/:repoId/files/*path`
Delete a file. Requires the current file SHA.

**Body:** `{ "sha": "current-file-sha", "message": "chore: remove file", "branch": "main" }`

### GET `/api/code-ops/:repoId/branches`
List all branches.

### POST `/api/code-ops/:repoId/branches`
Create a new branch.

**Body:** `{ "name": "feature/my-branch", "from": "main" }`

### GET `/api/code-ops/:repoId/pulls`
List pull requests. Query: `state` (open|closed|all).

### POST `/api/code-ops/:repoId/pulls`
Create a pull request.

**Body:** `{ "title": "feat: add feature", "head": "feature/my-branch", "base": "main", "body": "Description" }`

---

## Documentation Generator — `/api/doc-gen`

Generate AI-powered documentation for tracked repositories.

**Doc types:** `readme`, `architecture`, `api`, `testing`, `changelog`, `project_structure`, `custom`

### GET `/api/doc-gen/:repoId/generations`
List all generated documents for a repo.

### POST `/api/doc-gen/:repoId/generate`
Generate a document using AI. The repo must be analyzed first for best results.

**Body:**
```json
{ "doc_type": "readme" }
```

For custom docs:
```json
{ "doc_type": "custom", "custom_prompt": "Write a security policy document", "custom_title": "SECURITY.md" }
```

**Response:** `201` with `{ "id", "doc_type", "title", "content", "generated_at" }`

### GET `/api/doc-gen/:repoId/generations/:genId`
Get a generated document with full content.

### POST `/api/doc-gen/:repoId/generations/:genId/commit`
Commit a generated document back to the repository.

**Body (optional):** `{ "branch": "main", "message": "docs: update README", "filename": "README.md" }`

**Response:** `{ "ok": true, "commit_sha": "...", "filename": "...", "branch": "..." }`

---

## Multi-Agent Coordinator — `/api/multi-agent`

Orchestrate a chain of specialized AI agents for autonomous software engineering tasks.

**Pipeline types:**
- `full` — Planner → Code → Documentation → Testing → Review → Browser
- `code-only` — Planner → Code → Review
- `doc-only` — Planner → Documentation
- `test-only` — Planner → Testing
- `review-only` — Planner → Review

### GET `/api/multi-agent/agents`
List all agent capabilities and available session types.

### POST `/api/multi-agent/sessions`
Create a new agent session.

**Body:**
```json
{ "task_prompt": "Add rate limiting to the API and write unit tests", "session_type": "full", "repo_id": "optional-repo-uuid" }
```

**Response:** `201` with session ID and step sequence.

### GET `/api/multi-agent/sessions`
List sessions. Query: `status`, `limit`.

### GET `/api/multi-agent/sessions/:id`
Get session details including all step outputs.

### POST `/api/multi-agent/sessions/:id/run`
Execute the next agent step. Call repeatedly to advance through the pipeline, or use the dashboard "Run All" button for automatic advancement.

**Response:**
```json
{ "session_id": "...", "step": 0, "agent_type": "planner", "status": "done", "output": "...", "next_agent": "code", "session_done": false }
```

### GET `/api/multi-agent/sessions/:id/steps`
Get all step logs for a session.

### DELETE `/api/multi-agent/sessions/:id`
Cancel a running session.

---

## Agent Tasks — `/api/tasks`

User-facing task lifecycle management backed by the `agent_tasks` D1 table.

### GET `/api/tasks`
List tasks. Query: `status`, `type`, `limit`, `offset`.

### POST `/api/tasks`
Create a task. Body: `{ "type": "research", "payload": {}, "origin": "dashboard" }`

### GET `/api/tasks/:id`
Get a single task.

### PATCH `/api/tasks/:id`
Update task status/result/error/cost.

### GET `/api/tasks/stream`
SSE stream — tail recent task changes (polling-based).

---

## Agent Registry — `/api/agents`

### GET `/api/agents/registry`
List all 14 agent types with status. Query: `status`, `tag`.

### GET `/api/agents/registry/:type`
Get a single agent descriptor.

### POST `/api/agents/run`
Run a task via the orchestrator. Body: `{ "taskId": "..." }` or `{ "type": "research", "payload": {} }`.

---

## Settings — `/api/settings`

Key-value store for runtime configuration.

### GET `/api/settings`
List all settings.

### PUT `/api/settings/:key`
Set a setting value. Body: `{ "value": "..." }`

**Key settings used by the new features:**
- `github_token` — GitHub Personal Access Token for repo operations (PAT with `repo` scope)

---

## Observability — `/api/observability`

### GET `/api/observability`
System health snapshot — DB connectivity, worker status, recent error counts.

---

## Error Codes

| Status | Meaning |
|--------|---------|
| 400 | Bad request — missing or invalid parameters |
| 401 | Not authenticated — missing/invalid access token or GitHub token |
| 404 | Resource not found |
| 409 | Conflict — e.g. repo already tracked |
| 502 | GitHub API error — check the `details` field |
| 503 | Feature disabled — required secret not configured |
