### Token Host Builder

Turns a Token Host Schema (THS) document into deterministic Solidity artifacts and a generated UI bundle that can be deployed and self-hosted.

- Canonical product spec: `SPEC.md`
- Spec-to-code backlog: `AGENTS.md`

## Current State

- New pipeline (recommended): THS input (`*.schema.json`) -> mapping-based CRUD `App.sol` -> compiled artifact + manifest -> deploy via `th`.
- Legacy pipeline (kept temporarily): `contracts.json` -> per-record child contracts + Handlebars/Next templates via `build.sh`.

## Quickstart (New Pipeline)

Prereqs: Node >= 20, pnpm (repo uses `packageManager`), Foundry optional unless deploying.

```bash
pnpm install
pnpm th doctor

# Validate + build artifacts (Solidity + compile + manifest)
pnpm th validate apps/example/job-board.schema.json
pnpm th build apps/example/job-board.schema.json --out artifacts/job-board

# In another terminal:
anvil

# Deploy to local anvil (uses Anvil's default dev key unless ANVIL_PRIVATE_KEY is set)
pnpm th deploy artifacts/job-board --chain anvil

# Serve the generated UI locally (no Python required)
pnpm th preview artifacts/job-board

# Open http://127.0.0.1:3000/
# MetaMask: approve switching/adding the Anvil network (chainId 31337).
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
