'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { fetchAppAbi } from '../../../src/lib/abi';
import { collectionId, fnGet, fnTransfer } from '../../../src/lib/app';
import { chainFromId } from '../../../src/lib/chains';
import { makePublicClient, makeWalletClient, requestWalletAddress } from '../../../src/lib/clients';
import { formatNumeric, shortAddress } from '../../../src/lib/format';
import { fetchManifest, getPrimaryDeployment } from '../../../src/lib/manifest';
import { getCollection, transferEnabled, type ThsCollection, type ThsField } from '../../../src/lib/ths';

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

export default function ViewRecordPage(props: { params: { collection: string } }) {
  const collectionName = props.params.collection;
  const collection = useMemo(() => getCollection(collectionName), [collectionName]);

  const router = useRouter();
  const search = useSearchParams();
  const idParam = search.get('id');
  const rpcOverride = search.get('rpc') ?? undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<any | null>(null);
  const [abi, setAbi] = useState<any[] | null>(null);
  const [publicClient, setPublicClient] = useState<any | null>(null);
  const [record, setRecord] = useState<any | null>(null);

  const [transferTo, setTransferTo] = useState('');
  const [txStatus, setTxStatus] = useState<string | null>(null);

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
      setLoading(true);
      setError(null);
      try {
        const manifest = await fetchManifest();
        const d = getPrimaryDeployment(manifest);
        if (!d) throw new Error('Manifest has no deployments');
        const chain = chainFromId(Number(d.chainId));
        const pc = makePublicClient(chain, rpcOverride);
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
        setLoading(false);
      }
    }
    void boot();
  }, [rpcOverride]);

  const appAddress = deployment?.deploymentEntrypointAddress as `0x${string}` | undefined;

  async function fetchRecord() {
    if (!publicClient || !abi || !appAddress || id === null) return;
    if (appAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
      setError('App is not deployed yet (manifest has 0x0 address).');
      return;
    }

    setError(null);
    try {
      const r = await publicClient.readContract({
        address: appAddress,
        abi,
        functionName: fnGet(collectionName),
        args: [id]
      });
      setRecord(r);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    void fetchRecord();
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
    if (!deployment || !abi || !publicClient || !appAddress || id === null) return;

    setError(null);
    setTxStatus(null);

    try {
      const chain = chainFromId(Number(deployment.chainId));
      const account = await requestWalletAddress(chain);
      const walletClient = makeWalletClient(chain);

      setTxStatus('Sending transfer…');
      const hash = await walletClient.writeContract({
        address: appAddress,
        abi,
        functionName: fnTransfer(collectionName),
        args: [id, transferTo.trim()],
        account,
        chain
      });

      setTxStatus('Waiting for confirmation…');
      await publicClient.waitForTransactionReceipt({ hash });
      setTxStatus('Transferred.');
      await fetchRecord();
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setTxStatus(null);
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

  if (loading && !record) {
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

  if (!record) {
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
  const version = getValue(record, 'version', 8);
  const canEdit = Array.isArray((collection as any).updateRules?.mutable) && (collection as any).updateRules.mutable.length > 0;
  const canDelete = Boolean((collection as any).deleteRules?.softDelete);

  return (
    <>
      <div className="card">
        <div className="row">
          <h2>
            {collection.name} <span className="badge">#{String(getValue(record, 'id', 0))}</span>
          </h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => void fetchRecord()}>Refresh</button>
            {canEdit ? (
              <button className="btn" onClick={() => router.push(`/${collectionName}/edit/?id=${String(id)}`)}>Edit</button>
            ) : null}
            {canDelete ? (
              <button className="btn danger" onClick={() => router.push(`/${collectionName}/delete/?id=${String(id)}`)}>Delete</button>
            ) : null}
          </div>
        </div>
        <div className="kv">
          <div>owner</div>
          <div>{owner ? shortAddress(String(owner)) : '—'}</div>
          <div>createdBy</div>
          <div>{createdBy ? shortAddress(String(createdBy)) : '—'}</div>
          <div>createdAt</div>
          <div>{createdAt ? String(createdAt) : '—'}</div>
          <div>version</div>
          <div>{version ? String(version) : '—'}</div>
        </div>
      </div>

      <div className="card">
        <h2>Fields</h2>
        <div className="kv">
          {collection.fields.map((f) => {
            const v = getValue(record, f.name, fieldIndex(collection, f));
            const rendered = formatNumeric(v, f.type, (f as any).decimals);
            return (
              <React.Fragment key={f.name}>
                <div>{f.name}</div>
                <div>
                  {f.type === 'image' && rendered ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={String(rendered)} alt={f.name} style={{ maxWidth: 360, borderRadius: 12, border: '1px solid var(--border)' }} />
                  ) : (
                    <span className="badge">{rendered || '—'}</span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {transferEnabled(collection) ? (
        <div className="card">
          <h2>Transfer</h2>
          <div className="muted">Transfers change record ownership on-chain.</div>
          <label className="label">to (address)</label>
          <input className="input" value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="0x…" />
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button className="btn primary" onClick={() => void doTransfer()} disabled={!transferTo.trim()}>
              Transfer
            </button>
          </div>
          {txStatus ? <div className="muted" style={{ marginTop: 10 }}>{txStatus}</div> : null}
        </div>
      ) : null}

      {error ? <div className="card"><div className="pre">{error}</div></div> : null}
    </>
  );
}
