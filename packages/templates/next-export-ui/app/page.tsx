import Link from 'next/link';

import { displayField, hasCreatePayment, mutableFields, ths, transferEnabled } from '../src/lib/ths';

export default function HomePage() {
  const firstCollection = ths.collections[0] ?? null;
  const totalFields = ths.collections.reduce((sum, collection) => sum + collection.fields.length, 0);
  const editableCollections = ths.collections.filter((collection) => mutableFields(collection).length > 0).length;
  const transferCollections = ths.collections.filter((collection) => transferEnabled(collection)).length;
  const paidCollections = ths.collections.filter((collection) => Boolean(hasCreatePayment(collection))).length;

  return (
    <div className="pageStack">
      <section className="card heroPanel">
        <div className="heroSplit">
          <div>
            <div className="heroTopline">
              <span className="eyebrow">/tokenhost/launchpad</span>
              <div className="chipRow">
                <span className="badge">static export</span>
                <span className="badge">manifest runtime</span>
                <span className="badge">{ths.app.slug}</span>
              </div>
            </div>
            <h2 className="displayTitle">
              Web3 CRUD
              <br />
              <span>with a real control-surface aesthetic.</span>
            </h2>
            <p className="lead">
              {ths.app.name} ships with a Token Host-branded shell, live chain manifest loading, and generated routes for every schema collection.
            </p>
            <div className="actionGroup">
              {firstCollection ? <Link className="btn" href={`/${firstCollection.name}/`}>Open {firstCollection.name}</Link> : null}
              {firstCollection ? <Link className="btn primary" href={`/${firstCollection.name}/?mode=new`}>Create first record</Link> : null}
            </div>
          </div>
          <div className="heroDataPanel">
            <div className="eyebrow">/runtime/summary</div>
            <div className="heroStatGrid">
              <div className="heroStat">
                <div className="heroStatValue">{ths.collections.length}</div>
                <div className="heroStatLabel">Collections</div>
              </div>
              <div className="heroStat">
                <div className="heroStatValue">{totalFields}</div>
                <div className="heroStatLabel">Fields</div>
              </div>
              <div className="heroStat">
                <div className="heroStatValue">{editableCollections}</div>
                <div className="heroStatLabel">Editable</div>
              </div>
              <div className="heroStat">
                <div className="heroStatValue">{transferCollections}</div>
                <div className="heroStatLabel">Transferable</div>
              </div>
            </div>
            <div className="heroMeta">
              <span className="badge">paid creates: {paidCollections}</span>
              <span className="badge">schema {ths.schemaVersion}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="featureGrid">
        <div className="card featureCard">
          <div className="eyebrow">/manifest</div>
          <h3>Runtime-first deployment</h3>
          <p className="muted">
            The generated app reads <span className="badge">/.well-known/tokenhost/manifest.json</span> at runtime, so deployment metadata stays outside the bundle.
          </p>
        </div>
        <div className="card featureCard">
          <div className="eyebrow">/wallet</div>
          <h3>Wallet-native actions</h3>
          <p className="muted">
            Create, update, delete, and transfer flows stay inside the generated UI with clean chain and transaction feedback.
          </p>
        </div>
        <div className="card featureCard">
          <div className="eyebrow">/hosting</div>
          <h3>Self-hostable release</h3>
          <p className="muted">
            The theme, routes, and data surfaces are baked into a static export that can be published anywhere without a custom backend.
          </p>
        </div>
      </section>

      <section className="sectionHeading">
        <div>
          <span className="eyebrow">/collections</span>
          <h2>Generated schema surfaces</h2>
        </div>
        <p className="muted">Each collection ships with list, create, detail, and transaction-aware routes.</p>
      </section>

      <div className="grid">
        {ths.collections.map((collection) => {
          const display = displayField(collection);
          const fieldPreview = collection.fields.slice(0, 5);
          const payment = hasCreatePayment(collection);

          return (
            <div key={collection.name} className="card half collectionCard">
              <div className="collectionCardHeader">
                <div>
                  <div className="eyebrow">/{collection.name}</div>
                  <h3>{collection.name}</h3>
                  <p className="muted">
                    {collection.fields.length} field{collection.fields.length === 1 ? '' : 's'}
                    {display ? ` · display field ${display.name}` : ''}
                  </p>
                </div>
                <span className="badge">{collection.plural || collection.name}</span>
              </div>

              <div className="chipRow">
                <span className="badge">{mutableFields(collection).length} mutable</span>
                <span className="badge">create {collection.createRules.access}</span>
                <span className="badge">{transferEnabled(collection) ? 'transfer on' : 'transfer off'}</span>
                {payment ? <span className="badge">paid create</span> : null}
              </div>

              <div className="fieldPillRow">
                {fieldPreview.map((field) => (
                  <span key={field.name} className="fieldPill">
                    {field.name}
                  </span>
                ))}
                {collection.fields.length > fieldPreview.length ? <span className="fieldPill">+{collection.fields.length - fieldPreview.length} more</span> : null}
              </div>

              <div className="actionGroup">
                <Link className="btn" href={`/${collection.name}/`}>Browse</Link>
                <Link className="btn primary" href={`/${collection.name}/?mode=new`}>Create</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
