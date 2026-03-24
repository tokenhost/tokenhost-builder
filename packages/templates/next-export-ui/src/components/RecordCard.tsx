import Link from 'next/link';

import type { ThsCollection, ThsField } from '../lib/ths';
import { displayField, fieldLinkUi } from '../lib/ths';
import { formatFieldValue, shortAddress } from '../lib/format';
import ResolvedReferenceValue from './ResolvedReferenceValue';

function getValue(record: any, key: string, fallbackIndex?: number): any {
  if (record && typeof record === 'object' && key in record) {
    return (record as any)[key];
  }
  if (Array.isArray(record) && typeof fallbackIndex === 'number') {
    return record[fallbackIndex];
  }
  return undefined;
}

function fieldIndex(collection: ThsCollection, field: ThsField): number {
  // Record struct layout in generator:
  // [0..8] system fields, then user fields in schema order.
  const idx = (collection.fields as any[]).findIndex((f) => f && f.name === field.name);
  return 9 + Math.max(0, idx);
}

export default function RecordCard(props: {
  collection: ThsCollection;
  record: any;
  abi?: any[] | null;
  publicClient?: any | null;
  address?: `0x${string}`;
}) {
  const { collection, record, abi = null, publicClient = null, address } = props;
  const id = getValue(record, 'id', 0);
  const owner = getValue(record, 'owner', 3);
  const createdBy = getValue(record, 'createdBy', 2);
  const isDeleted = Boolean(getValue(record, 'isDeleted', 6));
  const canEdit = Array.isArray((collection as any).updateRules?.mutable) && (collection as any).updateRules.mutable.length > 0;

  const df = displayField(collection);
  const titleVal = df ? getValue(record, df.name, fieldIndex(collection, df)) : undefined;
  const title = df?.ui?.component === 'externalLink'
    ? fieldLinkUi(df)?.label || formatFieldValue(titleVal, df.type, (df as any).decimals, df.name)
    : df
      ? formatFieldValue(titleVal, df.type, (df as any).decimals, df.name)
      : '(record)';
  const previewFields = collection.fields
    .filter((field) => field.name !== df?.name)
    .map((field) => {
      const raw = getValue(record, field.name, fieldIndex(collection, field));
      if (raw === undefined || raw === null || raw === '') return null;
      return {
        name: field.name,
        type: field.type,
        raw,
        value: formatFieldValue(raw, field.type, (field as any).decimals, field.name)
      };
    })
    .filter(Boolean)
    .slice(0, 3) as Array<{ name: string; type: string; raw: unknown; value: string }>;

  return (
    <div className="card recordCard">
      <div className="row recordCardHeader">
        <div className="recordCardCopy">
          <div className="eyebrow">/{collection.name}/record</div>
          <h2>
            <span className="badge">#{String(id)}</span>{' '}
            {title}
            {isDeleted ? <span className="badge" style={{ marginLeft: 8, color: 'var(--th-danger)' }}>deleted</span> : null}
          </h2>
          <div className="muted recordMeta">
            owner: {owner ? shortAddress(String(owner)) : '—'} · createdBy: {createdBy ? shortAddress(String(createdBy)) : '—'}
          </div>
        </div>
        <div className="actionGroup">
          <Link className="btn" href={`/${collection.name}/?mode=view&id=${String(id)}`}>View</Link>
          {canEdit ? <Link className="btn" href={`/${collection.name}/?mode=edit&id=${String(id)}`}>Edit</Link> : null}
        </div>
      </div>

      {previewFields.length > 0 ? (
        <div className="recordPreviewGrid">
          {previewFields.map((field) => (
            <div key={field.name} className="recordPreviewCell">
              <div className="recordPreviewLabel">{field.name}</div>
              <div className="recordPreviewValue">
                {field.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={field.value} alt={field.name} style={{ maxWidth: 160, borderRadius: 10, border: '1px solid var(--border)' }} />
                ) : field.type === 'reference' ? (
                  <ResolvedReferenceValue
                    collection={collection}
                    field={collection.fields.find((candidate) => candidate.name === field.name) ?? { name: field.name, type: 'reference' }}
                    value={field.raw}
                    abi={abi}
                    publicClient={publicClient}
                    address={address}
                    fallback={field.value}
                  />
                ) : (
                  field.value
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
