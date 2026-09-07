# Decisions

This document records every design choice left open by `SPEC.md`, plus the operator-locked decisions from the builder brief. No questions were asked of the operator; the locked list was taken as given.

## Operator-locked (do not reopen)

1. **Tool argument convention for Rego.** `fs.read`/`fs.write` use `path`; `fs.write` also `content`. `repo.list` has optional `owner`. `repo.read_settings` uses `repository` (`owner/name`). `auth.request_scopes` uses `scopes` (string[]). `net.fetch` uses `url`. `mail.send` uses `to`, `subject`, `body`. Data-class checks: Rego inspects declared tool `data_classes` versus classes inferred from the call. `token` is always class `credential`. `content` is class `credential` except on `fs.write` (file payload). `auth.*` is class `credential`. Write-path checks use `path` against `sandbox.write_paths` (prefix match).
2. **Card identity.** `spec_version` is `"1.0.0"`. `card_type` is `"agent"`.
3. **Cosign keyless CI identity.** Certificate identity `https://github.com/joseruiz1571/colophon-beta/.github/workflows/ci.yml@refs/heads/main`. OIDC issuer `https://token.actions.githubusercontent.com`.
4. **Shipped agents.** `inventory/agents/evidence-reader.yaml` (high, read-only: `fs.read`, `repo.list`, `repo.read_settings`, `net.fetch`). `inventory/agents/sandbox-writer.yaml` (low, `fs.write` with `requires_approval: true`, plus `fs.read` and `repo.list`).
5. **Fixed UUIDs.** Evidence reader `8f3a2c1d-4b5e-4a67-9c8d-1e2f3a4b5c6d`. Sandbox writer `1a2b3c4d-5e6f-4789-8abc-def012345678`.
6. **Synthetic token.** Scenario argument `syn-token-NOT-A-SECRET-0001`. Traces, evidence, reports, and bundles store only its SHA-256 (the `content` field is redacted).
7. **OPA and Cosign local install.** See “Local tooling” below. CI installs both via official binaries / `sigstore/cosign-installer`.
8. **Package name** `colophon`. CLI entry `bun run colophon --`. `bin.colophon` → `src/cli.ts`.
9. **Session ids.** UUID v4 per `agent run`. Trace path `trace/<session_id>.jsonl`.
10. **Demo output.** `out/demo/<run-id>/` so two consecutive demos do not collide. Intermediate files go under `out/work/<run-id>/`.

## F1 Declare

- Declaration schema is draft 2020-12 at `schemas/declaration.schema.json`. Extra fields (`next_review`, `decision_boundaries`, `escalation`, `governance`, `evidence`) ride on the Declaration so a Card export is complete without a second source of truth.
- `declare list` reads `inventory/agents/*.yaml` and prints `id`, `name`, `risk_tier`, tool count, tab-separated.

## F2 Card

- Cards are RFC 8785-canonicalized with the `canonicalize` package before hashing. `metadata.canonical_sha256` is excluded from the hashed form.
- Shipped Cards use a fixed `exported_at` of `2026-09-07T00:00:00.000Z` so their hashes stay stable across regenerations (`src/tools/ship-fixtures.ts`).
- `card lint` evaluates `data.colophon.card.decision`. Stale `next_review` and high/critical without `kill_switch.available` are denies.
- `card validate` uses the JSON Schema plus an extra UUID v4 check so the all-zero UUID is rejected even if a generic `uuid` format would accept it.

## F3 Gate

- Policy output lives at `data.colophon.gate.decision` as `{effect, rule_ids, reasons}`.
- Decision composition is `default effect := "deny"` plus `effect := "allow"` / `effect := "escalate"` when permit rules hold. There is no competing `effect := "deny"` assignment, so a one-line `effect := "allow" if { input.call.name == "fs.write" }` flips write decisions (C19) without TypeScript changes.
- TypeScript never decides. It builds the OPA input (including approval fingerprint and prior decisions), routes on `decision.effect`, and fail-closes when OPA errors or returns an undefined/malformed result (`COL-GATE-FAIL-CLOSED`).
- Approvals are one-shot: Rego treats a fingerprint as consumed when a prior decision with the same fingerprint has `effect == "allow"`.
- The gate is an MCP server using `@modelcontextprotocol/sdk`. It connects to the demo upstream as an MCP client over stdio. `tools/list` is the intersection of upstream tools and `card.tools[]`.
- `--upstream demo` is expanded to `bun src/cli.ts upstream demo`.
- Invalid Card at startup: the server still listens; every call is fail-closed and the cause is written to stderr.

### Stable rule IDs

