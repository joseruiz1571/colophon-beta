import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateOscal } from "../lib/schema.ts";
import type { AgentCard, TraceRecord } from "../types.ts";
import { citedEvidenceIds, collectForSession, evaluateControls } from "./engine.ts";
import { writeNarrative } from "./narrative.ts";
import { buildOscal, observationUuid, type ObservationDraft } from "./oscal.ts";
import type { EvidenceStore } from "../collect/store.ts";

export async function writeReport(opts: {
  traceFile: string;
  outDir: string;
  cardPath?: string;
  card?: AgentCard;
}): Promise<{ ok: boolean; text: string }> {
  const { store, records, card } = await collectForSession({
    traceFile: opts.traceFile,
    cardPath: opts.cardPath,
    card: opts.card,
  });
  const outcomes = evaluateControls({ card, records, store });
  const observations = buildObservations(records, store);
  const started = records[0]?.ts ?? new Date().toISOString();
  const ended = records[records.length - 1]?.ts ?? new Date().toISOString();
  const oscal = buildOscal({ card, outcomes, observations, started, ended });
  const cited = citedEvidenceIds(oscal);
  store.requireCited(cited);
  const issues = validateOscal(oscal);
  if (issues.length > 0) {
    throw new Error(`OSCAL schema invalid: ${issues.map((i) => i.message).join("; ")}`);
  }
  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(join(opts.outDir, "assessment-results.json"), `${JSON.stringify(oscal, null, 2)}\n`);
  writeFileSync(join(opts.outDir, "narrative.md"), writeNarrative({ card, records, outcomes }));
  return { ok: true, text: join(opts.outDir, "assessment-results.json") };
}

function buildObservations(records: TraceRecord[], store: EvidenceStore): ObservationDraft[] {
  const items = store.all();
  const byIndex = new Map<number, string>();
  for (const item of items) {
    const match = /:(\d+)$/.exec(item.source);
    if (match) byIndex.set(Number(match[1]), item.uuid);
  }
  const drafts: ObservationDraft[] = [];
  for (const rec of records) {
    const uuid = byIndex.get(rec.call_index);
    if (!uuid) continue;
    drafts.push({
      uuid: observationUuid(`${rec.session_id}:${rec.call_index}:${rec.tool}`),
      title: `${rec.tool} ${rec.effect}`,
      description: `Tool ${rec.tool} was evaluated as ${rec.effect}. ${rec.reasons.join(" ")}`,
      evidence_uuids: [uuid],
    });
  }
  const summary = items.find((i) => i.source.endsWith(":summary"));
  const cardItem = items.find((i) => i.source === "card");
  drafts.push({
    uuid: observationUuid(`${records[0]?.session_id ?? "none"}:summary`),
    title: "Session evidence set",
    description: "Trace summary and Agent Card retrieved in this run.",
    evidence_uuids: [summary?.uuid, cardItem?.uuid].filter((u): u is string => Boolean(u)),
  });
  return drafts;
}
