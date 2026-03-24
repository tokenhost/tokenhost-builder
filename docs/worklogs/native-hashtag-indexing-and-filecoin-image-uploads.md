# Work Log: Native Hashtag Indexing + Filecoin Image Uploads

Issue: `#62`  
Ticket draft: `docs/tickets/011-native-hashtag-indexing-and-filecoin-image-uploads.md`

## Purpose

Chronological execution log for the platform-first microblog workstream. This file records:
- decisions,
- shipped changes,
- validation evidence,
- follow-ups and open risks.

## Entries

### 2026-03-23

#### Planning and sprint freeze
- Opened GitHub issue `#62` from the local ticket draft.
- Confirmed the sprint source of truth is the GitHub issue plus the in-repo ticket draft.
- Confirmed implementation will proceed as 8 stacked PRs and must not be merged by AI without human approval.

#### Architecture direction frozen
- Chose platform-first implementation over app-specific workaround.
- Decided not to model hashtags primarily as `Tag` / `PostTag` collections.
- Decided to add native tokenized secondary indexes in THS/generator/runtime.
- Decided generated UI must treat `image` as a first-class upload field rather than a raw string input.

#### Upload architecture direction frozen
- Decided generated UI will talk to a stable Token Host upload interface.
- Decided Filecoin Onchain Cloud is one upload provider implementation, not a special-case UI path.
- Decided the provider implementation must remain runner-agnostic:
  - `process`
  - `remote`
  - later `worker`
  - later `sdk`
- Decided the default funding model for the Filecoin Onchain Cloud provider is `appPays`.

#### Performance and boundedness requirements frozen
- Decided bounded token/scan behavior is a release requirement, not a nice-to-have.
- Planned explicit gas/perf validation rather than relying only on algorithmic reasoning.

#### Next steps
- Add sprint scaffolding docs and backlog references.
- Extend THS query-index shape for native tokenized indexes.
- Implement equality indexes before hashtag token indexes so the generator surface stays layered.
