import type { ReactNode } from 'react';
import Link from 'next/link';

import { ths } from '../lib/ths';

export default function CollectionLayout(props: { children: ReactNode; collectionName: string }) {
  const collection = ths.collections.find((c) => c.name === props.collectionName);

  if (!collection) {
    return (
      <div className="grid">
        <div className="card">
          <h2>Unknown collection</h2>
          <div className="pre">{props.collectionName}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="row">
          <div>
            <h2>{collection.name}</h2>
            <div className="muted">{collection.fields.length} fields</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Link className="btn" href={`/${collection.name}/`}>List</Link>
            <Link className="btn primary" href={`/${collection.name}/?mode=new`}>Create</Link>
          </div>
        </div>
      </div>
      <div style={{ gridColumn: 'span 12' }}>{props.children}</div>
    </div>
  );
}
