### Token Host Builder

Turns a Token Host Schema (THS) document into deterministic Solidity artifacts and a generated UI bundle that can be deployed and self-hosted.

- Canonical product spec: `SPEC.md`
- Spec-to-code backlog: `AGENTS.md`

## Current State

- New pipeline (recommended): THS input (`*.schema.json`) -> mapping-based CRUD `App.sol` -> compiled artifact + manifest -> deploy via `th`.
- Legacy pipeline (kept temporarily): `contracts.json` -> per-record child contracts + Handlebars/Next templates via `build.sh`.

## Quickstart (New Pipeline)

Prereqs: Node >= 20, pnpm (repo uses `packageManager`), Foundry required for local anvil (`th up` default) and for `th verify`.

```bash
pnpm install
pnpm th doctor

# One command: validate + build + start anvil + deploy + serve UI + local faucet
pnpm th up apps/example/job-board.schema.json

# Open http://127.0.0.1:3000/
# MetaMask: approve switching/adding the Anvil network (chainId 31337).
# Use the "Get test ETH" button (local faucet) if your wallet needs funds.
```

Environment examples:
- `.env.example` (CLI)
- `tokenhost-web-template/.env.example` (legacy generated UI template)

## Legacy (Deprecated)

```bash
pnpm legacy:build
# or
pnpm legacy:build-run
```

## Testing

Token Host Builder uses a two-layer quality model:

- Builder framework tests: validate schema/generator/CLI/runtime behavior.
- Generated app tests: validate that produced apps behave correctly for their schema (canonical `job-board` is enforced in CI today).

Fast local suite (no local chain required):

```bash
pnpm test
pnpm typecheck
```

Local integration suite (requires `anvil` on PATH):

```bash
pnpm test:integration
```

Generated app test scaffold (issue #28 slice):

```bash
pnpm th generate apps/example/job-board.schema.json --out artifacts/job-board --with-tests
cd artifacts/job-board/ui
pnpm test
```

Current integration coverage includes:

- preview auto-deploy behavior and manifest publication checks,
- local faucet behavior checks,
- canonical `apps/example/job-board.schema.json` end-to-end assertions:
  - Candidate CRUD flows,
  - JobPosting paid-create enforcement,
  - generated UI route health checks.

Planned expansion:

- generated apps emitted by `th generate` should include app-level test scaffolds/scripts so downstream repos can run schema-specific tests by default.

## CI

PRs run two required jobs:

- `static`: install + unit/CLI/template tests + typecheck
- `integration-local`: install + Foundry + local Anvil integration tests (`th preview`/deploy/faucet paths)
