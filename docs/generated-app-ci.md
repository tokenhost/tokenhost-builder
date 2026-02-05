# Generated App CI

When you run `th generate <schema> --with-tests`, the generated UI app includes:

- `tests/contract/integration.mjs`
- `tests/ui/smoke.mjs`
- `.github/workflows/generated-app-ci.yml`

The emitted workflow runs in GitHub Actions and is designed to work in a generated app repository with no manual CI authoring.

## Default workflow behavior

- Uses Node 20 and pnpm.
- Caches pnpm store using a lockfile-based key.
- Installs dependencies with `pnpm install --frozen-lockfile`.
- Installs Foundry/anvil.
- Runs generated contract tests with `pnpm run test:contract`.
- Runs generated UI tests with `pnpm run test:ui`.

## Optional workflow knobs

Use repository or environment variables to tune runtime cost:

- `TH_SKIP_CONTRACT_TESTS=1`
  - Skip Foundry installation and contract tests.
- `TH_SKIP_UI_TESTS=1`
  - Skip UI smoke tests.
- `TH_INSTALL_BROWSER_DEPS=1`
  - Install Playwright Chromium dependencies when Playwright exists in the generated app.

## Canonical app validation in this builder repo

This repo validates generated-app test scaffolds and canonical job-board behavior through integration tests under `test/integration/`:

- generated contract scaffold execution
- generated UI scaffold execution against live preview
- end-to-end canonical job-board flow

These checks back the required `integration-local` CI job in this repository.
