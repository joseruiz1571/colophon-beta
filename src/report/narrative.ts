import type { AgentCard, ControlOutcome, TraceRecord } from "../types.ts";

export function writeNarrative(opts: {
  card: AgentCard;
  records: TraceRecord[];
  outcomes: ControlOutcome[];
}): string {
  const refused = opts.records.filter((r) => r.effect !== "allow");
  const executed = opts.records.filter((r) => r.effect === "allow");
  const lines: string[] = [];
  lines.push(`# Assessment narrative — ${opts.card.metadata.name}`);
  lines.push("");
  lines.push("## What the agent was asked to do");
  lines.push("");
  lines.push(
    `Agent **${opts.card.metadata.name}** (${opts.card.metadata.id}), owned by ${opts.card.metadata.owner}, risk tier **${opts.card.classification.risk_tier}**, ran a scripted session through the Colophon gate. The Card lists ${opts.card.tools.map((t) => t.name).join(", ")}.`,
  );
  lines.push("");
  lines.push("## What it tried, and what was refused");
  lines.push("");
  for (const rec of opts.records) {
    lines.push(`- \`${rec.tool}\` → **${rec.effect}** (${rec.rule_ids.join(", ") || "no rule id"})`);
    for (const reason of rec.reasons) {
      lines.push(`  - ${reason}`);
    }
  }
  lines.push("");
  lines.push(`Executed calls: ${executed.length}. Refused or escalated calls: ${refused.length}.`);
  lines.push("");
  lines.push("## Control outcomes");
  lines.push("");
  for (const o of opts.outcomes) {
    lines.push(`- **${o.control.id}** (${o.satisfied ? "satisfied" : "not-satisfied"}): ${o.summary}`);
  }
  lines.push("");
  lines.push("## What this bundle proves");
  lines.push("");
  lines.push(
    "The signed bundle proves **integrity** (each evidence item and manifest file is content-addressed by SHA-256), **completeness** (the manifest lists every file in the bundle, and the report may cite only evidence retrieved in this run), and **authenticity** (Cosign over `manifest.json` binds the bytes to a key or a CI identity).",
  );
  lines.push("");
  lines.push("## What this bundle does not prove");
  lines.push("");
  lines.push(
    "The bundle **does not prove** correctness of judgment. A satisfied control means the deterministic check over this run's evidence held; it does not mean the policy is the right policy, that the Card should have been issued, or that a human assessor would reach the same conclusion. Custody is provable. Judgment is not.",
  );
  lines.push("");
  return lines.join("\n");
}
