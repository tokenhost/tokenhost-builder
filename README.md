# Token Host Builder

Token Host Builder is a schema-to-dapp generator framework for EVM CRUD apps.

Canonical product behavior is defined in `SPEC.md`.  
Execution backlog and current gap-tracking is in `AGENTS.md`.

## Active sprint

Current sprint source of truth:
- GitHub issue: `#62`
- Ticket draft: `docs/tickets/011-native-hashtag-indexing-and-filecoin-image-uploads.md`

Companion docs for the sprint:
- `docs/worklogs/native-hashtag-indexing-and-filecoin-image-uploads.md`
- `docs/spec-deltas/native-hashtag-indexing-and-filecoin-image-uploads.md`
- `docs/native-hashtag-indexing-and-filecoin-image-uploads-memo.md`

## Legacy template status

- `tokenhost-web-template/` is retired from this repo.
- Legacy frontend continuity lives in `tokenhost/app-tokenhost-com-frontend`.
- Preserved migration/behavior notes: `docs/legacy-tokenhost-web-template-notes.md`.

## First-class chain targets

- `anvil`
- `sepolia`
- `filecoin_calibration`
- `filecoin_mainnet`

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

## Transaction modes (generated UI)

Builder supports transaction mode metadata in `manifest.extensions.tx`:

- `userPays`: browser wallet signs/sends writes directly.
- `sponsored`: generated UI posts writes to a relay endpoint.

CLI controls:

- `th build <schema> --tx-mode auto|userPays|sponsored`
- `th up <schema> --tx-mode auto|userPays|sponsored`

Default `auto` behavior:

- anvil/local chain => `sponsored`
- other chains => `userPays`

Local preview endpoints:

- `GET/POST /__tokenhost/relay` for sponsored local writes (anvil).
- `GET/POST /__tokenhost/faucet` remains available for non-sponsored local mode.
