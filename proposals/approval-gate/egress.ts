/**
 * DRAFT scaffold for the structural approval gate.
 * Not imported anywhere yet. See docs/plans/approval-gate-spec.md.
 *
 * Self-contained types so this reads as real code without wiring into the
 * nexus-api package (kept out of any tsconfig on purpose).
 */

export type ActionType =
  | "send.client"
  | "publish.gumroad"
  | "publish.shopify"
  | "publish.social"
  | "publish.blog"
  | "spend.ads"
  | "delete.durable"
  // internal (never gated):
  | "draft.create"
  | "research.web"
  | "browser.read"
  | "log.write"
  | "propose.idea";

export interface Action {
  type: ActionType;
  payload: unknown;
  estimatedCost?: number; // required for spend.*
}

const GATED = new Set<ActionType>([
  "send.client",
  "publish.gumroad",
  "publish.shopify",
  "publish.social",
  "publish.blog",
  "delete.durable",
]);
const isMoney = (t: ActionType) => t.startsWith("spend.");
const isGated = (t: ActionType) => GATED.has(t) || isMoney(t);

export interface GateResult {
  halted: boolean;
  approvalId?: string;
  result?: unknown;
}

/**
 * The ONLY way an agent reaches the outside world.
 * Internal actions run immediately; external/money/irreversible actions halt
 * and create a snapshot-bound ApprovalRequest until the operator approves.
 */
export async function executeExternalAction(
  runId: string,
  action: Action,
  deps: EgressDeps
): Promise<GateResult> {
  if (!isGated(action.type)) {
    return { halted: false, result: await deps.runInternal(action) };
  }

  // Bind the approval to the EXACT payload (closes the approve-A / send-B hole).
  const hash = await deps.sha256(deps.canonicalJSON(action.payload));
  let ar = await deps.findApproval({ runId, type: action.type, hash });

  if (!ar) {
    ar = await deps.createApproval({
      runId,
      type: action.type,
      payloadJson: deps.canonicalJSON(action.payload),
      hash,
      estimatedCost: action.estimatedCost ?? null,
      idempotencyKey: deps.uuid(),
      status: "pending",
    });
    await deps.setRunStatus(runId, "awaiting_approval");
    return { halted: true, approvalId: ar.id }; // agent stops here
  }

  if (ar.status === "pending") return { halted: true, approvalId: ar.id };
  if (ar.status === "rejected") throw new Error(`rejected: ${ar.reviewerNotes ?? ""}`);
  if (ar.status === "executed") return { halted: false, result: ar.result };

  // status === "approved"
  if (isMoney(action.type)) {
    const ok = await deps.budgetTryReserve({ amount: ar.estimatedCost ?? 0 });
    if (!ok) {
      await deps.setRunStatus(runId, "budget_exceeded");
      throw new Error("budget_exceeded");
    }
  }

  // Execute the SNAPSHOT, never live agent state.
  const result = await deps.dispatch(action.type, JSON.parse(ar.payloadJson), {
    idempotencyKey: ar.idempotencyKey,
  });
  await deps.markExecuted(ar.id, result);
  return { halted: false, result };
}

// ---- dependency seams (implemented when this lands in a real package) ----
export interface ApprovalRow {
  id: string;
  status: "pending" | "approved" | "rejected" | "executed" | "expired";
  payloadJson: string;
  idempotencyKey: string;
  estimatedCost: number | null;
  reviewerNotes?: string | null;
  result?: unknown;
}
export interface EgressDeps {
  runInternal(a: Action): Promise<unknown>;
  dispatch(type: ActionType, payload: unknown, opts: { idempotencyKey: string }): Promise<unknown>;
  findApproval(q: { runId: string; type: ActionType; hash: string }): Promise<ApprovalRow | null>;
  createApproval(input: Record<string, unknown>): Promise<ApprovalRow>;
  markExecuted(id: string, result: unknown): Promise<void>;
  setRunStatus(runId: string, status: string): Promise<void>;
  budgetTryReserve(input: { amount: number }): Promise<boolean>;
  sha256(s: string): Promise<string>;
  canonicalJSON(v: unknown): string;
  uuid(): string;
}
