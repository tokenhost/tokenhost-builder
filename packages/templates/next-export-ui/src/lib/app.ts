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

export function fnGet(collectionName: string): string {
  // The generated contract overloads getC(uint256,bool) and getC(uint256).
  // Use the full signature to disambiguate for viem encoding/decoding.
  return `get${collectionName}(uint256)`;
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

  const calls: Hex[] = ids.map((id) =>
    encodeFunctionData({
      abi: args.abi,
      functionName: fnGet(args.collectionName),
      args: [id]
    })
  );

  const results = await appMulticall({
    publicClient: args.publicClient,
    abi: args.abi,
    address: args.address,
    calls
  });

  const records = results.map((data) =>
    decodeFunctionResult({
      abi: args.abi,
      functionName: fnGet(args.collectionName),
      data
    })
  );

  return { ids, records };
}
