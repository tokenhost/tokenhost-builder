import {
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  toBytes,
  type Hex
} from 'viem';

export function collectionId(name: string): Hex {
  return keccak256(toBytes(name));
}

export function fnListIds(collectionName: string): string {
  return `listIds${collectionName}`;
}

export function fnGetCount(collectionName: string): string {
  return `getCount${collectionName}`;
}

export function fnGet(collectionName: string): string {
  // viem expects the function name (not full signature) and resolves overloads from args.
  return `get${collectionName}`;
}

export function fnListByIndex(collectionName: string, fieldName: string): string {
  return `listByIndex${collectionName}_${fieldName}`;
}

export function fnCreate(collectionName: string): string {
  return `create${collectionName}`;
}

export function fnUpdate(collectionName: string): string {
  return `update${collectionName}`;
}

export function fnDelete(collectionName: string): string {
  return `delete${collectionName}`;
}

export function fnTransfer(collectionName: string): string {
  return `transfer${collectionName}`;
}

function abiFnSignature(entry: any): string | null {
  if (!entry || entry.type !== 'function' || typeof entry.name !== 'string') return null;
  const inputs = Array.isArray(entry.inputs) ? entry.inputs : [];
  const types = inputs.map((i) => String(i?.type ?? '')).join(',');
  return `${entry.name}(${types})`;
}

export function hasAbiFunction(abi: any[], nameOrSignature: string): boolean {
  if (!Array.isArray(abi)) return false;
  for (const entry of abi) {
    const sig = abiFnSignature(entry);
    if (!sig) continue;
    if (sig === nameOrSignature) return true;
    if (!nameOrSignature.includes('(') && entry.name === nameOrSignature) return true;
  }
  return false;
}

export function assertAbiFunction(abi: any[], nameOrSignature: string, collectionName: string): void {
  if (hasAbiFunction(abi, nameOrSignature)) return;
  const known = (Array.isArray(abi) ? abi : [])
    .map((entry) => abiFnSignature(entry))
    .filter(Boolean)
    .slice(0, 30)
    .join(', ');
  throw new Error(
    `ABI mismatch for collection "${collectionName}". Missing function "${nameOrSignature}". ` +
      `This usually means the route collection key does not match the schema collection name or ABI is stale. ` +
      `Known ABI functions: ${known}`
  );
}

export async function appMulticall(args: {
  publicClient: any;
  abi: any;
  address: `0x${string}`;
  calls: Hex[];
}): Promise<Hex[]> {
  const res = await args.publicClient.readContract({
    address: args.address,
    abi: args.abi,
    functionName: 'multicall',
    args: [args.calls]
  });
  return res as Hex[];
}

function getFunctionAbi(args: { abi: any[]; name: string; inputCount?: number }): any[] {
  const filtered = (Array.isArray(args.abi) ? args.abi : []).filter((entry) => {
    if (!entry || entry.type !== 'function' || entry.name !== args.name) return false;
    if (typeof args.inputCount !== 'number') return true;
    return Array.isArray(entry.inputs) && entry.inputs.length === args.inputCount;
  });
  return filtered;
}

function encodeGetCall(args: {
  abi: any[];
  collectionName: string;
  id: bigint;
  includeDeleted: boolean;
}): Hex {
  const abi = getFunctionAbi({
    abi: args.abi,
    name: fnGet(args.collectionName),
    inputCount: args.includeDeleted ? 2 : 1
  });

  return encodeFunctionData({
    abi,
    functionName: fnGet(args.collectionName),
    args: args.includeDeleted ? [args.id, true] : [args.id]
  });
}

function decodeGetCallResult(args: {
  abi: any[];
  collectionName: string;
  data: Hex;
  includeDeleted: boolean;
}): any {
  const abi = getFunctionAbi({
    abi: args.abi,
    name: fnGet(args.collectionName),
    inputCount: args.includeDeleted ? 2 : 1
  });

  return decodeFunctionResult({
    abi,
    functionName: fnGet(args.collectionName),
    data: args.data
  });
}

export async function readRecordsByIds(args: {
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collectionName: string;
  ids: bigint[];
  includeDeleted?: boolean;
}): Promise<any[]> {
  if (!args.ids || args.ids.length === 0) return [];

  const includeDeleted = Boolean(args.includeDeleted);
  const calls: Hex[] = args.ids.map((id) =>
    encodeGetCall({
      abi: args.abi,
      collectionName: args.collectionName,
      id,
      includeDeleted
    })
  );

  const results = await appMulticall({
    publicClient: args.publicClient,
    abi: args.abi,
    address: args.address,
    calls
  });

  return results.map((data) =>
    decodeGetCallResult({
      abi: args.abi,
      collectionName: args.collectionName,
      data,
      includeDeleted
    })
  );
}

export async function listRecords(args: {
  publicClient: any;
  abi: any;
  address: `0x${string}`;
  collectionName: string;
  cursorIdExclusive: bigint;
  limit: number;
}): Promise<{ ids: bigint[]; records: any[] }>
{
  assertAbiFunction(args.abi, fnListIds(args.collectionName), args.collectionName);
  assertAbiFunction(args.abi, fnGet(args.collectionName), args.collectionName);

  const ids = (await args.publicClient.readContract({
    address: args.address,
    abi: args.abi,
    functionName: fnListIds(args.collectionName),
    args: [args.cursorIdExclusive, BigInt(args.limit), false]
  })) as bigint[];

  if (!ids || ids.length === 0) return { ids: [], records: [] };

  const records = await readRecordsByIds({
    publicClient: args.publicClient,
    abi: args.abi,
    address: args.address,
    collectionName: args.collectionName,
    ids
  });

  return { ids, records };
}

export async function countRecords(args: {
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collectionName: string;
  includeDeleted?: boolean;
}): Promise<bigint> {
  assertAbiFunction(args.abi, fnGetCount(args.collectionName), args.collectionName);

  return (await args.publicClient.readContract({
    address: args.address,
    abi: args.abi,
    functionName: fnGetCount(args.collectionName),
    args: [Boolean(args.includeDeleted)]
  })) as bigint;
}

export async function listRecordsByIndex(args: {
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collectionName: string;
  fieldName: string;
  key: Hex;
  offset: bigint;
  limit: number;
  includeDeleted?: boolean;
}): Promise<{ ids: bigint[]; records: any[] }> {
  assertAbiFunction(args.abi, fnListByIndex(args.collectionName, args.fieldName), args.collectionName);
  assertAbiFunction(args.abi, fnGet(args.collectionName), args.collectionName);

  const ids = (await args.publicClient.readContract({
    address: args.address,
    abi: args.abi,
    functionName: fnListByIndex(args.collectionName, args.fieldName),
    args: [args.key, args.offset, BigInt(args.limit)]
  })) as bigint[];

  if (!ids || ids.length === 0) return { ids: [], records: [] };

  const records = await readRecordsByIds({
    publicClient: args.publicClient,
    abi: args.abi,
    address: args.address,
    collectionName: args.collectionName,
    ids,
    includeDeleted: args.includeDeleted
  });

  return { ids, records };
}
