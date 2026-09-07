# Status

Every claim in `SPEC.md` §8 / §10. A claim is `done` only when its probe has been run from this tree. Pointers are test names, files, or commands.

| claim | status | pointer |
|---|---|---|
| C1 | done | `test/declare.test.ts` (inventory + `fixtures/bad/missing-owner.yaml`); `$CLI declare validate` |
| C2 | done | `schemas/declaration.schema.json` required[] probed in `declaration schema required fields` |
| C3 | done | `list prints id name risk tier and tool count` |
| C4 | done | `ships a high-risk read-only agent and a low-risk approval write agent`; inventory YAML |
| C5 | done | `export writes a valid card` |
| C6 | done | `schema requires the C6 fields` |
| C7 | done | `verify rejects a tampered canonical_sha256` |
| C8 | done | `lint denies a stale card` / `high risk without kill switch` / `lint allows a shipped card` |
| C9 | done | `validate rejects a zero UUID card` |
| C10 | done | `agent --list-tools returns the Card's three writer tools` |
| C11 | done | `in-scope decision has effect rule_ids reasons`; `opa eval -d policy/ -i fixtures/gate-input/in-scope.json` |
| C12 | done | `unknown tool is deny` + `fixtures/gate-input/unknown-tool.json` |
| C13 | done | `data-class violation is deny` |
| C14 | done | `write outside sandbox is deny` |
| C15 | done | `scope expansion is deny` |
| C16 | done | `needs approval is escalate` |
| C17 | done | `approval-flow allows once then escalates` |
| C18 | done | `src/gate/serve.ts` fail-closed on invalid Card; stderr `gate fail-closed:`; `closedDecision` unit test |
| C19 | done | Policy composition is allow-assignment over default deny (`policy/gate.rego`); no permit logic in `src/` (A1 grep) |
| C20 | done | `opa test policy/ -v` (≥20 PASS) and `opa fmt --diff policy/` |
| C21 | done | `upstream demo lists the seven tools`; `$CLI upstream demo --list-tools` |
| C22 | done | `evidence-report scenario exits 0` |
| C23 | done | `interface LlmDriver` in `src/agent/driver.ts`; A4 dependency scan |
| C24 | done | evidence-report test asserts the four deny tools |
| C25 | done | `compliant-run is only allow` |
| C26 | done | `approval-flow allows once then escalates` |
| C27 | done | `record contains the twelve fields` |
| C28 | done | `verify names the line after a single-byte change` |
| C29 | done | `synthetic token is stored as sha256 only` + evidence-report grep |
| C30 | done | `interface Collector` in `src/collect/types.ts` |
| C31 | done | `MCPTraceCollector` / `CardCollector` tests |
| C32 | done | `LiveAwsProvider` only in `src/collect/aws/live.ts` behind `--live-aws`; A3 test |
| C33 | done | `EvidenceStore rejects a duplicate id` / `hash mismatch` |
| C34 | done | `controls file defines at least 8 controls` |
| C35 | done | `control themes are present` |
| C36 | done | `breach trace` writes schema-valid OSCAL; demo writes `out/demo/*/report/assessment-results.json` |
| C37 | done | `citation missing-id throws`; report `store.requireCited` |
| C38 | done | `narrative states what the bundle does not prove` |
| C39 | done | `breach trace marks at least one control not-satisfied` |
| C40 | done | `writes report evidence trace and manifest`; refuses non-empty dir |
| C41 | done | `verify names a changed file` |
| C42 | partial | Local `bundle sign` / `verify --pub` wrap Cosign key-pair (demo + `src/bundle/sign.ts`). Keyless sign/verify is in `.github/workflows/ci.yml` on push to `main` only — PR Fulcio identities are not `refs/heads/main`, so the pinned identity cannot verify a PR build. |
| C43 | done | `bun run demo` (probed on the builder VM); writes `out/demo/<run-id>/` |
| C44 | done | Unique `out/demo/<run-id>/`; two consecutive runs do not share a directory |
| C45 | done | `bun test` (≥60) and `bun run typecheck` |
| C46 | partial | `.github/workflows/ci.yml` contains install, typecheck, bun test, opa test, opa fmt, schema validation, demo, bundle verify, keyless Cosign, secret scan. Green-on-default-branch is not proven until the first successful `main` run. Keyless verify is push-to-main only (see C42). |
| C47 | done | `README.md` quickstart (2 commands), five stages, proves / does-not-prove |
| C48 | done | this file, 50 claim rows |
| C49 | done | `sha256sum SPEC.md` = `10e07085e0e56f210b8f152d7caa45b88a4dfd746bf4b1c027cd6fd812d34796` |
| C50 | done | `DECISIONS.md` |

| anti-claim | status | pointer |
|---|---|---|
| A1 | done (must remain false) | `test/anti-claims.test.ts` A1; `grep -rnE '(allow\|deny)' src/` filtered |
| A2 | done (must remain false) | Redaction of `content`/`token`; gitleaks in CI; synthetic placeholder is not a live secret |
| A3 | done (must remain false) | `LiveAwsProvider` is not referenced under `test/` or `.github/` |
| A4 | done (must remain false) | `package.json` has no LLM provider SDK |
| A5 | done (must remain false) | Demo writes under `out/` and `trace/` only |

## Gaps

- Keyless Cosign verify against the pinned `refs/heads/main` identity cannot succeed on pull-request workflow runs. The workflow still contains the step; it is gated to `push` (not `pull_request`).
- `C18` is implemented and unit-covered; a full MCP client against an invalid Card is not a dedicated bun test (the gate process fail-closes at startup and denies every call).
- `LiveAwsProvider` methods throw unless the operator supplies `--live-aws` and `AWS_*`. No live call is made in this repository.
