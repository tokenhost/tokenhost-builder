# UI Redesign System (Studio + Generated UI)

This repo now uses a shared token source for Studio and generated app UI.

## Shared token source

- Canonical token file: `packages/templates/next-export-ui/src/theme/tokens.json`
- Generated Next UI consumes it via `packages/templates/next-export-ui/src/theme/index.ts`.
- `th studio` loads the same JSON and maps values into CSS custom properties.

## Token groups

- `colors`: background, panel, border, text, primary/accent, success/danger
- `radius`: small/medium/large corner radii
- `spacing`: xs/sm/md/lg/xl rhythm
- `typography`: display/body/mono stacks
- `motion`: fast/base transition timings

## Runtime UX improvements

- Generated UI now exposes explicit wallet network mismatch recovery in `NetworkStatus`.
- Faucet button provides actionable disabled reason when endpoint is unavailable.
- Connect flow uses deployment chain context when available.

## Contribution guidance

- Keep visual primitives token-driven.
- Avoid hardcoded ad-hoc colors/spacings in route components.
- Add or update generated app tests when adding new critical UX surfaces.