| ID | Meaning |
|---|---|
| `COL-GATE-UNKNOWN-TOOL` | Tool not on the Card |
| `COL-GATE-DATA-CLASS` | Touched class not in the tool's `data_classes` |
| `COL-GATE-WRITE-SANDBOX` | `fs.write` path outside `sandbox.write_paths` |
| `COL-GATE-SCOPE-EXPANSION` | `auth.*` requested a scope the Card did not declare |
| `COL-GATE-REPO-SCOPE` | `repository` not in `decision_boundaries.allowed_repositories` |
| `COL-GATE-URL-SCOPE` | `url` not under `allowed_url_prefixes` |
| `COL-GATE-APPROVAL-REQUIRED` | `requires_approval` and no unused fingerprint |
| `COL-GATE-ALLOW` | Permit |
| `COL-GATE-DEFAULT` | Fail closed, no named violation |
| `COL-GATE-FAIL-CLOSED` | OPA error / undefined / invalid Card (applied by the router) |
| `COL-CARD-STALE-REVIEW` | `next_review` missing or past |
| `COL-CARD-KILLSWITCH` | high/critical without an available kill switch |
| `COL-CARD-OK` | Card lint permit |

## F4 Agent and upstream

- `ScriptDriver` replays a YAML scenario. `interface LlmDriver` exists with no implementation and no provider SDK.
- The demo upstream implements the seven named tools over `fixtures/` only. Paths outside `fixtures/` are refused by the upstream itself as a second fence.
- `--list-tools` on `upstream demo` prints names and exits. The same flag on `agent run` connects through the gate and prints the Card-filtered list.

## F5 Trace

- Genesis `prev_hash` is 64 zero hex characters.
- `hash` is SHA-256 of the RFC 8785 form of the line without `hash`.
- Credential-bearing argument keys (`content`, `token`, `password`, `secret`, `authorization`, `api_key`) are stored as `{sha256}` only.

## F6 Collect

- `EvidenceItem.id` and `sha256` are the SHA-256 of the canonical payload. A UUID v5 (URL namespace, name `colophon:evidence:<sha256>`) is stored for OSCAL citations.
- `AwsProvider` has `FixtureAwsProvider` (reads `fixtures/aws/`) and `LiveAwsProvider` (constructed only when `--live-aws` is passed; reads `AWS_*`; never used by tests, demo, or CI). No AWS SDK dependency.

## F7 Report

- Controls live in `controls/agent-controls.yaml` (nine controls). The engine interprets `check.type` over the collected evidence. This is assessment logic, not tool allow/deny.
- OSCAL 1.1.2 Assessment Results are validated against the vendored official NIST schema (`schemas/vendor/oscal_assessment-results_schema-1.1.2.json`, draft-07, downloaded from the v1.1.2 GitHub release). Instance validation uses Ajv draft-07 plus `ajv-formats`. The C36 probe's `ajv-cli --spec=draft2020` flag does not load a draft-07 `$schema`; the official file is kept byte-identical to the NIST release.
- Citation invariant: every `relevant-evidence.href` (after stripping `#`) must exist in the run's evidence store or the report refuses to write (`missing evidence id`).
- `colophon report --session` reads `trace/<id>.jsonl`. `--trace` is also accepted (C39 breach fixture).

## F8 Bundle and sign

- Bundle layout: `report/`, `evidence/<id>.json`, `trace/`, `manifest.json` (written last). Non-empty output directories are refused.
- `root_hash` is SHA-256 of the canonical `{files}` array.
- Signature artifacts (`*.sig`, `*.pem`, `*.crt`, `*.cert`) are ignored by `bundle verify` so Cosign can write next to the manifest.
- Local sign/verify wrap `cosign sign-blob` / `verify-blob` with a key pair. CI on `push` to `main` uses keyless OIDC with the locked identity. Pull requests skip keyless verify because the Fulcio identity would be the PR ref, not `refs/heads/main`.

## F9 Demo, docs, CI

- `bun run demo` runs declare → card → lint → three scenarios → bundle → verify → local Cosign key-pair sign.
- Demo wall-clock target is under 60 seconds after install; each OPA eval is a local subprocess.
- CI installs Bun 1.2.x, OPA 1.4.2, and Cosign 2.5.0. Secret scan is `gitleaks detect --no-git`.

## Local tooling

```bash
# Bun
curl -fsSL https://bun.sh/install | bash

# OPA 1.x
curl -L -o opa https://openpolicyagent.org/downloads/v1.4.2/opa_linux_amd64_static
chmod +x opa && sudo mv opa /usr/local/bin/opa

# Cosign
# https://docs.sigstore.dev/cosign/system_config/installation/
```

## Q&A

None. The builder brief locked the open questions listed above.
