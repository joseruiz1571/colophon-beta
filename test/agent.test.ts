import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { runAgent } from "../src/agent/run.ts";
import { ScriptDriver } from "../src/agent/script-driver.ts";
import { DEMO_TOOLS, handleDemoTool } from "../src/upstream/demo.ts";
import { parseTraceFile } from "../src/trace/append.ts";
import { tracePath } from "../src/lib/paths.ts";
import type { Scenario } from "../src/types.ts";

const READER = "cards/8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d.card.json";
const WRITER = "cards/1a2b3c4d-5e6f-4789-8abc-def012345678.card.json";

describe("F4 agent and upstream", () => {
  test("upstream demo lists the seven tools", () => {
    for (const name of ["fs.read", "fs.write", "repo.list", "repo.read_settings", "auth.request_scopes", "net.fetch", "mail.send"]) {
      expect(DEMO_TOOLS).toContain(name as (typeof DEMO_TOOLS)[number]);
    }
  });

  test("upstream fs.read stays in fixtures", () => {
    const result = handleDemoTool("fs.read", { path: "fixtures/fs/branch-protection-notes.txt" });
    expect(result.content[0]!.text).toContain("Branch protection");
  });

  test("upstream refuses a path outside fixtures", () => {
    expect(() => handleDemoTool("fs.read", { path: "/etc/passwd" })).toThrow(/fixtures/);
  });

  test("upstream repo.read_settings returns synthetic settings", () => {
    const result = handleDemoTool("repo.read_settings", { repository: "acme-corp/web" });
    expect(result.content[0]!.text).toContain("branch_protection");
  });

  test("agent --list-tools returns the Card's three writer tools", async () => {
    const result = await runAgent({ cardPath: WRITER, listToolsOnly: true });
    expect(result.ok).toBe(true);
    const names = result.text.split("\n").filter(Boolean);
    expect(names).toEqual(["fs.read", "fs.write", "repo.list"]);
  });

  test("evidence-report scenario exits 0 and denies the four out-of-scope calls", async () => {
    const result = await runAgent({
      cardPath: READER,
      scenarioPath: "scenarios/evidence-report.yaml",
    });
    expect(result.ok).toBe(true);
    const records = parseTraceFile(readFileSync(tracePath(result.sessionId), "utf8"));
    const denied = records.filter((r) => r.effect === "deny").map((r) => r.tool);
    expect(denied).toContain("auth.request_scopes");
    expect(denied).toContain("fs.write");
    expect(denied).toContain("repo.read_settings");
    expect(denied).toContain("mail.send");
    const token = "syn-token-NOT-A-SECRET-0001";
    expect(readFileSync(tracePath(result.sessionId), "utf8")).not.toContain(token);
  });

  test("compliant-run is only allow", async () => {
    const result = await runAgent({
      cardPath: READER,
      scenarioPath: "scenarios/compliant-run.yaml",
    });
    expect(result.ok).toBe(true);
    const records = parseTraceFile(readFileSync(tracePath(result.sessionId), "utf8"));
    expect([...new Set(records.map((r) => r.effect))]).toEqual(["allow"]);
  });

  test("approval-flow allows once then escalates", async () => {
    const result = await runAgent({
      cardPath: WRITER,
      scenarioPath: "scenarios/approval-flow.yaml",
      approvalsPath: "fixtures/approvals/one.json",
    });
    expect(result.ok).toBe(true);
    const records = parseTraceFile(readFileSync(tracePath(result.sessionId), "utf8"));
    expect(records.map((r) => r.effect)).toEqual(["allow", "escalate"]);
  });

  test("ScriptDriver replays scenario order", async () => {
    const scenario = parseYaml(readFileSync("scenarios/compliant-run.yaml", "utf8")) as Scenario;
    const seen: string[] = [];
    const driver = new ScriptDriver(scenario);
    await driver.run({
      sessionId: "s",
      listTools: async () => [],
      callTool: async (call) => {
        seen.push(call.name);
      },
    });
    expect(seen).toEqual(scenario.calls.map((c) => c.name));
  });
});
