import { opaEval, OpaEvalError } from "../lib/opa.ts";
import { approvalFingerprint } from "../lib/redact.ts";
import type { AgentCard, Decision, GateInput, PriorDecision } from "../types.ts";

export function closedDecision(cause: string): Decision {
  return {
    effect: "deny",
    rule_ids: ["COL-GATE-FAIL-CLOSED"],
    reasons: [`COL-GATE-FAIL-CLOSED: ${cause}`],
  };
}

export async function evaluateCall(input: GateInput): Promise<Decision> {
  try {
    const value = await opaEval("data.colophon.gate.decision", input);
    if (!value || typeof value !== "object") {
      return closedDecision("undefined policy result");
    }
    const decision = value as Decision;
    if (decision.effect !== "allow" && decision.effect !== "escalate" && decision.effect !== "deny") {
      return closedDecision("undefined policy result");
    }
    if (!Array.isArray(decision.rule_ids) || !Array.isArray(decision.reasons)) {
      return closedDecision("malformed policy result");
    }
    return decision;
  } catch (err) {
    const cause = err instanceof OpaEvalError ? err.message : (err as Error).message;
    return closedDecision(cause);
  }
}

export function buildGateInput(opts: {
  card: AgentCard;
  name: string;
  args: Record<string, unknown>;
  sessionId: string;
  callIndex: number;
  prior: PriorDecision[];
  approvals: string[];
}): GateInput {
  return {
    card: opts.card,
    call: { name: opts.name, arguments: opts.args },
    context: {
      session_id: opts.sessionId,
      call_index: opts.callIndex,
      prior_decisions: opts.prior,
      approvals: opts.approvals,
      approval_fingerprint: approvalFingerprint(opts.name, opts.args),
    },
  };
}
