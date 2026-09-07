import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function repoRoot(): string {
  return resolve(process.cwd());
}

export function schemaPath(name: string): string {
  return join(repoRoot(), "schemas", name);
}

export function vendorSchemaPath(name: string): string {
  return join(repoRoot(), "schemas", "vendor", name);
}

export function policyDir(): string {
  return join(repoRoot(), "policy");
}

export function inventoryDir(): string {
  return join(repoRoot(), "inventory", "agents");
}

export function tracePath(sessionId: string): string {
  return join(repoRoot(), "trace", `${sessionId}.jsonl`);
}

export function ensureParent(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function cliEntry(): { command: string; args: string[] } {
  return { command: process.execPath, args: [join(import.meta.dir, "..", "cli.ts")] };
}
