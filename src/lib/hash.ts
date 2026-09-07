import { createHash } from "node:crypto";
import { canonicalizeJson } from "./jcs.ts";

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256Canonical(value: unknown): string {
  return sha256Hex(canonicalizeJson(value));
}

/** RFC 4122 UUID v5 from a name, using the URL namespace. */
export function uuidV5(name: string): string {
  const ns = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");
  const digest = createHash("sha1").update(ns).update(name).digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export function isUuidV4(value: string): boolean {
  return UUID_V4.test(value);
}

export function genesisHash(): string {
  return "0".repeat(64);
}
