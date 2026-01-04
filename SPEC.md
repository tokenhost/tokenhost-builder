# Token Host Platform Specification (Draft v0.7)

Status: Draft (spec-driven design)  
Owner: Token Host  
Domain: `tokenhost.com`  
Last updated: 2026-01-04  
Scope: Production system. All existing repos are legacy prototypes and are not binding.

This document defines the intended production design of the Token Host platform: a managed schema-to-dapp builder that generates and deploys smart contracts, generates a hosted UI, optionally provisions indexing, and publishes apps under a dedicated hosted-app origin (default `*.apps.tokenhost.com`, plus optional custom domains).

Normative language: The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in RFC 2119.

---

## 1. Product Summary

Token Host is a “Firebase for Web3”: a platform for building blockchain-backed applications using a CRUD-first mental model.

Unlike traditional CRUD databases, smart contract storage and events are publicly readable on most chains. Token Host can generate **gateway/API visibility controls** and “read access” checks for its generated UI and hosted APIs, but these do not provide confidentiality. Apps MUST NOT store secrets or sensitive PII on-chain.

A user defines an **app schema** (collections, fields, constraints, and access rules). Token Host:
1) validates the schema,
2) generates an on-chain data contract (“App contract”),
3) generates a static web UI for CRUD and browsing,
4) deploys and verifies the contract on a selected chain,
5) (optionally) deploys/attaches an indexer for scalable queries,
6) hosts the generated UI at `https://<app-slug>.apps.tokenhost.com`.

Token Host also supports a **developer/automation** mode via a CLI that runs the same validation/generation/deploy steps locally or in CI and can export a complete app bundle.

### 1.1 Primary lifecycle: launch on Token Host, migrate outward

The original Token Host product intent (predating modern rollups) was a “cloud-hosted chain”: a middle ground between cloud databases and public blockchains where developers get:
- a developer-friendly creator experience (schemas, CRUD, indexing),
- a trusted operator (Token Host) who can run the infrastructure like a cloud provider,
- and a cryptographic audit trail because the authoritative state machine is an EVM.

In today’s ecosystem, the practical implementation is a low-cost EVM rollup/appchain operated by Token Host (“Token Host Chain”) plus a path to graduate onto external EVM chains (including OP Stack-based “OP Chains”).

Token Host’s primary recommended workflow is:
1) **Launch on Token Host Chain** in full on-chain mode (records + indexes) for fast iteration, low fees, and a cloud-like managed experience where the entire *backend* of the app runs on the EVM (no custom servers required for correctness).
2) **Graduate to a dedicated appchain / external rollup** when the app needs more sovereignty, scale, or ecosystem alignment. Token Host supports this by:
   - deploying the same schema-backed contracts to the destination chain,
   - switching the release’s primary write deployment,
   - preserving continuity by reading legacy deployments and optionally copying state.

Advantages of “EVM as the database backend” (especially on a low-cost rollup):
- **Audit trail**: all writes are transactions with receipts and events; history is inspectable.
- **Deterministic correctness**: business rules, access control, constraints, and payments live in contracts.
- **Portability**: the same generated contracts can run on any EVM chain (subject to chain configs), enabling migration and multi-chain releases.
- **Operational simplicity**: a static UI + RPC is sufficient to operate a functional app (indexers enhance UX but do not define correctness).

Token Host explicitly targets a “trusted operator with auditability” model:
- Early-stage apps can accept Token Host as the operator (analogous to “IBM-style” managed infrastructure) while benefiting from a verifiable ledger.
- As apps mature, the operator trust model can be reduced over time by migrating to a more decentralized rollup/appchain deployment.

---

## 2. Design Principles

### 2.1 Deterministic, auditable builds
- Given the same canonical schema (`schemaHash`), generator version, and toolchain digest, Token Host MUST produce deterministic contract sources and MUST produce artifacts with stable, verifiable digests recorded in the manifest.
- Token Host MUST define determinism in terms of canonical artifact digests rather than byte-for-byte identity of bundler output directories; the manifest is the verification surface.
- Every build MUST emit a signed manifest that records schema identity, toolchain versions, and produced artifact digests.

### 2.2 Chain-agnostic by default
- The platform MUST support a chain registry and per-chain deployment adapters.
- A single schema version MAY be deployed to multiple chains; the manifest MUST track deployments per chain.

### 2.3 No private key custody by default
- Token Host MUST NOT require users to upload, store, or share wallet private keys to use generated apps.
- Managed transaction improvements (gas sponsorship, batching, “session keys”) MUST be implemented without persistent user key custody (see EIP-7702 section).

### 2.4 CRUD-first, indexer-optional
- In the default configuration (with on-chain indexing enabled), the generated app MUST work using on-chain reads and writes without relying on an off-chain indexer.
- Token Host MAY support a “Lite mode” that disables heavy on-chain indexes for cost reasons; in that mode, list/search UX MAY require an indexer, but core create/update/delete and direct `get` by id MUST remain supported.
- When indexing is enabled, the UI SHOULD transparently switch to indexer-backed queries for scalability while preserving correctness (falling back to on-chain if the indexer is unavailable).

### 2.5 Secure-by-default configuration
- Secrets MUST be provided only via secure configuration (environment variables or secret stores). No hard-coded secrets in repo, templates, or generated output.
- Uploaded assets MUST use signed upload URLs; arbitrary server file paths MUST NOT be accepted.

### 2.6 No privacy illusions
- Token Host MUST treat all on-chain storage and emitted events as publicly readable.
- Token Host MUST NOT describe “read access” as privacy, encryption, or confidentiality; it is gateway/API visibility only.
- Studio MUST display an explicit warning when designing schemas and before publishing: “On-chain data is public. Do not store PII, secrets, or sensitive business data.”
- If an app requires confidentiality, Token Host MUST support privacy-preserving patterns such as:
  - client-side encryption (store ciphertext/commitments on-chain; manage keys off-platform), and/or
  - storing sensitive fields off-chain with on-chain references/commitments.

### 2.7 Economics-aware, L2-first
- Token Host SHOULD be positioned and optimized for L2s/high-throughput chains (e.g., Base, Arbitrum, Optimism, Polygon) where on-chain CRUD is economically viable.
- Studio MUST warn users when deploying schemas that store large `string` fields or maintain heavy on-chain indexes on expensive chains.
- For L1 deployments, Studio SHOULD default to Lite mode and MUST clearly communicate the gas/storage economics tradeoffs.

### 2.8 Cloud-chain first, portable
- Token Host SHOULD offer a first-party, low-cost EVM rollup/appchain (“Token Host Chain”) optimized for full on-chain mode (records + indexes).
- Token Host Chain and Token Host-provisioned appchains SHOULD be based on a standardized EVM rollup/appchain stack (e.g., OP Stack) to simplify provisioning, operations, and migration workflows.
- Token Host MUST support a first-class “launch on Token Host Chain, migrate to external chain” workflow via releases that can reference legacy deployments and switch the primary write target over time (see Section 11.8).
- Token Host MUST keep generated contracts portable across EVM chains (no hidden dependencies on Token Host Chain-specific precompiles); chain differences are expressed only through adapters and configuration.

### 2.9 Progressive decentralization (appchain growth path)

Token Host’s managed-chain model is designed to support a deliberate, staged reduction of trust in the operator over time.

- Token Host Chain and Token Host-provisioned appchains MAY begin with a centralized operator (sequencer + ops) for performance and DX.
- The system MUST be designed so that decentralization can increase over time without changing application schemas or contract semantics (only the chain environment changes).
- Studio MUST represent chain “trust posture” clearly (e.g., managed vs external vs decentralized) and MUST avoid implying decentralization where it does not exist.

### 2.10 Real-time UX via events

Token Host apps are intended to feel “alive” despite being backed by blockchain state.

- Generated apps SHOULD use chain events and (where available) websocket subscriptions to trigger refreshes and keep list/detail pages up to date.
- Real-time UX MUST NOT change correctness semantics: contracts remain authoritative, and reorg/finality behavior MUST be respected (see Sections 4.5.5 and 8.9).

---

## 3. Concepts and Terminology

- **Studio**: the web UI at `https://app.tokenhost.com` where users create schemas, build, deploy, and manage hosted apps.
- **Schema**: versioned JSON document that defines collections, fields, constraints, and access rules.
- **App**: a Token Host project with a chosen slug and one or more schema versions.
- **Collection**: a schema-defined entity (formerly called “contract” in prototypes) that maps to an on-chain record set.
- **Record**: an instance in a collection.
- **Build**: a deterministic generation + compilation + packaging run for a schema version.
- **Deployment**: a chain-specific deployment of a build’s contracts.
- **Release**: a published UI + contract address set mapped to a domain (subdomain or custom domain).
- **Manifest**: a machine-readable artifact describing build inputs, outputs, and deployments.
- **Indexer**: optional off-chain service that consumes on-chain events to enable search and advanced queries.
- **Token Host Chain**: a Token Host-operated EVM rollup/appchain intended to provide a cloud-like default environment for full-mode apps.
- **Appchain**: a dedicated EVM rollup/appchain provisioned for a specific app (or org) with its own RPC endpoints and chain configuration, intended as a “graduation” step from the shared Token Host Chain.
- **Chain migration**: switching a release’s primary deployment from one chain to another (while optionally continuing to read legacy deployments and optionally copying state).

---

## 4. System Architecture (Managed Platform)

### 4.1 High-level components

Token Host consists of the following production services:

1) **Studio (Web)**  
   - Handles user interactions: schema editing, build/deploy actions, domain settings, viewing logs and status.

2) **Token Host API** (`api.tokenhost.com`)  
   - Multi-tenant API for authentication, schema storage, builds, deployments, domains, templates, and billing.

3) **Build Orchestrator**  
   - Accepts build/deploy requests, enqueues jobs, manages concurrency, and exposes job state transitions.

4) **Workers**  
   - Stateless workers that run validation, code generation, compilation, packaging, deployment, verification, and indexer provisioning.

5) **Artifact Store**  
   - Stores build outputs: manifests, generated sources, ABIs, UI bundles, checksums, and logs.

6) **Hosting + CDN**  
   - Serves static releases under `*.apps.tokenhost.com` (or a separate hosted-app domain).
   - Provides a “Building…” status page when a release is not yet published.

7) **Chain Adapter Layer**  
   - Provides deploy/verify operations for supported chains with chain registry configuration.

8) **Indexer Layer (Optional)**  
   - Provides deployable/queryable indexers (e.g., The Graph or a managed event indexer).

9) **Token Host Chain (Optional, first-party network)**  
   - A Token Host-operated EVM rollup/appchain providing low-cost execution, stable RPC endpoints, and (optionally) standardized AA/sponsorship infrastructure for hosted apps.

10) **Appchain Provisioner (Optional)**  
   - Service that provisions dedicated EVM appchains (e.g., OP Stack-based “OP Chains”) for apps/orgs, manages chain configuration, and integrates new chains into Token Host’s deploy/index/host workflows.

### 4.2 Trust boundaries

- The user’s wallet (EOA or smart account) is outside Token Host trust boundaries.
- Token Host MUST treat RPC nodes, explorers, and OAuth providers as external dependencies.
- Token Host MUST assume schema input is untrusted and MUST validate/sanitize before using it to generate code.
- If Token Host operates Token Host Chain and/or managed appchains, those networks are part of Token Host’s operational trust boundary; Studio MUST disclose their trust posture to users (managed vs external vs decentralized).

### 4.3 Deployment models

- **Managed**: Token Host hosts the UI and orchestrates builds and deployments; users interact via Studio + generated app.
- **Export/Self-host**: Users can download a complete app bundle (schema + generated source + UI bundle + manifest) and deploy/host themselves.

### 4.4 Token Host Chain and appchains (cloud chain -> rollup)

Token Host is designed around the idea that an application’s backend can live entirely on an EVM execution layer:
- data (records),
- integrity constraints (uniqueness),
- access control (create/update/delete/transfer),
- optional on-chain indexes for browsing (full mode),
- and optional payment/reward mechanics.

In this model, “hosting the app” is primarily:
- hosting a static UI bundle, and
- operating reliable RPC/indexing infrastructure for the chain(s) the app targets.

Token Host provides two managed chain deployment flavors:

1) **Token Host Chain (shared)**  
   A Token Host-operated EVM rollup/appchain intended as the default “cloud chain” environment for new apps. It SHOULD be optimized for:
   - low, predictable fees suitable for CRUD workloads,
   - stable RPC endpoints and operational SLOs,
   - standardized account-abstraction/sponsorship capabilities (where feasible),
   - easy migration out to external EVM chains.

2) **Appchains (dedicated)**  
   Token Host MAY provision dedicated EVM rollups/appchains per app or org (e.g., OP Stack-based “OP Chains”). These are the “growth path” for apps that need more sovereignty or dedicated throughput while keeping the same EVM contract backend model.

