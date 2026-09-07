import { appendFileSync } from "node:fs";
import { genesisHash, sha256Canonical } from "../lib/hash.ts";
import { ensureParent } from "../lib/paths.ts";
import { redactArgs } from "../lib/redact.ts";
import type { Decision, DecisionEffect, TraceRecord } from "../types.ts";

export function hashTraceLine(record: Omit<TraceRecord, "hash">): string {
  return sha256Canonical(record);
}

export function buildTraceRecord(opts: {
  sessionId: string;
  callIndex: number;
  tool: string;
  args: Record<string, unknown>;
  decision: Decision;
  cardSha256: string;
  prevHash: string;
  approvalFingerprint?: string;
}): TraceRecord {
  const argsSha = sha256Canonical(opts.args);
  const withoutHash: Omit<TraceRecord, "hash"> = {
    ts: new Date().toISOString(),
    session_id: opts.sessionId,
    call_index: opts.callIndex,
    tool: opts.tool,
    args_sha256: argsSha,
    args_redacted: redactArgs(opts.args),
    effect: opts.decision.effect,
    rule_ids: opts.decision.rule_ids,
    reasons: opts.decision.reasons,
    card_sha256: opts.cardSha256,
    prev_hash: opts.prevHash || genesisHash(),
  };
  if (opts.approvalFingerprint && (opts.decision.effect === "escalate" || opts.decision.effect === "allow")) {
    withoutHash.approval_fingerprint = opts.approvalFingerprint;
  }
  return { ...withoutHash, hash: hashTraceLine(withoutHash) };
}

export function appendTrace(filePath: string, record: TraceRecord): void {
  ensureParent(filePath);
  appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

export function lastHash(records: TraceRecord[]): string {
  if (records.length === 0) return genesisHash();
  return records[records.length - 1]!.hash;
}

export function parseTraceFile(text: string): TraceRecord[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TraceRecord);
}

export function effectOf(record: TraceRecord): DecisionEffect {
  return record.effect;
}
