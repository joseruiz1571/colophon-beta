#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateDeclaration } from "./declare/validate.ts";
import { loadDeclarations } from "./declare/load.ts";
import { exportCard } from "./card/export.ts";
import { lintCard } from "./card/lint.ts";
import { runAgent } from "./agent/run.ts";
import { writeBundle } from "./bundle/write.ts";
import { verifyBundleDir } from "./bundle/verify.ts";
import { signBundle } from "./bundle/sign.ts";
import { verifyBundleSignature } from "./bundle/verify.ts";
import { parseTraceFile } from "./trace/append.ts";
import { readFileSync } from "node:fs";
import { repoRoot, tracePath } from "./lib/paths.ts";

const EVIDENCE_ID = "8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d";
const WRITER_ID = "1a2b3c4d-5e6f-4789-8abc-def012345678";

type Row = { scenario: string; tool: string; effect: string; rules: string };

async function main(): Promise<void> {
  const started = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
  const workDir = join(repoRoot(), "out", "work", runId);
  const outRoot = join(repoRoot(), "out", "demo", runId);
  mkdirSync(workDir, { recursive: true });
  const cardsDir = join(workDir, "cards");

  for (const row of loadDeclarations()) {
    const v = validateDeclaration(row.file);
    if (!v.ok) throw new Error(v.text);
  }
  const exportedReader = exportCard(EVIDENCE_ID, cardsDir);
  const exportedWriter = exportCard(WRITER_ID, cardsDir);
  if (!exportedReader.path || !exportedWriter.path) throw new Error("card export failed");
  const lintA = await lintCard(exportedReader.path);
  const lintB = await lintCard(exportedWriter.path);
  if (!lintA.ok) throw new Error(lintA.text);
  if (!lintB.ok) throw new Error(lintB.text);

  const rows: Row[] = [];
  const evidence = await runNamed("evidence-report", "scenarios/evidence-report.yaml", exportedReader.path);
  const compliant = await runNamed("compliant-run", "scenarios/compliant-run.yaml", exportedReader.path);
  const approval = await runNamed(
    "approval-flow",
    "scenarios/approval-flow.yaml",
    exportedWriter.path,
    "fixtures/approvals/one.json",
  );

  for (const run of [evidence, compliant, approval]) {
    const records = parseTraceFile(readFileSync(tracePath(run.sessionId), "utf8"));
    for (const rec of records) {
      rows.push({ scenario: run.name, tool: rec.tool, effect: rec.effect, rules: rec.rule_ids.join(",") });
    }
  }

  const bundleDir = outRoot;
  const bundled = await writeBundle({
    sessionId: evidence.sessionId,
    traceFile: tracePath(evidence.sessionId),
    outDir: bundleDir,
    cardPath: exportedReader.path,
  });
  if (!bundled.ok) throw new Error(bundled.text);
  const verified = verifyBundleDir(bundleDir);
  if (!verified.ok) throw new Error(verified.text);

  const keyDir = join(workDir, "keys");
  mkdirSync(keyDir, { recursive: true });
  const password = "colophon-demo-local";
  const gen = Bun.spawn(["cosign", "generate-key-pair"], {
    cwd: keyDir,
    env: { ...process.env, COSIGN_PASSWORD: password },
    stdout: "pipe",
    stderr: "pipe",
  });
  await gen.exited;
  process.env.COSIGN_PASSWORD = password;
  const signed = await signBundle(bundleDir, join(keyDir, "cosign.key"));
  if (signed.ok) {
    await verifyBundleSignature(bundleDir, join(keyDir, "cosign.pub"));
  }

  const table = renderTable(rows);
  writeFileSync(join(workDir, "summary.txt"), table);
  console.log(table);
  console.log(`demo run-id: ${runId}`);
  console.log(`bundle: ${bundleDir}`);
  console.log(`elapsed_ms: ${Date.now() - started}`);
}

async function runNamed(
  name: string,
  scenario: string,
  card: string,
  approvals?: string,
): Promise<{ name: string; sessionId: string }> {
  const result = await runAgent({
    scenarioPath: join(repoRoot(), scenario),
    cardPath: card,
    approvalsPath: approvals ? join(repoRoot(), approvals) : undefined,
  });
  if (!result.ok) throw new Error(`${name}: ${result.text}`);
  console.error(result.text);
  return { name, sessionId: result.sessionId };
}

function renderTable(rows: Row[]): string {
  const lines = ["scenario\ttool\teffect\trule_ids", ...rows.map((r) => `${r.scenario}\t${r.tool}\t${r.effect}\t${r.rules}`)];
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