Token Host’s “trusted authority with audit trail” positioning implies:
- The operator (Token Host) MAY control sequencing, fees, and infrastructure in managed environments.
- The system SHOULD provide verifiable history and auditability so that developers/users can independently inspect state transitions.
- Studio MUST clearly communicate when an app is running on a Token Host-managed chain vs an external chain and MUST avoid implying trustlessness when a trusted operator exists.

### 4.5 Token Host Chain & Appchain Specification (Draft)

This section specifies the chain-layer assumptions and artifacts required to support Token Host’s primary lifecycle (launch on a managed “cloud chain”, then migrate to an appchain/external EVM chain) without changing application contract semantics.

Token Host Chain and Token Host-provisioned appchains are “trusted operator + audit trail” environments: the operator may be centralized, but state transitions are recorded on an EVM ledger and are independently inspectable.

#### 4.5.1 Goals
- Provide a low-cost, high-throughput EVM execution environment suitable for full-mode apps (records + indexes) and creator workflows.
- Provide cloud-like operational guarantees (reliable RPC, predictable fees, observability) while keeping application correctness in contracts.
- Preserve portability: Token Host-generated contracts MUST remain deployable on external EVM chains without semantic changes.
- Provide a credible “graduation” path: from shared Token Host Chain -> dedicated appchain -> external EVM chain(s).

#### 4.5.2 Trust posture and authority model

Token Host MUST treat chain trust posture as a first-class, explicit property of every chain configuration.

At minimum, Token Host MUST support the following trust posture labels:
- `managed`: Token Host operates the sequencer and chain infrastructure.
- `co-managed`: Token Host and customer/dev share governance and/or operational control via multi-party controls.
- `external`: Token Host does not operate the chain (external EVM chain).
- `decentralized`: chain governance/sequencing is not controlled by Token Host (must not be used unless defensible).

For `managed` and `co-managed` chains, Token Host MUST assume (and disclose) that:
- The operator MAY be able to censor or delay transactions.
- The operator MAY perform chain software upgrades that affect performance/availability.
- The operator’s infrastructure is part of the app’s operational dependency graph.

“Audit trail” in this context means:
- all successful writes are transactions with receipts and emitted events,
- the chain exposes sufficient public RPC access for independent inspection of history,
- Token Host provides signed configuration and change logs for chain lifecycle actions (see below).

Audit trail MUST NOT be described as censorship resistance or privacy.

#### 4.5.3 Verification guarantees

Token Host Chain/appchains MUST provide:
- stable, documented RPC endpoints for reads and writes,
- access to transaction receipts and logs for indexing,
- consistent chain identifiers (`chainId`) and network metadata.

Token Host MUST provide a chain configuration artifact that can be independently verified for integrity (Section 4.5.5).

For managed chains, Token Host SHOULD provide additional verification affordances, such as:
- a public “chain status” endpoint (uptime/incident history),
- published hashes/digests of chain configuration and upgrades,
- a public archive RPC endpoint (where feasible) or a documented data retention policy.

#### 4.5.4 Upgrade and maintenance policy

Token Host MUST distinguish between:
- **app immutability** (schema versions and deployed app contracts), and
- **chain upgrades** (rollup/appchain software upgrades, sequencer infrastructure, DA configuration).

Chain upgrades are sometimes necessary. Therefore:
- Token Host MUST publish an explicit chain upgrade/maintenance policy for Token Host Chain and Token Host-managed appchains.
- Token Host MUST log and audit all chain lifecycle actions (provisioning, upgrades, parameter changes, key rotations) with immutable records and timestamps.
- High-impact chain actions SHOULD require multi-party approval controls (see Section 15.7).

Studio MUST surface chain upgrade status separately from app build/deploy status.

#### 4.5.5 Chain configuration artifact (canonical)

Every chain used by Token Host (Token Host Chain, Token Host-provisioned appchains, and user-configured external chains) MUST be representable as a versioned chain configuration artifact.

- The canonical JSON Schema for this artifact is `schemas/tokenhost-chain-config.schema.json`.
- Token Host MUST store and serve chain config artifacts as immutable, versioned documents.
- Chain config artifacts MUST be signed by the issuer (Token Host for managed chains; user/org for BYO chain configs).

At minimum, the chain config artifact MUST include:
- `chainId`, name, and native currency metadata,
- trust posture label and operator identity (for `managed`/`co-managed`),
- expected finality assumptions (e.g., recommended confirmations, typical finality time),
- data availability / settlement metadata for rollups (L1 origin chain, bridge entry points, DA mode/provider where applicable),
- sequencer/proposer identity metadata for managed chains (at minimum, operator name; optionally key IDs),
- RPC endpoints and explicit capability flags (archive, batching, trace/debug availability),
- websocket/log-subscription capability where available (for real-time UIs; see Section 8.9),
- recommended limits/caps for generated contracts and UIs where available (e.g., list page size and realtime polling intervals),
- operational metadata (rate limits, status/SLO URL pointers where available),
- explorer URLs (if applicable),
- AA/sponsorship capability flags (if applicable),
- issuer identity and signatures.

For real-time UIs, chain configs SHOULD include at least one `wss://` RPC endpoint and SHOULD mark it with `rpc.endpoints[].capabilities.subscriptions=true` when `eth_subscribe` log subscriptions are supported.

#### 4.5.6 Chain and appchain lifecycle

Token Host MUST model chain/appchain lifecycle actions as jobs with audit logs, similar to build/deploy jobs:
- provision Token Host-managed appchain,
- update chain configuration,
- rotate operator keys (where applicable),
- deprecate chain endpoints and migrate apps off a chain.

When Token Host provisions an appchain, the provisioning result MUST include:
- a chain config artifact that can be exported/self-hosted,
- explicit trust posture and operator identity,
- a clear “exit path” recommendation (how to migrate to another EVM chain).

### 4.6 Progressive Decentralization Playbook

This section defines how Token Host communicates and executes a “managed -> co-managed -> decentralized” growth path for Token Host Chain and Token Host-managed appchains.

#### 4.6.1 UX requirements (normative)

Token Host MUST represent chain trust posture clearly and consistently across Studio and hosted apps.

Studio MUST:
- show the chain’s trust posture label (`managed|co-managed|external|decentralized`) alongside every chain selector,
- display the chain operator identity (e.g., “Operated by Token Host”) for `managed`/`co-managed` chains,
- link to the chain config artifact (and its signatures) for the selected chain,
- show a warning banner before deploying to a `managed` chain explaining the authority model (possible censorship/delay) and the auditability model (verifiable history),
- never label a chain as `decentralized` unless Token Host can justify that claim with documented criteria.

Hosted apps (generated UI) SHOULD:
- display the primary chain trust posture in an “About/Network” panel,
- link to release manifests and chain config artifacts where discoverable,
- display migration context when legacy deployments exist (see Section 8.8).

#### 4.6.2 Technical stage plan (non-normative)

This is a non-normative reference progression that Token Host can use to communicate maturity and guide engineering.

Stage 0: **Managed (default launch posture)**
- Centralized operator runs sequencer + infra.
- Focus: low fees, reliability, and developer velocity.
- Requirements: strong operational security, clear disclosure, robust audit logs, stable RPC.

Stage 1: **Co-managed**
- Introduce multi-party controls for governance/admin actions (e.g., multi-sig for upgrades).
- Clarify separation of duties between Token Host and the customer/dev org.
- Improve transparency: published change logs, signed config versions, scheduled maintenance windows.

Stage 2: **Decentralization-ready**
- Reduce single-operator risk through stronger guarantees around configuration integrity, retention, and recoverability.
- Expand independent verification affordances (archive access, consistent indexing surfaces, documented DA/finality assumptions).
- Formalize and test migration/exit procedures as a first-class capability.

Stage 3: **Decentralized (aspirational)**
- Governance and sequencing are not controlled by Token Host.
- Token Host’s role becomes tooling + hosting + service integration.
- Warning: Token Host MUST treat “decentralized” as a claim requiring rigor and MUST avoid marketing-driven redefinitions.

---

## 5. Domains, Subdomains, and Hosting

### 5.1 Default hosted subdomains

Every app MAY be published to a Token Host subdomain:

- `https://<app-slug>.apps.tokenhost.com`

`app-slug` MUST be unique platform-wide and MUST conform to:
- lowercase letters, digits, hyphen
- length 3–63
- no leading/trailing hyphen
- not in the reserved slug list (`app`, `api`, `www`, `admin`, `support`, etc.)

Slug uniqueness MUST be enforced at app creation time and also at publish time (to prevent takeover of released subdomains).

### 5.2 Build status pages

Before an app is published (or while a new release is building), the subdomain MUST serve a static status page indicating:
- build state (queued/running/failed/succeeded),
- last updated timestamp,
- links to Studio for authorized users (not publicly exposing sensitive logs).

### 5.3 Custom domains

Apps MAY be published to custom domains owned by the user.

Token Host MUST implement DNS-based ownership verification (e.g., TXT record with a signed token) and MUST provide:
- required DNS instructions,
- verification status,
- automatic TLS provisioning via ACME.

### 5.4 CDN caching and invalidation

- Token Host MUST version UI bundles by content hash and serve immutable assets with long cache lifetimes.
- Publishing a new release MUST update the subdomain routing to point at the new versioned bundle without needing cache invalidation for immutable assets.

### 5.5 Takedowns and trust & safety

Token Host hosts user-generated applications under Token Host-controlled domains. As the hosting provider, Token Host MUST implement a trust & safety mechanism that can unpublish the *hosted UI* even if the underlying contracts remain live.

- Token Host MUST support placing an app (or specific release) into a `suspended`/`takedown` state.
- In takedown state, Token Host MUST disconnect domain routing for the app (or serve a generic “unavailable” page) and MUST NOT serve the user-generated UI bundle from Token Host-controlled domains.
- Takedown actions MUST be audited and access-controlled (admin-only).
- Takedown MUST NOT attempt to “delete” on-chain data; it only affects hosted content and Token Host services.

### 5.6 Hosted-app origin isolation (required)
Serving untrusted, user-generated apps under the same origin or cookie scope as platform control planes increases security and reputation risk.

- Hosted apps MUST be served from a dedicated hosted-app origin distinct from Studio and API.
- Studio/API session cookies MUST NOT be scoped to `.tokenhost.com` and MUST NOT be readable by hosted apps.
- Studio and API cookies SHOULD be host-only (no `Domain=` attribute) and SHOULD use `__Host-` cookie prefixes.
- Token Host SHOULD use a separate registrable domain (different eTLD+1) for hosted apps in production. If hosted apps are served under a `tokenhost.com` subdomain (e.g., `*.apps.tokenhost.com`), Token Host MUST harden cookie scope and isolation as above.
- Hosted apps MUST be treated as untrusted content: strict CSP, no privileged cookies, and safe escaping of user-provided content.

---

## 6. Schema Specification (“Token Host Schema”, THS)

### 6.1 Format and versioning
The Token Host Schema (THS) is a JSON document that fully describes the user-facing and on-chain behavior of a Token Host app. It is the single source of truth for generation, builds, and deployments.

At minimum, a schema contains:
- a required `thsVersion` (the THS document format version),
- a `schemaVersion` (the app’s semantic version) for human-readable versioning,
- an `app` section (metadata, features, theming),
- a list of `collections` (CRUD data models).

`thsVersion` identifies how to parse/validate the schema document. `schemaVersion` identifies the app’s semantic version and MUST NOT be used to infer schema document format.

In addition to `schemaVersion`, Token Host computes a canonical `schemaHash` for identity and reproducibility. The `schemaHash` MUST be computed over the entire schema document (including `thsVersion`) by:
1) canonicalizing JSON using RFC 8785 (JSON Canonicalization Scheme), and
2) hashing the canonical bytes with SHA-256,
3) representing the output as `sha256:<lowercase-hex>`.

The `schemaHash` is used to:
- uniquely identify build inputs,
- deduplicate identical schemas,
- key build caches safely,
- sign manifests.

Schema versions are immutable once published. Editing a published schema MUST create a new schema version.

### 6.2 Root structure (conceptual)
The canonical root fields are:
- `thsVersion`: string, required (THS document format version)
- `schemaVersion`: string, required (app semver)
- `app`: object, required
  - `name`: string, required
  - `slug`: string, required (must equal or derive from hosted slug rules)
  - `description`: string, optional
  - `theme`: object, optional (colors, typography, logos)
  - `features`: object, optional (indexer, delegation, uploads, on-chain indexing)
- `collections`: array, required
- `metadata`: object, optional (createdBy, createdAt, tags)

If present, `app.features` MAY include:
- `indexer`: boolean, default false (enable indexer integration)
- `delegation`: boolean, default false (enable delegation UX where supported; see Section 10)
- `uploads`: boolean, default false (enable managed upload flows; see Section 8.3)
- `onChainIndexing`: boolean, default true (when false, disable optional on-chain query indexes; see Section 7.8)

The `app.slug` is the durable identifier used for:
- hosted routing (`<slug>.apps.tokenhost.com` by default),
- release ownership and access checks in Studio,
- template selection defaults.

Token Host MUST treat `slug` as immutable once an app has been published to a hosted origin. If renaming is supported, it MUST be implemented as “new slug + redirect” rather than reassigning ownership of an existing slug.

