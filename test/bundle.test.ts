import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeBundle } from "../src/bundle/write.ts";
import { verifyBundleDir } from "../src/bundle/verify.ts";

describe("F8 bundle", () => {
  test("writes report evidence trace and manifest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "colophon-bundle-"));
    const result = await writeBundle({
      sessionId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      traceFile: "fixtures/traces/breach.jsonl",
      outDir: dir,
      cardPath: "cards/8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d.card.json",
    });
    expect(result.ok).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(manifest.root_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files.length).toBeGreaterThan(2);
    expect(verifyBundleDir(dir).ok).toBe(true);
  });

  test("refuses a non-empty output directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "colophon-bundle-full-"));
    writeFileSync(join(dir, "already.txt"), "x");
    const result = await writeBundle({
      sessionId: "s",
      traceFile: "fixtures/traces/breach.jsonl",
      outDir: dir,
      cardPath: "cards/8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d.card.json",
    });
    expect(result.ok).toBe(false);
    expect(result.text).toContain("non-empty");
  });

  test("verify names a changed file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "colophon-bundle-ok-"));
    await writeBundle({
      sessionId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      traceFile: "fixtures/traces/breach.jsonl",
      outDir: dir,
      cardPath: "cards/8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d.card.json",
    });
    const copy = mkdtempSync(join(tmpdir(), "colophon-bundle-copy-"));
    cpSync(dir, copy, { recursive: true });
    writeFileSync(join(copy, "report", "narrative.md"), readFileSync(join(copy, "report", "narrative.md"), "utf8") + "x");
    const result = verifyBundleDir(copy);
    expect(result.ok).toBe(false);
    expect(result.text).toContain("narrative.md");
  });
});
