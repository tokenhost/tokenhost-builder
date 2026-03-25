import type { ReactNode } from 'react';
import Link from 'next/link';

import { displayField, fieldDisplayName, hasCreatePayment, mutableFields, ths, transferEnabled } from '../lib/ths';

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
    <div className="pageStack">
      <section className="card collectionHero">
        <div className="heroTopline">
          <span className="eyebrow">/collection/{collection.name}</span>
        </div>

        <div className="heroSplit">
          <div>
            <h2 className="displayTitle">{collection.name}</h2>
            <p className="lead">
              Generated routes, chain reads, and transaction flows for the <span className="badge">{collection.name}</span> collection.
            </p>
            <div className="actionGroup">
              <Link className="btn" href={`/${collection.name}/`}>List records</Link>
              <Link className="btn primary" href={`/${collection.name}/?mode=new`}>Create {collection.name}</Link>
            </div>
            <div className="fieldPillRow">
              {collection.fields.slice(0, 6).map((field) => (
                <span key={field.name} className="fieldPill">
                  {fieldDisplayName(field)}
                </span>
              ))}
            </div>
          </div>

          <div className="heroDataPanel">
            <div className="eyebrow">/schema/controls</div>
            <div className="heroStatGrid">
              <div className="heroStat">
                <div className="heroStatValue">{mutableFields(collection).length}</div>
                <div className="heroStatLabel">Mutable fields</div>
              </div>
              <div className="heroStat">
                <div className="heroStatValue">{transferEnabled(collection) ? 'ON' : 'OFF'}</div>
                <div className="heroStatLabel">Transfers</div>
              </div>
            </div>
            <div className="heroMeta">
              <span className="badge">
                display {displayField(collection) ? fieldDisplayName(displayField(collection)!) : 'auto'}
              </span>
              {hasCreatePayment(collection) ? <span className="badge">paid create</span> : <span className="badge">free create</span>}
            </div>
          </div>
        </div>
      </section>
      <div>{props.children}</div>
    </div>
  );
}
