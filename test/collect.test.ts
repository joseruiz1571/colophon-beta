import { describe, expect, test } from "bun:test";
import { CardCollector } from "../src/collect/card-collector.ts";
import { MCPTraceCollector } from "../src/collect/trace-collector.ts";
import { EvidenceStore, evidenceFromPayload } from "../src/collect/store.ts";
import { FixtureAwsProvider } from "../src/collect/aws/fixture.ts";
import { readCardFile } from "../src/card/validate.ts";
import { parseTraceFile } from "../src/trace/append.ts";
import { readFileSync } from "node:fs";

describe("F6 collect", () => {
  test("Collector interface is implemented by MCPTraceCollector", () => {
    const records = parseTraceFile(readFileSync("fixtures/traces/breach.jsonl", "utf8"));
    const collector: { collect: () => Promise<unknown> } = new MCPTraceCollector(records);
    expect(typeof collector.collect).toBe("function");
  });

  test("MCPTraceCollector yields one item per decision plus a summary", async () => {
    const items = await MCPTraceCollector.fromFile("fixtures/traces/breach.jsonl").collect();
    expect(items.length).toBe(3);
    expect(items.some((i) => i.source.endsWith(":summary"))).toBe(true);
  });

  test("CardCollector yields the Card as evidence", async () => {
    const card = readCardFile("cards/8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d.card.json");
    const items = await new CardCollector(card).collect();
    expect(items).toHaveLength(1);
    expect(items[0]!.source).toBe("card");
  });

  test("EvidenceStore rejects a duplicate id", () => {
    const store = new EvidenceStore();
    const item = evidenceFromPayload("src", { hello: "world" });
    store.add(item);
    expect(() => store.add(item)).toThrow(/duplicate id/);
  });

  test("EvidenceStore rejects a hash mismatch", () => {
    const store = new EvidenceStore();
    const item = evidenceFromPayload("src", { hello: "world" });
    expect(() => store.add({ ...item, sha256: "00".repeat(32), id: item.id })).toThrow(/hash mismatch/);
  });

  test("evidence id equals sha256 of canonical payload", () => {
    const item = evidenceFromPayload("src", { z: 1, a: 2 });
    expect(item.id).toBe(item.sha256);
    expect(item.uuid).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test("FixtureAwsProvider reads fixtures/aws", async () => {
    const provider = new FixtureAwsProvider();
    const events = await provider.getCloudTrailEvents();
    expect(events[0]?.event_id).toBe("syn-ct-0001");
    const role = await provider.getIamRolePolicy("colophon-auditor-example");
    expect(role.role_name).toBe("colophon-auditor-example");
    const enc = await provider.getBucketEncryption("acme-evidence.example");
    expect(enc.sse_algorithm).toBe("aws:kms");
  });
});
