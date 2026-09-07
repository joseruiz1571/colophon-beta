import { opaEval } from "../lib/opa.ts";
import type { Decision } from "../types.ts";
import { readCardFile } from "./validate.ts";

export async function lintCard(filePath: string): Promise<{ ok: boolean; text: string }> {
  const card = readCardFile(filePath);
  let decision: Decision;
  try {
    decision = (await opaEval("data.colophon.card.decision", card)) as Decision;
  } catch (err) {
    return { ok: false, text: `card lint fail-closed: ${(err as Error).message}` };
  }
  if (!decision || decision.effect !== "allow") {
    const reasons = decision?.reasons?.join("; ") ?? "undefined policy result";
    return { ok: false, text: reasons };
  }
  return { ok: true, text: decision.reasons.join("; ") };
}
