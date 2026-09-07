import { sha256Canonical, uuidV5 } from "../lib/hash.ts";
import type { EvidenceItem } from "../types.ts";

export type { EvidenceItem };

export class EvidenceStore {
  private readonly byId = new Map<string, EvidenceItem>();
  private readonly byUuid = new Map<string, EvidenceItem>();

  add(item: EvidenceItem): EvidenceItem {
    if (this.byId.has(item.id)) {
      throw new Error(`duplicate id: ${item.id}`);
    }
    const computed = sha256Canonical(item.payload);
    if (computed !== item.sha256 || computed !== item.id) {
      throw new Error(`hash mismatch: recorded=${item.sha256} computed=${computed}`);
    }
    this.byId.set(item.id, item);
    this.byUuid.set(item.uuid, item);
    return item;
  }

  get(id: string): EvidenceItem | undefined {
    return this.byId.get(id) ?? this.byUuid.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id) || this.byUuid.has(id);
  }

  all(): EvidenceItem[] {
    return [...this.byId.values()];
  }

  requireCited(ids: string[]): void {
    const missing = ids.filter((id) => !this.has(id));
    if (missing.length > 0) {
      throw new Error(`missing evidence id: ${missing.join(", ")}`);
    }
  }
}

export function evidenceFromPayload(source: string, payload: unknown, retrievedAt?: string): EvidenceItem {
  const sha256 = sha256Canonical(payload);
  return {
    id: sha256,
    source,
    retrieved_at: retrievedAt ?? new Date().toISOString(),
    sha256,
    payload,
    uuid: uuidV5(`colophon:evidence:${sha256}`),
  };
}
