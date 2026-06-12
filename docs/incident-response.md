# Incident Response Runbook

_How to respond when something goes wrong in production._

## Severity levels

| Level | Definition | Response time |
|---|---|---|
| **P1 — Critical** | Attacker has platform access or data is actively leaking | Immediate, drop everything |
| **P2 — High** | Publishing is broken or content is being posted incorrectly | Within 1 hour |
| **P3 — Medium** | Queue is stuck or generation is failing silently | Within 4 hours |
| **P4 — Low** | Dashboard glitch, stale data, non-blocking bug | Next working day |

---

## P1: Credential compromise

**Symptoms**: Unexpected posts on social platforms, unusual API spend,
unknown sessions in Cloudflare dashboard.

**Immediate actions**:
1. **Revoke the compromised credential** — rotate the platform token or
   API key immediately via the platform's admin console.
2. **Rotate all shared secrets** — `wrangler secret put` for any Worker
   secrets that may have been exposed.
3. **Kill active sessions** — changing the dashboard password revokes all
   sessions (generation-stamped).
4. **Check dead-letter tables** — query `publisher_failures` and
   `content_queue_failures` for signs of abuse.
5. **Audit git history** — run `gitleaks detect --source .` to confirm no
   new secrets were committed.

**Recovery**:
- Re-provision platform tokens through OAuth flows.
- Verify no unauthorized posts remain on any platform.
- File a post-mortem within 48 hours.

---

## P2: Broken publishing

**Symptoms**: Posts fail to publish, publisher returns errors, content
appears on wrong platforms.

**Diagnostic steps**:
1. Check `publisher_failures` table for recent errors:
   ```sql
   SELECT platform, http_status, category, LEFT(error_message, 200)
     FROM publisher_failures
    WHERE failed_at > NOW() - INTERVAL '1 hour'
    ORDER BY failed_at DESC;
   ```
2. Identify failure category:
   - `auth` → token expired, re-authenticate
   - `rate_limit` → platform throttle, wait and retry
   - `validation` → content rejected, check media types/dimensions
   - `network` → transient, check Cloudflare status
3. For YouTube upload failures, check if chunked upload stalled (look for
   partial uploads in YouTube Studio).
4. For TikTok, verify the async publish completed (check analytics).

**Recovery**:
- Fix root cause (token refresh, media format, etc.)
- Re-queue failed items: update status back to `pending` in `content_queue`
  and clear `claim_token`.
- Monitor next batch for successful publish.

---

## P3: Queue stuck / generation failing

**Symptoms**: Items in `content_queue` stuck in `generating` or `pending`
status for hours.

**Diagnostic steps**:
1. Check for stuck claims:
   ```sql
   SELECT id, topic, status, claimed_at, attempt_count,
          LEFT(last_error, 200) AS err
     FROM content_queue
    WHERE status IN ('generating', 'publishing')
      AND claimed_at < NOW() - INTERVAL '2 hours';
   ```
2. Check workflow failures:
   ```sql
   SELECT workflow_id, step_name, LEFT(stack_trace, 500)
     FROM workflow_failures
    WHERE failed_at > NOW() - INTERVAL '6 hours'
    ORDER BY failed_at DESC;
   ```
3. Check LLM budget:
   - If `assertLLMBudget()` is throwing, the daily cap may be hit.
   - Check `MAX_DAILY_LLM_CALLS` environment variable.

**Recovery**:
- Reset stuck items:
  ```sql
  UPDATE content_queue
     SET status = 'pending', claim_token = NULL, claimed_at = NULL
   WHERE status IN ('generating', 'publishing')
     AND claimed_at < NOW() - INTERVAL '2 hours';
  ```
- If LLM budget exhausted, wait for UTC midnight reset or increase cap.
- If specific step keeps failing, check the step's error in
  `workflow_failures` and fix root cause.

---

## P4: Dashboard / data issues

**Symptoms**: Stale analytics, missing revenue data, UI bugs.

**Steps**:
1. Check if stats-pull workflow ran (Cloudflare Cron Triggers dashboard).
2. Verify Supabase connectivity from Worker logs.
3. Check for schema mismatches in `docs/AGENT_TASKS.md` type definitions.

---

## Escalation paths

| Situation | Action |
|---|---|
| Platform API returns 403 consistently | Check platform developer status page; file support ticket |
| Cloudflare Worker throwing 500s | Check wrangler tail logs; may be platform incident |
| Supabase outage | Check status.supabase.com; switch to read-only mode if prolonged |
| LLM provider rate limits | Reduce `MAX_DAILY_LLM_CALLS`; implement exponential backoff |

## Post-incident

1. Write a post-mortem within 48 hours (add to `docs/history/`).
2. Update `docs/THREAT_MODEL.md` if a new attack vector was discovered.
3. Add regression test or CI check to prevent recurrence.
4. Update this runbook with lessons learned.
