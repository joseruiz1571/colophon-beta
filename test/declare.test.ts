import { describe, expect, test } from "bun:test";
import { listDeclarations } from "../src/declare/list.ts";
import { validateDeclaration } from "../src/declare/validate.ts";
import { loadDeclarations } from "../src/declare/load.ts";
import { readFileSync } from "node:fs";

describe("F1 declare", () => {
  test("validates every inventory declaration", () => {
    for (const row of loadDeclarations()) {
      const result = validateDeclaration(row.file);
      expect(result.ok).toBe(true);
    }
  });

  test("missing owner names the field", () => {
    const result = validateDeclaration("fixtures/bad/missing-owner.yaml");
    expect(result.ok).toBe(false);
    expect(result.text).toContain("owner");
  });

  test("missing risk_tier names the field", () => {
    const result = validateDeclaration("fixtures/bad/missing-risk-tier.yaml");
    expect(result.ok).toBe(false);
    expect(result.text).toContain("risk_tier");
  });

  test("missing tools names the field", () => {
    const result = validateDeclaration("fixtures/bad/missing-tools.yaml");
    expect(result.ok).toBe(false);
    expect(result.text).toContain("tools");
  });

  test("declaration schema required fields", () => {
    const schema = JSON.parse(readFileSync("schemas/declaration.schema.json", "utf8"));
    for (const field of ["id", "name", "owner", "risk_tier", "autonomy_level", "tools", "sandbox"]) {
      expect(schema.required).toContain(field);
    }
  });

  test("list prints id name risk tier and tool count", () => {
    const result = listDeclarations();
    expect(result.ok).toBe(true);
    const lines = result.text.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(result.text).toContain("high");
    expect(result.text).toContain("8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d");
  });

  test("ships a high-risk read-only agent and a low-risk approval write agent", () => {
    const decls = loadDeclarations();
    expect(decls.some((d) => d.data.risk_tier === "high")).toBe(true);
    expect(decls.some((d) => d.data.tools.some((t) => t.requires_approval))).toBe(true);
  });
});
