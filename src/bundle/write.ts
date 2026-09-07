import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { collectForSession } from "../report/engine.ts";
import { writeReport } from "../report/write.ts";
import { sha256Hex } from "../lib/hash.ts";
import { canonicalizeJson } from "../lib/jcs.ts";
import type { AgentCard } from "../types.ts";

export type ManifestFile = { path: string; sha256: string; bytes: number };

export type BundleManifest = {
  created_at: string;
  session_id: string;
  files: ManifestFile[];
  root_hash: string;
};

export function dirIsNonEmpty(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).length > 0;
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

export function isSignatureArtifact(rel: string): boolean {
  return rel.endsWith(".sig") || rel.endsWith(".pem") || rel.endsWith(".crt") || rel.endsWith(".cert");
}

export function buildManifest(dir: string, sessionId: string): BundleManifest {
  const files: ManifestFile[] = [];
  for (const full of listFiles(dir)) {
    const rel = relative(dir, full).split("\\").join("/");
    if (rel === "manifest.json") continue;
    if (isSignatureArtifact(rel)) continue;
    const buf = readFileSync(full);
    files.push({ path: rel, sha256: sha256Hex(buf), bytes: buf.byteLength });
  }
  const root_hash = sha256Hex(canonicalizeJson({ files }));
  return {
    created_at: new Date().toISOString(),
    session_id: sessionId,
    files,
    root_hash,
  };
}

export async function writeBundle(opts: {
  sessionId: string;
  traceFile: string;
  outDir: string;
  cardPath?: string;
  card?: AgentCard;
}): Promise<{ ok: boolean; text: string }> {
  if (dirIsNonEmpty(opts.outDir)) {
    return { ok: false, text: `bundle refuses non-empty output directory: ${opts.outDir}` };
  }
  mkdirSync(join(opts.outDir, "report"), { recursive: true });
  mkdirSync(join(opts.outDir, "evidence"), { recursive: true });
  mkdirSync(join(opts.outDir, "trace"), { recursive: true });

  const { store } = await collectForSession({
    traceFile: opts.traceFile,
    cardPath: opts.cardPath,
    card: opts.card,
  });
  const reported = await writeReport({
    traceFile: opts.traceFile,
    outDir: join(opts.outDir, "report"),
    cardPath: opts.cardPath,
    card: opts.card,
  });
  if (!reported.ok) return reported;
  for (const item of store.all()) {
    writeFileSync(join(opts.outDir, "evidence", `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`);
  }
  cpSync(opts.traceFile, join(opts.outDir, "trace", `${opts.sessionId}.jsonl`));
  const manifest = buildManifest(opts.outDir, opts.sessionId);
  writeFileSync(join(opts.outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ok: true, text: join(opts.outDir, "manifest.json") };
}
