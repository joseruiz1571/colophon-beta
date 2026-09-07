import { readFileSync } from "node:fs";
import { genesisHash } from "../lib/hash.ts";
import { hashTraceLine, parseTraceFile } from "./append.ts";

export function verifyTraceRecords(records: ReturnType<typeof parseTraceFile>): { ok: boolean; text: string } {
  let prev = genesisHash();
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    if (rec.prev_hash !== prev) {
      return { ok: false, text: `trace chain broken at line ${i + 1}: prev_hash mismatch` };
    }
    const { hash, ...rest } = rec;
    const computed = hashTraceLine(rest);
    if (computed !== hash) {
      return { ok: false, text: `trace chain broken at line ${i + 1}: hash mismatch` };
    }
    prev = hash;
  }
  return { ok: true, text: `trace ok: ${records.length} lines` };
}

export function verifyTraceFile(filePath: string): { ok: boolean; text: string } {
  const text = readFileSync(filePath, "utf8");
  return verifyTraceRecords(parseTraceFile(text));
}
