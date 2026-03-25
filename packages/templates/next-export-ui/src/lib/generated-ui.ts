'use client';

import { extractHashtagTokens } from './indexing';
import { resolveReferenceRecords, recordSummary } from './relations';
import { listAllRecords, listHashtagRecords, loadAppRuntime, type AppRuntime } from './runtime';
import { ths } from './ths';

export type GeneratedFeedConfig = NonNullable<NonNullable<typeof ths.app.ui>['generated']>['feeds'] extends Array<infer T> ? T : never;
export type GeneratedTokenPageConfig = NonNullable<NonNullable<typeof ths.app.ui>['generated']>['tokenPages'] extends Array<infer T> ? T : never;
export type GeneratedHomeSection = NonNullable<NonNullable<typeof ths.app.ui>['generated']>['homeSections'] extends Array<infer T> ? T : never;

export type GeneratedFeedItem = {
  id: bigint;
  record: any;
  referenceId: bigint | null;
  referenceRecord: any | null;
};

export function generatedFeeds(): GeneratedFeedConfig[] {
  return Array.isArray(ths.app.ui?.generated?.feeds) ? ths.app.ui.generated.feeds : [];
}

export function generatedTokenPages(): GeneratedTokenPageConfig[] {
  return Array.isArray(ths.app.ui?.generated?.tokenPages) ? ths.app.ui.generated.tokenPages : [];
}

export function generatedHomeSections(): GeneratedHomeSection[] {
  return Array.isArray(ths.app.ui?.generated?.homeSections) ? ths.app.ui.generated.homeSections : [];
}

export function getGeneratedFeed(id: string): GeneratedFeedConfig | null {
  return generatedFeeds().find((feed) => feed.id === id) ?? null;
}

export function getGeneratedTokenPage(id: string): GeneratedTokenPageConfig | null {
  return generatedTokenPages().find((page) => page.id === id) ?? null;
}

export async function loadGeneratedFeed(runtime: AppRuntime, feed: GeneratedFeedConfig): Promise<GeneratedFeedItem[]> {
  const page = await listAllRecords({
    manifest: runtime.manifest,
    publicClient: runtime.publicClient,
    abi: runtime.abi,
    address: runtime.appAddress,
    collectionName: feed.collection,
    pageSize: feed.limit ?? 25
  });

  const baseItems = page.ids.map((id, index) => ({ id, record: page.records[index] }));
  const referenceField = feed.card?.referenceField;
  if (!referenceField) {
    return baseItems.map((item) => ({ ...item, referenceId: null, referenceRecord: null }));
  }

  const collection = ths.collections.find((candidate) => candidate.name === feed.collection);
  const relation = collection?.relations?.find((entry) => entry.field === referenceField);
  if (!relation?.to) {
    return baseItems.map((item) => ({ ...item, referenceId: null, referenceRecord: null }));
  }

  return resolveReferenceRecords(runtime, baseItems, {
    fieldName: referenceField,
    targetCollectionName: relation.to
  });
}

export async function loadGeneratedTokenFeed(runtime: AppRuntime, tokenPage: GeneratedTokenPageConfig, value: string): Promise<{ token: string; items: GeneratedFeedItem[] }> {
  const feed = tokenPage.feed ? getGeneratedFeed(tokenPage.feed) : null;
  const page = await listHashtagRecords({
    manifest: runtime.manifest,
    publicClient: runtime.publicClient,
    abi: runtime.abi,
    address: runtime.appAddress,
    collectionName: tokenPage.collection,
    fieldName: tokenPage.field,
    hashtag: value,
    pageSize: tokenPage.limit ?? feed?.limit ?? 25
  });

  const baseItems = page.ids.map((id, index) => ({ id, record: page.records[index] }));
  if (!feed?.card?.referenceField) {
    return {
      token: page.hashtag,
      items: baseItems.map((item) => ({ ...item, referenceId: null, referenceRecord: null }))
    };
  }

  const collection = ths.collections.find((candidate) => candidate.name === tokenPage.collection);
  const relation = collection?.relations?.find((entry) => entry.field === feed.card?.referenceField);
  if (!relation?.to) {
    return {
      token: page.hashtag,
      items: baseItems.map((item) => ({ ...item, referenceId: null, referenceRecord: null }))
    };
  }

  return {
    token: page.hashtag,
    items: await resolveReferenceRecords(runtime, baseItems, {
      fieldName: feed.card.referenceField,
      targetCollectionName: relation.to
    })
  };
}

export function sortGeneratedFeedItemsDesc(items: GeneratedFeedItem[]): GeneratedFeedItem[] {
  return [...items].sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? 1 : -1));
}

export function collectGeneratedTrendingTokens(items: GeneratedFeedItem[], textField: string, limit = 8): Array<{ token: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const token of extractHashtagTokens(String(item.record?.[textField] ?? ''))) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .slice(0, limit)
    .map(([token, count]) => ({ token, count }));
}

export function feedCardSummary(item: GeneratedFeedItem, feed: GeneratedFeedConfig) {
  const referenceSummary = item.referenceRecord ? recordSummary(item.referenceRecord) : null;
  const textField = feed.card?.textField ?? 'body';
  const mediaField = feed.card?.mediaField ?? 'image';
  return {
    title: referenceSummary?.title ?? `Record #${String(item.id)}`,
    subtitle: referenceSummary?.subtitle ?? null,
    body: String(item.record?.[textField] ?? '').trim(),
    mediaUrl: String(item.record?.[mediaField] ?? '').trim() || null,
    imageUrl: referenceSummary?.imageUrl ?? null
  };
}

export async function loadGeneratedUiRuntime(): Promise<AppRuntime> {
  return loadAppRuntime();
}
