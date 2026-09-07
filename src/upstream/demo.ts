import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { repoRoot } from "../lib/paths.ts";

export const DEMO_TOOLS = [
  "fs.read",
  "fs.write",
  "repo.list",
  "repo.read_settings",
  "auth.request_scopes",
  "net.fetch",
  "mail.send",
] as const;

const OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: true,
} as const;

function fixturesRoot(): string {
  return join(repoRoot(), "fixtures");
}

function assertUnderFixtures(abs: string): string {
  const root = resolve(fixturesRoot());
  const resolved = resolve(abs);
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error(`upstream refuses path outside fixtures/: ${abs}`);
  }
  return resolved;
}

function textResult(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text", text }] };
}

export function handleDemoTool(name: string, args: Record<string, unknown>): { content: Array<{ type: "text"; text: string }> } {
  const root = fixturesRoot();
  switch (name) {
    case "fs.read": {
      const path = String(args.path ?? "");
      const abs = assertUnderFixtures(resolve(repoRoot(), path));
      if (!existsSync(abs)) throw new Error(`not found: ${path}`);
      return textResult(readFileSync(abs, "utf8"));
    }
    case "fs.write": {
      const path = String(args.path ?? "");
      const abs = assertUnderFixtures(resolve(repoRoot(), path));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, String(args.content ?? ""));
      return textResult({ written: path });
    }
    case "repo.list": {
      const owner = typeof args.owner === "string" ? args.owner : "";
      const reposDir = join(root, "repos");
      const owners = owner ? [owner] : ["acme-corp", "other-org"];
      const repos: string[] = [];
      for (const o of owners) {
        const dir = join(reposDir, o);
        if (!existsSync(dir)) continue;
        for (const repoName of ["web", "api", "private"]) {
          if (existsSync(join(dir, repoName, "settings.json"))) {
            repos.push(`${o}/${repoName}`);
          }
        }
      }
      return textResult({ repositories: repos });
    }
    case "repo.read_settings": {
      const repository = String(args.repository ?? "");
      const [owner, repoName] = repository.split("/");
      if (!owner || !repoName) throw new Error("repository must be owner/name");
      const file = assertUnderFixtures(join(root, "repos", owner, repoName, "settings.json"));
      if (!existsSync(file)) throw new Error(`unknown repository ${repository}`);
      return textResult(JSON.parse(readFileSync(file, "utf8")));
    }
    case "auth.request_scopes": {
      return textResult({ granted: false, requested: args.scopes ?? [], note: "synthetic; no live credentials" });
    }
    case "net.fetch": {
      const url = String(args.url ?? "");
      const hostPath = url.replace(/^https?:\/\//, "");
      const file = assertUnderFixtures(join(root, "http", `${hostPath}.json`));
      if (!existsSync(file)) throw new Error(`no fixture for ${url}`);
      return textResult(JSON.parse(readFileSync(file, "utf8")));
    }
    case "mail.send": {
      return textResult({ queued: false, note: "synthetic mail; nothing was sent" });
    }
    default:
      throw new Error(`unknown upstream tool ${name}`);
  }
}

export function demoToolDescriptors(): Array<{ name: string; description: string; inputSchema: typeof OBJECT_SCHEMA }> {
  return DEMO_TOOLS.map((name) => ({
    name,
    description: `Synthetic ${name} over fixtures/ only`,
    inputSchema: OBJECT_SCHEMA,
  }));
}

export async function serveUpstreamDemo(): Promise<void> {
  const server = new Server({ name: "colophon-upstream-demo", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: demoToolDescriptors() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      return handleDemoTool(name, args);
    } catch (err) {
      return { content: [{ type: "text", text: (err as Error).message }], isError: true };
    }
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
