import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTrace, buildTraceRecord, parseTraceFile } from "../src/trace/append.ts";
import { verifyTraceFile, verifyTraceRecords } from "../src/trace/verify.ts";
import { genesisHash, sha256Hex } from "../src/lib/hash.ts";

describe("F5 trace", () => {
  test("record contains the twelve fields", () => {
    const rec = buildTraceRecord({
      sessionId: "11111111-2222-4333-8444-555555555555",
      callIndex: 0,
      tool: "fs.read",
      args: { path: "fixtures/fs/branch-protection-notes.txt" },
      decision: { effect: "allow", rule_ids: ["COL-GATE-ALLOW"], reasons: ["ok"] },
      cardSha256: "ab".repeat(32),
      prevHash: genesisHash(),
    });
    for (const key of [
      "ts",
      "session_id",
      "call_index",
      "tool",
      "args_sha256",
      "args_redacted",
      "effect",
      "rule_ids",
      "reasons",
      "card_sha256",
      "prev_hash",
      "hash",
    ]) {
      expect(rec).toHaveProperty(key);
    }
  });

  test("verify accepts an intact chain", () => {
    const a = buildTraceRecord({
      sessionId: "s",
      callIndex: 0,
      tool: "fs.read",
      args: { path: "a" },
      decision: { effect: "allow", rule_ids: ["COL-GATE-ALLOW"], reasons: ["ok"] },
      cardSha256: "ab".repeat(32),
      prevHash: genesisHash(),
    });
    const b = buildTraceRecord({
      sessionId: "s",
      callIndex: 1,
      tool: "repo.list",
      args: { owner: "acme-corp" },
      decision: { effect: "allow", rule_ids: ["COL-GATE-ALLOW"], reasons: ["ok"] },
      cardSha256: "ab".repeat(32),
      prevHash: a.hash,
    });
    expect(verifyTraceRecords([a, b]).ok).toBe(true);
  });

  test("verify names the line after a single-byte change", () => {
    const dir = mkdtempSync(join(tmpdir(), "colophon-trace-"));
    const a = buildTraceRecord({
      sessionId: "s",
      callIndex: 0,
      tool: "fs.read",
      args: { path: "a" },
      decision: { effect: "allow", rule_ids: ["COL-GATE-ALLOW"], reasons: ["ok"] },
      cardSha256: "ab".repeat(32),
      prevHash: genesisHash(),
    });
    const b = buildTraceRecord({
      sessionId: "s",
      callIndex: 1,
      tool: "fs.read",
      args: { path: "b" },
      decision: { effect: "allow", rule_ids: ["COL-GATE-ALLOW"], reasons: ["ok"] },
      cardSha256: "ab".repeat(32),
      prevHash: a.hash,
    });
    const c = buildTraceRecord({
      sessionId: "s",
      callIndex: 2,
      tool: "fs.read",
      args: { path: "c" },
      decision: { effect: "allow", rule_ids: ["COL-GATE-ALLOW"], reasons: ["ok"] },
      cardSha256: "ab".repeat(32),
      prevHash: b.hash,
    });
    const file = join(dir, "t.jsonl");
    writeFileSync(file, [a, b, c].map((r) => JSON.stringify(r)).join("\n") + "\n");
    const copy = join(dir, "copy.jsonl");
    const text = readFileSync(file, "utf8").replace("allow", "deny");
    writeFileSync(copy, text);
    const result = verifyTraceFile(copy);
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/line 1|line 3/);
  });

  test("synthetic token is stored as sha256 only", () => {
    const token = "syn-token-NOT-A-SECRET-0001";
    const rec = buildTraceRecord({
      sessionId: "s",
      callIndex: 0,
      tool: "fs.write",
      args: { path: "/tmp/gh-token.json", content: token },
      decision: { effect: "deny", rule_ids: ["COL-GATE-UNKNOWN-TOOL"], reasons: ["no"] },
      cardSha256: "ab".repeat(32),
      prevHash: genesisHash(),
    });
    const serialized = JSON.stringify(rec);
    expect(serialized).not.toContain(token);
    expect(JSON.stringify(rec.args_redacted)).toContain(sha256Hex(token));
  });

  test("append writes jsonl", () => {
    const dir = mkdtempSync(join(tmpdir(), "colophon-append-"));
    const file = join(dir, "a.jsonl");
    const rec = buildTraceRecord({
      sessionId: "s",
      callIndex: 0,
      tool: "fs.read",
      args: { path: "a" },
      decision: { effect: "allow", rule_ids: ["COL-GATE-ALLOW"], reasons: ["ok"] },
      cardSha256: "ab".repeat(32),
      prevHash: genesisHash(),
    });
    appendTrace(file, rec);
    expect(parseTraceFile(readFileSync(file, "utf8"))).toHaveLength(1);
  });
});
