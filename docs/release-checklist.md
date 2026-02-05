# Release Checklist

Use this checklist for builder releases that affect generation, tests, deploy, or CI behavior.

## Core validation

- `pnpm test` passes.
- `pnpm test:integration` passes.
- Required GitHub checks are green (`static`, `integration-local`).

## Generated-app tests rollout checks

- Rollout doc is up to date: `docs/generated-app-test-rollout.md`.
- Generated app CI doc is up to date: `docs/generated-app-ci.md`.
- SPEC and AGENTS are synchronized for generated-app testing behavior.
- Canonical generated app verification is present in `integration-local`.
- Default-on switch gate is satisfied before enabling emitted tests by default.

## Release notes

- Breaking/behavioral changes documented.
- Generated app migration notes included when defaults change.
- Deprecation milestones (`--with-tests` alias / testless path) updated if applicable.
