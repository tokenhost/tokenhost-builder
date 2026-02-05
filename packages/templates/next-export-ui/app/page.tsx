import Link from 'next/link';

import { ths } from '../src/lib/ths';

export default function HomePage() {
  return (
    <div className="grid">
      <div className="card">
        <h2 className="displayTitle">Collections</h2>
        <div className="muted lead">
          This app is a static export UI that reads <span className="badge">/.well-known/tokenhost/manifest.json</span> at runtime.
        </div>
      </div>

      {ths.collections.map((c) => (
        <div key={c.name} className="card half">
          <div className="row">
            <div>
              <h2>{c.name}</h2>
              <div className="muted">Fields: {c.fields.length}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link className="btn" href={`/${c.name}/`}>List</Link>
              <Link className="btn primary" href={`/${c.name}/new/`}>New</Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
