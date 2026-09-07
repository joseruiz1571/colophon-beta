import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { canonicalizeJson } from "../src/lib/jcs.ts";
import { isUuidV4, sha256Canonical, sha256Hex, uuidV5, ZERO_UUID } from "../src/lib/hash.ts";
import { approvalFingerprint, redactArgs } from "../src/lib/redact.ts";
import { parseArgv } from "../src/lib/args.ts";
import { handleDemoTool } from "../src/upstream/demo.ts";

describe("library", () => {
  test("JCS sorts keys", () => {
    expect(canonicalizeJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  test("sha256 is stable", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("canonical hash is order-independent", () => {
    expect(sha256Canonical({ b: 1, a: 2 })).toBe(sha256Canonical({ a: 2, b: 1 }));
  });

  test("uuid v4 detector", () => {
    expect(isUuidV4("8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d")).toBe(true);
    expect(isUuidV4(ZERO_UUID)).toBe(false);
  });

  test("uuid v5 is deterministic", () => {
    expect(uuidV5("x")).toBe(uuidV5("x"));
    expect(uuidV5("x")).not.toBe(uuidV5("y"));
  });

  test("redact hashes content and token", () => {
    const out = redactArgs({ path: "/tmp/x", content: "secret-value", token: "abc" });
    expect(out.path).toBe("/tmp/x");
    expect(out.content).toEqual({ sha256: sha256Hex("secret-value") });
    expect(out.token).toEqual({ sha256: sha256Hex("abc") });
  });

  test("approval fingerprint matches shipped fixture", () => {
    const fp = approvalFingerprint("fs.write", {
      content: "sandbox-ok",
      path: "fixtures/sandbox/approved-note.txt",
    });
    const file = JSON.parse(readFileSync("fixtures/approvals/one.json", "utf8"));
    expect(file.fingerprints[0]).toBe(fp);
  });

  test("parseArgv splits command flags and positionals", () => {
    const parsed = parseArgv(["card", "export", "abc", "--out", "cards/"]);
    expect(parsed.command).toEqual(["card", "export"]);
    expect(parsed.positionals).toEqual(["abc"]);
    expect(parsed.flags.out).toBe("cards/");
  });

  test("net.fetch reads the synthetic status fixture", () => {
    const result = handleDemoTool("net.fetch", { url: "https://status.github.example/health" });
    expect(result.content[0]!.text).toContain("ok");
  });

  test("repo.list filters by owner", () => {
    const result = handleDemoTool("repo.list", { owner: "acme-corp" });
    expect(result.content[0]!.text).toContain("acme-corp/web");
  });

  test("mail.send is synthetic", () => {
    const result = handleDemoTool("mail.send", { to: "a@acme.example", subject: "s", body: "b" });
    expect(result.content[0]!.text).toContain("nothing was sent");
  });

  test("auth.request_scopes does not grant live credentials", () => {
    const result = handleDemoTool("auth.request_scopes", { scopes: ["repo"] });
    expect(result.content[0]!.text).toContain("synthetic");
  });
});

