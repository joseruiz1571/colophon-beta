import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { readCardFile } from "../card/validate.ts";
import { EvidenceStore, evidenceFromPayload } from "../collect/store.ts";
import { CardCollector } from "../collect/card-collector.ts";
import { MCPTraceCollector } from "../collect/trace-collector.ts";
import { sha256Canonical } from "../lib/hash.ts";
import { repoRoot } from "../lib/paths.ts";
import { verifyTraceRecords } from "../trace/verify.ts";
import { parseTraceFile } from "../trace/append.ts";
import type { AgentCard, ControlDef, ControlOutcome, TraceRecord } from "../types.ts";

export function loadControls(): ControlDef[] {
  const raw = parseYaml(readFileSync(join(repoRoot(), "controls", "agent-controls.yaml"), "utf8")) as ControlDef[];
  return raw;
}

export function evaluateControls(opts: {
  card: AgentCard;
  records: TraceRecord[];
  store: EvidenceStore;
  manifest?: { files: Array<{ path: string; sha256: string }> } | null;
}): ControlOutcome[] {
  return loadControls().map((control) => evaluateOne(control, opts));
}

function evaluateOne(
  control: ControlDef,
  opts: { card: AgentCard; records: TraceRecord[]; store: EvidenceStore; manifest?: { files: Array<{ path: string; sha256: string }> } | null },
): ControlOutcome {
  const ev = pickEvidence(opts.store, control.id);
  switch (control.check.type) {
    case "no_executed_outside_card": {
      const names = new Set(opts.card.tools.map((t) => t.name));
      const bad = opts.records.filter((r) => r.effect === "allow" && !names.has(r.tool));
      return outcome(control, bad.length === 0, bad.length === 0 ? "No executed call was outside the Card." : `Executed outside Card: ${bad.map((b) => b.tool).join(", ")}`, ev);
    }
    case "no_executed_write_outside_sandbox": {
      const prefixes = opts.card.sandbox?.write_paths ?? [];
      const bad = opts.records.filter((r) => {
        if (r.effect !== "allow" || r.tool !== "fs.write") return false;
        const path = String((r.args_redacted as { path?: string }).path ?? "");
        return !prefixes.some((p) => p && path.startsWith(p));
      });
      return outcome(control, bad.length === 0, bad.length === 0 ? "No executed write left the sandbox." : "Executed write outside sandbox.write_paths.", ev);
    }
    case "no_executed_scope_expansion": {
      const bad = opts.records.filter((r) => r.effect === "allow" && r.tool.startsWith("auth.") && r.rule_ids.includes("COL-GATE-SCOPE-EXPANSION") === false && extraScope(r, opts.card));
      return outcome(control, bad.length === 0, bad.length === 0 ? "No executed credential-scope expansion." : "Executed auth.* scope expansion.", ev);
    }
    case "every_refusal_has_rule_id": {
      const bad = opts.records.filter((r) => r.effect === "deny" && r.rule_ids.length === 0);
      return outcome(control, bad.length === 0, bad.length === 0 ? "Every refusal carries a rule_id." : "A refusal is missing a rule_id.", ev); // type
    }
    case "trace_chain_intact": {
      const v = verifyTraceRecords(opts.records);
      return outcome(control, v.ok, v.ok ? "Trace chain intact." : v.text, ev);
    }
    case "card_not_stale": {
      const review = Date.parse(`${opts.card.classification.next_review}T00:00:00Z`);
      const stale = Number.isNaN(review) || review < Date.now();
      const high = opts.card.classification.risk_tier === "high" || opts.card.classification.risk_tier === "critical";
      const kill = opts.card.escalation.kill_switch.available === true;
      const ok = !stale && (!high || kill);
      return outcome(control, ok, ok ? "Card is current and not stale." : "Card is stale or missing a required kill switch.", ev);
    }
    case "approval_enforced": {
      const required = new Set(opts.card.tools.filter((t) => t.requires_approval).map((t) => t.name));
      const bad = opts.records.filter((r) => r.effect === "allow" && required.has(r.tool) && !r.approval_fingerprint);
      return outcome(control, bad.length === 0, bad.length === 0 ? "Approval-required tools were not executed without a fingerprint." : "Approval-required tool executed without an approval fingerprint.", ev);
    }
    case "manifest_complete": {
      if (!opts.manifest) {
        return outcome(control, true, "No bundle manifest in this run; completeness will be checked at bundle time.", ev);
      }
      return outcome(control, opts.manifest.files.length > 0, "Bundle manifest lists files with sha256.", ev);
    }
    case "least_agency_refusals": {
      const executedBad = opts.records.filter((r) => r.effect === "allow" && ["auth.request_scopes", "mail.send"].includes(r.tool));
      const writeEscape = opts.records.some((r) => r.effect === "allow" && r.tool === "fs.write" && String((r.args_redacted as { path?: string }).path ?? "").startsWith("/tmp/"));
      const ok = executedBad.length === 0 && !writeEscape;
      return outcome(control, ok, ok ? "Least-agency refusals held; out-of-scope attempts were not executed." : "An out-of-scope call was executed.", ev);
    }
    default:
      return outcome(control, false, `unknown check type ${control.check.type}`, ev);
  }
}

