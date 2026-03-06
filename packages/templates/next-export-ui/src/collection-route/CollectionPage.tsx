import React, { Suspense } from 'react';

import ClientPage from '../../app/[collection]/ClientPage';

export default function CollectionPage(props: { collectionName: string }) {
  return (
    <Suspense
      fallback={
        <div className="card">
          <h2>Loading…</h2>
          <div className="muted">Preparing client view.</div>
        </div>
      }
    >
      <ClientPage params={{ collection: props.collectionName }} />
    </Suspense>
  );
}
