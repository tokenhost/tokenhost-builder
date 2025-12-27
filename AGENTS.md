Plan

1) Document scope and remediation steps for the Token Host builder.
2) Remove committed secrets; switch to environment-based config; add example env values.
3) Fix template/runtime issues (auth env vars, bad imports, reverse-reference link, Web3 helper signer/provider).
4) Align generator tests with current Solidity output and behavior.

Productized Builder Steps (Detailed Roadmap)

1) Foundation: schema spec + validation + migration tooling.
   - Opinionated stack: TypeScript, Node 20 LTS, pnpm workspaces, turborepo, ESLint + Prettier.
   - Schema: JSON Schema draft 2020-12 with `schemaVersion`, `app`, `contracts[]`, `fields`, `types`, `rules`.
   - Validation: Ajv + custom lint rules (reserved names, circular refs, uniqueness rules, type constraints).
   - Migrations: `migrations/NNN-name.ts` with up/down transforms and a `th migrate` CLI.
   - Builder parity: schema supports UI-driven creation (contract list, fields, types, unique flag, references).
   - Monorepo layout:
     - packages/schema, packages/generator, packages/contracts, packages/templates,
       packages/cli, packages/deployer, packages/indexer, packages/docs, apps/example.
   - Done when: schema validates, migrations run, example app passes validation.
   - Docs: schema reference, lint rules, migration guide, versioning policy.

2) Core generator: contracts + UI generation, tests, and reproducible artifacts.
   - Contract strategy: default to single App contract with structs + events (avoid per-record contracts).
   - Solidity: pin to 0.8.24, compile with Foundry + solc, deterministic formatting.
   - Artifacts: `artifacts/manifest.json` with schema version, compiler version, chain outputs.
   - UI: Next.js 14 with `output: export`, template system with theming + overrides.
   - Preview pipeline: generate a runnable preview app from a saved schema without deploy.
   - Generator APIs: generateContracts(), generateUI(), writeArtifacts(), buildManifest().
   - Tests: golden snapshots for contracts/UI, compile smoke tests, basic contract unit tests.
   - Done when: `th generate` emits artifacts + UI and tests pass on CI.
   - Docs: generation workflow, customization hooks, output structure.

3) Chain adapter/deployer: per-chain RPC/IDs, verification, and env-driven overrides.
   - SDK: viem or ethers v6 (opinionated pick: viem for typed clients + speed).
   - Chain registry: `chains.json` with RPC, chainId, explorer API, confirmations, gas policy.
   - Deployment flow: `th deploy --chain sepolia --signer env` with dry-run support.
   - Verification: Etherscan + Sourcify adapters, auto-verify after deploy.
   - Done when: deploy + verify works for local + one public testnet.
   - Docs: chain config reference, env var map, verification guide.

4) Indexing integration: optional subgraph/indexer for search, filters, and pagination at scale.
   - Adapter interface: generateIndexer(), deployIndexer(), queryAdapter().
   - Default adapter: The Graph subgraph (events-first indexing); optional Subsquid adapter.
   - UI data source switch: on-chain fallback when indexer absent.
   - Done when: sample app can filter/search via indexer and fallback on-chain.
   - Docs: indexing setup, query patterns, scaling notes.

5) CLI and template marketplace: scaffold, generate, build, and deploy with presets and variants.
   - CLI (opinionated): `th init`, `th validate`, `th generate`, `th build`, `th deploy`,
     `th verify`, `th indexer`, `th migrate`, `th doctor`.
   - Optional UI builder: `th studio` launches a local schema editor that writes validated JSON.
   - Template registry: local + remote (GitHub) with semantic versioning and schema compatibility.
   - Presets: minimal, social feed, marketplace, registry.
   - Done when: new app can be created and deployed via CLI only.
   - Docs: CLI usage, template authoring guide, preset catalog.

6) CI/CD with preview deployments: lint + test + generate + deploy in CI, artifact publishing.
   - CI pipelines: lint + test + generate, contract compile, UI build, snapshot diff.
   - Preview deploys: per-PR deploy to testnet + preview site (Vercel/Netlify).
   - Artifact publishing: GitHub Releases or S3 with manifest + checksums.
   - Build status: job queue + build logs and webhook callbacks for managed workflows.
   - Done when: PR produces preview links and main merges produce versioned releases.
   - Docs: GitHub Actions templates, release checklist.

7) Security hardening + audits: threat modeling, automated scans, and on-chain invariants.
   - Security tooling: Slither, Semgrep, npm audit, Foundry fuzz/property tests.
   - Invariants: uniqueness enforcement, reference integrity, access rules, event consistency.
   - Audit prep: documented threat model, test coverage report, dependency SBOM.
   - Done when: automated checks are CI-gated and a third-party audit is feasible.
   - Docs: security checklist, audit prep guide, incident response.

8) Managed service MVP: hosted schema editor, build/deploy pipeline, optional indexer, static hosting, custom domains.
   - Architecture: multi-tenant API + build workers + artifact storage + job queue.
   - UX flow: schema -> validate -> preview -> deploy -> publish -> manage domains.
   - Schema library: per-user app list, version history, and export (JSON + full app bundle).
   - Subdomain provisioning: `app-name.example.com` with build status and CDN hosting.
   - Auth: email + OAuth + wallet signature login (nonce-based); never store private keys.
   - Key handling: BYO wallet by default, optional managed keys with strict guardrails.
   - Asset storage: signed uploads for logos/avatars/assets; optional IPFS pinning.
   - Observability: build logs, error tracking, usage metrics.
   - Docs: hosted service quickstart, domain setup, billing basics.

9) Enterprise hardening: BYO RPC/keys/indexer, compliance controls, usage quotas, SSO/org features.
   - Enterprise features: RBAC, audit logs, SAML/SCIM, VPC deploys, data retention.
   - Compliance: SOC2-ready controls, logging, and policy docs.
   - Done when: enterprise deployment playbook and security posture are documented.
   - Docs: enterprise deployment guide, compliance pack, SLA template.
