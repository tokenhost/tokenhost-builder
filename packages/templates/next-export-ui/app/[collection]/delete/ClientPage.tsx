'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { fetchAppAbi } from '../../../src/lib/abi';
import { fnDelete, fnGet } from '../../../src/lib/app';
import { chainFromId } from '../../../src/lib/chains';
import { makePublicClient, makeWalletClient, requestWalletAddress } from '../../../src/lib/clients';
import { shortAddress } from '../../../src/lib/format';
import { fetchManifest, getPrimaryDeployment } from '../../../src/lib/manifest';
import { getCollection } from '../../../src/lib/ths';

function getValue(record: any, key: string, fallbackIndex?: number): any {
  if (record && typeof record === 'object' && key in record) {
    return (record as any)[key];
  }
  if (Array.isArray(record) && typeof fallbackIndex === 'number') {
    return record[fallbackIndex];
  }
  return undefined;
}

export default function DeleteRecordPage(props: { params: { collection: string } }) {
  const collectionName = props.params.collection;
  const collection = useMemo(() => getCollection(collectionName), [collectionName]);

  const router = useRouter();
  const search = useSearchParams();
  const idParam = search.get('id');
  const rpcOverride = search.get('rpc') ?? undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [deployment, setDeployment] = useState<any | null>(null);
  const [abi, setAbi] = useState<any[] | null>(null);
  const [publicClient, setPublicClient] = useState<any | null>(null);
  const [record, setRecord] = useState<any | null>(null);

  const id = useMemo(() => {
    if (!idParam) return null;
    try {
      return BigInt(idParam);
    } catch {
      return null;
    }
  }, [idParam]);

  const softDeleteEnabled = Boolean((collection as any)?.deleteRules?.softDelete);

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

  async function submit() {
    if (!deployment || !abi || !publicClient || !appAddress || id === null) return;

    setError(null);
    setStatus(null);

    try {
      setStatus('Connecting wallet…');
      const chain = chainFromId(Number(deployment.chainId));
      const account = await requestWalletAddress(chain);
      const walletClient = makeWalletClient(chain);

      setStatus('Sending delete…');
      const hash = await walletClient.writeContract({
        address: appAddress,
        abi,
        functionName: fnDelete(collectionName),
        args: [id],
        account,
        chain
      });

      setStatus('Waiting for confirmation…');
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus('Deleted.');
      router.push(`/${collectionName}/`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus(null);
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
        <div className="muted">Run <span className="badge">th deploy</span> and re-publish the manifest for this UI.</div>
        <div className="pre">manifest deploymentEntrypointAddress is 0x0</div>
      </div>
    );
  }

  if (!softDeleteEnabled) {
    return (
      <div className="card">
        <h2>Delete disabled</h2>
        <div className="muted">This collection does not allow soft deletes (schema.deleteRules.softDelete=false).</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => router.push(`/${collectionName}/view/?id=${String(id)}`)}>
          Back
        </button>
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
          <button className="btn" onClick={() => router.push(`/${collectionName}/view/?id=${String(id)}`)}>Back</button>
        </div>
      </div>
    );
  }

  const owner = record ? getValue(record, 'owner', 3) : null;

  return (
    <div className="card">
      <h2>
        Delete {collection.name} <span className="badge">#{String(id)}</span>
      </h2>

      <div className="muted">
        This will soft-delete the record on-chain. It will no longer show up in list pages.
      </div>

      <div className="kv" style={{ marginTop: 12 }}>
        <div>owner</div>
        <div>{owner ? shortAddress(String(owner)) : '—'}</div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
        <button className="btn danger" onClick={() => void submit()} disabled={!abi || !publicClient || !appAddress}>
          Confirm delete
        </button>
        <button className="btn" onClick={() => router.push(`/${collectionName}/view/?id=${String(id)}`)}>Cancel</button>
      </div>

      {status ? <div className="muted" style={{ marginTop: 12 }}>{status}</div> : null}
      {error ? <div className="pre" style={{ marginTop: 12 }}>{error}</div> : null}
    </div>
  );
}

