import { fetchAppAbi } from './abi';
import { listRecords } from './app';
import { chainFromId } from './chains';
import { makePublicClient } from './clients';
import { fetchManifest, getPrimaryDeployment } from './manifest';

export type AppRuntime = {
  manifest: any;
  deployment: any;
  abi: any[];
  chain: any;
  publicClient: any;
  appAddress: `0x${string}`;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MAX_LIST_PAGE_SIZE = 50;

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

  const chain = chainFromId(chainId);
  const publicClient = makePublicClient(chain, rpcOverride);
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
  pageSize?: number;
}): Promise<{ ids: bigint[]; records: any[] }> {
  const pageSize = Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, Number(args.pageSize ?? MAX_LIST_PAGE_SIZE)));
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

export async function findRecordByFieldValue(args: {
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collectionName: string;
  fieldName: string;
  value: unknown;
  pageSize?: number;
}): Promise<{ id: bigint | null; record: any | null }> {
  const page = await listRecordsByFieldValue(args);
  return {
    id: page.ids[0] ?? null,
    record: page.records[0] ?? null
  };
}
