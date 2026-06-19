# NEXUS — Open PR Triage Plan (10 open)

Goal: clear the noise. A solo repo shouldn't carry 10 open PRs. 8 are stale Dependabot
bumps from Jun 10; 1 is yours; the policy below makes most of this automatic going
forward.

---

## Verdicts

| PR | What | Verdict |
|---|---|---|
| **#82** brain-bridge + feedback-loop routes + dashboard action (yours, Jun 18) | feature | **Decide now:** merge if it's done, close if superseded. Don't let your own PR rot. |
| **#81** minor-and-patch group, 9 updates | deps (minor/patch) | **Auto-merge** after CI green. |
| **#54** react + @types/react | deps | **Merge** once it matches the React version Next pulls in (check against #53 decision first). |
| **#53** next 14.2.35 → **16.2.9** | deps (MAJOR ×2) | **Hold. Handle deliberately.** See below. |
| **#51** @types/node 20 → **25** in /apps/nexus | deps (MAJOR) | **Merge after typecheck** — align to your deployed Workers Node-compat version; 25 may be ahead of runtime. Prefer the `@types/node` major matching your `compatibility_date`/runtime, not "latest". |
| **#50** pino 8 → **10** in /apps/nexus | deps (MAJOR) | **Review changelog** (transport/config breaking changes), then merge. |
| **#49** lucide-react 0.312 → **1.17** in /apps/nexus | deps (MAJOR) | **Check icon renames** (some icons renamed/removed at 1.0), grep imports, then merge. |
| **#48** typescript 5.9 → **6.0** in /apps/nexus | deps (MAJOR) | **Run typecheck on a branch** — TS majors surface new errors. Merge if clean. |
| **#47** minor-and-patch group, 6 updates in /apps/nexus | deps (minor/patch) | **Auto-merge** after CI green. |
| **#46** actions group, 4 updates | deps (CI actions) | **Auto-merge** — workflow action bumps, low blast radius. |

---

## The one that needs care: #53 (Next 14 → 16)

This is **two major versions** on a Cloudflare Pages app. Risk isn't React/Next itself,
it's the **`@cloudflare/next-on-pages` (or OpenNext) adapter compatibility matrix** —
the adapter must support Next 16, and App Router / edge-runtime behavior shifts across
14→15→16. Do **not** blind-merge.

1. Branch from #53. Confirm your Pages adapter version supports Next 16.
2. `pnpm typecheck && pnpm test`, then a **preview deploy** to Cloudflare Pages.
3. Smoke-test the password gate, the observability page, and `/api/stats` wiring.
4. Consider 14 → 15 first if 16 adapter support is immature. Stepping one major is safer.

---

## Make this automatic (paste-ready)

Drop in `.github/workflows/dependabot-auto-merge.yml` so minor/patch never queues again:

```yaml
name: dependabot-auto-merge
on: pull_request_target
permissions:
  contents: write
  pull-requests: write
jobs:
  auto-merge:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - uses: dependabot/fetch-metadata@v2
        id: meta
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
      - name: Enable auto-merge for minor & patch
        if: steps.meta.outputs.update-type == 'version-update:semver-minor' || steps.meta.outputs.update-type == 'version-update:semver-patch'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This auto-merges minor/patch **only when CI passes** (auto-merge waits for required
checks — make sure branch protection requires your `typecheck`/`test` checks). Majors
still stop for human review, which is exactly what you want.

Optionally group + slow down Dependabot in `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule: { interval: weekly }
    groups:
      minor-and-patch:
        update-types: ["minor", "patch"]
  - package-ecosystem: npm
    directory: "/apps/nexus"
    schedule: { interval: weekly }
    groups:
      minor-and-patch:
        update-types: ["minor", "patch"]
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: weekly }
```

---

## Execution sequence (copy-paste)

```bash
# 1. Decide on your own PR first
gh pr view 82 --repo groupsmix/a-g-e-n-t-p-o-s-t-e-r
#   merge it:           gh pr merge 82 --squash --repo groupsmix/a-g-e-n-t-p-o-s-t-e-r
#   or close it:        gh pr close 82 --repo groupsmix/a-g-e-n-t-p-o-s-t-e-r

# 2. Land the safe groups (after CI green)
for n in 81 47 46; do gh pr merge $n --auto --squash --repo groupsmix/a-g-e-n-t-p-o-s-t-e-r; done

# 3. Type-only / logger majors — verify on a branch, then merge
#    #48 (typescript 6), #51 (@types/node 25), #50 (pino 10), #49 (lucide 1)
#    gh pr checkout <n>; pnpm typecheck && pnpm test; then merge

# 4. Next 16 (#53) + react (#54) — preview deploy, smoke test, then merge together
```

Net effect: 10 → handled. After this, only majors will ever wait for you.
