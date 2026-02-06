# Gasless UX via Sponsored Transactions (Plan C) - Specification

## 1. Purpose

Define a production-ready way to provide a gasless end-user experience on top of `reth` without
forking Ethereum protocol rules or modifying geth/reth consensus behavior.

This specification targets:

- Stock wallet compatibility (especially MetaMask).
- Centralized operator infrastructure.
- Clear operational controls for abuse and spend.

## 2. Product Goal

Users should be able to perform app actions without holding native gas tokens or reasoning about
gas settings, while transactions still settle on an EVM chain with standard fee mechanics.

In short: users feel gasless; infrastructure pays gas.

## 3. Scope

### In scope

- Sponsorship flow where backend relayers pay gas.
- Signature-based authorization from users (no custodial private keys).
- Replay protection, nonce strategy, and policy controls.
- Rate limiting, quotas, and operator spend guardrails.
- Monitoring and SLOs for relay reliability.

### Out of scope

- Protocol-level gas removal or execution client fee rule changes.
- Custom wallet plugins/snaps as a hard requirement.
- Decentralized relayer marketplace design.

## 4. Non-Goals

- Making all arbitrary third-party dapps gasless by default.
- Hiding transaction finality or failure semantics from users.
- Eliminating all backend trust assumptions in v1.

## 5. Requirements

### 5.1 Functional requirements

1. **Wallet compatibility**
   - Must work with stock MetaMask for signing.
   - Must not require custom wallet extensions.

2. **Gasless submission UX**
   - User signs an intent/typed payload.
   - Backend verifies signature and policy.
   - Backend submits on-chain transaction and pays gas.

3. **Authorization + replay protection**
   - Every user intent includes:
     - domain separator,
     - chain ID,
     - expiration,
     - unique nonce or request ID.
   - Backend rejects expired or replayed intents.

4. **Policy engine**
   - Per-user policy checks before relaying:
     - max value,
     - allowed target contracts/functions,
     - per-window request limits,
     - optional KYC/account state constraints.

5. **Submission guarantees**
   - Return deterministic request/relay IDs.
   - Expose status states (accepted, submitted, mined, failed, dropped, rejected).
   - Support idempotent retries for duplicate client submissions.

6. **Error model**
   - Clear user-facing error classes:
     - auth failure,
     - policy rejection,
     - simulation failure,
     - temporary infra failure,
     - on-chain revert.

### 5.2 Non-functional requirements

1. **Reliability**
   - Relay API availability target: `>= 99.9%`.
   - No single point of failure for key components (API, queue, signer, broadcaster).

2. **Latency**
   - P95 pre-submission decision latency (verify + policy + enqueue): `< 500ms`.
   - P95 submission latency to node: `< 2s` under normal load.

3. **Security**
   - Strong request authentication.
   - Signed payload validation with strict schema.
   - Private key isolation for relayer signer (HSM/KMS preferred).

4. **Cost control**
   - Hard daily/monthly spend caps.
   - Dynamic throttling or partial shutdown when budget thresholds are crossed.

5. **Observability**
   - Structured logs, metrics, and traces for all relay lifecycle steps.
   - Alerting for stuck queue, high failure ratio, and budget burn anomalies.

## 6. High-Level Architecture

1. **Client**
   - Requests typed data to sign.
   - Signs via MetaMask (`eth_signTypedData_v4`).
   - Submits signed intent to sponsor API.

2. **Sponsor API**
   - Authenticates caller.
   - Verifies signature and typed data domain.
   - Applies policy + quota checks.
   - Optionally simulates call before relay.
   - Enqueues valid request.

3. **Relayer worker**
   - Builds transaction.
   - Prices fees according to policy.
   - Submits to node RPC (reth/geth compatible).
   - Tracks hash lifecycle until terminal state.

4. **State + telemetry**
   - Intent store (dedupe/replay protection).
   - Relay status store.
   - Metrics/logging/alerts pipeline.

## 7. Chain and Node Compatibility Requirements

- No required modifications to geth/reth protocol logic.
- Compatible with standard JSON-RPC nodes.
- If reth-specific features are used (for example forwarding), they must remain optional.

## 8. API Contract (minimum)

1. `POST /sponsor/intents`
   - Input: signed intent payload.
   - Output: `intent_id`, initial status.

2. `GET /sponsor/intents/{intent_id}`
   - Output: current state and tx hash (if submitted).

3. `GET /sponsor/limits`
   - Output: current quota and policy summary for caller.

All write APIs must be idempotent using client-provided idempotency keys.

## 9. Security and Abuse Controls

1. **Authentication**
   - API key/JWT/session token required for submission.

2. **Rate limits**
   - Per-IP and per-user burst + sustained limits.

3. **Replay prevention**
   - Nonce/request ID uniqueness with TTL.

4. **Policy restrictions**
   - Allowlist of contracts/functions in v1.
   - Value transfer limits and optional blocklist checks.

5. **Budget controls**
   - Per-user and global spend ceilings.
   - Circuit breaker behavior when exceeded.

## 10. Rollout Plan

### Phase 0: Internal pilot

- Small allowlist of users/contracts.
- Manual spend monitoring.
- No public traffic.

### Phase 1: Controlled beta

- External users with strict quotas.
- Full telemetry + incident runbooks.
- Automated retry and dead-letter queue.

### Phase 2: Production

- Hardened signer ops (KMS/HSM).
- On-call alerts and SLO reporting.
- Budget automation and policy tuning.

## 11. Success Criteria

The project is successful when all are true for at least 30 consecutive days in production:

1. `>= 95%` of eligible user actions complete without users holding native gas token.
2. Relay API availability is `>= 99.9%`.
3. P95 relay decision latency is `< 500ms`.
4. End-to-end successful relay rate is `>= 98%` (excluding user-invalid requests).
5. Fraud/abuse spend remains within predefined risk budget.
6. No critical replay or signature-validation security incidents.
7. Zero required wallet modifications for supported clients.

## 12. Acceptance Tests

1. **MetaMask happy path**
   - User signs intent, relay submits tx, tx is mined, status updates correctly.

2. **No balance user**
   - User address with zero native token can still complete sponsored action.

3. **Replay attack**
   - Reuse same signed payload; second submission is rejected.

4. **Expired payload**
   - Intent past deadline is rejected with explicit reason.

5. **Policy violation**
   - Disallowed method/value is rejected before relay.

6. **Rate-limit behavior**
   - Requests beyond limit are throttled/rejected without service instability.

7. **Node degradation**
   - RPC failures trigger retry/backoff and terminal error visibility.

8. **Budget cutoff**
   - Spending cap triggers controlled rejection mode and alerts.

## 13. Risks and Mitigations

1. **Gas price spikes**
   - Mitigation: fee ceilings + adaptive throttling + deferred queue.

2. **Relayer key compromise**
   - Mitigation: KMS/HSM, scoped signer permissions, rotation, anomaly detection.

3. **Intent schema bugs**
   - Mitigation: strict versioned schemas and compatibility tests.

4. **Mempool unpredictability**
   - Mitigation: replacement policy, tx timeout handling, fallback broadcasters.

## 14. Open Decisions (to finalize before implementation)

1. Choose one primary pattern for v1:
   - EIP-2771 trusted forwarder path, or
   - ERC-4337/paymaster path.
2. Define exact contract/function allowlist for launch.
3. Set launch quotas and daily sponsorship budget.
4. Decide required confirmation depth for "completed" status.
