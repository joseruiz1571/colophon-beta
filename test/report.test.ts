import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { citedEvidenceIds, collectForSession, evaluateControls, loadControls } from "../src/report/engine.ts";
import { writeReport } from "../src/report/write.ts";
import { EvidenceStore } from "../src/collect/store.ts";
import { validateOscal } from "../src/lib/schema.ts";

describe("F7 report", () => {
  test("controls file defines at least 8 controls", () => {
    expect(loadControls().length).toBeGreaterThanOrEqual(8);
  });

  test("control themes are present", () => {
    const text = readFileSync("controls/agent-controls.yaml", "utf8");
    for (const theme of ["outside", "sandbox", "scope", "rule_id", "chain", "stale", "approval", "manifest"]) {
      expect(text).toContain(theme);
    }
  });

  test("citation missing-id throws", () => {
    const store = new EvidenceStore();
    expect(() => store.requireCited(["deadbeef"])).toThrow(/missing evidence id/);
  });

  test("citation helper extracts href ids", () => {
    const ids = citedEvidenceIds({
      observations: [{ "relevant-evidence": [{ href: "#abc", description: "x" }] }],
    });
    expect(ids).toContain("abc");
  });

  test("breach trace marks at least one control not-satisfied", async () => {
    const dir = mkdtempSync(join(tmpdir(), "colophon-breach-"));
    await writeReport({
      traceFile: "fixtures/traces/breach.jsonl",
      outDir: dir,
      cardPath: "cards/8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d.card.json",
    });
    const oscal = JSON.parse(readFileSync(join(dir, "assessment-results.json"), "utf8"));
    const findings = oscal["assessment-results"].results[0].findings;
    const unsat = findings.filter((f: { target: { status: { state: string } } }) => f.target.status.state === "not-satisfied");
    expect(unsat.length).toBeGreaterThanOrEqual(1);
    expect(validateOscal(oscal)).toEqual([]);
  });

  test("narrative states what the bundle does not prove", async () => {
    const dir = mkdtempSync(join(tmpdir(), "colophon-narr-"));
    await writeReport({
      traceFile: "fixtures/traces/breach.jsonl",
      outDir: dir,
      cardPath: "cards/8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d.card.json",
    });
    const narrative = readFileSync(join(dir, "narrative.md"), "utf8");
    expect(narrative.toLowerCase()).toContain("does not prove");
    expect(narrative.toLowerCase()).toContain("integrity");
  });

  test("evaluateControls returns one outcome per control", async () => {
    const { store, records, card } = await collectForSession({
      traceFile: "fixtures/traces/breach.jsonl",
      cardPath: "cards/8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d.card.json",
    });
    const outcomes = evaluateControls({ card, records, store });
    expect(outcomes).toHaveLength(loadControls().length);
  });
});
