# Legacy `tokenhost-web-template` Notes (Archived)

This document preserves practical insights from the deprecated in-repo `tokenhost-web-template/` before removal.

Status:
- Source of truth now lives outside this repo: `tokenhost/app-tokenhost-com-frontend`.
- In this repo, the legacy template is removed to reduce dependency/security noise and avoid dual UI pipelines.

## What was worth preserving

1. Chain mismatch handling and wallet chain add/switch UX
- Legacy helper implemented explicit `wallet_switchEthereumChain` and fallback `wallet_addEthereumChain`.
- This behavior remains important for local Anvil onboarding and should be retained in generated UI runtimes.

2. Read/write provider separation
- Legacy runtime kept a read-capable contract binding and swapped in a signer-backed contract after wallet connect.
- This pattern avoids write failures during unauthenticated reads and should remain part of runtime architecture.

3. Auth endpoint base URL normalization
- Legacy utility normalized external auth host using `NEXT_PUBLIC_GOOGLE_AUTH_DOMAIN` with trailing-slash cleanup.
- Keep this pattern (or equivalent) whenever cross-origin auth endpoints are used by generated UIs.

4. Practical UX components to keep in mind
- Pagination (`Pager.hbs`) and upload progress UI (`ImageUpload.js`) are useful behavior references.
- The specific implementation/dependencies are outdated, but the interaction patterns are still relevant.

## What was intentionally not preserved

- Dependency stack and lockfile (`next@13`, `web3`, mixed lint/prettier setup) due to drift and security churn.
- Handlebars-era file/layout conventions that conflict with the current THS + generated Next export flow.

## Follow-up expectations

- Any necessary visual/UX patterns should be reintroduced in the spec-aligned UI generator under `packages/templates/next-export-ui`.
- Keep design evolution tied to generated-app test coverage and CI, not legacy template branches.
