Generated app test scaffold

This directory is emitted by `th generate --with-tests`.

- `contract/integration.mjs` runs schema-driven contract behavior tests against local anvil.
- `contract/smoke.mjs` validates baseline generated app contract test preconditions.
- `ui/smoke.mjs` validates baseline generated UI route/component preconditions.

Contract integration prerequisites:
- local anvil RPC (default `http://127.0.0.1:8545`)
- generated `../contracts/App.sol` and `../schema.json`

Contract test env vars:
- `TH_RPC_URL` (optional)
- `TH_TEST_PRIVATE_KEY` (optional, defaults to anvil account #0 key)

These tests are schema-driven and intended to be expanded further for app-specific assertions.
