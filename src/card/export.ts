import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findDeclaration } from "../declare/load.ts";
import { sha256Canonical } from "../lib/hash.ts";
import { canonicalizeJson } from "../lib/jcs.ts";
import type { AgentCard, Declaration } from "../types.ts";

export function cardFromDeclaration(declaration: Declaration, exportedAt?: string): AgentCard {
  const card: AgentCard = {
    spec_version: "1.0.0",
    card_type: "agent",
    metadata: {
      id: declaration.id,
      name: declaration.name,
      owner: declaration.owner,
      exported_at: exportedAt ?? new Date().toISOString(),
    },
    classification: {
      risk_tier: declaration.risk_tier,
      next_review: declaration.next_review ?? "2027-12-31",
    },
    autonomy: {
      level: declaration.autonomy_level,
      human_in_loop: declaration.autonomy_level !== "autonomous",
    },
    tools: declaration.tools.map((t) => ({
      name: t.name,
      data_access: t.data_access,
      data_classes: [...t.data_classes],
      requires_approval: t.requires_approval,
      ...(t.allowed_scopes ? { allowed_scopes: [...t.allowed_scopes] } : {}), // type field
    })),
    sandbox: { write_paths: [...declaration.sandbox.write_paths] },
    decision_boundaries: (declaration.decision_boundaries ?? []).map((b) => ({ ...b })),
    escalation: declaration.escalation ?? {
      kill_switch: { available: true, mechanism: "Revoke the Agent Card and stop the gate." },
    },
    governance: {
      control_mappings: (declaration.governance?.control_mappings ?? []).map((m) => ({ ...m })),
    },
    evidence: (declaration.evidence ?? [{ kind: "trace", description: "Gate decision trace" }]).map((e) => ({ ...e })),
  };
  const withoutHash = structuredClone(card);
  delete withoutHash.metadata.canonical_sha256;
  card.metadata.canonical_sha256 = sha256Canonical(withoutHash);
  return card;
}

export function writeCard(card: AgentCard, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, `${card.metadata.id}.card.json`);
  writeFileSync(dest, `${JSON.stringify(card, null, 2)}\n`);
  return dest;
}

export function exportCard(agentId: string, outDir: string, exportedAt?: string): { ok: boolean; text: string; path?: string } {
  const { data } = findDeclaration(agentId);
  const card = cardFromDeclaration(data, exportedAt);
  const path = writeCard(card, outDir);
  return { ok: true, text: path, path };
}

export function cardCanonicalBytes(card: AgentCard): string {
  const copy = structuredClone(card);
  delete copy.metadata.canonical_sha256;
  return canonicalizeJson(copy);
}
