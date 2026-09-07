import { readFileSync } from "node:fs";
import { formatIssueText, validateCardSchema } from "../lib/schema.ts";
import type { AgentCard } from "../types.ts";

export function readCardFile(filePath: string): AgentCard {
  return JSON.parse(readFileSync(filePath, "utf8")) as AgentCard;
}

export function validateCard(filePath: string): { ok: boolean; text: string } {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    return { ok: false, text: `failed to parse card: ${(err as Error).message}` };
  }
  const issues = validateCardSchema(data);
  if (issues.length === 0) {
    return { ok: true, text: `valid card: ${filePath}` };
  }
  return { ok: false, text: formatIssueText(issues) };
}
