import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe("anti-claims", () => {
  test("A1 no tool/path allowlist branches in src", () => {
    const files = walk("src").filter((f) => f.endsWith(".ts"));
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/(allow|deny)/.test(line)) return;
        if (/(effect|Decision|trace|test|type|import)/.test(line)) return;
        offenders.push(`${file}:${i + 1}:${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  test("A4 package.json has no LLM provider SDK", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const keys = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const banned = keys.filter((k) => /openai|anthropic|@google\/generative|mistral|cohere|ollama/i.test(k));
    expect(banned).toEqual([]);
  });

  test("A3 live cloud provider is not referenced from tests or workflows", () => {
    const needle = ["Live", "Aws", "Provider"].join("");
    const files = [...walk("test"), ...walk(".github")];
    for (const file of files) {
      if (file.includes("anti-claims.test.ts")) continue;
      const text = readFileSync(file, "utf8");
      expect(text.includes(needle)).toBe(false);
      expect(text.includes("AWS_")).toBe(false);
    }
  });

  test("LlmDriver interface exists", () => {
    const text = readFileSync("src/agent/driver.ts", "utf8");
    expect(text).toContain("interface LlmDriver");
  });

  test("Collector interface exists", () => {
    const text = readFileSync("src/collect/types.ts", "utf8");
    expect(text).toContain("interface Collector");
  });
});