### 6.3 Collections

Each collection defines:
- `name`: string, required (PascalCase)
- `plural`: string, optional for UI (defaults to `name + "s"`)
- `fields`: array of Field Definitions (user-defined fields)
- `createRules`, `visibilityRules`, `updateRules`, `deleteRules`, `transferRules`: access and field policies
- `indexes`: uniqueness and query indexes
- `relations`: references to other collections
- `ui`: per-collection UI overrides (default list columns, sort, forms)

### 6.4 Field definitions

Fields define on-chain storage and UI behavior. A field includes:
- `name`: string, required (camelCase, unique in collection)
- `type`: enum, required
- `required`: boolean, default false (UI-only; on-chain requiredness is defined by `createRules.required`)
- `decimals`: number, required when `type="decimal"` (0–18 recommended; defines the scale factor `10^decimals`)
- `default`: optional default value (off-chain only unless representable on-chain)
- `validation`: optional validation rules; Token Host MUST clearly label which validations are enforced on-chain (authoritative) vs off-chain (UX-only)
- `ui`: optional display metadata (label, placeholder, widget, helpText)

Studio SHOULD auto-derive `field.required` from `createRules.required` and MUST warn (or auto-correct) when they diverge.

Supported v1 field types:
- `string`: UTF-8 string, stored on-chain
- `uint256`: numeric, stored on-chain
- `int256`: numeric, stored on-chain
- `decimal`: fixed-point decimal stored as a scaled `uint256` (schema MUST specify `decimals`; UI MUST handle parse/format)
- `bool`: stored on-chain
- `address`: stored on-chain
- `bytes32`: stored on-chain
- `image`: stored as `string` URL/CID; upload handled off-chain (see uploads)
- `reference`: foreign key to another collection (stored as `uint256` record ID)
- `externalReference`: address pointer to an external contract/account (stored as `address`)

Field names MUST NOT conflict with:
- system field names (`id`, `createdAt`, `createdBy`, `owner`, `updatedAt`, `updatedBy`, `isDeleted`, `deletedAt`, `version`),
- reserved Solidity keywords or global names (`address`, `mapping`, `contract`, etc.),
- reserved UI/runtime identifiers used by the generated app.

### 6.5 System fields

Token Host collections always include system fields in the generated contract, even if not declared in the schema:
- `id` (`uint256`): record ID
- `createdAt` (`uint256`): block timestamp at create
- `createdBy` (`address`): `_msgSender()` at create
- `owner` (`address`): current owner at create (defaults to `_msgSender()`); updated by transfers if enabled
- `updatedAt` (`uint256`): block timestamp at update (if updates enabled)
- `updatedBy` (`address`): `_msgSender()` at update (if updates enabled)
- `isDeleted` (`bool`): soft delete flag (if soft delete enabled)
- `deletedAt` (`uint256`): timestamp at delete (if soft delete enabled)
- `version` (`uint256`): optimistic concurrency counter (optional feature)

The generated UI MUST hide system fields by default but MAY expose them in “advanced” views.

### 6.6 CRUD rules and access model

Each collection defines operation policies:

**Create rules**
- `required`: list of field names required at create
- `auto`: map of system/custom fields to expressions (limited safe set)
- `payment`: optional payment requirement for create (v1 supports native currency only)
- `access`: one of:
  - `public`: any address
  - `owner`: shorthand for “any address; record `owner` is set to `_msgSender()` at create”
  - `allowlist`: only addresses in an on-chain allowlist
  - `role`: addresses with RBAC roles (OpenZeppelin-style AccessControl)

If `createRules.payment` is present, it MUST have:
- `asset`: `"native"` (v1)
- `amountWei`: string (uint256 in wei)

Studio MAY accept human-readable inputs (e.g., “0.01 ETH”) but MUST convert and store the canonical `amountWei` in the schema to preserve determinism and chain-agnostic behavior.

**Visibility rules (UI/gateway visibility; not confidentiality)**
- `gets`: list of fields displayed by default in the generated UI and returned by Token Host-hosted gateway/indexer APIs (if applicable)
- `access`: `public|owner|allowlist|role` (enforced in UI and Token Host-hosted APIs; does not provide confidentiality for on-chain data)

Visibility rules MUST be described as gateway/API visibility only. They MUST NOT be presented as privacy or confidentiality, because on-chain storage and events remain publicly readable.

**Update rules**
- `mutable`: list of user fields that may be updated
- `access`: `owner|allowlist|role` (default SHOULD be `owner`)
- `optimisticConcurrency`: boolean (if enabled, caller supplies expected version)

**Delete rules**
- `softDelete`: boolean (default true)
- `access`: `owner|allowlist|role`

**Transfer rules**

Transfers enable asset-like ownership changes (tickets, coupons, items) where the current owner can assign the record to a new owner address.

- If `transferRules` is absent, the generator MUST NOT emit transfer methods for the collection.
- If `transferRules` is present, it MUST define:
  - `access`: `owner|allowlist|role` (default SHOULD be `owner`)

Transfers MUST:
- change `record.owner` (but MUST NOT change `record.createdBy`),
- be disabled for deleted records (soft or hard deleted),
- reject `to == address(0)`.

Example (transfer-enabled asset collection):

```json
{
  "name": "Ticket",
  "fields": [{ "name": "eventName", "type": "string", "required": true }],
  "createRules": { "required": ["eventName"], "access": "public" },
  "visibilityRules": { "gets": ["eventName"], "access": "public" },
  "updateRules": { "mutable": [], "access": "owner" },
  "deleteRules": { "softDelete": true, "access": "owner" },
  "transferRules": { "access": "owner" },
  "indexes": { "unique": [], "index": [] }
}
```

Access rules are enforced on-chain. UI MUST reflect access (disable/hide actions), but on-chain enforcement is authoritative.

In managed mode, Studio MAY expose convenience “roles” (e.g., “Only my team”) that map to explicit on-chain allowlists or RBAC role assignments. The contract MUST remain the final arbiter of permission.

### 6.7 Indexes and constraints
Token Host defines two families of constraints:

1) **Uniqueness constraints** (`unique`)
   - Enforced on-chain at create and update.
   - Each uniqueness constraint MUST specify a `field` and MAY specify a `scope`:

Schema shape (normative):
- `indexes.unique`: array of objects `{ "field": string, "scope": "active"|"allTime" }` (`scope` defaults to `active`).
     - `active` (default): unique among non-deleted records; values MAY be reused after soft delete.
     - `allTime`: values are never reusable once claimed (recommended for handles/slugs where reuse enables impersonation).

2) **Query indexes** (`index`)
   - Used to support equality-based listing and reverse reference listing.
   - Indexes MAY be implemented as append-only lists (see on-chain scaling notes).

### 6.8 Relations

Relations are expressed through `reference` fields and relation metadata:
- `field`: the local reference field name
- `to`: target collection name
- `enforce`: boolean; if true, create/update MUST ensure referenced record exists and is not deleted
- `reverseIndex`: boolean; if true, Token Host MUST maintain a reverse lookup index for the relation

### 6.9 Migrations

Schema evolution requires explicit migrations and an explicit data continuity strategy:
- Breaking schema changes MUST bump `schemaVersion` (semver major).
- Token Host MUST provide a migration framework that can transform schema JSON between versions.
- On-chain data migration is not automatic. By default, Token Host treats contracts as immutable deployments and preserves historical data at historical addresses.

#### 6.9.1 Default upgrade model: new contract per schema version
- Each schema version deployment MUST be treated as immutable: contract code and storage are not upgraded in place.
- Deploying schema v2 on a chain produces a new App deployment for that chain (one or more contract addresses, depending on deployment mode).
- A release MAY point to multiple deployments across schema versions to preserve continuity in the user experience.

#### 6.9.2 Data continuity strategy (default): UI aggregation
To avoid “migration cliffs” where historical data becomes stranded at an old address, Token Host’s default continuity strategy is **UI aggregation**:

- A release manifest MUST be able to reference:
  - a **primary deployment** (the latest schema version the app writes to), and
  - **legacy deployments** (previous schema versions the UI can still read from).
- The generated UI MUST support presenting legacy data as **read-only** (unless the legacy deployment is also configured as writable, which SHOULD NOT be the default).
- When displaying records across deployments, the UI MUST treat a record’s durable identity as `(chainId, deploymentEntrypointAddress, collectionId, recordId)` (not just `recordId`).
  - `deploymentEntrypointAddress` is the canonical address for a deployment: the single App contract address in single-contract mode, or the App Router contract address in modular mode.
- If schema v2 adds fields that did not exist in v1, the UI MUST render missing fields for v1 records as “not available” (not as empty strings) and MUST NOT pretend those fields ever existed historically.

Token Host MAY provide a user-driven “upgrade record” flow that copies a legacy record into the new deployment (creating a new record ID in v2), but MUST clearly label it as a copy/migration action (not a transparent in-place update).

#### 6.9.3 Advanced continuity strategies (optional, not default)
Token Host MAY support advanced continuity modes, but they MUST be explicitly selected (they are not assumed in the core product model):

- **Link pattern (“fallback contract”)**: schema v2 deployment stores an immutable `fallbackContract` address. Read methods check v2 first, then consult v1 for missing records/fields. This increases read complexity and can increase gas/RPC costs; it MUST be carefully bounded and paginated.
- **Proxy upgrades (EIP-1967)**: upgradeable proxies can preserve a single address across logic upgrades, but introduce additional trust/upgrade risk and complicate Token Host’s “deterministic + immutable artifacts” philosophy. If supported, Token Host MUST surface proxy risks clearly in Studio and MUST provide strict admin controls and auditability.

### 6.10 Example schema (illustrative)
```json
{
  "thsVersion": "2025-12",
  "schemaVersion": "1.0.0",
  "app": { "name": "Job Board", "slug": "job-board" },
  "collections": [
    {
      "name": "Candidate",
      "fields": [
        { "name": "handle", "type": "string", "required": true },
        { "name": "bio", "type": "string" },
        { "name": "photo", "type": "image" }
      ],
      "createRules": { "required": ["handle"], "access": "public" },
      "visibilityRules": { "gets": ["handle", "bio", "photo"], "access": "public" },
      "updateRules": { "mutable": ["bio", "photo"], "access": "owner" },
      "deleteRules": { "softDelete": true, "access": "owner" },
      "indexes": {
        "unique": [{ "field": "handle", "scope": "allTime" }],
        "index": []
      }
    },
    {
      "name": "JobPosting",
      "fields": [
        { "name": "title", "type": "string", "required": true },
        { "name": "description", "type": "string" },
        { "name": "salary", "type": "decimal", "decimals": 2 }
      ],
      "createRules": {
        "required": ["title"],
        "payment": { "asset": "native", "amountWei": "10000000000000000" },
        "access": "public"
      },
      "visibilityRules": { "gets": ["title", "description", "salary"], "access": "public" },
      "updateRules": { "mutable": ["description", "salary"], "access": "owner" },
      "deleteRules": { "softDelete": true, "access": "owner" },
      "indexes": { "unique": [], "index": [] }
    }
  ]
}
```

### 6.11 Validation, linting, and safety limits
Token Host validates schemas in two phases:

1) **Structural validation** (JSON Schema)  
   - Ensures types and required keys exist.
   - Rejects unknown keys unless explicitly allowed by the schema version.

2) **Semantic validation** (Token Host lint rules)  
   Token Host MUST reject schemas that are structurally valid but unsafe or non-portable. Examples include:
   - duplicate names (collections/fields),
   - references to non-existent collections,
   - circular reference constraints that would require unbounded on-chain checks,
   - indexes on unsupported field types,
   - contradictory rules (e.g., updateRules references fields not declared),
   - contract-size risk (too many collections/fields for a single deployment target).

**Validation taxonomy (authoritative vs UX-only)**

Token Host MUST clearly distinguish:
- **On-chain authoritative constraints**: enforced by the generated contracts (e.g., access control, required fields at create, uniqueness, reference existence when `enforce=true`, payment requirements, pagination bounds).
- **Off-chain UX-only validations**: enforced only by Studio / the generated UI (e.g., regex patterns, rich formatting rules, complex field interdependencies).

If a schema includes UX-only validations, Studio MUST label them as “UI-only” and MUST NOT imply they are enforced for callers who interact with the contracts directly.

To keep generated contracts deployable and usable, Token Host SHOULD enforce configurable safety limits, such as:
- maximum number of collections per schema,
- maximum number of fields per collection,
- maximum number of indexed fields per collection,
- maximum string length (enforced off-chain; optionally enforced on-chain with `bytes(s).length` checks),
- maximum pagination `limit` in list methods.

Studio MUST surface validation failures as actionable, field-scoped errors (not generic “failed” messages).

### 6.12 Auto fields and expressions

The schema can request automatic field assignment at create/update time via `createRules.auto`. Because these values are executed on-chain, Token Host MUST restrict this feature to a safe, deterministic expression set.

