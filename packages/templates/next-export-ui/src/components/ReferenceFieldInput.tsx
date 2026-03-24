'use client';

import React from 'react';
import Link from 'next/link';

import { recordSummary, useOwnedReferenceOptions } from '../lib/relations';
import { type ThsCollection, type ThsField } from '../lib/ths';

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
  const { account, loading, error, options, mustOwn, relatedCollection, ownedOptions, selectedOption } = useOwnedReferenceOptions({
    manifest,
    publicClient,
    abi,
    address,
    collectionName: collection.name,
    fieldName: field.name,
    value,
    onChange
  });

  const resolvedValue = value.trim();
  const hasResolvedValue = resolvedValue !== '' && options.some((option) => String(option.id) === resolvedValue);
  const selectedSummary = selectedOption ? recordSummary(selectedOption.record) : null;

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
      {selectedSummary ? (
        <div className="recordPreviewCell" style={{ minHeight: 110 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="chipRow">
              <span className="badge">{relatedCollection.name} #{String(selectedOption?.id ?? '')}</span>
              {selectedSummary.subtitle ? <span className="badge">{selectedSummary.subtitle}</span> : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {selectedSummary.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedSummary.imageUrl}
                  alt={selectedSummary.title}
                  style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
                />
              ) : null}
              <div style={{ display: 'grid', gap: 6 }}>
                <strong>{selectedSummary.title}</strong>
                {selectedSummary.body ? <span className="muted">{selectedSummary.body}</span> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {!mustOwn ? (
        <input
          className="input"
          type="number"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`${relatedCollection.name} record id`}
        />
      ) : null}
      <div className="muted">
        {error
          ? `Could not load ${relatedCollection.name} records automatically.${mustOwn ? '' : ' You can still enter a record id manually.'} ${error}`
          : options.length > 0
            ? ownedOptions.length > 0
              ? mustOwn
                ? `This relation requires a ${relatedCollection.name} owned by the connected wallet. Your owned records are shown here${account ? ` for ${account.slice(0, 6)}…` : ''}.`
                : `Showing ${relatedCollection.name} labels instead of a raw foreign-key entry. Owned records appear first and your last choice is remembered${account ? ` for ${account.slice(0, 6)}…` : ''}.`
              : `Showing ${relatedCollection.name} labels instead of a raw foreign-key entry.`
            : mustOwn
              ? account
                ? `Create a ${relatedCollection.name} owned by the connected wallet before selecting it here.`
                : `Connect a wallet to create or select an owned ${relatedCollection.name}.`
              : `Create a ${relatedCollection.name} record first, or enter a record id manually.`}
      </div>
      {!loading && options.length === 0 ? (
        <div className="actionGroup">
          <Link className="btn" href={`/${relatedCollection.name}/?mode=new`}>Create {relatedCollection.name}</Link>
          {!mustOwn ? <Link className="btn" href={`/${relatedCollection.name}/`}>Browse {relatedCollection.name}</Link> : null}
        </div>
      ) : null}
    </>
  );
}
