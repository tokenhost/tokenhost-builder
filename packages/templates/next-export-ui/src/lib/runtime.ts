import { fetchAppAbi } from './abi';
import { listRecords, listRecordsByIndex } from './app';
import { extractHashtagTokens, hashtagIndexKey, normalizeHashtagToken } from './indexing';
import { chainFromId } from './chains';
import { chainWithRpcOverride, makePublicClient } from './clients';
import { fetchManifest, getListMaxLimit, getPrimaryDeployment, getReadRpcUrl } from './manifest';

export type AppRuntime = {
  manifest: any;
  deployment: any;
  abi: any[];
  chain: any;
  publicClient: any;
  appAddress: `0x${string}`;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function clampListPageSize(manifest: any, requested?: number): number {
  const maxListPageSize = getListMaxLimit(manifest);
  return Math.min(maxListPageSize, Math.max(1, Number(requested ?? maxListPageSize)));
}

export async function loadAppRuntime(rpcOverride?: string): Promise<AppRuntime> {
  const manifest = await fetchManifest();
  const deployment = getPrimaryDeployment(manifest);
  if (!deployment) throw new Error('Manifest has no deployments.');

  const chainId = Number(deployment.chainId);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error('Primary deployment is missing a usable chainId.');
  }

  const appAddress = String(deployment.deploymentEntrypointAddress || '') as `0x${string}`;
  if (!appAddress || appAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error('App is not deployed yet (manifest has 0x0 address).');
  }

  const resolvedRpcUrl = rpcOverride || getReadRpcUrl(manifest) || undefined;
  const chain = chainWithRpcOverride(chainFromId(chainId), resolvedRpcUrl);
  const publicClient = makePublicClient(chain, resolvedRpcUrl);
  const abi = await fetchAppAbi();

  return {
    manifest,
    deployment,
    abi,
    chain,
    publicClient,
    appAddress
  };
}

export async function listAllRecords(args: {
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collectionName: string;
  manifest?: any;
  pageSize?: number;
}): Promise<{ ids: bigint[]; records: any[] }> {
  const pageSize = clampListPageSize(args.manifest, args.pageSize);
  const ids: bigint[] = [];
  const records: any[] = [];
  let cursor = 0n;

  for (;;) {
    const page = await listRecords({
      publicClient: args.publicClient,
      abi: args.abi,
      address: args.address,
      collectionName: args.collectionName,
      cursorIdExclusive: cursor,
      limit: pageSize
    });

    if (!page.ids.length) break;

    ids.push(...page.ids);
    records.push(...page.records);

    const nextCursor = page.ids[page.ids.length - 1];
    if (nextCursor === undefined || page.ids.length < pageSize) break;
    cursor = nextCursor;
  }

  return { ids, records };
}

export async function listRecordsByFieldValue(args: {
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collectionName: string;
  fieldName: string;
  value: unknown;
  manifest?: any;
  pageSize?: number;
}): Promise<{ ids: bigint[]; records: any[] }> {
  const page = await listAllRecords(args);
  const matchedIds: bigint[] = [];
  const matchedRecords: any[] = [];

  for (let index = 0; index < page.records.length; index += 1) {
    const record = page.records[index];
    if (record?.[args.fieldName] !== args.value) continue;
    const id = page.ids[index];
    if (id !== undefined) matchedIds.push(id);
    matchedRecords.push(record);
  }

  return { ids: matchedIds, records: matchedRecords };
}

export async function listAllRecordsByIndex(args: {
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collectionName: string;
  fieldName: string;
  key: `0x${string}`;
  manifest?: any;
  pageSize?: number;
  includeDeleted?: boolean;
  recordMatches?: (record: any) => boolean;
}): Promise<{ ids: bigint[]; records: any[] }> {
  const pageSize = clampListPageSize(args.manifest, args.pageSize);
  const ids: bigint[] = [];
  const records: any[] = [];
  const seenIds = new Set<string>();
  let offset = 0n;

  for (;;) {
    const page = await listRecordsByIndex({
      publicClient: args.publicClient,
      abi: args.abi,
      address: args.address,
      collectionName: args.collectionName,
      fieldName: args.fieldName,
      key: args.key,
      offset,
      limit: pageSize,
      includeDeleted: args.includeDeleted
    });

    if (!page.ids.length) break;

    for (let index = 0; index < page.ids.length; index += 1) {
      const id = page.ids[index];
      const record = page.records[index];
      if (id === undefined || !record) continue;
      if (record?.isDeleted) continue;
      const dedupeKey = String(id);
      if (seenIds.has(dedupeKey)) continue;
      if (args.recordMatches && !args.recordMatches(record)) continue;
      seenIds.add(dedupeKey);
      ids.push(id);
      records.push(record);
    }

    if (page.ids.length < pageSize) break;
    offset += BigInt(page.ids.length);
  }

  return { ids, records };
}

export async function listHashtagRecords(args: {
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collectionName: string;
  fieldName: string;
  hashtag: string;
  manifest?: any;
  pageSize?: number;
}): Promise<{ hashtag: string; ids: bigint[]; records: any[] }> {
  const normalized = normalizeHashtagToken(args.hashtag);
  if (!normalized) {
    return { hashtag: '', ids: [], records: [] };
  }

  const page = await listAllRecordsByIndex({
    publicClient: args.publicClient,
    abi: args.abi,
    address: args.address,
    collectionName: args.collectionName,
    fieldName: args.fieldName,
    key: hashtagIndexKey(normalized),
    manifest: args.manifest,
    pageSize: args.pageSize,
    includeDeleted: true,
    recordMatches: (record) => extractHashtagTokens(String(record?.[args.fieldName] ?? '')).includes(normalized)
  });

  return {
    hashtag: normalized,
    ids: page.ids,
    records: page.records
  };
}

export async function findRecordByFieldValue(args: {
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collectionName: string;
  fieldName: string;
  value: unknown;
  manifest?: any;
  pageSize?: number;
}): Promise<{ id: bigint | null; record: any | null }> {
  const page = await listRecordsByFieldValue(args);
  return {
    id: page.ids[0] ?? null,
    record: page.records[0] ?? null
  };
}
