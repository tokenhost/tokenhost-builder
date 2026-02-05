'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { fetchAppAbi } from '../../../src/lib/abi';
import { assertAbiFunction, fnGet, fnUpdate } from '../../../src/lib/app';
import { chainFromId } from '../../../src/lib/chains';
import { makePublicClient, makeWalletClient, requestWalletAddress } from '../../../src/lib/clients';
import { formatNumeric, parseFieldValue } from '../../../src/lib/format';
import { fetchManifest, getPrimaryDeployment } from '../../../src/lib/manifest';
import { getCollection, mutableFields, type ThsCollection, type ThsField } from '../../../src/lib/ths';

function inputType(field: ThsField): 'text' | 'number' {
  if (field.type === 'uint256' || field.type === 'int256' || field.type === 'decimal' || field.type === 'reference') return 'number';
  return 'text';
}

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

export default function EditRecordPage(props: { params: { collection: string } }) {
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

  const [form, setForm] = useState<Record<string, string>>({});

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

  const fields = collection ? mutableFields(collection) : [];
  const optimistic = Boolean((collection as any)?.updateRules?.optimisticConcurrency);

  async function fetchRecord() {
    if (!publicClient || !abi || !appAddress || id === null) return;
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
    }
  }

  // Load record once ABI + id are ready.
  useEffect(() => {
    void fetchRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, abi, appAddress, idParam]);

  // Initialize form state from the fetched record.
  useEffect(() => {
    if (!collection || !record) return;
    const initial: Record<string, string> = {};
    for (const f of fields) {
      const v = getValue(record, f.name, fieldIndex(collection, f));
      if (f.type === 'bool') {
        initial[f.name] = v ? 'true' : 'false';
      } else {
        initial[f.name] = formatNumeric(v, f.type, (f as any).decimals);
      }
    }
    setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, collectionName]);

  async function submit() {
    if (!deployment || !abi || !publicClient || !appAddress || id === null) return;
    if (!record) return;

    setError(null);
    setStatus(null);

    try {
      setStatus('Connecting wallet…');
      const chain = chainFromId(Number(deployment.chainId));
      const account = await requestWalletAddress(chain);
      const walletClient = makeWalletClient(chain);

      const args: any[] = [id];
      for (const f of fields) {
        args.push(parseFieldValue(form[f.name] ?? '', f.type, (f as any).decimals));
      }
      if (optimistic) {
        const v = getValue(record, 'version', 8);
        args.push(typeof v === 'bigint' ? v : BigInt(String(v ?? '0')));
      }

      assertAbiFunction(abi, fnUpdate(collectionName), collectionName);
      setStatus('Sending transaction…');
      const hash = await walletClient.writeContract({
        address: appAddress,
        abi,
        functionName: fnUpdate(collectionName),
        args,
        account,
        chain
      });

      setStatus('Waiting for confirmation…');
      await publicClient.waitForTransactionReceipt({ hash });

      setStatus('Updated.');
      router.push(`/${collectionName}/view/?id=${String(id)}`);
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

  if (fields.length === 0) {
    return (
      <div className="card">
        <h2>Edit disabled</h2>
        <div className="muted">This collection has no mutable fields in schema.updateRules.</div>
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

  if (!record) {
    return (
      <div className="card">
        <h2>Not found</h2>
        <div className="muted">No record returned.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row">
        <h2>
          Edit {collection.name} <span className="badge">#{String(getValue(record, 'id', 0))}</span>
        </h2>
        <button className="btn" onClick={() => router.push(`/${collectionName}/view/?id=${String(id)}`)}>Back</button>
      </div>

      {fields.map((f) => (
        <div key={f.name}>
          <label className="label">{f.name}</label>
          {f.type === 'bool' ? (
            <select
              className="select"
              value={form[f.name] ?? 'false'}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          ) : (
            <input
              className="input"
              type={inputType(f)}
              value={form[f.name] ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
              placeholder={f.type === 'reference' ? 'record id (uint256)' : f.type}
            />
          )}
        </div>
      ))}

      <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
        <button className="btn primary" onClick={() => void submit()} disabled={!abi || !publicClient || !appAddress}>
          Save
        </button>
        <button className="btn" onClick={() => router.push(`/${collectionName}/view/?id=${String(id)}`)}>Cancel</button>
      </div>

      {status ? <div className="muted" style={{ marginTop: 12 }}>{status}</div> : null}
      {error ? <div className="pre" style={{ marginTop: 12 }}>{error}</div> : null}
    </div>
  );
}
