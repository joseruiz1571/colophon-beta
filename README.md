> This repository is one of two independent builds against an identical spec, kept as a record of that experiment. The current build renames the Agent Card to a Record and moves to OSCAL 1.2.3: https://github.com/joseruiz1571/colophon. This repository is not maintained.

# Colophon

A colophon is the statement at the back of a book that records who made it, where, and how. This CLI is that statement for AI agents: a signed, machine-readable record of what an agent was allowed to do, what it tried to do, what it was refused, and the evidence behind each of those facts.

## Quickstart

```bash
bun install
bun run demo
```

That is the whole path from a clone to a Cosign-signed demo bundle under `out/demo/<run-id>/`. Optional checks:

```bash
bun test
opa test policy/
```

## Architecture — five stages

1. **Declare.** An operator writes a YAML Declaration under `inventory/agents/`. `colophon declare validate` and `colophon declare list` check it against `schemas/declaration.schema.json`.
2. **Card.** `colophon card export` turns a Declaration into a signable Agent Card (RFC 8785 canonical SHA-256). `validate`, `verify`, and `lint` (Rego) keep the Card current.
3. **Gate.** `colophon gate serve` is an MCP stdio server. Every `tools/call` is evaluated by `policy/gate.rego`. Application code routes; Rego decides. Fail closed.
4. **Trace and collect.** Each decision is appended to `trace/<session_id>.jsonl` as a hash-chained line. Collectors turn the verified trace and the Card into content-addressed evidence.
5. **Report and bundle.** `colophon report` emits OSCAL 1.1.2 Assessment Results. `colophon bundle` writes `report/`, `evidence/`, `trace/`, and a `manifest.json` whose Cosign signature covers the bytes.

```
Declaration → Agent Card → Gate (OPA) → Trace → Evidence → OSCAL AR → Signed bundle
```

## What this proves / what it does not

**Proves.** Integrity of the evidence and the bundle (content-addressed SHA-256, hash-chained trace). Completeness of the file list in `manifest.json`. Authenticity of the manifest via Cosign (local key-pair or GitHub OIDC in CI). That the four out-of-scope demo attempts were refused with a rule ID.

**Does not prove.** Correctness of judgment. A satisfied control means the deterministic check over this run's evidence held. It does not mean the policy is the right policy, that the Card should have been issued, or that a human assessor would agree. Custody is provable. Judgment is not.

## Commands

```bash
bun run colophon -- declare validate inventory/agents/evidence-reader.yaml
bun run colophon -- declare list
bun run colophon -- card export <agent-id> --out cards/
bun run colophon -- card validate cards/<id>.card.json
bun run colophon -- card verify cards/<id>.card.json
bun run colophon -- card lint cards/<id>.card.json
bun run colophon -- agent run --scenario scenarios/evidence-report.yaml --card cards/<id>.card.json
bun run colophon -- trace verify trace/<session>.jsonl
bun run colophon -- report --session <id> --out out/report --card cards/<id>.card.json
bun run colophon -- bundle --session <id> --out out/bundle --card cards/<id>.card.json
bun run colophon -- bundle verify out/bundle
bun run colophon -- bundle sign out/bundle --key cosign.key
```

## Local tooling

- Bun ≥ 1.2
- OPA ≥ 1.0 (`opa` on `PATH`)
- Cosign (`cosign` on `PATH`) for signing

See `DECISIONS.md` for install notes and locked design choices. See `STATUS.md` for claim-by-claim status. `SPEC.md` is the contract.