In v1, Token Host supports the following auto expressions:
- `block.timestamp` (for timestamp fields)
- `_msgSender()` (for actor fields; equivalent to `msg.sender` unless meta-tx/forwarding is configured)
- constant literals representable on-chain (e.g., `0`, `1`, fixed `bytes32`)

Token Host MUST NOT allow arbitrary Solidity expressions in the schema (e.g., loops, external calls, or dynamic computation), because that would turn schema input into code execution.

### 6.13 Type mapping (schema -> Solidity -> UI)

For each supported field type, Token Host defines a canonical mapping that is consistent across:
- Solidity storage types,
- Solidity function parameter types (`calldata`/`memory`),
- ABI encoding,
- UI widgets and validation.

Examples:
- `string` and `image`:
  - Solidity storage: `string`
  - Create/update parameters: `string calldata`
  - UI widget: single-line or multi-line text; image uses upload flow and stores URL/CID
- `reference`:
  - Solidity storage: `uint256`
  - Create/update parameters: `uint256`
  - UI widget: reference picker (search by unique field if available) or direct ID input in advanced mode
- `decimal` (fixed-point):
  - Solidity storage: `uint256` (scaled by `10^decimals`)
  - Create/update parameters: `uint256` scaled integer
  - UI widget: decimal/currency input that parses to scaled integer and formats by dividing by `10^decimals`

Token Host MUST treat `image` as a string at the contract layer and MUST NOT attempt to store binary blobs on-chain.

---

## 7. CRUD Builder (Generated On-chain Data Model)

Token Host’s “CRUD builder” is the contract generation strategy for turning collections into on-chain storage and methods.

A schema version deployment is called an **App deployment**. An App deployment MUST be either:
- **Single-contract mode**: one generated App contract address per deployment, or
- **Modular mode**: multiple immutable contracts per deployment (e.g., an App Router + per-collection module contracts) to avoid EVM bytecode size and deployment gas limits.

The generator MAY choose the mode automatically based on schema size and target-chain constraints, but the release manifest MUST fully describe the resulting contract set.

### 7.0 Deployment modes (single vs modular)

- In single-contract mode, all collections are implemented in one contract.
- In modular mode, Token Host MUST generate per-collection module contracts and MUST provide a discoverability mechanism (either an App Router contract that lists module addresses, or a manifest URL published in contract metadata).
- In modular mode, the generated UI/client MUST be able to route calls to the correct contract per collection based on the manifest.
- Reference enforcement (when `relations[].enforce=true`) in modular mode MUST be implemented as bounded external calls to the referenced collection module (no unbounded iteration).

### 7.1 Storage model

For each collection `C`, the generated contract maintains:
- `nextIdC: uint256` starting at 1
- `recordsC: mapping(uint256 => RecordC)` storing system fields and user fields
- `activeCountC: uint256` count of non-deleted records (O(1) reads)
- If on-chain listing/enumeration is enabled, the contract MUST be able to enumerate records deterministically. In v1, because IDs are sequential, enumeration MAY be derived from `nextIdC` (range `1..nextIdC-1`) and does not strictly require storing an `allIdsC` array. If `allIdsC: uint256[]` is stored, it MUST be append-only and MUST reflect created IDs.
- If soft delete is enabled, records MUST include an `isDeleted` flag and the contract MUST maintain `activeCountC` accurately.
- The contract MAY additionally maintain an **active set** to accelerate “browse active records” views without scanning tombstones:
  - `activeIdsC: uint256[]` list of active (non-deleted) record IDs
  - `activePosC: mapping(uint256 => uint256)` mapping record ID to position+1 in `activeIdsC` (0 means “not active”), enabling O(1) removal via swap-and-pop.

The record struct MUST include all system fields plus user-defined fields. Soft deletion MUST NOT physically remove the record struct; it marks `isDeleted`.

### 7.2 Ownership and attribution

- Generated contracts MUST use OpenZeppelin’s `Context` and MUST use `_msgSender()` for attribution and access checks (future-proofing for meta-transactions and account abstraction patterns).
- `createdBy` MUST equal `_msgSender()` at record creation and MUST be immutable thereafter.
- `owner` MUST equal `_msgSender()` at record creation. If transfers are enabled for the collection, `owner` MAY change via an explicit transfer method.
- `updatedBy` MUST equal `_msgSender()` at update.
- The system MUST NOT use `tx.origin` for attribution.

### 7.3 Create semantics

Create operations MUST:
1) check create access (public/allowlist/role),
2) if `createRules.payment` is configured, enforce the payment requirement (see below),
3) validate required fields (on-chain representable validation),
4) enforce uniqueness constraints for configured unique fields,
5) optionally enforce reference existence constraints,
6) assign ID = `nextIdC` and increment `nextIdC`,
7) populate system fields,
8) store the record,
9) update indexes,
10) emit events.

Create MUST be a single transaction and MUST be deterministic for identical inputs.

#### 7.3.1 Paid creates (native currency)
If `createRules.payment` is configured for a collection:
- the generated create function MUST be `payable`,
- the function MUST revert unless `msg.value == amountWei`,
- collected value SHOULD remain in the App contract balance (pull pattern).

If `createRules.payment` is not configured for a collection, the generated create function SHOULD be non-payable.

**Treasury and withdrawal**
- Deployments MUST specify a `treasuryAddress` (see Section 7.13) that is the default recipient of withdrawn native fees.
- The generated App contract MUST include an admin-controlled withdrawal mechanism for accumulated native fees (exact shape generator-defined), and MUST avoid reentrancy hazards (e.g., `nonReentrant` + effects-before-interactions on withdrawals).

### 7.4 Read semantics

Read operations MUST include:
- `getC(id)`: returns the record (or reverts if not found or deleted, unless `includeDeleted` is requested)
- `existsC(id)`: returns true if record exists and is not deleted
- `getCountC(includeDeleted=false)`: returns count (computed from counters; may exclude deleted)

The generated UI MUST prefer `getC` for detail pages.

To distinguish “never created” from “created but empty values”, Token Host MUST include an existence signal in storage. In v1, existence SHOULD be derived from `createdBy != address(0)` (because `createdBy` is set on create and is never the zero address on live chains).

### 7.5 List/pagination semantics
List operations MUST be paginated and MUST avoid oversized responses.

For each collection `C`, the generator MUST emit a paginated ID listing method:
- `listIdsC(cursorIdExclusive, limit, includeDeleted=false)` returns up to `limit` record IDs (`uint256[]`) in descending `id` order (newest-first).

Semantics:
- `cursorIdExclusive` is an *exclusive* upper bound. If `cursorIdExclusive==0`, the listing starts from `nextIdC` (i.e., “from the newest record”).
- The function MUST scan downward from `min(cursorIdExclusive, nextIdC)` and return record IDs in descending order.
- If `includeDeleted=false`, the function MUST skip deleted records.
- The function MUST be bounded. The generator MUST enforce a maximum scan budget per call (`maxScanSteps`) so listings cannot become unbounded due to tombstones.
  - If the scan budget is exhausted before `limit` results are found, the function MUST return the results it has found (which MAY be fewer than `limit`).

This listing intentionally models a **live view** over a changing dataset (see Section 8.9). Page boundaries may shift as new records are created, deleted, or restored.

To reduce RPC payload size, returning full records from list methods SHOULD be avoided. If the generator emits a list-of-records convenience method (e.g., `listSummariesC`), it MUST be bounded, paginated, and MUST return only system fields plus a schema-configured subset of “summary fields” (recommended default: `visibilityRules.gets`).

Implementation note: list methods MUST cap `limit` to a safe maximum (configurable per deployment), and MUST cap scan steps (see above).

Recommended defaults (non-normative):
- If chain config provides `limits.lists.maxLimit` and/or `limits.lists.maxScanSteps`, the generator SHOULD use those values (or stricter).
- Otherwise, a safe default is `maxLimit=50` and `maxScanSteps = min(1000, maxLimit * 20)`.
- The UI SHOULD handle “short pages” (fewer than `limit` results) gracefully and SHOULD allow loading more using the next cursor (the smallest returned ID).

### 7.6 Update semantics

Update operations are optional per collection (enabled when `updateRules.mutable` is non-empty).

Update MUST:
1) check update access,
2) validate record exists,
3) validate only mutable fields are changed,
4) enforce uniqueness if unique fields are updated,
5) enforce reference existence if reference fields are updated and `enforce=true`,
6) set `updatedAt` and `updatedBy`,
7) increment `version` if optimistic concurrency is enabled,
8) update indexes for changed indexed fields,
9) emit events.

### 7.7 Delete and transfer semantics

Delete operations MUST support:
- **soft delete** (default): mark `isDeleted=true` and set `deletedAt`
- **hard delete** (optional): only if enabled; MUST delete unique mappings and mark record as deleted; full removal from arrays is NOT REQUIRED in v1 (append-only lists are acceptable, with filtering at read time)

Soft delete affects constraints and counters:
- `activeCountC` MUST decrement on soft delete and increment on restore (if restore is supported).
- If `activeIdsC` is present, soft delete MUST remove the record ID from `activeIdsC` using swap-and-pop and MUST clear `activePosC` for that record ID.
- If an owner index is present, soft delete MUST remove the record ID from the current owner’s owner index set.
- Uniqueness constraints MUST declare a scope: `active` (default; value reusable after soft delete) or `allTime` (value never reusable once claimed). If scope is `active`, unique mappings SHOULD be cleared on soft delete; if scope is `allTime`, they MUST NOT be cleared.

Transfers are optional per collection (enabled when `transferRules` is present). If enabled, a transfer operation MUST:
1) check transfer access (`owner|allowlist|role`),
2) validate record exists and is not deleted,
3) validate `to != address(0)`,
4) update `record.owner` from `from` to `to`,
5) update owner index sets (remove from `from`, add to `to`) when `onChainIndexing=true`,
6) set `updatedAt` and `updatedBy`,
7) emit transfer events.

### 7.8 Indexing inside the contract

Token Host supports several on-chain indexes to make the app usable without an off-chain indexer:

On-chain indexes materially increase write gas costs. Token Host MUST support a schema-level “Lite mode” switch (e.g., `app.features.onChainIndexing=false`) that disables optional on-chain query indexes. When Lite mode is enabled:
- the contract MUST still support CRUD by id,
- the generator MUST omit optional query indexes (owner index, equality indexes, reverse-reference indexes),
- uniqueness constraints MAY remain on-chain (they are integrity constraints, not query acceleration),
- list/search UX SHOULD rely on the indexer when present,
- the generated UI MUST clearly communicate when an indexer is required for browsing/search.

**Owner index (when `onChainIndexing=true`)**  
For each collection C:
- `ownedIdsC: mapping(address => uint256[])` list of active record IDs currently owned by an address.
- `ownedPosC: mapping(address => mapping(uint256 => uint256))` mapping `(owner, id) -> position+1` in `ownedIdsC[owner]` (0 means “not present”), enabling O(1) removal via swap-and-pop.

Owner index maintenance MUST:
- add the record ID to `ownedIdsC[owner]` at create,
- move the record ID between owner sets on transfer (if enabled),
- remove the record ID from the owner set on soft delete (and add it back on restore if supported).

The generator MUST NOT expose an unbounded “return the full array” getter for this index. Any owner-index accessor MUST be paginated (offset + limit) and MUST cap `limit`.

**Unique index**  
For each unique constraint on field `f`:
- `uniqueC_f: mapping(bytes32 => uint256)` maps `hash(value)` to record ID.
- Update MUST clear old hash mapping if the value changes.
- If the uniqueness scope is `active`, soft delete SHOULD clear the mapping so the value becomes reusable among active records. If the scope is `allTime`, soft delete MUST NOT clear the mapping.

**Equality index (secondary index; when `onChainIndexing=true`)**  
For each indexed field `f`:
- `indexC_f: mapping(bytes32 => uint256[])` mapping of `hash(value)` to append-only list of record IDs.
- If a record’s field changes, the record ID MAY appear in multiple buckets historically; readers MUST validate current field value when interpreting results.
  - Index accessors MUST be paginated (offset + limit) and MUST cap `limit`.

**Reference reverse index (when `onChainIndexing=true`)**  
For reference fields `ref`:
- `refIndexC_ref: mapping(uint256 => uint256[])` mapping of referenced ID to append-only list of record IDs.
  - Index accessors MUST be paginated (offset + limit) and MUST cap `limit`.

**Index accessor semantics (normative)**
- Index accessors MUST return **candidate IDs only**. Callers MUST validate record existence, deletion status, and current field values via `getC`/`existsC` when correctness matters.
- For append-only equality/reference indexes, ordering MUST be insertion order (oldest to newest) within the bucket.
- For swap-and-pop sets (e.g., owner index sets), ordering MUST NOT be relied upon.
- Index accessors MUST be paginated and MUST cap `limit` to avoid RPC timeouts.

#### 7.8.1 Index key derivation

Indexes require a stable key derivation so that:
- the UI can compute lookups deterministically,
- indexers can mirror index behavior off-chain,
- upgrades do not silently change semantics.

