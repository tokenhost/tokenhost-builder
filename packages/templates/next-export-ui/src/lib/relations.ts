'use client';

import { readRecordsByIds } from './app';
import { displayField, getCollection } from './ths';
import { formatFieldValue } from './format';
import type { AppRuntime } from './runtime';
import { listAllRecords } from './runtime';

export type OwnedRecord = {
  id: bigint;
  record: any;
};

export type ResolvedReferenceItem = {
  id: bigint;
  record: any;
  referenceId: bigint | null;
  referenceRecord: any | null;
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

export function relatedRecordLabel(collectionName: string, id: bigint, record: any): string {
  const collection = getCollection(collectionName);
  if (!collection) return `${collectionName} #${String(id)}`;

  const field = displayField(collection);
  if (!field) return `${collection.name} #${String(id)}`;

  const raw = record?.[field.name];
  const rendered = formatFieldValue(raw, field.type, field.decimals, field.name).trim();
  if (!rendered) return `${collection.name} #${String(id)}`;
  return `${rendered} (#${String(id)})`;
}

export async function listOwnedRecords(runtime: AppRuntime, collectionName: string, ownerAddress: string): Promise<OwnedRecord[]> {
  const normalizedOwner = ownerAddress.trim().toLowerCase();
  const page = await listAllRecords({
    manifest: runtime.manifest,
    publicClient: runtime.publicClient,
    abi: runtime.abi,
    address: runtime.appAddress,
    collectionName
  });

  return page.ids
    .map((id, index) => ({ id, record: page.records[index] }))
    .filter((entry) => recordOwner(entry.record) === normalizedOwner);
}

export async function loadRecordsByIds(runtime: AppRuntime, collectionName: string, ids: bigint[]): Promise<Map<string, any>> {
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id)))).map((id) => BigInt(id));
  if (!uniqueIds.length) return new Map();

  const records = await readRecordsByIds({
    publicClient: runtime.publicClient,
    abi: runtime.abi,
    address: runtime.appAddress,
    collectionName,
    ids: uniqueIds
  });

  const out = new Map<string, any>();
  uniqueIds.forEach((id, index) => {
    out.set(String(id), records[index] ?? null);
  });
  return out;
}

export async function resolveReferenceRecords(
  runtime: AppRuntime,
  items: Array<{ id: bigint; record: any }>,
  options: { fieldName: string; targetCollectionName: string }
): Promise<ResolvedReferenceItem[]> {
  const referenceIds = items
    .map((item) => getRecordId(item.record?.[options.fieldName]))
    .filter((value): value is bigint => value !== null);

  const recordsById = await loadRecordsByIds(runtime, options.targetCollectionName, referenceIds);

  return items.map((item) => {
    const referenceId = getRecordId(item.record?.[options.fieldName]);
    return {
      ...item,
      referenceId,
      referenceRecord: referenceId ? recordsById.get(String(referenceId)) ?? null : null
    };
  });
}
