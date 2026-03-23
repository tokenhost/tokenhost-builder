# Working Note / Spec Delta: Native Hashtag Indexing + Filecoin Image Uploads

Issue: `#62`  
Ticket draft: `docs/tickets/011-native-hashtag-indexing-and-filecoin-image-uploads.md`

## Purpose

This file is the working note for the sprint and the temporary home for spec deltas that are not yet fully folded into `SPEC.md`.

If implementation changes platform behavior and `SPEC.md` has not yet been updated, that behavior must be described here before merge.

## Current direction

### 1. Native tokenized query indexes

Working direction for this sprint:
- extend THS query-index modeling in a backward-compatible way,
- preserve `indexes.index: [{ field }]` as equality index behavior,
- add an opt-in tokenized index mode for supported `string` fields,
- ship one tokenizer in v1: hashtag extraction.

### 2. Upload architecture

Working direction for this sprint:
- generated UI should depend only on a stable Token Host upload interface,
- Filecoin Onchain Cloud should sit behind that interface as one provider implementation,
- runner choice should remain a deployment concern rather than a schema concern.

Initial runner modes under consideration:
- `process`
- `remote`
- future `worker`
- future `sdk`

### 3. Boundedness and gas predictability

This sprint adds the following requirement beyond the current explicit spec text:
- tokenized index generation must define hard limits so write gas stays predictable in practice.

Planned bounds to make explicit in implementation and then fold into `SPEC.md`:
- maximum tokens extracted per indexed field on create/update
- maximum token length
- maximum page size for token/equality accessors
- maximum list scan depth

## Open questions

1. Should tokenized index options live directly in `indexes.index[]`, or should the schema split equality and tokenized index families more explicitly?
2. Should bounded limits be configurable per chain, fixed by generator version, or partly configurable with hard caps?
3. Should upload runner mode live in manifest extensions, local preview config, generated app env, or a combination?
4. Should local-dev chain selection and fallback behavior be codified in `SPEC.md`, CLI docs, or both?

## Merge rule

Before merging behavior that depends on any unresolved item above:
- either resolve it in `SPEC.md`,
- or replace the open item here with a concrete written rule and corresponding tests.