Token Host MUST derive index keys as follows:
- For `string`/`image`: `key = keccak256(bytes(value))`
- For `uint256`, `int256`, `decimal` (scaled `uint256`), `bool`, `address`, `bytes32`, `reference` (uint256): `key = keccak256(abi.encode(value))`

This produces a uniform `bytes32` key space.

Normalization note: Token Host does not implicitly normalize string values on-chain. If an app requires case-insensitive uniqueness or trimmed matching, the schema/UI MUST enforce canonicalization by storing the canonical form as the field value.

### 7.9 Event model

Events are the primary integration surface for indexers and external analytics.

Token Host MUST emit, per collection:
- `RecordCreated(collectionId, recordId, actor, timestamp, dataHash)`
- `RecordUpdated(collectionId, recordId, actor, timestamp, changedFieldsHash)`
- `RecordDeleted(collectionId, recordId, actor, timestamp, isHardDelete)`
- `RecordTransferred(collectionId, recordId, fromOwner, toOwner, actor, timestamp)` (only for collections with transfers enabled)

`dataHash` and `changedFieldsHash` SHOULD be keccak256 of ABI-encoded values to allow indexers to detect mismatches without storing full payloads in events. Token Host MAY additionally emit field-level events for frequently queried fields.

#### 7.9.1 Event indexing for narrow subscriptions (normative)

To support real-time UIs without “event storms,” Token Host-generated contracts MUST structure events so that clients can subscribe narrowly using topic filters.

In Solidity:
- For `RecordCreated`, `RecordUpdated`, and `RecordDeleted`, the generator MUST mark `collectionId`, `recordId`, and `actor` as `indexed` event parameters.
- For `RecordTransferred`, the generator MUST mark `collectionId`, `fromOwner`, and `toOwner` as `indexed` event parameters, and MUST include `recordId` as a non-indexed parameter in the event data.

Rationale:
- Collection-scoped pages can filter by `collectionId`.
- Record detail pages can filter by `recordId` (for create/update/delete).
- “My records” pages can filter membership changes by subscribing to `RecordTransferred` where `fromOwner==me` or `toOwner==me` and parsing `recordId` from event data.

### 7.10 Gas and scaling constraints

Token Host MUST avoid unbounded loops in state-changing methods.

- Create/update/delete/transfer MUST NOT iterate over unbounded arrays.
- Append-only index lists and swap-and-pop set maintenance are permitted to keep writes O(1).
- Read/list methods may iterate up to `count` (bounded) and MUST cap output size.

Gas economics note:
- On-chain storage (especially `string`) and on-chain index maintenance can be expensive. Token Host SHOULD be treated as L2-first for practical CRUD workloads.
- Studio MUST surface cost/scaling warnings when schemas imply heavy storage or indexing, and when users target chains with high calldata/storage costs.
- Token Host Chain (where offered) SHOULD be the default target for full-mode apps because it is operated and priced for “EVM as database” workloads.

For high-scale apps (or Lite mode), Token Host SHOULD recommend enabling the indexer and using events as the canonical query surface.

### 7.11 Generated contract API (normative surface)

A generated Token Host app is intended to expose a small, stable on-chain surface for UIs and indexers. In single-contract mode that surface is one App contract; in modular mode it is an App deployment composed of one or more contracts described by the release manifest. To keep ABIs stable and UIs simple, Token Host generates **typed functions per collection** rather than an untyped “bytes payload” generic interface.

For each collection `Candidate`, the generator MUST emit an external API that, at minimum, enables:
- create a record,
- fetch a record by id,
- list record IDs (and optionally summaries),
- (if configured) update a record,
- (if configured) delete a record,
- (if configured) transfer a record to a new owner,
- (if configured) lookup by unique field(s),
- (if configured and `onChainIndexing=true`) list by reference field(s),
- (if configured and `onChainIndexing=true`) list record IDs by owner (`record.owner`).

The exact Solidity signatures are generator-defined but MUST follow these rules:
- Create/update functions MUST accept parameters for required/mutable user fields (plus any required reference IDs).
- Create functions MUST return the new record ID (`uint256`).
- `getC(id)` MUST return a view struct that includes system fields and user fields (in schema order).
- `listIdsC(...)` MUST return IDs only (not full record structs).
- If `listSummariesC(...)` is emitted, it MUST return only system fields plus configured summary fields.
- Any function that returns a dynamic array MUST be paginated (offset + limit or cursor + limit) and MUST cap `limit`. The generator MUST NOT emit unbounded “return all IDs/records” accessors.
- All write functions MUST revert (not silently fail) on access violations and constraint violations.

In addition to per-collection CRUD, the generated App contract MUST include a batching primitive:
  - `multicall(bytes[] calldata calls) external returns (bytes[] memory results)`
  - MUST execute each call against the same contract (no arbitrary external calls),
  - MUST preserve `_msgSender()` for access checks (delegatecall-based pattern),
  - MUST revert the entire batch if any call fails (atomicity),
  - MUST cap the number of calls per batch to a safe maximum (recommended source: `limits.multicall.maxCalls` in chain config, or a conservative generator default).

For v1, `multicall` SHOULD be non-payable. Paid create operations (those requiring a native fee) SHOULD be executed as single direct calls (not inside multicall) unless a future multicall-with-value design is introduced.

Token Host MAY emit both:
- generic events (`RecordCreated`, `RecordUpdated`, `RecordDeleted`) for uniform indexing, and
- per-collection typed events (`CandidateCreated`, …) for convenience.

### 7.12 Collection identifiers

Inside events and manifests, Token Host needs a stable way to refer to collections.

Token Host MUST define a stable `collectionId` for each collection. In v1, `collectionId` SHOULD be:
- `bytes32 collectionId = keccak256(bytes(collectionName))`

This allows indexers and external tools to identify collections without relying on ordering. The generator MUST record `collectionName -> collectionId` in the build manifest.

### 7.13 Access control and administration
When a collection uses `allowlist` or `role` access modes, the generated contract(s) MUST include administrative functions to manage membership.

**Deployment-time admin and treasury**
- Deployments MUST specify an `adminAddress` that receives `DEFAULT_ADMIN_ROLE` (or equivalent) for any AccessControl/allowlist management.
- If paid creates are enabled for any collection, deployments MUST also specify a `treasuryAddress` that is the default recipient of withdrawn native fees.
- In managed deployments, Token Host infrastructure MAY submit the deployment transaction, but Token Host MUST set `adminAddress`/`treasuryAddress` to customer-selected addresses and MUST NOT retain on-chain admin privileges by default.

If `role` access is used, Token Host SHOULD generate per-collection per-operation roles such as:
- `CANDIDATE_CREATE_ROLE`
- `CANDIDATE_UPDATE_ROLE`
- `CANDIDATE_DELETE_ROLE`
- `CANDIDATE_TRANSFER_ROLE` (only for collections with transfers enabled)

If `allowlist` access is used, Token Host SHOULD generate per-collection per-operation allowlists such as:
- `candidateCreateAllowlist[address] => bool`
- `candidateUpdateAllowlist[address] => bool`
- `candidateTransferAllowlist[address] => bool` (only for collections with transfers enabled)

To avoid ambiguity, “owner” access MUST always be defined as “record.owner == _msgSender()”.

### 7.14 Record hashing (event integrity)

`dataHash` / `recordHash` values exist to provide an integrity primitive for indexers and auditors. Hashes MUST be computed deterministically from the record’s canonical ABI encoding.

In v1, Token Host SHOULD compute:
- `recordHash = keccak256(abi.encode(collectionId, recordId, systemFields..., userFieldsInSchemaOrder...))`

This design ensures:
- identical records across environments produce identical hashes,
- indexers can recompute the hash from decoded record values to detect RPC inconsistencies.

### 7.15 Error model

Generated contracts MUST use explicit, distinguishable reverts. For gas efficiency, Token Host SHOULD prefer Solidity custom errors over string revert reasons.

At minimum, generated contracts SHOULD expose the following error classes:
- unauthorized access (create/read/update/delete/transfer)
- record not found
- record deleted (soft-deleted record accessed without includeDeleted)
- unique constraint violation
- invalid reference (referenced record missing or deleted when enforce=true)
- invalid payment (incorrect `msg.value` for paid creates)
- transfer disabled (transfer attempted when not enabled)
- invalid transfer recipient (`to == address(0)`)
- version mismatch (optimistic concurrency)
- invalid pagination (limit too large, offset out of range)

The build manifest SHOULD include an “error catalog” mapping logical error names to selectors for external tooling.

### 7.16 Contract metadata and self-description

The generated App contract MUST expose enough metadata for UIs and indexers to self-configure:
- schema hash (bytes32)
- schema version string
- app slug (string)
- list of collections (names and ids) or an equivalent manifest link in off-chain metadata

Token Host MAY also publish the schema and manifest at a stable URL and include that URL in contract storage for discoverability.

---

## 8. UI Generation (Hosted App)

### 8.1 Runtime model

The hosted UI is a static site (Next.js export) that reads a public, immutable manifest and then connects to the chain via wallet provider or RPC.

The manifest MAY include multiple deployments (primary + legacy) to support data continuity across schema versions. The generated UI MUST be able to render legacy deployments as read-only data sources as described in Section 6.9.2.

The UI MUST:
- support wallet connection (EIP-1193 providers),
- detect chain mismatch and guide network switching,
- perform CRUD operations with clear error handling,
- display build/version metadata (schema version, deployed address).

### 8.2 Generated pages

For each collection, Token Host MUST generate:
- list page with pagination,
- detail page,
- create page/form,
- (if enabled) edit page/form,
- (if enabled) delete UI with confirmation,
- (if enabled) transfer UI (set new owner) with confirmation.

List pages MUST avoid oversized on-chain reads. Without an indexer, the generated UI SHOULD render list pages by calling `listIdsC` and then fetching details via `multicall(getC)` or `listSummariesC` when available. Pagination SHOULD be cursor-based using `cursorIdExclusive` (e.g., pass the smallest ID from the prior page as the next cursor).

For unique fields, the UI SHOULD offer:
- “lookup by unique field” page (e.g., `/candidate/by-handle/<handle>`), backed by on-chain unique mapping or indexer query.

For reference fields, the UI SHOULD offer:
- “view related records” pages (reverse lookup).

### 8.3 Uploads (images/assets)

Uploads are off-chain but referenced on-chain as strings (URLs or CIDs).

In managed mode, Token Host MUST provide:
- signed upload URLs for assets (S3/GCS or equivalent),
- content-type restrictions,
- size limits,
- malware scanning or basic file checks,
- stable public URLs for consumed assets.

Token Host MAY offer optional IPFS pinning and store returned CID URLs.

### 8.4 Data sources and indexer integration

When an indexer is enabled, the UI SHOULD:
- use indexer queries for list/search,
- use on-chain reads for detail verification or fallback.

If the indexer is unavailable, the UI MUST remain functional via on-chain reads (with reduced features).

### 8.5 UX requirements (generated apps)

Token Host-generated UIs must feel “product-grade” even when the underlying data source is a blockchain.

At minimum, generated apps MUST include:
- clear loading states for list/detail queries,
- explicit empty states (no records yet),
- actionable error messages for common failures (user rejected signature, wrong network, RPC unavailable, unique constraint violation),
- transaction status UI (submitted, pending, confirmed, failed),
- optimistic UI patterns only when correctness is preserved (e.g., display “pending” record until confirmed).

If a collection has paid creates, the UI MUST:
- display the required create fee alongside gas estimates before submission,
- submit the transaction with the correct native value,
- clearly distinguish “fee” from “gas”.

If a collection has transfers enabled, the UI MUST:
- render a “Transfer” action only when the user is authorized,
- validate destination addresses client-side (basic checks) and require confirmation,
- surface transfer history from events when an indexer is available (optional but recommended).

Generated apps SHOULD include:
- pagination controls that preserve URL state (shareable links),
- deep links for record detail pages,
- safe rendering of user-provided content (escape HTML, prevent injection),
- accessibility considerations (keyboard navigation, aria labels, color contrast).

### 8.6 UI configuration, templates, and overrides

Token Host provides a template system to balance “no-code defaults” with customization:
- In managed mode, users MAY select from vetted templates and themes.
- In export/self-host mode, developers MAY override templates and add custom components.

Template customization MUST NOT allow arbitrary server-side code execution in Token Host infrastructure. Managed templates must be declarative (e.g., theme tokens, layout choices, component selection) rather than arbitrary code.

### 8.7 Multi-chain awareness

If an app has deployments on multiple chains, the manifest MUST enumerate them and MUST identify a **primary deployment** for writes (plus optional legacy deployments for continuity). The generated UI MUST:
- use the primary deployment as the default write target,
- detect the user’s current wallet network and guide network switching when the user attempts a write,
- make it clear which chain is “primary” vs “legacy” when legacy deployments exist (migration-aware UX),
- allow read-only browsing via public RPC even without a wallet (optional but recommended).

### 8.8 Migration UX copy (required terminology)

When a release includes multiple deployments (primary + legacy), the generated UI MUST use consistent, explicit terminology so users understand where reads and writes occur.

