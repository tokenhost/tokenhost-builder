import Link from 'next/link';

import type { ThsCollection, ThsField } from '../lib/ths';
import { displayField } from '../lib/ths';
import { formatNumeric, shortAddress } from '../lib/format';

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

export default function RecordCard(props: { collection: ThsCollection; record: any }) {
  const { collection, record } = props;
  const id = getValue(record, 'id', 0);
  const owner = getValue(record, 'owner', 3);
  const createdBy = getValue(record, 'createdBy', 2);
  const isDeleted = Boolean(getValue(record, 'isDeleted', 6));
  const canEdit = Array.isArray((collection as any).updateRules?.mutable) && (collection as any).updateRules.mutable.length > 0;

  const df = displayField(collection);
  const titleVal = df ? getValue(record, df.name, fieldIndex(collection, df)) : undefined;

  return (
    <div className="card">
      <div className="row">
        <div>
          <h2>
            <span className="badge">#{String(id)}</span>{' '}
            {df ? formatNumeric(titleVal, df.type, (df as any).decimals) : '(record)'}
            {isDeleted ? <span className="badge" style={{ marginLeft: 8, color: 'var(--danger)' }}>deleted</span> : null}
          </h2>
          <div className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
            owner: {owner ? shortAddress(String(owner)) : '—'} · createdBy: {createdBy ? shortAddress(String(createdBy)) : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link className="btn" href={`/${collection.name}/view/?id=${String(id)}`}>View</Link>
          {canEdit ? <Link className="btn" href={`/${collection.name}/edit/?id=${String(id)}`}>Edit</Link> : null}
        </div>
      </div>
    </div>
  );
}
