'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { assertAbiFunction, fnGet } from '../lib/app';
import { formatFieldValue } from '../lib/format';
import { displayField, getRelatedCollection, type ThsCollection, type ThsField } from '../lib/ths';

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
  return rendered;
}

export default function ResolvedReferenceValue(props: {
  collection: ThsCollection;
  field: ThsField;
  value: unknown;
  abi: any[] | null;
  publicClient: any | null;
  address: `0x${string}` | undefined;
  fallback?: string;
}) {
  const { collection, field, value, abi, publicClient, address, fallback } = props;
  const relatedCollection = useMemo(() => getRelatedCollection(collection, field.name), [collection, field.name]);
  const [label, setLabel] = useState<string | null>(null);

  const id = useMemo(() => {
    if (value === null || value === undefined || value === '') return null;
    try {
      return typeof value === 'bigint' ? value : BigInt(String(value));
    } catch {
      return null;
    }
  }, [value]);

  useEffect(() => {
    let cancelled = false;

    async function loadLabel() {
      if (!relatedCollection || !abi || !publicClient || !address || id === null) {
        setLabel(null);
        return;
      }

      try {
        assertAbiFunction(abi, fnGet(relatedCollection.name), relatedCollection.name);
        const record = await publicClient.readContract({
          address,
          abi,
          functionName: fnGet(relatedCollection.name),
          args: [id]
        });
        if (cancelled) return;
        setLabel(recordLabel(relatedCollection, id, record));
      } catch {
        if (!cancelled) setLabel(null);
      }
    }

    void loadLabel();

    return () => {
      cancelled = true;
    };
  }, [abi, address, id, publicClient, relatedCollection]);

  const renderedFallback = fallback && fallback.trim() ? fallback : id === null ? '—' : `#${String(id)}`;
  if (!relatedCollection || id === null) {
    return <span className="badge">{renderedFallback}</span>;
  }

  return (
    <Link className="btn" href={`/${relatedCollection.name}/?mode=view&id=${String(id)}`}>
      {label ? `${label} (#${String(id)})` : `${relatedCollection.name} ${renderedFallback}`}
    </Link>
  );
}
