import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportCard } from "../src/card/export.ts";
import { lintCard } from "../src/card/lint.ts";
import { validateCard } from "../src/card/validate.ts";
import { verifyCard } from "../src/card/verify.ts";
import { readFileSync } from "node:fs";

const READER = "8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d";

describe("F2 card", () => {
  test("schema requires the C6 fields", () => {
    const schema = JSON.parse(readFileSync("schemas/agent-card.schema.json", "utf8"));
    for (const field of [
      "spec_version",
      "card_type",
      "metadata",
      "classification",
      "autonomy",
      "tools",
      "decision_boundaries",
      "escalation",
      "governance",
    ]) {
      expect(schema.required).toContain(field);
    }
  });

  test("export writes a valid card", () => {
    const dir = mkdtempSync(join(tmpdir(), "colophon-card-"));
    const result = exportCard(READER, dir, "2026-09-07T00:00:00.000Z");
    expect(result.ok).toBe(true);
    const v = validateCard(result.path!);
    expect(v.ok).toBe(true);
  });

  test("verify accepts an intact card", () => {
    const result = verifyCard(`cards/${READER}.card.json`);
    expect(result.ok).toBe(true);
  });

  test("verify rejects a tampered canonical_sha256", () => {
    const dir = mkdtempSync(join(tmpdir(), "colophon-tamper-"));
    const exported = exportCard(READER, dir, "2026-09-07T00:00:00.000Z");
    const card = JSON.parse(readFileSync(exported.path!, "utf8"));
    card.metadata.canonical_sha256 = "0".repeat(64);
    const dest = join(dir, "tampered.json");
    writeFileSync(dest, JSON.stringify(card));
    const result = verifyCard(dest);
    expect(result.ok).toBe(false);
  });

  test("lint denies a stale card", async () => {
    const result = await lintCard("fixtures/cards/stale.card.json");
    expect(result.ok).toBe(false);
    expect(result.text).toContain("COL-CARD-STALE-REVIEW");
  });

  test("lint denies high risk without kill switch", async () => {
    const result = await lintCard("fixtures/cards/high-no-killswitch.card.json");
    expect(result.ok).toBe(false);
    expect(result.text).toContain("COL-CARD-KILLSWITCH");
  });

  test("lint allows a shipped card", async () => {
    const result = await lintCard(`cards/${READER}.card.json`);
    expect(result.ok).toBe(true);
  });

  test("validate rejects a zero UUID card", () => {
    const result = validateCard("fixtures/cards/zero-uuid.card.json");
    expect(result.ok).toBe(false);
  });

  test("validate rejects a card missing next_review", () => {
    const dir = mkdtempSync(join(tmpdir(), "colophon-norev-"));
    const card = JSON.parse(readFileSync(`cards/${READER}.card.json`, "utf8"));
    delete card.classification.next_review;
    const dest = join(dir, "noreview.json");
    writeFileSync(dest, JSON.stringify(card));
    expect(validateCard(dest).ok).toBe(false);
  });
});