The generated UI MUST:
- label the active write target as **“Primary chain”**,
- label any historical read sources as **“Legacy chain”** (or “Legacy chains”),
- treat legacy deployments as read-only by default and communicate this clearly.

Required action terminology:
- Any UI action that creates a new record on the primary chain based on a legacy record MUST be labeled **“Copy record”**.
- The UI MUST NOT label this action as “move”, “migrate”, or “transfer” unless it actually preserves identity and mutates the source (which v1 does not).

Required provenance display:
- If a record on the primary chain is known to have been copied from a legacy deployment, the UI MUST display provenance in a human-readable way using the term **“Copied from”**.
- Provenance SHOULD include at minimum: source chain name + chainId, source deployment entrypoint address, source collection name, and source recordId.

Recommended default English copy (illustrative):
- “Primary chain: <chainName> (<chainId>)”
- “Legacy chain (read-only): <chainName> (<chainId>)”
- “Copy record: Create a new record on the primary chain based on this legacy record. The new record will have a new ID.”
- “Copied from <chainName> (<chainId>) / <deploymentEntrypointAddress> / <collection>#<recordId>”

### 8.9 Real-time updates (events + websockets)

Token Host-generated apps SHOULD feel real-time by responding to on-chain events.

#### 8.9.1 Data freshness model (normative)

- Generated apps MUST treat chain state as authoritative and MUST respect finality guidance from the selected chain config (e.g., `finality.recommendedConfirmations`).
- Generated apps MUST distinguish:
  - an **observed head** (latest block the client has seen), and
  - a **safe head** (observed head minus confirmations, or a chain-provided `safe`/`finalized` tag when available).
- By default, generated apps SHOULD render “live” updates based on events quickly, but MUST avoid presenting unconfirmed changes as final. The UI SHOULD label new/changed rows as “pending” until they reach the safe head.
- Generated apps MUST assume that websocket subscriptions can disconnect and MUST implement reconnection + resync logic.
- Generated apps MUST handle reorgs correctly when the underlying client library surfaces removed logs (or when receipts disappear). Where “removed logs” are not available, the UI MUST tolerate inconsistencies by verifying record state on-chain at the safe head.

#### 8.9.2 Subscription behavior (normative)

When the selected chain config includes an RPC endpoint that supports websocket log subscriptions (`eth_subscribe`) (recommended signal: `rpc.endpoints[].capabilities.subscriptions=true` on a `wss://` endpoint), the generated app SHOULD subscribe to events **as narrowly as possible** to avoid event storms.

Normative requirements:
- Subscriptions MUST be scoped to the active deployment entrypoint contract address(es) (primary + any legacy deployments being actively read in the current UI context).
- Subscriptions MUST use topic filters over `indexed` event parameters where feasible (see Section 7.9.1), so that only the currently viewed collection(s) and/or record(s) are subscribed.
- The UI SHOULD NOT subscribe to `RecordUpdated` for an entire collection unless the current screen requires it. Preferred patterns:
  - **Collection list pages**: subscribe to `RecordCreated` and `RecordDeleted` for that collection (and optionally `RecordTransferred` if ownership membership is displayed).
  - **Record detail pages**: subscribe to `RecordUpdated` and `RecordDeleted` for that `(collectionId, recordId)`.
  - **“My records” pages**: subscribe to `RecordCreated` filtered by `actor==me` and `RecordTransferred` filtered by `fromOwner==me` or `toOwner==me`, and refresh membership lists on demand.
- Subscriptions MUST be attached only while a view is active and MUST be cleaned up on navigation (unsubscribe) to avoid accumulating subscriptions.
- The UI MUST debounce refresh/invalidation work under high event rates (recommended default: 250ms, or `limits.realtime.recommendedDebounceMs` if present in chain config).

If websocket log subscriptions are not available, the generated app MUST fall back to polling (e.g., periodic block number checks + targeted refetches). Polling SHOULD use a conservative default interval (e.g., 10s) or `limits.realtime.recommendedPollingIntervalSeconds` when present in chain config.

#### 8.9.3 UX semantics for “live views” (normative)

Real-time updates change what “page 2” means. Token Host does **not** provide snapshot isolation for list pages by default.

- The generated UI MUST treat list views as **live**: results MAY change over time as new events arrive.
- To avoid disruptive UI jumps, when a user is not on the “top” of a list (e.g., page > 1 or scrolled down in an infinite list), the UI SHOULD avoid inserting/removing rows automatically and SHOULD instead display an “Updates available” affordance that the user can click to refresh.
- Record detail pages SHOULD refresh in place when the record is updated or transferred (subject to finality display).
- The UI SHOULD show a “Live” indicator and SHOULD expose a user-facing refresh control.

#### 8.9.4 Integration with indexers (normative)

If an indexer is enabled, the UI SHOULD still use chain events (or polling) as the realtime trigger, then re-query the indexer for list/search views and use on-chain reads for detail verification and fallback.

To keep UX honest when the indexer lags:
- Token Host-hosted indexer/gateway responses SHOULD include an `indexedToBlock` watermark per chain.
- When using the indexer as a list source, the UI MUST surface indexer freshness (e.g., “Indexer synced to block N”) and SHOULD surface lag relative to the observed head.
- When a chain event arrives for block `B` and the indexer watermark is `< B`, the UI SHOULD NOT thrash by repeatedly refetching the same list query; it SHOULD instead show “Updates pending indexer sync” and MAY poll until the indexer watermark reaches `B` before refetching.

---

## 9. Authentication, Profiles, and Identity

### 9.1 Token Host accounts vs wallet addresses

Token Host accounts are used to access Studio and manage apps. Wallet addresses are used to sign on-chain transactions in generated apps.

Token Host MUST support linking wallet addresses to Token Host accounts to provide richer profile displays, but the generated app MUST NOT require Token Host login to function.

However, generated apps MAY optionally offer Token Host login (OAuth) as a convenience layer (e.g., for profiles, notifications, or optional gas sponsorship/session UX), as long as the app remains usable with direct wallet connections.

### 9.2 Supported sign-in methods (Studio)

Studio MUST support:
- email/password,
- OAuth (Google, Facebook),
- wallet signature login (nonce-based).

Wallet signature login MUST:
- issue a one-time nonce,
- verify signature server-side,
- rotate nonce on success,
- enforce rate limits.

### 9.3 Public profile service

Token Host SHOULD provide a public, privacy-respecting profile endpoint:
- `GET /v1/profiles/<address>` returns a **minimal** public profile only if the user opted in.

Profile scraping and correlation are real risks. Therefore:
- The public profile response MUST NOT include email addresses, OAuth identifiers, or other sensitive account metadata.
- Public profile fields MUST be explicitly opt-in and SHOULD default to empty/hidden.
- Token Host SHOULD return only a minimal safe set by default (e.g., `displayName`, `avatarUrl`) and require explicit per-field toggles for anything beyond that.
- Token Host SHOULD rate limit this endpoint and monitor abuse.

Editing profile data MUST require authentication and explicit consent for public display. Extended profile data (if any) MUST require authenticated access with explicit scopes and MUST NOT be world-readable by default.

---

## 10. Account Abstraction and EOA Delegation (EIP-7702)

### 10.1 Summary (what it is, and what Token Host assumes)

EIP-7702 is an emerging account abstraction primitive that enables an EOA to delegate execution to contract logic via explicit authorization. The practical effect is that an EOA can temporarily behave more like a smart account: executing richer logic, batching calls, and enforcing additional authorization layers.

Token Host treats EIP-7702 as an optional enhancement that can reduce UX friction, but it is not a dependency. Token Host apps MUST remain fully usable with normal EOA transactions (direct wallet calls to the generated App contract).

Because ecosystem support varies and the EIP may evolve, Token Host MUST gate EIP-7702 features behind:
- explicit chain capability detection, and
- explicit user opt-in per app.

### 10.2 Capability detection and opt-in UX

Token Host clients (Studio and generated apps) MUST:
- detect whether the connected chain supports delegation,
- explain what enabling delegation does at a high level,
- require explicit user consent before enabling delegation behaviors,
- provide a clear “disable/revoke” path (at minimum, by letting delegation expire and/or by changing delegation state).

### 10.3 What Token Host uses delegation for

When available, Token Host MAY use EIP-7702 to implement:

1) **Safe batching**  
   Token Host-generated UIs commonly perform multi-step workflows (e.g., create a record, then update a secondary field, then link a reference). Without batching, these steps require multiple transactions and can leave partial state if users abandon the flow. Token Host MUST provide a contract-level batching primitive (`multicall`) so standard wallets can batch calls today. Where EIP-7702 is available, delegation MAY further improve batching UX and policy enforcement.

2) **Policy enforcement at the account layer**  
   Delegation logic can enforce additional constraints before calling the App contract (e.g., method allowlists, spend limits, session expiry). This is particularly valuable when Token Host adds optional “session” features.

Token Host SHOULD design these features so that the App contract remains the canonical storage and rule engine. Delegation logic must be an authorization/convenience layer, not the sole guardian of correctness.

### 10.4 Gas sponsorship (scope and constraints)

EIP-7702 alone does not guarantee “gasless” transactions on all chains. Gas sponsorship generally requires either:
- chain-native sponsorship mechanisms, or
- an account abstraction/paymaster model (e.g., EIP-4337 or L2-specific equivalents).

On Token Host Chain (if operated by Token Host), Token Host SHOULD treat sponsorship support as part of the “cloud-like” offering:
- provide a standard paymaster/relayer under strict quotas and abuse controls,
- standardize on supported AA primitives for that network (e.g., EIP-4337 and/or EIP-7702 where available),
- enable sponsorship flows that can work for both wallet-connected and Token Host login (OAuth) onboarding, without requiring Token Host to custody user private keys.

Token Host MAY offer gas sponsorship only where the underlying chain infrastructure supports it. If offered, it MUST be:
- rate-limited,
- explicitly disclosed to the user,
- protected against abuse (per-user quotas, per-app quotas, risk scoring),
- implemented without user private-key custody.

### 10.5 Session keys (reduced confirmation prompts)

Token Host MAY support “session keys” as an opt-in feature where:
- a user creates a short-lived session authorization with least privilege,
- subsequent app actions can be authorized without repeating full wallet flows.

Implementation is chain-dependent. Token Host SHOULD implement session keys using established account abstraction patterns (e.g., smart-account validation, scoped permissions, nonces, expiry) and MAY leverage EIP-7702 where it meaningfully reduces per-user deployment friction.

Session keys MUST:
- be time-bounded (TTL),
- be scope-bounded (contract + method selectors + value limits),
- be revocable by expiry and by explicit user action when possible,
- never require Token Host to store the user’s private key.

### 10.6 Delegation/Kernels and managed logic

If Token Host ships delegation-enabled UX, it SHOULD use audited, reusable “kernel” logic rather than generating bespoke delegation code per app. Any kernel/manager contracts MUST:
- be versioned,
- be independently auditable,
- be included in the manifest and verification workflow,
- have a clear upgrade story (ideally deploy-new-version, not mutable upgrades).

### 10.7 Threat model and security posture

Delegation expands the account attack surface. Token Host MUST treat delegation features as security-sensitive and MUST:
- include replay protection (nonces),
- prevent confused-deputy flows (strict allowlists),
- require explicit consent and clear UI,
- include monitoring and incident response for relayer/paymaster abuse if applicable.

### 10.8 Fallback behavior

If delegation is unavailable, disabled, or fails:
- the UI MUST fall back to direct contract calls,
- batch/session UX MUST degrade gracefully (more prompts, more transactions),
- the user MUST not be blocked from using the app.

---

## 11. Build, Deploy, and Publish Pipelines

### 11.1 Build (deterministic)

A build takes an immutable schema version and produces:
- generated Solidity source,
- compiled artifacts (ABI, bytecode),
- generated UI bundle,
- signed manifest.

Build steps:
1) validate schema (structural + semantic lint),
2) generate contracts and UI,
3) compile contracts with pinned toolchain,
4) run unit tests and snapshot/golden tests,
5) package UI (static export),
6) write artifacts and manifest to the artifact store.

### 11.2 Deployment (chain-specific)
Deployment steps:
1) select chain config from registry,
2) select deployment-time parameters (at minimum: `adminAddress`; and `treasuryAddress` if paid creates are enabled),
3) deploy contract(s),
4) verify contract source on explorer and/or Sourcify,
5) update manifest with deployed addresses, deployment parameters, and chain metadata.

In managed deployments, Token Host infrastructure MAY submit deployment transactions, but MUST set `adminAddress`/`treasuryAddress` to customer-selected addresses and MUST NOT retain on-chain admin privileges by default.

### 11.3 Publish (domain mapping)

Publishing steps:
1) select a build + deployment set,
2) publish UI bundle to hosting,
3) map `https://<slug>.apps.tokenhost.com` (and optional custom domain) to the release,
4) expose release metadata publicly (manifest URL).

