'use client';

import { resolveReferenceRecords } from './relations';
import { loadAppRuntime, type AppRuntime } from './runtime';

export type FeedItem = {
  id: bigint;
  record: any;
  authorProfileId: bigint | null;
  authorProfile: any | null;
};

export function profileDisplayName(profile: any): string {
  const displayName = String(profile?.displayName ?? '').trim();
  const handle = String(profile?.handle ?? '').trim();
  if (displayName) return displayName;
  if (handle) return `@${handle}`;
  return 'Anonymous';
}

export function profileHandle(profile: any): string {
  return String(profile?.handle ?? '').trim();
}

export async function resolveFeedItemsWithProfiles(runtime: AppRuntime, items: Array<{ id: bigint; record: any }>): Promise<FeedItem[]> {
  const resolved = await resolveReferenceRecords(runtime, items, {
    fieldName: 'authorProfile',
    targetCollectionName: 'Profile'
  });

  return resolved.map((item) => ({
    id: item.id,
    record: item.record,
    authorProfileId: item.referenceId,
    authorProfile: item.referenceRecord
  }));
}

export async function loadMicroblogRuntime(): Promise<AppRuntime> {
  return loadAppRuntime();
}
