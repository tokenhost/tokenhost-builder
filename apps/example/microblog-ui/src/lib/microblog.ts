'use client';

import { readRecordsByIds } from './app';
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

export function getRecordId(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function recordOwner(record: any): string {
  return String(record?.owner ?? '').trim().toLowerCase();
}

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
    publicClient: runtime.publicClient,
    abi: runtime.abi,
    address: runtime.appAddress,
    collectionName: 'Profile',
    pageSize: 50
  });

  return page.ids.map((id, index) => ({ id, record: page.records[index] }));
}

export async function listOwnedProfiles(runtime: AppRuntime, ownerAddress: string): Promise<ProfileRecord[]> {
  const normalizedOwner = ownerAddress.trim().toLowerCase();
  const profiles = await listProfiles(runtime);
  return profiles.filter((entry) => recordOwner(entry.record) === normalizedOwner);
}

export async function loadProfilesByIds(runtime: AppRuntime, ids: bigint[]): Promise<Map<string, any>> {
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id)))).map((id) => BigInt(id));
  if (!uniqueIds.length) return new Map();

  const records = await readRecordsByIds({
    publicClient: runtime.publicClient,
    abi: runtime.abi,
    address: runtime.appAddress,
    collectionName: 'Profile',
    ids: uniqueIds
  });

  const out = new Map<string, any>();
  uniqueIds.forEach((id, index) => {
    out.set(String(id), records[index] ?? null);
  });
  return out;
}

export async function resolveFeedItemsWithProfiles(runtime: AppRuntime, items: Array<{ id: bigint; record: any }>): Promise<FeedItem[]> {
  const profileIds = items
    .map((item) => extractAuthorProfileId(item.record))
    .filter((value): value is bigint => value !== null);

  const profilesById = await loadProfilesByIds(runtime, profileIds);

  return items.map((item) => {
    const authorProfileId = extractAuthorProfileId(item.record);
    return {
      ...item,
      authorProfileId,
      authorProfile: authorProfileId ? profilesById.get(String(authorProfileId)) ?? null : null
    };
  });
}

export async function loadMicroblogRuntime(): Promise<AppRuntime> {
  return loadAppRuntime();
}