### 11.4 Manifest requirements
The manifest MUST include:
- `thsVersion`, schema hash, and schemaVersion,
- generator version,
- Solidity compiler version and settings,
- canonical artifact digests for generated sources, compiled artifacts (ABI/bytecode), and UI bundle,
- per-chain deployments including a canonical `deploymentEntrypointAddress` and the full set of deployed contract addresses (one or many, depending on deployment mode),
- deployment-time parameters (`adminAddress`, `treasuryAddress`) per deployment,
- per-deployment chain config references/digests (recommended, especially for managed chains),
- release lineage (primary deployment, legacy deployments, and superseded releases where applicable),
- feature flags (indexer enabled, delegation enabled, uploads enabled, on-chain indexing enabled),
- signatures/checksums.

Canonical JSON Schema:
- `schemas/tokenhost-release-manifest.schema.json`

### 11.5 Build/deploy job lifecycle (managed mode)

In managed mode, builds and deployments run as asynchronous jobs. Every job MUST have:
- a stable `jobId`,
- a type (`build`, `deploy`, `verify`, `publish`, `indexer`),
- a state machine with explicit states,
- timestamps (createdAt, startedAt, finishedAt),
- an immutable link to inputs (schemaHash, buildId, chainId),
- structured logs and a summarized failure reason on error.

Token Host MUST implement the following job states:
- `queued`: accepted but not started
- `running`: worker assigned and executing
- `succeeded`: completed successfully
- `failed`: permanently failed (with error summary)
- `canceled`: canceled by user/admin (best effort)

Studio MUST surface job state changes in real time (polling or streaming) and MUST provide sufficient context for users to remediate failures (e.g., “verification failed: missing explorer API key”, “deploy failed: insufficient funds”).

### 11.6 Reproducibility and toolchain pinning
To keep builds reproducible and auditable, Token Host MUST:
- pin Node.js version, Solidity compiler version, and build tooling versions per generator release,
- run builds in hermetic environments (container images) where inputs are controlled,
- record toolchain digests (container image digest, package lock hashes) in the manifest,
- compute and record canonical artifact digests for all emitted artifacts (Section 11.6.1).

Token Host SHOULD support build caching keyed by `(schemaHash, generatorVersion, toolchainDigest)` and MUST treat caches as an optimization only (never a source of truth).

#### 11.6.1 Canonical artifact digests (normative)

All digests recorded in Token Host manifests and chain config artifacts MUST be expressed as `sha256:<lowercase-hex>`.

Token Host MUST compute digests as follows:
- **File digest**: `sha256(fileBytes)`.
- **Directory digest** (e.g., UI bundle directory):
  1) recursively list all regular files,
  2) compute `sha256:<hex>` for each file,
  3) build a JSON object `{ "version": 1, "files": [{"path": "...", "digest": "sha256:..."}, ...] }` where `path` uses `/` separators,
  4) sort `files` by `path` ascending (bytewise UTF-8),
  5) canonicalize the JSON using RFC 8785 and hash it with SHA-256.

The manifest MUST record artifact digests for at least:
- generated Solidity sources (directory digest),
- compiled ABI/bytecode bundle (directory digest),
- generated UI bundle (directory digest).

### 11.7 Release management and rollback

Publishing creates a release pointer for a domain. Token Host MUST support:
- publishing a new release to `https://<slug>.apps.tokenhost.com`,
- keeping a release history per app,
- rolling back the domain pointer to a previous release.

Rollbacks MUST be domain-pointer changes only (immutable assets remain versioned by hash), and must not mutate historical artifacts.

### 11.8 Chain migration (launch on Token Host, migrate outward)
Token Host’s primary lifecycle includes starting apps on Token Host Chain (full on-chain mode) and later migrating the app to either:
- a Token Host-provisioned dedicated appchain (growth step), and/or
- an external EVM chain for ecosystem alignment or other requirements.

A **chain migration** is modeled as publishing a new release that changes the **primary deployment** used for writes, while retaining prior deployments as legacy read sources for continuity.

In v1:
- Chain migration MUST be supported as an **EVM-to-EVM** workflow (Token Host Chain -> an EVM appchain / external EVM chain such as an OP Stack chain or other L2/appchain).
- Non-EVM migrations that do not preserve EVM semantics (e.g., to CosmWasm) are out of scope and require a different contract backend. EVM-based chains in other ecosystems are in-scope if they can run the generated contracts without semantic changes.

Migration steps (conceptual):
1) deploy the target deployment on the destination chain (same schema version or a newer schema version),
2) (optional) provision/update indexers to cover the destination chain and any legacy chains required for read continuity,
3) publish a new release where the destination deployment is `role=primary` and previous deployments are `role=legacy`,
4) (optional) run an explicit state copy job that replays/copies selected legacy records into the new deployment.

#### 11.8.1 State copy job (normative)

State copy MUST be explicit and MUST NOT be implied by simply publishing a new release.

A state copy job MUST be modeled and audited as a job type (e.g., `stateCopy`) with:
- immutable inputs (source deployments, destination deployment, selected collections/records),
- a defined snapshot boundary for reads (source chain block number + required confirmations),
- batching parameters (max records per batch, max gas per batch),
- an operator identity (who initiated and who paid gas, if applicable),
- resumability (job can restart without duplicating destination records).

State copy output MUST include an exportable, signed report artifact containing at minimum:
- source and destination deployment identifiers (chainId + deployment entrypoint address),
- snapshot block numbers used for each source chain,
- counts of records attempted/copied/skipped/failed per collection,
- a provenance map from `(sourceChainId, sourceDeploymentEntrypointAddress, collectionId, sourceRecordId)` -> `(destChainId, destDeploymentEntrypointAddress, collectionId, destRecordId)`,
- failure reasons for any failed copies.
- The destination release manifest SHOULD reference the report artifact by URL and digest (e.g., `migrations.stateCopyReports[]`).

If state copy is performed:
- copied records MUST be treated as new records with new IDs on the destination chain,
- the UI MUST preserve provenance using the “Copied from” language (Section 8.8),
- access control and ownership MUST be validated on the destination chain at the time of copying (no blind imports).

Cost note: migrating full historical state from a cheap chain to an expensive chain may be cost-prohibitive. Studio MUST surface this risk and SHOULD encourage migration strategies that preserve legacy data via UI aggregation where feasible.

### 11.9 Appchain provisioning and progressive decentralization

Token Host MAY offer “appchains” as a managed service: dedicated EVM rollup/appchains provisioned per app or org, intended as a growth step from the shared Token Host Chain.

Appchain provisioning MUST be modeled as an auditable job with explicit inputs and outputs (similar to build/deploy jobs). At minimum, provisioning MUST produce:
- chain identity: `chainId`, human-readable name, network type,
- RPC endpoints (public + optionally private),
- explorer endpoint(s) (if provided),
- canonical bridge/entry points (if applicable),
- AA/sponsorship capability flags (if applicable),
- signed chain configuration artifact that can be exported/self-hosted.

Token Host MUST treat “appchain” as an infrastructure choice, not a schema/contract change:
- the same schema version MUST be deployable onto Token Host Chain or an appchain,
- the UI/manifest model (primary + legacy deployments) MUST remain the mechanism for migrating the primary write target.

Progressive decentralization expectations:
- Token Host SHOULD provide a clear staged posture for appchains (e.g., “managed”, “co-managed”, “decentralized”) and MUST communicate what each stage means in operational and trust terms.
- Moving between stages MUST NOT require changing application schemas; it is a chain operation and governance operation.
- Token Host MUST preserve verifiable audit logs for chain lifecycle actions (provision, config changes, governance changes, upgrades) and MUST provide exportable evidence (signed artifacts and/or on-chain references).

Safety constraints:
- Appchains MUST have an explicit upgrade/maintenance policy for the chain stack itself (separate from app contract immutability), and Studio MUST distinguish “chain upgrade” from “app schema upgrade”.
- Token Host MUST provide an exit story for users and developers where feasible (e.g., the ability to migrate the app to another EVM chain and keep legacy reads available).

---

## 12. Token Host CLI

The CLI is the supported way to run the same pipeline locally or in CI.

Required commands:
- `th init`: create a new app workspace
- `th validate`: validate schema
- `th generate`: generate contracts and UI
- `th build`: compile + package, output manifest
- `th deploy`: deploy to a chain (BYO key) and update manifest
- `th migrate-chain`: migrate primary deployment to a new chain (deploy + release manifest with legacy deployments)
- `th verify`: verify on explorers
- `th indexer`: generate/deploy indexer configuration (optional)
- `th migrate`: apply schema migrations locally
- `th doctor`: environment checks

Optional commands (chain management):
- `th chains`: list configured chains / show chain details
- `th chains add`: add an external chain config locally
- `th chains provision`: request provisioning of a Token Host-managed appchain (managed mode)

The CLI MUST be able to export a complete bundle suitable for self-hosting.

---

## 13. Managed Platform API (Conceptual)

The Token Host API is the control plane for the managed platform. It is responsible for multi-tenant identity, schema storage, build/deploy orchestration, domain mapping, and artifact discovery.

The API MUST be versioned (e.g., `/v1`) and MUST be designed so that:
- managed Studio and CLI can call the same endpoints,
- long-running operations are modeled as jobs,
- write operations are idempotent where possible.

### 13.1 Authentication and sessions

- Studio authentication MUST use secure sessions (httpOnly cookies preferred).
- Session cookies SHOULD be scoped to `app.tokenhost.com` and `api.tokenhost.com` (not `.tokenhost.com`) to avoid leaking privileged cookies to hosted apps under `*.apps.tokenhost.com` (or any hosted-app domain).
- Mutating endpoints MUST be CSRF-protected (SameSite + CSRF tokens or equivalent).

Wallet signature login MUST be nonce-based and MUST include:
- nonce issuance endpoint,
- signature verification endpoint,
- nonce rotation on success,
- rate limiting and abuse detection.

### 13.2 Organizations, roles, and authorization

Token Host is multi-tenant. Every resource belongs to an organization (`org`).

The API MUST support:
- org creation and management,
- inviting members,
- membership roles with least privilege (e.g., Owner, Admin, Developer, Viewer),
- audit logging of privileged actions.

Authorization rules MUST be applied server-side on every request. UI visibility is not sufficient.

### 13.3 Apps, schemas, and schema library

Apps are durable objects with a slug reservation.

The API MUST support:
- creating an app and reserving `app.slug`,
- listing apps in an org,
- storing schemas as immutable versions,
- marking one schema version as the “default draft” in Studio (optional).

Schema endpoints SHOULD include:
- `GET /v1/apps/:appId/schemas`
- `POST /v1/apps/:appId/schemas` (creates new immutable schema version)
- `GET /v1/apps/:appId/schemas/:schemaId`

### 13.4 Builds, deployments, verification, and releases

Builds and deployments are jobs. The API MUST provide:
- job creation endpoints (e.g., request a build),
- job status endpoints (polling),
- job log access endpoints (authorized),
- job cancellation (best-effort).

Example conceptual endpoints:
- `POST /v1/apps/:appId/builds` (body includes schemaId)
- `GET /v1/apps/:appId/builds/:buildId`
- `POST /v1/apps/:appId/deployments` (body includes buildId + chainId)
- `GET /v1/apps/:appId/deployments/:deploymentId`
- `POST /v1/apps/:appId/releases` (body includes primary deployment set + UI bundle + optional legacy deployment references + optional supersedesReleaseId)
- `GET /v1/apps/:appId/releases`

The API SHOULD support idempotency keys for build/deploy requests to prevent duplicate work when clients retry.

### 13.5 Domains and certificates

Domain management MUST include:
- default subdomain mapping for `app.slug`,
- custom domain creation,
- DNS verification tokens,
- certificate provisioning status.

Example conceptual endpoints:
- `POST /v1/apps/:appId/domains`
- `GET /v1/apps/:appId/domains`
- `POST /v1/apps/:appId/domains/:domainId/verify`

### 13.6 Upload signing (managed assets)

If uploads are enabled, Token Host MUST provide an upload signing service so browsers can upload directly to object storage without exposing platform credentials.

Example:
- `POST /v1/uploads/sign` returns a short-lived signed URL and required headers/policy.

The signing service MUST enforce content-type and size constraints and SHOULD enforce per-org quotas.

### 13.7 Webhooks and external automation

Token Host SHOULD support webhooks for:
- build completion,
- deployment completion,
- publish completion,
- failures (with sanitized error data).

Webhook delivery MUST be signed (HMAC or equivalent) and retried with exponential backoff.

### 13.8 Public discovery endpoints

Hosted apps require public access to manifests and (optionally) schemas.

Token Host MUST make release manifests publicly readable at stable URLs (hash-addressed), for example:
- `GET https://<slug>.apps.tokenhost.com/.well-known/tokenhost/manifest.json`

If a schema is intended to be public, Token Host MAY also publish it under:
- `GET https://<slug>.apps.tokenhost.com/.well-known/tokenhost/schema.json`

Publishing these files MUST NOT expose private org data (only the schema and release metadata).

### 13.9 Trust & safety (takedowns)

Token Host MUST implement a moderation/takedown control that can unpublish hosted UI for apps that violate policy or present unacceptable risk, without attempting to alter immutable on-chain state.

