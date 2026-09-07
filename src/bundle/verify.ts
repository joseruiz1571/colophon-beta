import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../lib/hash.ts";
import { canonicalizeJson } from "../lib/jcs.ts";
import { buildManifest, isSignatureArtifact, type BundleManifest } from "./write.ts";

export function verifyBundleDir(dir: string): { ok: boolean; text: string } {
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return { ok: false, text: "missing manifest.json" };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as BundleManifest;
  const recomputed = buildManifest(dir, manifest.session_id);
  const expected = new Map(manifest.files.map((f) => [f.path, f]));
  const actual = new Map(recomputed.files.map((f) => [f.path, f]));

  for (const [path, file] of expected) {
    const got = actual.get(path);
    if (!got) return { ok: false, text: `missing file ${path}` };
    if (got.sha256 !== file.sha256 || got.bytes !== file.bytes) {
      return { ok: false, text: `hash mismatch in ${path}` };
    }
  }
  for (const path of actual.keys()) {
    if (!expected.has(path) && path !== "manifest.json" && !isSignatureArtifact(path)) {
      return { ok: false, text: `unexpected file ${path}` };
    }
  }
  const root = sha256Hex(canonicalizeJson({ files: manifest.files }));
  if (root !== manifest.root_hash) {
    return { ok: false, text: "root_hash mismatch" };
  }
  return { ok: true, text: `bundle ok: ${manifest.files.length} files` };
}

export async function verifyBundleSignature(dir: string, pub: string): Promise<{ ok: boolean; text: string }> {
  const files = verifyBundleDir(dir);
  if (!files.ok) return files;
  const sig = join(dir, "manifest.json.sig");
  if (!existsSync(sig)) return { ok: false, text: "missing manifest.json.sig" };
  const proc = Bun.spawn(
    ["cosign", "verify-blob", "--key", pub, "--signature", sig, join(dir, "manifest.json")],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    return { ok: false, text: stderr || stdout };
  }
  return { ok: true, text: stdout || "verify-blob ok" };
}
