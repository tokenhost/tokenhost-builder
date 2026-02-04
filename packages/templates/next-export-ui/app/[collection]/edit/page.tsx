import React, { Suspense } from 'react';

import ClientPage from './ClientPage';

export default function EditRecordPage(props: { params: { collection: string } }) {
  return (
    <Suspense
      fallback={
        <div className="card">
          <h2>Loading…</h2>
          <div className="muted">Preparing client view.</div>
        </div>
      }
    >
      <ClientPage params={props.params} />
    </Suspense>
  );
}

