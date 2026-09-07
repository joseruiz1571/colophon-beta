import { sha256Canonical, sha256Hex } from "./hash.ts";

const CREDENTIAL_KEYS = new Set(["content", "token", "password", "secret", "authorization", "api_key"]);

export function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (CREDENTIAL_KEYS.has(key.toLowerCase()) && typeof value === "string") {
      out[key] = { sha256: sha256Hex(value) };
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function approvalFingerprint(name: string, args: Record<string, unknown>): string {
  return sha256Canonical({ name, arguments: args });
}