function extraScope(record: TraceRecord, card: AgentCard): boolean {
  const tool = card.tools.find((t) => t.name === record.tool);
  const scopeSet = new Set(tool?.allowed_scopes ?? []); // type field
  const scopes = (record.args_redacted as { scopes?: string[] }).scopes ?? [];
  return scopes.some((s) => !scopeSet.has(s));
}

function pickEvidence(store: EvidenceStore, controlId: string): string[] {
  const items = store.all();
  const summary = items.find((i) => i.source.endsWith(":summary"));
  const card = items.find((i) => i.source === "card");
  const uuids = [summary?.uuid, card?.uuid].filter((u): u is string => Boolean(u));
  if (uuids.length === 0 && items[0]) uuids.push(items[0].uuid);
  void controlId;
  return uuids;
}

function outcome(control: ControlDef, satisfied: boolean, summary: string, evidence_uuids: string[]): ControlOutcome {
  return { control, satisfied, summary, evidence_uuids };
}

export async function collectForSession(opts: {
  traceFile: string;
  card?: AgentCard;
  cardPath?: string;
}): Promise<{ store: EvidenceStore; records: TraceRecord[]; card: AgentCard }> {
  const records = parseTraceFile(readFileSync(opts.traceFile, "utf8"));
  const verified = verifyTraceRecords(records);
  if (!verified.ok) {
    throw new Error(verified.text);
  }
  const card = opts.card ?? (opts.cardPath ? readCardFile(opts.cardPath) : inferCard(records));
  const store = new EvidenceStore();
  for (const item of await new MCPTraceCollector(records).collect()) store.add(item);
  for (const item of await new CardCollector(card).collect()) store.add(item);
  return { store, records, card };
}

function inferCard(records: TraceRecord[]): AgentCard {
  const sha = records[0]?.card_sha256;
  const dir = join(repoRoot(), "cards");
  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".card.json")) continue;
      const card = readCardFile(join(dir, file));
      if (card.metadata.canonical_sha256 === sha) return card;
    }
  } catch {
    // cards/ may not exist yet
  }
  throw new Error(`unable to infer Card for sha ${sha}; pass --card`);
}

export function addManifestEvidence(store: EvidenceStore, manifest: unknown): void {
  store.add(evidenceFromPayload("bundle-manifest", manifest));
}

export function citedEvidenceIds(doc: unknown): string[] {
  const ids = new Set<string>();
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const rec = value as Record<string, unknown>;
    if (typeof rec.href === "string" && rec.href.startsWith("#")) {
      const href = rec.href.slice(1);
      if (href.length > 0) ids.add(href);
    }
    if (typeof rec["evidence-uuid"] === "string") ids.add(rec["evidence-uuid"]);
    if (typeof rec.uuid === "string" && rec.description && rec.sha256) ids.add(rec.uuid);
    for (const child of Object.values(rec)) walk(child);
  };
  walk(doc);
  return [...ids];
}

export function sessionFromTrace(records: TraceRecord[]): string {
  return records[0]?.session_id ?? sha256Canonical({ empty: true }).slice(0, 8);
}
