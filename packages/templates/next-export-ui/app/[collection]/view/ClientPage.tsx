'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { fetchAppAbi } from '../../../src/lib/abi';
import { assertAbiFunction, collectionId, fnGet, fnTransfer } from '../../../src/lib/app';
import { chainFromId } from '../../../src/lib/chains';
import { chainWithRpcOverride, makePublicClient } from '../../../src/lib/clients';
import { formatDateTime, formatFieldValue, shortAddress } from '../../../src/lib/format';
import { fetchManifest, getPrimaryDeployment, getReadRpcUrl } from '../../../src/lib/manifest';
import { displayField, fieldDisplayName, fieldLinkUi, getCollection, transferEnabled, type ThsCollection, type ThsField } from '../../../src/lib/ths';
import { submitWriteTx } from '../../../src/lib/tx';
import TxStatus, { type TxPhase } from '../../../src/components/TxStatus';
import ResolvedReferenceValue from '../../../src/components/ResolvedReferenceValue';

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
  const idx = (collection.fields as any[]).findIndex((f) => f && f.name === field.name);
  return 9 + Math.max(0, idx);
}

function prefersLongText(field: ThsField): boolean {
  return field.type === 'string' && ['body', 'description', 'content', 'bio', 'summary'].includes(field.name);
}

function findMediaField(collection: ThsCollection): ThsField | null {
  return collection.fields.find((field) => field.type === 'image') ?? null;
}

function renderFieldValue(args: {
  collection: ThsCollection;
  field: ThsField;
  rendered: string;
  raw: unknown;
  abi: any[] | null;
  publicClient: any | null;
  address: `0x${string}` | undefined;
}) {
  const { collection, field, rendered, raw, abi, publicClient, address } = args;
  if (!rendered) return <span className="badge">—</span>;

  const linkUi = fieldLinkUi(field);
  if (field.type === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={String(rendered)} alt={field.name} style={{ maxWidth: 360, borderRadius: 12, border: '1px solid var(--border)' }} />;
  }

  if (linkUi) {
    return (
      <a className="btn" href={String(rendered)} target={linkUi.target} rel={linkUi.target === '_blank' ? 'noreferrer' : undefined}>
        {linkUi.label || rendered}
      </a>
    );
  }

  if (field.type === 'reference') {
    return (
      <ResolvedReferenceValue
        collection={collection}
        field={field}
        value={raw}
        abi={abi}
        publicClient={publicClient}
        address={address}
        fallback={rendered}
      />
    );
  }

  return <span className="badge">{rendered}</span>;
}

