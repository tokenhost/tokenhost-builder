# Token Host Builder: Spec-to-Code Gap Plan (Authoritative)

This file is the authoritative backlog for bringing this repository in-line with `SPEC.md`.
If `AGENTS.md` conflicts with `SPEC.md`, treat `SPEC.md` as canonical and update this file.

## Repo snapshot (current reality)

Spec-aligned (new) pipeline:
- Input: THS (Token Host Schema) JSON (validated + linted), e.g. `apps/example/job-board.schema.json`.
- Schema/validation: `packages/schema` (JSON Schema + Ajv validation, semantic lints, RFC8785+sha256 hashing, legacy importer).
- Contracts generator: `packages/generator` (single-contract, mapping-based CRUD `App.sol`, Solidity 0.8.24).
- CLI: `packages/cli` (`th init|studio|validate|import-legacy|generate|build|deploy|verify(stub)|doctor`).
- Build output: `th build <schema> --out <dir>` writes `contracts/App.sol`, `compiled/App.json`, `schema.json`, `manifest.json`.
- Deploy: `th deploy <buildDir> --chain anvil|sepolia` (anvil deploy works; sepolia verify still TBD).

Legacy (kept temporarily; deprecated):
- Input: legacy `contracts.json` shape (`contracts{}` with `fields`, `initRules`, `readRules`, `writeRules`).
- Generator: `solidityGenerator.js` generates an `App` contract + per-record child contracts (one contract deployed per record).
- UI: Handlebars templates in `tokenhost-web-template/` and generator script `handlebar.cjs` that writes a Next.js app into `site/`.
- Build/deploy: `build.sh` compiles via `solcjs`, generates UI, then deploys via `tokenhost-web-template/contracts/deploy.js` (Foundry `forge create`).

Tests:
- `pnpm test` and `pnpm test:integration` pass.
- CI requires `static` and `integration-local` on PRs to `master`.
- Canonical generated app coverage includes contract and UI scaffold verification.

## Phase 0 (NOW): Remediation of current snapshot (stability + security)

Goal: make the current builder reproducible, safe-by-default, and testable before deeper rewrites.

- Secrets/env hygiene
  - Remove tracked secrets/config from git (e.g. `tokenhost-web-template/.env.local`).
  - Switch all secrets to env-based config; add `.env.example` files (root + template) with placeholder values.
- Build determinism + tooling cleanup
  - Make `build.sh` idempotent (remove `yarn add sass` during build; pin tool versions; fail fast with actionable errors).
  - Pick a single package manager (SPEC target: Node 20 + pnpm) and remove dual lockfile drift.
  - Stop committing generated artifacts that are not source-of-truth (define what is source vs output).
- Template/runtime correctness fixes (known pain points)
  - Auth env vars: normalize to `NEXT_PUBLIC_*` where needed; avoid `REACT_APP_*` leakage.
  - Fix broken imports / runtime errors in generated `site/` output (validate `next dev` works after `th/build`).
  - Reverse-reference UX: fix link generation and query pages for reference lookups.
  - Web3 helper: fix signer/provider separation and initialization (remove “sneaky place” init; handle chain mismatch cleanly).
- Generator correctness fixes (current architecture)
  - Remove `tx.origin` usage from generated contracts (SPEC 7.2 forbids it).
  - Fix `UserInfo` tracking bugs (owner/list bookkeeping).
  - Unique mapping: namespace by collection + field; support multiple unique fields per collection; fix collisions (see TODOs in `solidityGenerator.js`).
- Tests
  - Make tests runnable (add missing deps; ensure `npm test`/`pnpm test` passes).
  - Align golden Solidity outputs with actual generator output (or vice versa) and add a compile smoke test.

Phase 0 progress (done):
- Removed tracked `.env.local`; added `.env.example` (root + template).
- Removed committed build artifacts (`out/`, `cache/`); added `.gitignore` for generated dirs (`out`, `cache`, `artifacts`, `dist`, `.next`).
- Removed `tx.origin` from legacy generator output (uses `msg.sender` / `_msgSender()` instead).
- Fixed legacy template env var usage (`NEXT_PUBLIC_*` instead of `REACT_APP_*`).
- Fixed legacy reverse-reference link correctness for non-name-matching reference fields (via field lookup in `handlebar.cjs`).
- Fixed legacy Web3 helper initialization (no more “sneaky place”; contract is always initialized; MetaMask connect rebinds signer cleanly).
- Tests pass under pnpm; added CRUD compile smoke test + THS lint tests.

