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
