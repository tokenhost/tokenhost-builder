# Memo Draft: Native Hashtag Indexing + Filecoin Image Uploads

## Working title

Making Token Host feel native for media and discovery: on-chain hashtag indexes and Filecoin-backed image posts

## Purpose

This memo is a living summary of the sprint behind issue `#62`. It is intentionally more narrative than the work log or spec-delta note so it can be reused later as:
- an engineering summary,
- a product memo,
- a release note input,
- or the basis for a public blog post.

## Problem

Token Host could already model `image` fields and generic query indexes in theory, but two practical gaps remained:
- image creation/editing still behaved like a raw string field in the generated UI,
- hashtag-based feeds required app-specific modeling workarounds instead of a native platform primitive.

## Chosen direction

We are addressing the problem at the platform layer:
- native tokenized secondary indexes for hashtags,
- native generated-UI upload behavior for `image` fields,
- and a provider/runner abstraction so Filecoin Onchain Cloud can be used without hardcoding one hosting topology.

## Key design choices

### Platform-first indexing

We are not treating hashtags as a demo-specific relational pattern. Instead, the sprint adds a native tokenized index capability to Token Host so future apps can reuse the same primitive.

### Upload interface over provider detail

The generated UI should only know how to ask Token Host to upload a file and receive a canonical URL/CID. It should not know provider details or runner topology.

### Bounded behavior is part of the feature

For on-chain tokenized indexes, correctness is not enough. The feature is only acceptable if gas and query behavior stay bounded and testable.

## Status

In progress.
