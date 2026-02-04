import Link from 'next/link';

import { ths } from '../../src/generated/ths';

export const dynamicParams = false;

export function generateStaticParams() {
  return ths.collections.map((c) => ({ collection: c.name }));
}

export default function CollectionLayout(props: { children: React.ReactNode; params: { collection: string } }) {
  const collectionName = props.params.collection;
  const collection = ths.collections.find((c) => c.name === collectionName);

  if (!collection) {
    return (
      <div className="grid">
        <div className="card">
          <h2>Unknown collection</h2>
          <div className="pre">{collectionName}</div>
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
            <Link className="btn primary" href={`/${collection.name}/new/`}>Create</Link>
          </div>
        </div>
      </div>
      <div style={{ gridColumn: 'span 12' }}>{props.children}</div>
    </div>
  );
}