## Phase 1: Adopt THS (Token Host Schema) as input (SPEC 6)

Goal: replace the legacy `contracts.json` format with a versioned, validated THS document.

- Implement THS root structure: `thsVersion`, `schemaVersion`, `app`, `collections[]`, `metadata` (SPEC 6.1-6.3).
- Add JSON Schema (draft 2020-12) for THS + Ajv validation; add semantic lint rules (reserved names, uniqueness, circular refs, type constraints).
- Implement `schemaHash` per SPEC 6.1 (RFC 8785 canonicalization + SHA-256).
- Provide a migration path:
  - Converter: legacy `contracts.json` -> THS (best-effort) so existing examples still generate.
  - Migrations framework: `migrations/NNN-name.ts` with up/down transforms + CLI hook (`th migrate`).

Phase 1 progress (done):
- THS JSON Schema (draft 2020-12) + Ajv structural validation implemented (`packages/schema`).
- Semantic lint rules implemented (`packages/schema/src/lint.ts`).
- RFC8785+sha256 `schemaHash` implemented (`computeSchemaHash`).
- Best-effort legacy importer implemented (`th import-legacy`).

Remaining:
- Schema migrations framework (registry + `th migrate` implementation + versioned transforms).

## Phase 2: Spec-aligned contract generator (SPEC 7)

Goal: make generated contracts match the CRUD builder model in `SPEC.md`.

- Replace per-record child contracts with record structs stored in mapping(s) (single-contract mode first; modular mode later if needed).
- Implement system fields + semantics:
  - create/update/delete/transfer rules, access control, paid creates, reference enforcement, optimistic concurrency (as applicable).
  - required fields enforced on-chain (SPEC 7.3); remove UI-only “required” drift.
- Implement pagination and indexes:
  - `listIdsC(cursorIdExclusive, limit, includeDeleted)` with bounded scan (SPEC 7.5).
  - Optional on-chain indexes gated by `app.features.onChainIndexing` (SPEC 7.8).
  - Unique/equality/reference reverse indexes with correct key derivation (SPEC 7.8.1).
- Implement event model + multicall:
  - `RecordCreated/Updated/Deleted/Transferred` with indexed topics and deterministic hashes (SPEC 7.9-7.14).
  - `multicall(bytes[] calls)` with safe semantics (SPEC 7.11).
- Metadata/self-description and error model:
  - expose schema hash/version/slug + collection ids (SPEC 7.12, 7.16).
  - use custom errors + error catalog support (SPEC 7.15).

Phase 2 progress (done/partial):
- Mapping-based single-contract CRUD generator implemented (`packages/generator`) with `multicall`, events, soft delete, unique indexes, and optional reverse reference indexes.
- Solidity pinned to 0.8.24; compile smoke test added.

Remaining (not exhaustive):
- Harden error model (required-field errors, access mode errors, withdraw errors) + optional error catalog.
- Reference enforcement (`enforce=true`) and richer access modes (allowlist/role/delegation).
- UI contract surface parity checks vs SPEC 7 (naming/ABIs, optional list summaries, etc.).

## Phase 3: Spec-aligned UI generator (SPEC 8 + Appendix B)

Goal: generated UI matches standard routes, works without Token Host login, and is compatible with the new contracts.

- Implement standard routes (Appendix B) and stable naming across builds for a given schema version.
- Update runtime stack (pick one: viem or ethers v6) and remove legacy `web3` patterns where they block spec compliance.
- Support:
  - paid creates UX (fee display + correct `msg.value`),
  - transfers (if enabled),
  - websocket-driven event refresh with safe fallback polling (SPEC 16 acceptance criteria).
- Schema-driven theming and per-collection UI overrides (SPEC 6.2, 8.*).
- Export bundle that can be self-hosted (SPEC 16).

