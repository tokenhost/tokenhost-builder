'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { listAllRecords } from '../lib/runtime';
import { formatFieldValue } from '../lib/format';
import { displayField, getRelatedCollection, type ThsCollection, type ThsField } from '../lib/ths';

type ReferenceOption = {
  id: bigint;
  label: string;
  owned: boolean;
};

function getRecordValue(record: any, key: string, fallbackIndex?: number): any {
  if (record && typeof record === 'object' && key in record) {
    return (record as any)[key];
  }
  if (Array.isArray(record) && typeof fallbackIndex === 'number') {
    return record[fallbackIndex];
  }
  return undefined;
}

function fieldIndex(collection: ThsCollection, field: ThsField): number {
  const idx = (collection.fields as any[]).findIndex((candidate) => candidate && candidate.name === field.name);
  return 9 + Math.max(0, idx);
}

function recordLabel(collection: ThsCollection, id: bigint, record: any): string {
  const display = displayField(collection);
  if (!display) return `${collection.name} #${String(id)}`;
  const raw = getRecordValue(record, display.name, fieldIndex(collection, display));
  const rendered = formatFieldValue(raw, display.type, display.decimals, display.name).trim();
  if (!rendered) return `${collection.name} #${String(id)}`;
  return `${rendered} (#${String(id)})`;
}

export default function ReferenceFieldInput(props: {
  manifest: any;
  publicClient: any;
  abi: any[];
  address: `0x${string}`;
  collection: ThsCollection;
  field: ThsField;
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const { manifest, publicClient, abi, address, collection, field, value, disabled, onChange } = props;
  const relatedCollection = useMemo(() => getRelatedCollection(collection, field.name), [collection, field.name]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ReferenceOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      if (!relatedCollection || !publicClient || !abi || !address) {
        setOptions([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const walletAccount =
          typeof window !== 'undefined' ? window.localStorage.getItem('TH_ACCOUNT')?.toLowerCase() ?? '' : '';
        const page = await listAllRecords({
          publicClient,
          abi,
          address,
          collectionName: relatedCollection.name,
          manifest
        });

        const nextOptions = page.ids
          .map((id, index) => {
            const record = page.records[index];
            if (!record) return null;
            const owner = String(getRecordValue(record, 'owner', 3) ?? '').toLowerCase();
            return {
              id,
              label: recordLabel(relatedCollection, id, record),
              owned: Boolean(walletAccount) && owner === walletAccount
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
        if (!value && ownedOptions.length === 1) {
          onChange(String(ownedOptions[0]?.id ?? ''));
        }
      } catch (cause: any) {
        if (cancelled) return;
        setOptions([]);
        setError(String(cause?.message ?? cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [abi, address, collection, field.name, manifest, onChange, publicClient, relatedCollection, value]);

  const resolvedValue = value.trim();
  const hasResolvedValue = resolvedValue !== '' && options.some((option) => String(option.id) === resolvedValue);

  if (!relatedCollection) {
    return (
      <input
        className="input"
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="record id (uint256)"
      />
    );
  }

  return (
    <>
      <select
        className="select"
        value={hasResolvedValue ? resolvedValue : ''}
        disabled={disabled || loading || options.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {loading ? `Loading ${relatedCollection.name}…` : options.length > 0 ? `Select ${relatedCollection.name}` : `No ${relatedCollection.name} records found`}
        </option>
        {options.map((option) => (
          <option key={String(option.id)} value={String(option.id)}>
            {option.label}{option.owned ? ' · owned by connected wallet' : ''}
          </option>
        ))}
      </select>
      <input
        className="input"
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`${relatedCollection.name} record id`}
      />
      <div className="muted">
        {error
          ? `Could not load ${relatedCollection.name} records automatically. You can still enter a record id manually. ${error}`
          : options.length > 0
            ? `Showing ${relatedCollection.name} labels instead of a raw foreign-key entry. Owned records appear first.`
            : `Create a ${relatedCollection.name} record first, or enter a record id manually.`}
      </div>
    </>
  );
}
