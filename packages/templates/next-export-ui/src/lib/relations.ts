'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { countRecords, readRecordsByIds } from './app';
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

export type ReferenceOption = {
  id: bigint;
  label: string;
  owned: boolean;
  record: any;
};

export type ReferenceCreationGate = {
  fieldName: string;
  relatedCollection: ReturnType<typeof getCollection>;
  count: number;
  loading: boolean;
  error: string | null;
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

export function recordSummary(record: any): { title: string; subtitle: string | null; imageUrl: string | null; body: string | null } {
  const title =
    String(record?.displayName ?? '').trim() ||
    String(record?.title ?? '').trim() ||
    String(record?.name ?? '').trim() ||
    String(record?.handle ?? '').trim() ||
    'Unnamed record';

  const subtitle = String(record?.handle ?? '').trim()
    ? `@${String(record.handle).trim()}`
    : String(record?.slug ?? '').trim() || null;

  const imageUrl = String(record?.avatar ?? '').trim() || String(record?.image ?? '').trim() || null;
  const body = String(record?.bio ?? '').trim() || String(record?.description ?? '').trim() || null;

  return { title, subtitle, imageUrl, body };
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

function selectionStorageKey(args: { collectionName: string; fieldName: string; account: string }) {
  return `TH_REFERENCE_SELECTION:${args.collectionName}:${args.fieldName}:${args.account.toLowerCase()}`;
}

export function useOwnedReferenceOptions(args: {
  manifest: any;
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collectionName: string;
  fieldName: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [account, setAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ReferenceOption[]>([]);
  const onChangeRef = useRef(args.onChange);

  onChangeRef.current = args.onChange;

  const collection = useMemo(() => getCollection(args.collectionName), [args.collectionName]);
  const relation = useMemo(
    () => (collection?.relations ?? []).find((entry) => entry.field === args.fieldName) ?? null,
    [collection, args.fieldName]
  );
  const relatedCollection = useMemo(() => (relation?.to ? getCollection(relation.to) : null), [relation]);

  useEffect(() => {
    try {
      setAccount(window.localStorage.getItem('TH_ACCOUNT'));
    } catch {
      setAccount(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!relatedCollection || !args.publicClient || !args.abi || !args.address) {
        setOptions([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const page = await listAllRecords({
          manifest: args.manifest,
          publicClient: args.publicClient,
          abi: args.abi,
          address: args.address,
          collectionName: relatedCollection.name
        });

        const normalizedAccount = account?.trim().toLowerCase() ?? '';
        const nextOptions = page.ids
          .map((id, index) => {
            const record = page.records[index];
            if (!record) return null;
            return {
              id,
              label: relatedRecordLabel(relatedCollection.name, id, record),
              owned: Boolean(normalizedAccount) && recordOwner(record) === normalizedAccount,
              record
            };
          })
          .filter(Boolean) as ReferenceOption[];

        nextOptions.sort((left, right) => {
          if (left.owned !== right.owned) return left.owned ? -1 : 1;
          if (left.label !== right.label) return left.label.localeCompare(right.label);
          return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
        });

        if (cancelled) return;
        setOptions(nextOptions);

        const ownedOptions = nextOptions.filter((option) => option.owned);
        if (!args.value && account) {
          let preferred = '';
          try {
            preferred = window.localStorage.getItem(
              selectionStorageKey({ collectionName: args.collectionName, fieldName: args.fieldName, account })
            ) ?? '';
          } catch {
            preferred = '';
          }
          if (preferred && nextOptions.some((option) => String(option.id) === preferred)) {
            onChangeRef.current(preferred);
          } else if (ownedOptions.length === 1) {
            onChangeRef.current(String(ownedOptions[0]?.id ?? ''));
          }
        }
      } catch (cause: any) {
        if (cancelled) return;
        setOptions([]);
        setError(String(cause?.message ?? cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [account, args.abi, args.address, args.collectionName, args.fieldName, args.manifest, args.publicClient, args.value, relatedCollection]);

  useEffect(() => {
    if (!account || !args.value) return;
    try {
      window.localStorage.setItem(
        selectionStorageKey({ collectionName: args.collectionName, fieldName: args.fieldName, account }),
        args.value
      );
    } catch {
      // ignore
    }
  }, [account, args.collectionName, args.fieldName, args.value]);

  const selectedOption = options.find((option) => String(option.id) === args.value) ?? null;

  return {
    account,
    loading,
    error,
    options,
    relatedCollection,
    ownedOptions: options.filter((option) => option.owned),
    selectedOption
  };
}

export function useRequiredReferenceCreationGates(args: {
  manifest: any;
  publicClient: any;
  abi: any[] | null;
  address: `0x${string}` | undefined;
  collection: ReturnType<typeof getCollection> | null;
  requiredFieldNames: string[];
}) {
  const [gates, setGates] = useState<ReferenceCreationGate[]>([]);

  const requiredReferenceTargets = useMemo(() => {
    if (!args.collection) return [];
    return args.collection.fields
      .filter((field) => field.type === 'reference' && args.requiredFieldNames.includes(field.name))
      .map((field) => {
        const relation = (args.collection?.relations ?? []).find((entry) => entry.field === field.name) ?? null;
        const relatedCollection = relation?.to ? getCollection(relation.to) : null;
        if (!relatedCollection) return null;
        return {
          fieldName: field.name,
          relatedCollection
        };
      })
      .filter(Boolean) as Array<{ fieldName: string; relatedCollection: NonNullable<ReturnType<typeof getCollection>> }>;
  }, [args.collection, args.requiredFieldNames]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!requiredReferenceTargets.length || !args.publicClient || !args.abi || !args.address) {
        setGates([]);
        return;
      }

      setGates(
        requiredReferenceTargets.map((entry) => ({
          fieldName: entry.fieldName,
          relatedCollection: entry.relatedCollection,
          count: 0,
          loading: true,
          error: null
        }))
      );

      const next: ReferenceCreationGate[] = [];
      for (const entry of requiredReferenceTargets) {
        try {
          const count = await countRecords({
            publicClient: args.publicClient,
            abi: args.abi,
            address: args.address,
            collectionName: entry.relatedCollection.name,
            includeDeleted: false
          });
          next.push({
            fieldName: entry.fieldName,
            relatedCollection: entry.relatedCollection,
            count: Number(count),
            loading: false,
            error: null
          });
        } catch (cause: any) {
          next.push({
            fieldName: entry.fieldName,
            relatedCollection: entry.relatedCollection,
            count: 0,
            loading: false,
            error: String(cause?.message ?? cause)
          });
        }
      }

      if (!cancelled) setGates(next);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [args.abi, args.address, args.manifest, args.publicClient, requiredReferenceTargets]);

  return {
    gates,
    loading: gates.some((gate) => gate.loading),
    blockers: gates.filter((gate) => !gate.loading && !gate.error && gate.count === 0)
  };
}
