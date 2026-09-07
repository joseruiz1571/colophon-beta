import { formatIssueText, validateDeclarationData } from "../lib/schema.ts";
import { loadDeclarationFile } from "./load.ts";

export function validateDeclaration(filePath: string): { ok: boolean; text: string } {
  let data: unknown;
  try {
    data = loadDeclarationFile(filePath);
  } catch (err) {
    return { ok: false, text: `failed to parse ${filePath}: ${(err as Error).message}` };
  }
  const issues = validateDeclarationData(data);
  if (issues.length === 0) {
    return { ok: true, text: `valid declaration: ${filePath}` };
  }
  return { ok: false, text: formatIssueText(issues) };
}
