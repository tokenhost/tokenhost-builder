# Token Host Builder

Token Host Builder is a schema-to-dapp generator framework for EVM CRUD apps.

Canonical product behavior is defined in `SPEC.md`.  
Execution backlog and current gap-tracking is in `AGENTS.md`.

## Legacy template status

- `tokenhost-web-template/` is retired from this repo.
- Legacy frontend continuity lives in `tokenhost/app-tokenhost-com-frontend`.
- Preserved migration/behavior notes: `docs/legacy-tokenhost-web-template-notes.md`.

## Current generated-app testing model

- `th generate <schema> --with-tests` emits generated app tests and a generated app CI workflow.
- Generated scaffold includes:
  - `tests/contract/integration.mjs`
  - `tests/ui/smoke.mjs`
  - `.github/workflows/generated-app-ci.yml`
- Current default remains opt-in (`--with-tests`) until the default-on rollout gate is met.

## Rollout and migration docs

- Rollout decision doc: `docs/generated-app-test-rollout.md`
- Generated app CI details: `docs/generated-app-ci.md`
- Release acceptance checklist: `docs/release-checklist.md`
- UI redesign system notes: `docs/ui-redesign-system.md`

## Builder CI baseline

This repo requires:
- `static`
- `integration-local`

`integration-local` must continue to include canonical generated-app verification before default-on is enabled for emitted tests.

## Contract verification

Use `th verify <buildDir>` after deployment to verify on Sourcify and/or Etherscan.

- Supports `--verifier sourcify|etherscan|both`.
- Uses chain-scoped API keys:
  - `SEPOLIA_ETHERSCAN_API_KEY` (preferred)
  - `ETHERSCAN_API_KEY` (fallback)
- Writes verification status back into `manifest.json` under `deployments[*].verified`
  and `manifest.extensions.verification[chainId]`.
- Re-publishes manifest into `ui-site/` when present.
