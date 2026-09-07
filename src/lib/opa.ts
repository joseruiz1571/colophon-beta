import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { policyDir } from "./paths.ts";

export class OpaEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpaEvalError";
  }
}

export async function opaEval(query: string, input: unknown): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), "colophon-opa-"));
  const inputPath = join(dir, "input.json");
  await writeFile(inputPath, JSON.stringify(input));
  try {
    const proc = Bun.spawn(["opa", "eval", "-f", "json", "-d", policyDir(), "-i", inputPath, query], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      throw new OpaEvalError(`opa eval failed (${code}): ${stderr || stdout}`);
    }
    const parsed = JSON.parse(stdout) as {
      result?: Array<{ expressions?: Array<{ value?: unknown }> }>;
    };
    const value = parsed.result?.[0]?.expressions?.[0]?.value;
    if (value === undefined) {
      throw new OpaEvalError("opa eval returned undefined policy result");
    }
    return value;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
