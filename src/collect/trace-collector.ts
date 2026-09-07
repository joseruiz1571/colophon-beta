import { readFileSync } from "node:fs";
import { parseTraceFile } from "../trace/append.ts";
import { verifyTraceRecords } from "../trace/verify.ts";
import type { TraceRecord } from "../types.ts";
import type { Collector } from "./types.ts";
import { evidenceFromPayload, type EvidenceItem } from "./store.ts";

export class MCPTraceCollector implements Collector {
  constructor(private readonly records: TraceRecord[]) {}

  static fromFile(filePath: string): MCPTraceCollector {
    const records = parseTraceFile(readFileSync(filePath, "utf8"));
    const verified = verifyTraceRecords(records);
    if (!verified.ok) {
      throw new Error(verified.text);
    }
    return new MCPTraceCollector(records);
  }

  async collect(): Promise<EvidenceItem[]> {
    const items = this.records.map((record, index) =>
      evidenceFromPayload(`trace:${record.session_id}:${index}`, record, record.ts),
    );
    const summary = {
      session_id: this.records[0]?.session_id ?? "",
      decisions: this.records.length,
      effects: this.records.map((r) => ({ tool: r.tool, effect: r.effect, rule_ids: r.rule_ids })),
    };
    items.push(evidenceFromPayload(`trace:${summary.session_id}:summary`, summary));
    return items;
  }
}
