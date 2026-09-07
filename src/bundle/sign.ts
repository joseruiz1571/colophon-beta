import { existsSync } from "node:fs";
import { join } from "node:path";
import { verifyBundleDir } from "./verify.ts";

export async function signBundle(dir: string, key: string): Promise<{ ok: boolean; text: string }> {
  const files = verifyBundleDir(dir);
  if (!files.ok) return files;
  if (!existsSync(key)) return { ok: false, text: `missing key ${key}` };
  const sig = join(dir, "manifest.json.sig");
  const proc = Bun.spawn(
    ["cosign", "sign-blob", "--yes", "--key", key, "--output-signature", sig, join(dir, "manifest.json")],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env } },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    return { ok: false, text: stderr || stdout };
  }
  return { ok: true, text: `signed ${sig}` };
}
