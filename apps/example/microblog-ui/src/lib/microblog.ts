'use client';

import { getRecordId, listOwnedRecords, recordOwner, resolveReferenceRecords } from './relations';
import { listAllRecords, loadAppRuntime, type AppRuntime } from './runtime';

export type ProfileRecord = {
  id: bigint;
  record: any;
};

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

export function profileLabel(profile: any): string {
  const handle = profileHandle(profile);
  const displayName = String(profile?.displayName ?? '').trim();
  if (displayName && handle) return `${displayName} (@${handle})`;
  if (handle) return `@${handle}`;
  if (displayName) return displayName;
  return 'Unnamed profile';
}

export function extractAuthorProfileId(postRecord: any): bigint | null {
  return getRecordId(postRecord?.authorProfile);
}

export async function listProfiles(runtime: AppRuntime): Promise<ProfileRecord[]> {
  const page = await listAllRecords({
    manifest: runtime.manifest,
    publicClient: runtime.publicClient,
    abi: runtime.abi,
    address: runtime.appAddress,
    collectionName: 'Profile',
    pageSize: 50
  });

  return page.ids.map((id, index) => ({ id, record: page.records[index] }));
}

export async function listOwnedProfiles(runtime: AppRuntime, ownerAddress: string): Promise<ProfileRecord[]> {
  return listOwnedRecords(runtime, 'Profile', ownerAddress);
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
