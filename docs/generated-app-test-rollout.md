# Generated-App Tests Rollout Plan

## Purpose

Define the default-on rollout for generated-app tests without destabilizing existing users.

## Scope

This plan covers:
- scaffold emission,
- contract tests emission,
- UI tests emission,
- generated CI workflow emission,
- default-on switch for emitted tests.

## Current state (as of 2026-02-05)

- Phase 1 complete: `--with-tests` emits test scaffold.
- Phase 2 complete: contract integration test scaffold emitted.
- Phase 3 complete: UI smoke test scaffold emitted (static + optional live mode).
- Phase 4 complete: generated CI workflow emitted under `.github/workflows/generated-app-ci.yml`.
- Phase 5 pending: default-on switch for emitted tests.

## Rollout phases and defaults

1. Phase 1: scaffold emission
- Behavior: `th generate --with-tests` emits base `tests/` tree.
- Default: OFF.

2. Phase 2: contract tests emission
- Behavior: emit `tests/contract/*` and add `test:contract` script.
- Default: OFF.

3. Phase 3: UI tests emission
- Behavior: emit `tests/ui/smoke.mjs` and add `test:ui` script.
- Default: OFF.

4. Phase 4: generated CI template emission
- Behavior: emit `.github/workflows/generated-app-ci.yml`.
- Default: OFF.

5. Phase 5: default-on switch
- Behavior: `th generate` emits tests + generated CI workflow by default.
- New opt-out flag: `--no-tests` (or equivalent) to disable emitted test scaffold.
- Existing `--with-tests` remains accepted for compatibility for two minor releases after the switch, then becomes removable.

## Gate for default-on switch

Default-on MUST NOT be enabled until all are true:

- Builder CI includes generated-app verification in `integration-local` and stays green.
- At least two consecutive weeks of green `integration-local` runs on `master`.
- Canonical generated app (`apps/example/job-board.schema.json`) generated-app tests pass in CI.
- No open P0/P1 bugs attributed to generated test scaffolding or generated app CI template.

## Compatibility strategy for existing generated apps

Existing generated apps are not auto-migrated.

Migration path for existing app repos:
- Regenerate with `th generate --with-tests` and copy emitted `ui/tests/` + `.github/workflows/generated-app-ci.yml`.
- Keep app-specific tests and custom workflows; merge generated workflow sections as needed.
- Validate locally with:
  - `pnpm run test:contract`
  - `pnpm run test:ui`

## Deprecation timeline for testless path

- T0: Current (opt-in tests via `--with-tests`).
- T1: Default-on release lands.
  - `--with-tests` still accepted (compat alias).
  - `--no-tests` documented as supported opt-out.
- T2: Two minor releases after T1.
  - Announce pending removal of `--with-tests` alias in release notes.
- T3: Four minor releases after T1.
  - Remove `--with-tests` alias if adoption and support metrics are stable.

## Release acceptance checklist integration

Before releasing default-on behavior:
- `docs/release-checklist.md` generated-app tests section is complete.
- PR checklist includes generated-app rollout assertions.
- SPEC and AGENTS sections for generated tests are synchronized.