export default function ViewRecordPage(props: { params: { collection: string } }) {
  const collectionName = props.params.collection;
  const collection = useMemo(() => getCollection(collectionName), [collectionName]);

  const router = useRouter();
  const search = useSearchParams();
  const idParam = search.get('id');
  const rpcOverride = search.get('rpc') ?? undefined;

  const [bootstrapping, setBootstrapping] = useState(true);
  const [recordLoading, setRecordLoading] = useState(false);
  const [initialRecordResolved, setInitialRecordResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<any | null>(null);
  const [manifest, setManifest] = useState<any | null>(null);
  const [abi, setAbi] = useState<any[] | null>(null);
  const [publicClient, setPublicClient] = useState<any | null>(null);
  const [record, setRecord] = useState<any | null>(null);

  const [transferTo, setTransferTo] = useState('');
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txPhase, setTxPhase] = useState<TxPhase>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

  const id = useMemo(() => {
    if (!idParam) return null;
    try {
      return BigInt(idParam);
    } catch {
      return null;
    }
  }, [idParam]);

  useEffect(() => {
    async function boot() {
      setBootstrapping(true);
      setInitialRecordResolved(false);
      setError(null);
      try {
        const manifest = await fetchManifest();
        const d = getPrimaryDeployment(manifest);
        if (!d) throw new Error('Manifest has no deployments');
        const chain = chainWithRpcOverride(chainFromId(Number(d.chainId)), rpcOverride || getReadRpcUrl(manifest) || undefined);
        const pc = makePublicClient(chain, rpcOverride || getReadRpcUrl(manifest) || undefined);
        setManifest(manifest);
        setDeployment(d);
        setPublicClient(pc);
        setAbi(null);

        const addr = String(d.deploymentEntrypointAddress || '').toLowerCase();
        const zero = '0x0000000000000000000000000000000000000000';
        if (addr && addr !== zero) {
          const a = await fetchAppAbi();
          setAbi(a);
        }
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setBootstrapping(false);
      }
    }
    void boot();
  }, [rpcOverride]);

  const appAddress = deployment?.deploymentEntrypointAddress as `0x${string}` | undefined;

  async function fetchRecord(options?: { initial?: boolean }) {
    if (!publicClient || !abi || !appAddress || id === null) return;
    if (appAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
      setError('App is not deployed yet (manifest has 0x0 address).');
      return;
    }

    const isInitial = options?.initial === true;
    if (isInitial) setInitialRecordResolved(false);
    setRecordLoading(true);
    setError(null);
    try {
      assertAbiFunction(abi, fnGet(collectionName), collectionName);
      const r = await publicClient.readContract({
        address: appAddress,
        abi,
        functionName: fnGet(collectionName),
        args: [id]
      });
      setRecord(r);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setRecordLoading(false);
      if (isInitial) setInitialRecordResolved(true);
    }
  }

  useEffect(() => {
    void fetchRecord({ initial: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, abi, appAddress, idParam]);

  // Refresh when this record changes.
  useEffect(() => {
    if (!publicClient || !abi || !appAddress || id === null) return;
    if (appAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') return;

    const cid = collectionId(collectionName);
    const unwatchers: Array<() => void> = [];

    for (const eventName of ['RecordUpdated', 'RecordDeleted', 'RecordTransferred'] as const) {
      const unwatch = publicClient.watchContractEvent({
        address: appAddress,
        abi,
        eventName,
        args: { collectionId: cid, recordId: id },
        pollingInterval: 2000,
        onLogs: () => void fetchRecord()
      });
      unwatchers.push(unwatch);
    }

    return () => unwatchers.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, abi, appAddress, id, collectionName]);

  async function doTransfer() {
    if (!transferTo.trim()) return;
    if (!manifest || !deployment || !abi || !publicClient || !appAddress || id === null) return;

    setError(null);
    setTxStatus(null);
    setTxPhase('idle');
    setTxHash(null);

    try {
      const chain = chainWithRpcOverride(
        chainFromId(Number(deployment.chainId)),
        rpcOverride || getReadRpcUrl(manifest) || undefined
      );

      assertAbiFunction(abi, fnTransfer(collectionName), collectionName);
      const result = await submitWriteTx({
        manifest,
        deployment,
        chain,
        publicClient,
        address: appAddress,
        abi,
        functionName: fnTransfer(collectionName),
        contractArgs: [id, transferTo.trim()],
        setStatus: setTxStatus,
        onPhase: setTxPhase,
        onHash: setTxHash
      });
      setTxStatus(`Transferred (${result.hash.slice(0, 10)}…).`);
      await fetchRecord();
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setTxStatus(null);
      setTxPhase('failed');
    }
  }

  if (!collection) {
    return (
      <div className="card">
        <h2>Unknown collection</h2>
        <div className="pre">{collectionName}</div>
      </div>
    );
  }

  if (!idParam) {
    return (
      <div className="card">
        <h2>Missing id</h2>
        <div className="muted">Provide ?id=&lt;uint256&gt;</div>
      </div>
    );
  }

  if (id === null) {
    return (
      <div className="card">
        <h2>Invalid id</h2>
        <div className="pre">{idParam}</div>
      </div>
    );
  }

  if ((bootstrapping || (recordLoading && !initialRecordResolved)) && !record) {
    return (
      <div className="card">
        <h2>Loading…</h2>
        <div className="muted">Fetching manifest + record.</div>
      </div>
    );
  }

  if (appAddress && appAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
    return (
      <div className="card">
        <h2>Not deployed</h2>
        <div className="muted">
          This UI reads <span className="badge">/.well-known/tokenhost/manifest.json</span> at runtime, but the manifest still has a placeholder
          deployment address (<span className="badge">deploymentEntrypointAddress = 0x0</span>).
        </div>
        <div className="muted" style={{ marginTop: 12 }}>
          Run <span className="badge">th deploy {'<buildDir>'} --chain anvil</span>, then refresh this page.
        </div>
        <div className="muted" style={{ marginTop: 12 }}>
          If you are hosting this UI remotely, publish the updated <span className="badge">manifest.json</span> to{' '}
          <span className="badge">/.well-known/tokenhost/manifest.json</span>.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2>Error</h2>
        <div className="pre">{error}</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
          <button className="btn" onClick={() => void fetchRecord()}>Retry</button>
          <button className="btn" onClick={() => router.push(`/${collectionName}/`)}>Back</button>
        </div>
      </div>
    );
  }

  if (initialRecordResolved && !record) {
    return (
      <div className="card">
        <h2>Not found</h2>
        <div className="muted">No record returned.</div>
      </div>
    );
  }

  const owner = getValue(record, 'owner', 3);
  const createdBy = getValue(record, 'createdBy', 2);
  const createdAt = getValue(record, 'createdAt', 1);
  const updatedAt = getValue(record, 'updatedAt', 4);
  const version = getValue(record, 'version', 8);
  const canEdit = Array.isArray((collection as any).updateRules?.mutable) && (collection as any).updateRules.mutable.length > 0;
  const canDelete = Boolean((collection as any).deleteRules?.softDelete);
  const display = displayField(collection);
  const titleField =
    collection.fields.find((field) => field.type === 'string' && ['displayName', 'title', 'name', 'handle'].includes(field.name)) ??
    (display?.type === 'string' ? display : null);
  const titleRaw = titleField ? getValue(record, titleField.name, fieldIndex(collection, titleField)) : null;
  const title = titleField ? formatFieldValue(titleRaw, titleField.type, (titleField as any).decimals, titleField.name) : `${collection.name} #${String(id)}`;
  const longTextField = collection.fields.find(prefersLongText) ?? null;
  const longTextRaw = longTextField ? getValue(record, longTextField.name, fieldIndex(collection, longTextField)) : null;
  const longText = longTextField ? formatFieldValue(longTextRaw, longTextField.type, (longTextField as any).decimals, longTextField.name) : '';
  const mediaField = findMediaField(collection);
  const mediaRaw = mediaField ? getValue(record, mediaField.name, fieldIndex(collection, mediaField)) : null;
  const mediaUrl = mediaField ? formatFieldValue(mediaRaw, mediaField.type, (mediaField as any).decimals, mediaField.name) : '';
  const detailFields = collection.fields.filter((field) => ![titleField?.name, longTextField?.name, mediaField?.name].includes(field.name));

  return (
    <>
      <section className="card heroPanel">
        <div className="collectionCardHeader" style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="eyebrow">/{collection.name.toLowerCase()}/{String(getValue(record, 'id', 0))}</div>
            <h2 className="displayTitle displayTitleCompact">{title || `${collection.name} #${String(id)}`}</h2>
            <div className="muted">
              {titleField && titleField.name !== longTextField?.name ? fieldDisplayName(titleField) : 'On-chain record'}
            </div>
          </div>
          <div className="chipRow">
            <span className="badge">id {String(getValue(record, 'id', 0))}</span>
            {transferEnabled(collection) ? <span className="badge">transferable</span> : null}
            {canEdit ? <button className="btn" onClick={() => router.push(`/${collectionName}/?mode=edit&id=${String(id)}`)}>Edit</button> : null}
            {canDelete ? <button className="btn danger" onClick={() => router.push(`/${collectionName}/?mode=delete&id=${String(id)}`)}>Delete</button> : null}
          </div>
        </div>

        {longText ? <p className="recordHeroBody">{longText}</p> : null}

        {mediaUrl ? (
          <div className="recordHeroMedia">
            <img src={mediaUrl} alt={`${collection.name} ${String(id)}`} style={{ display: 'block', width: '100%', maxHeight: 540, objectFit: 'contain' }} />
          </div>
        ) : null}

        <div className="chipRow">
          <span className="badge">owner {owner ? shortAddress(String(owner)) : '—'}</span>
          <span className="badge">created {createdAt ? formatDateTime(createdAt, 'compact') : '—'}</span>
          {updatedAt ? <span className="badge">updated {formatDateTime(updatedAt, 'compact')}</span> : null}
          <span className="badge">version {version ? String(version) : '0'}</span>
          <button className="btn" onClick={() => void fetchRecord()}>Refresh</button>
        </div>
      </section>

      <section className="card">
        <h2>Details</h2>
        <div className="kv">
          <div>owner</div>
          <div>{owner ? shortAddress(String(owner)) : '—'}</div>
          <div>createdBy</div>
          <div>{createdBy ? shortAddress(String(createdBy)) : '—'}</div>
          <div>createdAt</div>
          <div>{createdAt ? formatDateTime(createdAt) : '—'}</div>
          <div>updatedAt</div>
          <div>{updatedAt ? formatDateTime(updatedAt) : '—'}</div>
          {detailFields.map((f) => {
            const v = getValue(record, f.name, fieldIndex(collection, f));
            const rendered = formatFieldValue(v, f.type, (f as any).decimals, f.name);
            return (
              <React.Fragment key={f.name}>
                <div>{fieldDisplayName(f)}</div>
                <div>{renderFieldValue({ collection, field: f, rendered, raw: v, abi, publicClient, address: appAddress })}</div>
              </React.Fragment>
            );
          })}
        </div>
      </section>

      {transferEnabled(collection) ? (
        <div className="card">
          <h2>Transfer</h2>
          <div className="muted">Transfers change record ownership on-chain.</div>
          <label className="label">to (address)</label>
          <input className="input" value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="0x…" />
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button
              className="btn primary"
              onClick={() => void doTransfer()}
              disabled={!transferTo.trim() || txPhase === 'submitting' || txPhase === 'submitted' || txPhase === 'confirming'}
            >
              Transfer
            </button>
          </div>
          {txStatus ? <div className="muted" style={{ marginTop: 10 }}>{txStatus}</div> : null}
          <TxStatus phase={txPhase} hash={txHash} chainId={Number(deployment?.chainId ?? NaN)} error={error} />
        </div>
      ) : null}

      {error ? <div className="card"><div className="pre">{error}</div></div> : null}
    </>
  );
}
