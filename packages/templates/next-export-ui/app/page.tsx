import Link from 'next/link';

import GeneratedHomePageClient from '../src/components/GeneratedHomePageClient';
import { displayField, hasCreatePayment, mutableFields, ths, transferEnabled } from '../src/lib/ths';

export default function HomePage() {
  if (Array.isArray(ths.app.ui?.generated?.homeSections) && ths.app.ui.generated.homeSections.length > 0) {
    return <GeneratedHomePageClient />;
  }

  const firstCollection = ths.collections[0] ?? null;
  const totalFields = ths.collections.reduce((sum, collection) => sum + collection.fields.length, 0);
  const editableCollections = ths.collections.filter((collection) => mutableFields(collection).length > 0).length;
  const transferCollections = ths.collections.filter((collection) => transferEnabled(collection)).length;
  const paidCollections = ths.collections.filter((collection) => Boolean(hasCreatePayment(collection))).length;
  const totalRelations = ths.collections.reduce((sum, collection) => sum + (Array.isArray(collection.relations) ? collection.relations.length : 0), 0);
  const indexedCollections = ths.collections.filter((collection) => Array.isArray((collection as any).indexes?.index) && (collection as any).indexes.index.length > 0).length;
  const imageCollections = ths.collections.filter((collection) => collection.fields.some((field) => field.type === 'image')).length;

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
              <span className="badge">relations: {totalRelations}</span>
              <span className="badge">indexed collections: {indexedCollections}</span>
              <span className="badge">media collections: {imageCollections}</span>
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
          <div className="eyebrow">/relationships</div>
          <h3>Reference-aware by default</h3>
          <p className="muted">
            Generated forms can resolve related records, prefer owned identities when available, and render linked labels instead of exposing raw foreign keys everywhere.
          </p>
        </div>
        <div className="card featureCard">
          <div className="eyebrow">/wallet</div>
          <h3>Public reads, wallet-native writes</h3>
          <p className="muted">
            Read-only pages use the deployment chain's public RPC when available, so browsing does not require MetaMask and does not depend on the wallet being on the right network. Create, update, delete, and transfer flows still use the wallet with clean chain and transaction feedback.
          </p>
        </div>
        <div className="card featureCard">
          <div className="eyebrow">/uploads</div>
          <h3>Long-running media flows</h3>
          <p className="muted">
            Upload fields expose progress, processing, retry, and submit-blocking states so generated apps can handle remote media workflows without custom glue.
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

      <section className="card sectionHeading">
        <div className="sectionHeadingPrimary">
          <span className="eyebrow">/collections</span>
          <h2>Generated schema surfaces</h2>
        </div>
        <div className="sectionHeadingAside">
          <p className="muted">Each collection ships with list, create, detail, and transaction-aware routes.</p>
        </div>
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
                {collection.fields.some((field) => field.type === 'reference') ? <span className="badge">reference-aware</span> : null}
                {collection.fields.some((field) => field.type === 'image') ? <span className="badge">media upload</span> : null}
                {Array.isArray((collection as any).indexes?.index) && (collection as any).indexes.index.length > 0 ? <span className="badge">indexed queries</span> : null}
              </div>

              <div className="fieldPillRow">
                {fieldPreview.map((field) => (
                  <span key={field.name} className="fieldPill">
                    {field.name}
                  </span>
                ))}
                {collection.fields.length > fieldPreview.length ? <span className="fieldPill">+{collection.fields.length - fieldPreview.length} more</span> : null}
              </div>

              {Array.isArray(collection.relations) && collection.relations.length > 0 ? (
                <div className="chipRow">
                  {collection.relations.map((relation) => (
                    <span key={`${collection.name}-${relation.field}-${relation.to}`} className="badge">
                      {relation.field} → {relation.to}
                    </span>
                  ))}
                </div>
              ) : null}

              {Array.isArray((collection as any).indexes?.index) && (collection as any).indexes.index.length > 0 ? (
                <div className="chipRow">
                  {(collection as any).indexes.index.map((index: any) => (
                    <span key={`${collection.name}-${String(index?.field ?? '')}-${String(index?.mode ?? 'equality')}`} className="badge">
                      {String(index?.field ?? 'field')} {String(index?.mode ?? 'equality')}
                    </span>
                  ))}
                </div>
              ) : null}

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
