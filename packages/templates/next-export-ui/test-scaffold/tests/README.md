Generated app test scaffold

This directory is emitted by `th generate --with-tests`.
The same scaffold also emits `.github/workflows/generated-app-ci.yml`.

- `contract/integration.mjs` runs schema-driven contract behavior tests against local anvil.
- `contract/smoke.mjs` validates baseline generated app contract test preconditions.
- `ui/smoke.mjs` validates baseline generated UI route/component preconditions.

Contract integration prerequisites:
- local anvil RPC (default `http://127.0.0.1:8545`)
- generated `../contracts/App.sol` and `../schema.json`

Contract test env vars:
- `TH_RPC_URL` (optional)
- `TH_TEST_PRIVATE_KEY` (optional, defaults to anvil account #0 key)

UI smoke test env vars:
- `TH_UI_BASE_URL` (optional; when set, `ui/smoke.mjs` performs live route and manifest checks)

When `TH_UI_BASE_URL` is not set, `ui/smoke.mjs` runs static scaffold checks only.

Generated CI workflow defaults:
- Install dependencies with pnpm on Node 20.
- Install Foundry/anvil and run `pnpm run test:contract`.
- Run `pnpm run test:ui`.

Generated CI workflow knobs:
- `TH_SKIP_CONTRACT_TESTS=1` skips Foundry install and contract tests.
- `TH_SKIP_UI_TESTS=1` skips UI tests.
- `TH_INSTALL_BROWSER_DEPS=1` installs Playwright Chromium deps if Playwright is present.

These tests are schema-driven and intended to be expanded further for app-specific assertions.
