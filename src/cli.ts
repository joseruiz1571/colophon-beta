#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { lintCard } from "./card/lint.ts";
import { exportCard } from "./card/export.ts";
import { validateCard } from "./card/validate.ts";
import { verifyCard } from "./card/verify.ts";
import { listDeclarations } from "./declare/list.ts";
import { validateDeclaration } from "./declare/validate.ts";
import { runAgent } from "./agent/run.ts";
import { loadApprovalsFile, serveGate } from "./gate/serve.ts";
import { DEMO_TOOLS, serveUpstreamDemo } from "./upstream/demo.ts";
import { verifyTraceFile } from "./trace/verify.ts";
import { writeReport } from "./report/write.ts";
import { writeBundle } from "./bundle/write.ts";
import { verifyBundleDir, verifyBundleSignature } from "./bundle/verify.ts";
import { signBundle } from "./bundle/sign.ts";
import { flagBool, flagString, parseArgv } from "./lib/args.ts";
import { tracePath } from "./lib/paths.ts";
import { FixtureAwsProvider } from "./collect/aws/fixture.ts";
import { evidenceFromPayload } from "./collect/store.ts";

async function maybeLiveAws(live: boolean): Promise<void> {
  if (!live) return;
  const { LiveAwsProvider } = await import("./collect/aws/live.ts");
  const provider = new LiveAwsProvider();
  await provider.getCloudTrailEvents();
}

function fail(text: string, code = 1): never {
  console.error(text);
  process.exit(code);
}

function ok(text: string): never {
  if (text) console.log(text);
  process.exit(0);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const parsed = parseArgv(argv);
  const [group, action] = parsed.command;
  const flags = parsed.flags;

  if (group === "declare" && action === "validate") {
    const file = parsed.positionals[0];
    if (!file) fail("usage: colophon declare validate <file>");
    const result = validateDeclaration(file);
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  if (group === "declare" && action === "list") {
    const result = listDeclarations();
    ok(result.text);
  }

  if (group === "card" && action === "export") {
    const id = parsed.positionals[0];
    const out = flagString(flags, "out") ?? "cards";
    if (!id) fail("usage: colophon card export <agent-id> --out <dir>");
    const result = exportCard(id, out);
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  if (group === "card" && action === "validate") {
    const file = parsed.positionals[0];
    if (!file) fail("usage: colophon card validate <card>");
    const result = validateCard(file);
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  if (group === "card" && action === "verify") {
    const file = parsed.positionals[0];
    if (!file) fail("usage: colophon card verify <card>");
    const result = verifyCard(file);
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  if (group === "card" && action === "lint") {
    const file = parsed.positionals[0];
    if (!file) fail("usage: colophon card lint <card>");
    const result = await lintCard(file);
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  if (group === "gate" && action === "serve") {
    const card = flagString(flags, "card");
    const upstream = flagString(flags, "upstream");
    if (!card || !upstream) fail("usage: colophon gate serve --card <card> --upstream <command>");
    const approvals = flagString(flags, "approvals") ? loadApprovalsFile(String(flags.approvals)) : [];
    const sessionId = flagString(flags, "session") ?? randomUUID();
    await serveGate({ cardPath: card, upstream, sessionId, approvals });
    return;
  }

  if (group === "upstream" && action === "demo") {
    if (flagBool(flags, "list-tools")) {
      ok(DEMO_TOOLS.join("\n"));
    }
    await serveUpstreamDemo();
    return;
  }

  if (group === "agent" && action === "run") {
    const card = flagString(flags, "card");
    if (!card) fail("usage: colophon agent run --scenario <file> --card <card>");
    const result = await runAgent({
      scenarioPath: flagString(flags, "scenario"),
      cardPath: card,
      approvalsPath: flagString(flags, "approvals"),
      sessionId: flagString(flags, "session"),
      listToolsOnly: flagBool(flags, "list-tools"),
    });
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  if (group === "trace" && action === "verify") {
    const file = parsed.positionals[0];
    if (!file) fail("usage: colophon trace verify <file>");
    const result = verifyTraceFile(file);
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  if (group === "report") {
    const out = flagString(flags, "out");
    if (!out) fail("usage: colophon report --session <id>|--trace <file> --out <dir>");
    const session = flagString(flags, "session");
    const trace = flagString(flags, "trace") ?? (session ? tracePath(session) : undefined);
    if (!trace || !existsSync(trace)) fail(`trace not found: ${trace ?? "(none)"}`);
    if (flagBool(flags, "live-aws")) {
      await maybeLiveAws(true);
    } else if (flagBool(flags, "fixture-aws")) {
      const provider = new FixtureAwsProvider();
      await provider.getCloudTrailEvents();
      evidenceFromPayload("aws:cloudtrail", await provider.getCloudTrailEvents());
    }
    const result = await writeReport({
      traceFile: resolve(trace),
      outDir: out,
      cardPath: flagString(flags, "card"),
    });
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  if (group === "bundle" && !action) {
    const out = flagString(flags, "out");
    const session = flagString(flags, "session");
    if (!out || !session) fail("usage: colophon bundle --session <id> --out <dir>");
    const result = await writeBundle({
      sessionId: session,
      traceFile: flagString(flags, "trace") ?? tracePath(session),
      outDir: out,
      cardPath: flagString(flags, "card"),
    });
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  if (group === "bundle" && action === "verify") {
    const dir = parsed.positionals[0];
    if (!dir) fail("usage: colophon bundle verify <dir> [--pub <pub>]");
    const pub = flagString(flags, "pub");
    const result = pub ? await verifyBundleSignature(dir, pub) : verifyBundleDir(dir);
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  if (group === "bundle" && action === "sign") {
    const dir = parsed.positionals[0];
    const key = flagString(flags, "key");
    if (!dir || !key) fail("usage: colophon bundle sign <dir> --key <key>");
    const result = await signBundle(dir, key);
    if (!result.ok) fail(result.text);
    ok(result.text);
  }

  fail(`unknown command: ${parsed.command.join(" ")}`);
}

main().catch((err) => {
  fail((err as Error).stack ?? (err as Error).message);
});
