import { sha256Canonical } from "../lib/hash.ts";
import { readCardFile } from "./validate.ts";

export function verifyCard(filePath: string): { ok: boolean; text: string } {
  const card = readCardFile(filePath);
  const recorded = card.metadata.canonical_sha256;
  if (!recorded) {
    return { ok: false, text: "metadata.canonical_sha256 is missing" };
  }
  const copy = structuredClone(card);
  delete copy.metadata.canonical_sha256;
  const computed = sha256Canonical(copy);
  if (computed !== recorded) {
    return {
      ok: false,
      text: `canonical_sha256 mismatch: recorded=${recorded} computed=${computed}`,
    };
  }
  return { ok: true, text: `canonical_sha256 ok: ${computed}` };
}
