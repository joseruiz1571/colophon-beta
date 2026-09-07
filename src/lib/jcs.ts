import canonicalize from "canonicalize";

/** RFC 8785 JSON Canonicalization Scheme. */
export function canonicalizeJson(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) {
    throw new Error("canonicalize produced no output");
  }
  return out;
}
