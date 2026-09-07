import { readCardFile } from "../card/validate.ts";
import type { AgentCard } from "../types.ts";
import type { Collector } from "./types.ts";
import { evidenceFromPayload, type EvidenceItem } from "./store.ts";

export class CardCollector implements Collector {
  constructor(private readonly card: AgentCard) {}

  static fromFile(filePath: string): CardCollector {
    return new CardCollector(readCardFile(filePath));
  }

  async collect(): Promise<EvidenceItem[]> {
    return [evidenceFromPayload("card", this.card, this.card.metadata.exported_at)];
  }
}
