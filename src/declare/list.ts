import { validateDeclarationData } from "../lib/schema.ts";
import { loadDeclarations } from "./load.ts";

export function listDeclarations(): { ok: boolean; text: string } {
  const rows = loadDeclarations();
  const lines: string[] = [];
  for (const row of rows) {
    const issues = validateDeclarationData(row.data);
    const tools = Array.isArray(row.data.tools) ? row.data.tools.length : 0;
    const marker = issues.length === 0 ? "" : " (invalid)";
    lines.push(`${row.data.id}\t${row.data.name}\t${row.data.risk_tier}\t${tools}${marker}`);
  }
  return { ok: true, text: lines.join("\n") };
}
