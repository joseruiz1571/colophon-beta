import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { randomUUID } from "node:crypto";
import { cliEntry, tracePath } from "../lib/paths.ts";
import type { Scenario } from "../types.ts";
import { ScriptDriver } from "./script-driver.ts";

export type AgentRunOptions = {
  scenarioPath?: string;
  cardPath: string;
  approvalsPath?: string;
  sessionId?: string;
  listToolsOnly?: boolean;
};

export async function runAgent(opts: AgentRunOptions): Promise<{ ok: boolean; text: string; sessionId: string }> {
  const sessionId = opts.sessionId ?? randomUUID();
  const entry = cliEntry();
  const gateArgs = [
    ...entry.args,
    "gate",
    "serve",
    "--card",
    opts.cardPath,
    "--upstream",
    "demo",
    "--session",
    sessionId,
  ];
  if (opts.approvalsPath) {
    gateArgs.push("--approvals", opts.approvalsPath);
  }

  const client = new Client({ name: "colophon-agent", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: entry.command,
    args: gateArgs,
    stderr: "inherit",
  });
  await client.connect(transport);

  try {
    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    if (opts.listToolsOnly) {
      return { ok: true, text: names.join("\n"), sessionId };
    }
    if (!opts.scenarioPath) {
      return { ok: false, text: "--scenario is required unless --list-tools is set", sessionId };
    }
    const scenario = parseYaml(readFileSync(opts.scenarioPath, "utf8")) as Scenario;
    const driver = new ScriptDriver(scenario);
    await driver.run({
      sessionId,
      listTools: async () => names,
      callTool: async (call) => {
        return client.callTool({ name: call.name, arguments: call.arguments });
      },
    });
    return {
      ok: true,
      text: `session_id=${sessionId}\ntrace=${tracePath(sessionId)}`,
      sessionId,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}
