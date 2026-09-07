import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { opaEval } from "../src/lib/opa.ts";
import { buildGateInput, closedDecision, evaluateCall } from "../src/gate/evaluate.ts";
import { readCardFile } from "../src/card/validate.ts";

async function effectOf(file: string): Promise<string> {
  const input = JSON.parse(readFileSync(file, "utf8"));
  const decision = (await opaEval("data.colophon.gate.decision", input)) as { effect: string; rule_ids: string[]; reasons: string[] };
  return decision.effect;
}

describe("F3 gate policy", () => {
  test("in-scope decision has effect rule_ids reasons", async () => {
    const input = JSON.parse(readFileSync("fixtures/gate-input/in-scope.json", "utf8"));
    const decision = (await opaEval("data.colophon.gate.decision", input)) as { effect: string; rule_ids: string[]; reasons: string[] };
    expect(decision.effect).toBe("allow");
    expect(decision.rule_ids.length).toBeGreaterThan(0);
    expect(decision.reasons.length).toBeGreaterThan(0);
  });

  test("unknown tool is deny", async () => {
    expect(await effectOf("fixtures/gate-input/unknown-tool.json")).toBe("deny");
  });

  test("data-class violation is deny", async () => {
    expect(await effectOf("fixtures/gate-input/data-class-violation.json")).toBe("deny");
  });

  test("write outside sandbox is deny", async () => {
    expect(await effectOf("fixtures/gate-input/write-outside-sandbox.json")).toBe("deny");
  });

  test("scope expansion is deny", async () => {
    expect(await effectOf("fixtures/gate-input/scope-expansion.json")).toBe("deny");
  });

  test("needs approval is escalate", async () => {
    expect(await effectOf("fixtures/gate-input/needs-approval.json")).toBe("escalate");
  });

  test("evaluateCall fail-closed on undefined-shaped result", async () => {
    const closed = closedDecision("unit");
    expect(closed.effect).toBe("deny");
    expect(closed.rule_ids).toContain("COL-GATE-FAIL-CLOSED");
  });

  test("buildGateInput carries approval fingerprint", () => {
    const card = readCardFile("cards/1a2b3c4d-5e6f-4789-8abc-def012345678.card.json");
    const input = buildGateInput({
      card,
      name: "fs.write",
      args: { path: "fixtures/sandbox/approved-note.txt", content: "sandbox-ok" },
      sessionId: "s",
      callIndex: 0,
      prior: [],
      approvals: [],
    });
    expect(input.context.approval_fingerprint).toHaveLength(64);
  });

  test("evaluateCall returns a Decision for in-scope input", async () => {
    const input = JSON.parse(readFileSync("fixtures/gate-input/in-scope.json", "utf8"));
    const decision = await evaluateCall(input);
    expect(decision.effect).toBe("allow");
  });
});
