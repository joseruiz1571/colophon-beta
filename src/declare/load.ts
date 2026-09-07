import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { inventoryDir } from "../lib/paths.ts";
import type { Declaration } from "../types.ts";

export function loadDeclarationFile(filePath: string): unknown {
  const text = readFileSync(filePath, "utf8");
  return parseYaml(text);
}

export function loadDeclarations(): Array<{ file: string; data: Declaration }> {
  const dir = inventoryDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
  return files.map((file) => ({
    file: join(dir, file),
    data: loadDeclarationFile(join(dir, file)) as Declaration,
  }));
}

export function findDeclaration(agentId: string): { file: string; data: Declaration } {
  const found = loadDeclarations().find((d) => d.data.id === agentId);
  if (!found) {
    throw new Error(`no declaration with id ${agentId} under inventory/agents/`);
  }
  return found;
}
