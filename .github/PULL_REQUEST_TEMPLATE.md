## Summary

Describe what changed and why.

## Validation

- [ ] `pnpm test`
- [ ] `pnpm test:integration`
- [ ] Any targeted tests added/updated for this change

## Generated-App Tests Rollout Checklist

- [ ] If this PR changes test scaffolding or defaults, `docs/generated-app-test-rollout.md` is updated.
- [ ] If this PR changes generated app CI behavior, `docs/generated-app-ci.md` is updated.
- [ ] `AGENTS.md` and `SPEC.md` reflect the same generated-app testing behavior and rollout phase.
- [ ] Canonical generated app coverage remains in CI (`integration-local`).
- [ ] Migration/deprecation notes are included if generated defaults changed.
