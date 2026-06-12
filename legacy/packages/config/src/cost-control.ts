/**
 * Audit #44: basic spend cap for LLM API calls.
 *
 * Tracks the number of LLM invocations per calendar day (UTC) and refuses
 * new calls once MAX_DAILY_LLM_CALLS is reached. The counter lives in
 * process memory, so it resets on every restart — acceptable for the
 * single-operator cron path. A multi-tenant / fleet deployment should
 * replace this with a Redis or D1 counter.
 */

let counterDate: string = "";
let counterValue = 0;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Return the current daily LLM call count and the configured limit.
 */
export function getLLMUsage(): { used: number; limit: number; date: string } {
  const date = todayUTC();
  if (date !== counterDate) {
    counterDate = date;
    counterValue = 0;
  }
  const limit = parseInt(process.env.MAX_DAILY_LLM_CALLS ?? "500", 10) || 500;
  return { used: counterValue, limit, date };
}

/**
 * Increment the daily LLM call counter. Throws when the budget is exhausted
 * so the calling tool can surface the refusal to the agent / user.
 *
 * Usage:
 *   assertLLMBudget();       // throws if over limit
 *   await generateObject(…); // proceed with the LLM call
 */
export function assertLLMBudget(): void {
  const { used, limit } = getLLMUsage();
  if (limit > 0 && used >= limit) {
    throw new Error(
      `Daily LLM budget exhausted: ${used}/${limit} calls used today. ` +
        `Raise MAX_DAILY_LLM_CALLS or wait for the UTC day to roll over.`,
    );
  }
  counterValue += 1;
}