## Phase 4: Build/deploy artifacts + manifest (SPEC 11 + Appendix A)

Goal: deterministic builds that output a release manifest and reproducible artifacts.

- Pin toolchain (SPEC target: Node 20.x, solc 0.8.24) and generate deterministic artifacts.
- Emit a release manifest conforming to `schemas/tokenhost-release-manifest.schema.json`.
- Bundle and digest artifacts (`sources.tgz`, `compiled.tgz`, UI bundle hash).
- Chain config:
  - consume a signed chain config artifact (`schemas/tokenhost-chain-config.schema.json`) or define a compatible `chains.json` source of truth,
  - deploy to local + one public testnet (Sepolia recommended) and verify contracts.

Phase 4 progress (done/partial):
- `th build` compiles via solc-js 0.8.24 and emits a manifest that validates against `schemas/tokenhost-release-manifest.schema.json`.
- Artifact digests use SPEC 11.6.1 directory digest shape (`version: 1, files[]`) and RFC8785+sha256 hashing.
- `th deploy` deploys to anvil/sepolia via viem and updates the manifest with real addresses + block number.

Remaining:
- Package artifacts (`sources.tgz`, `compiled.tgz`, UI bundle) and record/serve URLs.
- Chain config artifact integration + digest recording.
- Real `th verify` (Etherscan/Sourcify) and end-to-end Sepolia verified deploy.

## Phase 5: CLI (SPEC 12)

Goal: replace ad-hoc scripts with a coherent CLI that runs locally and in CI.

- Implement minimal `th` commands:
  - `th init`, `th validate`, `th generate`, `th build`, `th deploy`, `th verify`, `th doctor`.
- Add `th migrate` and stubs for chain migration/indexer hooks as needed.

Phase 5 progress (done/partial):
- Implemented: `th init`, `th studio` (local schema builder), `th validate`, `th import-legacy`, `th generate` (contracts + UI), `th build`, `th deploy`, `th verify` (stub), `th doctor`, `th up|run|dev`.
- `th generate --with-tests` emits generated app test scaffold and generated app CI workflow.

Remaining:
- `th publish` (if/when in scope), real `th verify`.
- `th migrate` implementation + `migrate-chain` implementation (currently stubs).

## Phase 6: Generated-app test rollout (default behavior)

Goal: make generated-app tests default-on with a controlled compatibility transition.

Rollout phases:
1) scaffold emission,
2) contract tests emission,
3) UI tests emission,
4) generated CI template emission,
5) default-on switch.

Phase 6 progress (done/partial):
- Phases 1-4 are complete behind `th generate --with-tests`.
- Generated output now includes:
  - `tests/contract/integration.mjs`
  - `tests/ui/smoke.mjs`
  - `.github/workflows/generated-app-ci.yml`

Remaining:
- Phase 5 default-on switch for emitted tests.
- Add/keep explicit opt-out (`--no-tests` or equivalent) when default-on is enabled.
- Keep compatibility alias behavior for `--with-tests` across a deprecation window.

Default-on gate (must satisfy before switching):
- `integration-local` includes generated-app verification and is stable on `master`.
- At least one canonical generated-app workflow verification remains in CI before and after switch.
- No open P0/P1 generated-test-scaffold regressions.

Migration/deprecation policy:
- Existing generated app repos are not auto-migrated; teams must regenerate and merge emitted tests/workflow.
- `--with-tests` remains accepted for at least two minor releases after default-on.
- Remove testless generation path only after deprecation milestones are completed.

## Out of scope for this repo (unless we explicitly pull it in)

- Managed platform API / Studio backend (SPEC 13).
- Hosted observability/audit services (SPEC 14) beyond local/CI logging.
- Compliance / enterprise controls (SPEC 15) beyond baseline secure engineering practices.

## CEO decision points (blocking choices)

- Contract architecture: stay “per-record contracts” (legacy) vs move to mapping-based CRUD per SPEC (recommended for v1).
- SDK choice for runtime + deploy tooling: viem vs ethers v6 (spec allows either; pick one).
- Back-compat strategy: support legacy `contracts.json` indefinitely vs one-time migration to THS.
