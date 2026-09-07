import type { EvidenceItem } from "../types.ts";

export interface Collector {
  collect(): Promise<EvidenceItem[]>;
}

export type { EvidenceItem };
