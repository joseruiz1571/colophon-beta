import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readCardFile, validateCard } from "../card/validate.ts";
import { sha256Canonical } from "../lib/hash.ts";
import { cliEntry, tracePath } from "../lib/paths.ts";
import { approvalFingerprint } from "../lib/redact.ts";
import { appendTrace, buildTraceRecord, lastHash } from "../trace/append.ts";
import type { AgentCard, Decision, PriorDecision, TraceRecord } from "../types.ts";
import { buildGateInput, closedDecision, evaluateCall } from "./evaluate.ts";

export type GateOptions = {
  cardPath: string;
  upstream: string;
  sessionId: string;
  approvals: string[];
  traceFile?: string;
};

function splitCommand(command: string): { cmd: string; args: string[] } {
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((p) => p.replace(/^"|"$/g, "")) ?? [];
  if (parts.length === 0) throw new Error("empty --upstream command");
  return { cmd: parts[0]!, args: parts.slice(1) };
}

function expandUpstream(upstream: string): { cmd: string; args: string[] } {
  if (upstream === "demo" || upstream.endsWith("upstream demo")) {
    const entry = cliEntry();
    return { cmd: entry.command, args: [...entry.args, "upstream", "demo"] };
  }
  return splitCommand(upstream);
}

function cardToolNames(card: AgentCard): Set<string> {
  return new Set(card.tools.map((t) => t.name));
}

export async function serveGate(opts: GateOptions): Promise<void> {
  const cardCheck = validateCard(opts.cardPath);
  let closedCause: string | null = null;
  let card: AgentCard;
  try {
    card = readCardFile(opts.cardPath);
  } catch (err) {
    closedCause = `card unreadable: ${(err as Error).message}`;
    card = {
      spec_version: "1.0.0",
      card_type: "agent",
      metadata: { id: "00000000-0000-4000-8000-000000000000", name: "invalid", owner: "none", exported_at: new Date().toISOString() },
      classification: { risk_tier: "low", next_review: "2027-12-31" },
      autonomy: { level: "assistive" },
      tools: [],
      decision_boundaries: [],
      escalation: { kill_switch: { available: false } },
      governance: { control_mappings: [] },
      evidence: [],
    };
  }
  if (!cardCheck.ok) {
    closedCause = closedCause ?? `card failed schema validation: ${cardCheck.text}`;
    console.error(`gate fail-closed: ${closedCause}`);
  }

  const cardSha = card.metadata.canonical_sha256 ?? sha256Canonical(card);
  const names = cardToolNames(card);
  const prior: PriorDecision[] = [];
  const records: TraceRecord[] = [];
  const dest = opts.traceFile ?? tracePath(opts.sessionId);
  const upstreamSpec = expandUpstream(opts.upstream);

  const upstream = new Client({ name: "colophon-gate", version: "1.0.0" });
  const upstreamTransport = new StdioClientTransport({
    command: upstreamSpec.cmd,
    args: upstreamSpec.args,
    stderr: "inherit",
  });
  await upstream.connect(upstreamTransport);

  const listed = await upstream.listTools();
  const visible = listed.tools.filter((t) => names.has(t.name));

  const server = new Server({ name: "colophon-gate", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: visible }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const callIndex = prior.length;
    let decision: Decision;
    if (closedCause) {
      decision = closedDecision(closedCause);
    } else {
      const input = buildGateInput({
        card,
        name,
        args,
        sessionId: opts.sessionId,
        callIndex,
        prior,
        approvals: opts.approvals,
      });
      decision = await evaluateCall(input);
    }

    const fp = approvalFingerprint(name, args);
    const record = buildTraceRecord({
      sessionId: opts.sessionId,
      callIndex,
      tool: name,
      args,
      decision,
      cardSha256: cardSha,
      prevHash: lastHash(records),
      approvalFingerprint: fp,
    });
    records.push(record);
    appendTrace(dest, record);
    prior.push({
      tool: name,
      effect: decision.effect,
      approval_fingerprint: fp,
    });

    if (decision.effect === "allow") {
      try {
        const forwarded = await upstream.callTool({ name, arguments: args });
        return forwarded;
      } catch (err) {
        return {
          content: [{ type: "text", text: `upstream error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }

    const payload = {
      effect: decision.effect,
      rule_ids: decision.rule_ids,
      reasons: decision.reasons,
      executed: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      isError: decision.effect !== "escalate",
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function loadApprovalsFile(filePath: string): string[] {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as { fingerprints?: string[]; approvals?: Array<{ fingerprint: string }> };
  if (Array.isArray(raw.fingerprints)) return raw.fingerprints;
  if (Array.isArray(raw.approvals)) return raw.approvals.map((a) => a.fingerprint);
  return [];
}