At minimum, the API MUST support:
- setting an app or release hosting state (`published|unpublished|suspended`),
- a reason code and audit trail for state changes,
- admin-only enforcement actions.

Example conceptual endpoints:
- `POST /v1/admin/apps/:appId/takedown` (suspend hosting; requires admin)
- `POST /v1/admin/apps/:appId/restore` (restore hosting; requires admin)

### 13.10 Chains and appchains

Token Host’s chain registry and (optional) appchain provisioning capabilities MUST be represented explicitly in the API.

The API MUST support:
- listing supported/public chain configs (including Token Host Chain if available),
- storing org-scoped external chain configs (BYO RPC/explorer keys),
- requesting provisioning of Token Host-managed appchains (where offered),
- tracking chain lifecycle as jobs with audit logs.

Example conceptual endpoints:
- `GET /v1/chains` (public chain registry)
- `POST /v1/orgs/:orgId/chains` (add/update org-scoped external chain config)
- `GET /v1/apps/:appId/chains` (chains relevant to an app: Token Host Chain, provisioned appchains, user-configured chains)
- `POST /v1/apps/:appId/chains/provision` (request a managed appchain; returns a job)
- `GET /v1/apps/:appId/chains/:chainId` (chain details and status)

---

## 14. Observability and Audit

Token Host MUST provide:
- build logs (streaming and stored),
- deployment logs,
- structured audit logs for schema changes, publish actions, domain changes, and chain/appchain lifecycle actions,
- metrics (SLOs for build time, deploy success, hosting availability),
- error reporting for Studio and (optionally) hosted apps.

---

## 15. Security and Compliance Requirements

### 15.1 Supply chain

Token Host’s build pipeline is a high-risk surface because it transforms untrusted schema input into executable artifacts. Token Host MUST treat builds as untrusted workloads and isolate them accordingly.

Requirements:
- Build workers MUST run in isolated sandboxes (container isolation at minimum; stronger isolation preferred for untrusted workloads).
- Dependencies MUST be pinned (lockfiles) and the manifest MUST record dependency versions.
- Token Host SHOULD generate SBOMs (Software Bill of Materials) for releases and store them with artifacts.
- Build workers MUST not have access to long-lived production secrets beyond what is required for the specific job (principle of least privilege).

### 15.2 Web security

Studio and hosted apps are web-facing and MUST follow modern web security practices:
- Studio and hosted apps MUST set strict security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, etc.).
- Mutating API endpoints MUST be protected against CSRF.
- User-generated content displayed in hosted apps MUST be safely escaped to prevent XSS.
- Cross-tenant data access MUST be prevented by authorization checks and tenant scoping in the data model.
- CORS policies MUST be explicit and minimal; wildcard credentials MUST NOT be used.

### 15.3 Secrets and configuration

Token Host MUST operate under “no secrets in code”:
- Secrets MUST NOT be stored in source control, templates, or generated output.
- Secrets MUST be stored in a dedicated secret manager.
- Secrets MUST be rotated and auditable.
- Production secrets MUST be scoped per environment (dev/staging/prod) and per service.

### 15.4 Abuse prevention

Token Host provides public endpoints (auth, builds, uploads) that can be abused. Token Host MUST:
- rate limit auth endpoints (especially nonce issuance and login),
- rate limit build requests per org (quota + burst limits),
- detect and reject abusive schemas (excessive size/complexity),
- rate limit upload signing and enforce storage quotas.

### 15.5 Smart contract security posture

Generated contracts are part of the platform’s security boundary. Token Host MUST:
- avoid insecure attribution patterns (MUST NOT use `tx.origin`),
- avoid unbounded loops in state-changing functions,
- use explicit access control patterns (OpenZeppelin libraries preferred),
- produce contracts that can pass baseline static analysis (Slither/Semgrep rulesets),
- include invariant and fuzz testing templates for generated contracts.

If Token Host introduces delegation/kernel contracts, those MUST be audited independently from app-specific generated contracts.

### 15.6 Relayer/paymaster key management (if applicable)

If Token Host operates relayers or paymasters:
- relayer keys MUST be stored in HSM/KMS-backed systems,
- relayer operations MUST be rate-limited and policy-controlled,
- relayer actions MUST be attributable and logged,
- compromise of relayer keys MUST not grant control of user-owned assets (only the ability to spend Token Host gas budgets).

### 15.7 Chain operator key management (if Token Host operates chains)

If Token Host operates Token Host Chain and/or Token Host-managed appchains, chain operator keys and admin controls are security-critical. Token Host MUST:
- store chain operator keys (sequencer/batcher/bridge/governance keys, as applicable) in HSM/KMS-backed systems,
- use least-privilege separation between operational roles (sequencing vs governance vs deployment tooling),
- require multi-party approval for high-impact actions (chain upgrades, bridge parameter changes),
- maintain immutable, queryable audit logs for chain lifecycle actions (provisioning, upgrades, key rotation),
- publish clear incident-response and rollback procedures for chain incidents.

---

## 16. Acceptance Criteria (Phase 1 “Production MVP”)

The system is considered Phase 1 complete when:
- A user can sign into Studio and create an app schema.
- Schema validation rejects invalid schemas with actionable errors.
- A build produces a deterministic manifest and artifacts.
- A deployment to one public testnet succeeds and verifies contracts.
- The app is published at `https://<slug>.apps.tokenhost.com` (or a custom domain) and supports basic CRUD.
- When the chain supports websocket log subscriptions, the published app reflects on-chain changes in near-real-time (event-driven refresh with safe fallbacks).
- A schema can require a native fee for create on a collection, and the generated UI/contract correctly enforces it.
- A transfer-enabled collection can transfer record ownership via an on-chain transfer method and generated UI.
- Admins can place a published app into a takedown/suspended state that stops serving the user-generated UI under Token Host-controlled domains.
- Export bundle download works and can be self-hosted.
- Optional: indexer integration can be enabled for the example app.

---

## Appendix A. Release Manifest (Example Shape)

The exact manifest schema is versioned, but a v1 example shape is:

```json
{
  "manifestVersion": "1.0.0",
  "thsVersion": "2025-12",
  "schemaVersion": "1.0.0",
  "schemaHash": "sha256:…",
  "generatorVersion": "0.1.0",
  "toolchain": {
    "node": "20.x",
    "solc": "0.8.24",
    "containerDigest": "sha256:…"
  },
  "release": {
    "releaseId": "rel_…",
    "supersedesReleaseId": null,
    "publishedAt": "2025-12-27T00:00:00Z"
  },
  "app": { "name": "Job Board", "slug": "job-board" },
  "collections": [{ "name": "Candidate", "collectionId": "0x…" }],
  "artifacts": {
    "soliditySources": { "digest": "sha256:…", "url": "https://…/sources.tgz" },
    "compiledContracts": { "digest": "sha256:…", "url": "https://…/compiled.tgz" }
  },
  "deployments": [
    {
      "role": "primary",
      "chainId": 11155111,
      "chainName": "sepolia",
      "deploymentMode": "single",
      "deploymentEntrypointAddress": "0x…",
      "adminAddress": "0x…",
      "treasuryAddress": "0x…",
      "contracts": [
        {
          "role": "app",
          "address": "0x…",
          "verified": true,
          "bytecodeDigest": "sha256:…",
          "abiDigest": "sha256:…"
        }
      ],
      "verified": true,
      "blockNumber": 0,
      "chainConfig": {
        "url": "https://…/chain-config.json",
        "digest": "sha256:…",
        "chainConfigVersion": "1.0.0"
      }
    },
    {
      "role": "legacy",
      "schemaVersion": "0.9.0",
      "schemaHash": "sha256:…",
      "chainId": 11155111,
      "chainName": "sepolia",
      "deploymentMode": "single",
      "deploymentEntrypointAddress": "0x…",
      "adminAddress": "0x…",
      "treasuryAddress": null,
      "contracts": [{ "role": "app", "address": "0x…", "verified": true }],
      "verified": true,
      "blockNumber": 0
    }
  ],
  "ui": {
    "bundleHash": "sha256:…",
    "baseUrl": "https://job-board.apps.tokenhost.com/",
    "wellKnown": "/.well-known/tokenhost/manifest.json"
  },
  "features": {
    "indexer": false,
    "delegation": false,
    "uploads": true,
    "onChainIndexing": true
  },
  "migrations": {
    "stateCopyReports": [{ "url": "https://…/state-copy-report.json", "digest": "sha256:…" }]
  },
  "signatures": [{ "alg": "ed25519", "sig": "…" }]
}
```

---

## Appendix B. Standard Generated Routes (Guidelines)

Token Host-generated apps SHOULD use predictable routes so users can share links:
- `/` home (collection dashboard)
- `/<collection>` list
- `/<collection>/new` create
- `/<collection>/<id>` detail
- `/<collection>/<id>/edit` edit (if enabled)
- `/<collection>/<id>/delete` delete (if enabled)
- `/<collection>/by-<field>/<value>` unique lookup (if enabled)
- `/<collection>/by-<ref>/<refId>` reverse-reference lookup (if enabled)

Route naming MUST be stable across builds for a given schema version.

---

## Appendix C. Tokenized Records and App Economy (Future Modules)

This appendix captures optional, future-facing modules that align with Token Host’s “EVM as the backend” philosophy while expanding beyond pure CRUD data into assets and economies. These modules are intentionally opt-in because they increase security, UX, and regulatory complexity.

### C.1 Tokenized collections (“records as NFTs”)

Token Host collections can represent either:
- **data records** (identity/profile, logs, posts), or
- **assets** (tickets, coupons, items) where transferability and wallet-native UX are desirable.

The core spec supports asset-like records via `transferRules` and the `owner` system field. A natural extension is to make a collection’s records be NFTs (ERC-721 or ERC-1155) so they integrate with existing wallets, tooling, and marketplaces.

Conceptual schema shape (non-normative):
- `tokenization` (optional):
  - `standard`: `"erc721" | "erc1155"`
  - `soulbound`: boolean (if true, transfers are disabled)
  - `metadata`: `"offchain" | "onchain" | "hybrid"`

Normative requirements if tokenization is enabled:
- `recordId` MUST equal `tokenId`.
- Create MUST mint the token to the initial `owner`.
- Ownership checks MUST be based on token ownership (`ownerOf(tokenId)` / ERC-1155 balance model) and MUST remain compatible with `_msgSender()`.
- Transfers SHOULD be implemented using the relevant token standard’s semantics (`transferFrom`/`safeTransferFrom`) and MUST update the app’s `owner` view consistently (either stored as a cached field kept in sync, or derived at read time).
- Soft delete MUST have defined behavior:
  - either disallow deleting tokenized records,
  - or implement “freeze” semantics (record is marked inactive while token still exists),
  - or treat hard delete as burning the token (only if explicitly enabled).

Design note:
- Tokenizing everything is not the goal; the goal is to let an app mix data collections and asset collections within the same schema while retaining deterministic generation and migration capabilities.

### C.2 App economy module (payments, rewards, liquidity)

Some apps want first-class economic primitives (e.g., “pay to post”, “reward contributors”, “stake for access”). Token Host can support this via an optional “app economy” module layered on top of deterministic schema generation.

Scope goals:
- Let app actions be paid for in native currency (already supported for creates) and/or in an app token (ERC-20).
- Optionally reward actions (“farming”) under strict safety constraints.
- Optionally support a developer-funded liquidity bootstrap, recognizing that DEX integrations are chain-specific and must be adapter-based.

Conceptual schema shape (non-normative):
- `app.economy` (optional):
  - `token`:
    - `mode`: `"external" | "generated"`
    - `addressByChain`: map of `chainId -> tokenAddress` (if external)
    - `symbol`, `decimals` (display only)
  - `payments`:
    - enable ERC-20 payments in `createRules.payment`/`updateRules.payment`/etc (future)
    - allow `asset: "native" | "erc20"`
  - `rewards`:
    - `enabled`: boolean
    - `funding`: `"prefunded"` (recommended default)
    - `rules`: action-based reward rules (create/update/verify/etc) with strict rate limits
  - `liquidity`:
    - `enabled`: boolean
    - `bootstrap`: explicit operator/dev-driven steps (no implicit swaps)

Safety requirements (if implemented):
- The platform MUST NOT imply that token modules are safe by default; Studio MUST require explicit opt-in and display risk warnings (security, sybil abuse, market risk).
- Rewards MUST NOT be implemented as “mint on every CRUD action” without strict anti-abuse controls; prefunded + claim-based distribution SHOULD be preferred.
- Dynamic pricing and oracle-based conversions SHOULD NOT be part of the initial design; “pay in ETH or pay in token” SHOULD be modeled as explicit fixed-price options per action.
- Token Host MUST NOT require custody of user private keys for economy features. Any relayers/paymasters used for token payments MUST be abuse-controlled.

Relationship to Token Host Chain / OP chains:
- A first-party Token Host Chain can standardize paymaster/AA primitives and token-payment UX, making Web2-like onboarding (OAuth + sponsored actions) more achievable without compromising key custody defaults.
