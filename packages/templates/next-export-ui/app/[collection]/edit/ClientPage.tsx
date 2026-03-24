'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { fetchAppAbi } from '../../../src/lib/abi';
import { assertAbiFunction, fnGet, fnUpdate } from '../../../src/lib/app';
import { chainFromId } from '../../../src/lib/chains';
import { chainWithRpcOverride, makePublicClient } from '../../../src/lib/clients';
import { formatNumeric, parseFieldValue } from '../../../src/lib/format';
import { fetchManifest, getPrimaryDeployment, getReadRpcUrl } from '../../../src/lib/manifest';
import { getCollection, mutableFields, type ThsCollection, type ThsField } from '../../../src/lib/ths';
import { submitWriteTx } from '../../../src/lib/tx';
import TxStatus, { type TxPhase } from '../../../src/components/TxStatus';
import ImageFieldInput from '../../../src/components/ImageFieldInput';
import ReferenceFieldInput from '../../../src/components/ReferenceFieldInput';

function inputType(field: ThsField): 'text' | 'number' {
  if (field.type === 'uint256' || field.type === 'int256' || field.type === 'decimal') return 'number';
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

  const [bootstrapping, setBootstrapping] = useState(true);
  const [recordLoading, setRecordLoading] = useState(false);
  const [initialRecordResolved, setInitialRecordResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txPhase, setTxPhase] = useState<TxPhase>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

  const [deployment, setDeployment] = useState<any | null>(null);
  const [manifest, setManifest] = useState<any | null>(null);
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

  const fields = collection ? mutableFields(collection) : [];
  const optimistic = Boolean((collection as any)?.updateRules?.optimisticConcurrency);

  async function fetchRecord(options?: { initial?: boolean }) {
    if (!publicClient || !abi || !appAddress || id === null) return;
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

  // Load record once ABI + id are ready.
  useEffect(() => {
    void fetchRecord({ initial: true });
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
    if (!manifest || !deployment || !abi || !publicClient || !appAddress || id === null) return;
    if (!record) return;

    setError(null);
    setStatus(null);
    setTxPhase('idle');
    setTxHash(null);

    try {
      const chain = chainWithRpcOverride(
        chainFromId(Number(deployment.chainId)),
        rpcOverride || getReadRpcUrl(manifest) || undefined
      );

      const contractArgs: any[] = [id];
      for (const f of fields) {
        contractArgs.push(parseFieldValue(form[f.name] ?? '', f.type, (f as any).decimals));
      }
      if (optimistic) {
        const v = getValue(record, 'version', 8);
        contractArgs.push(typeof v === 'bigint' ? v : BigInt(String(v ?? '0')));
      }

      assertAbiFunction(abi, fnUpdate(collectionName), collectionName);
      const result = await submitWriteTx({
        manifest,
        deployment,
        chain,
        publicClient,
        address: appAddress,
        abi,
        functionName: fnUpdate(collectionName),
        contractArgs,
        setStatus,
        onPhase: setTxPhase,
        onHash: setTxHash
      });

      setStatus(`Updated (${result.hash.slice(0, 10)}…).`);
      router.push(`/${collectionName}/?mode=view&id=${String(id)}`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus(null);
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

  if (fields.length === 0) {
    return (
      <div className="card">
        <h2>Edit disabled</h2>
        <div className="muted">This collection has no mutable fields in schema.updateRules.</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => router.push(`/${collectionName}/?mode=view&id=${String(id)}`)}>
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
          <button className="btn" onClick={() => router.push(`/${collectionName}/?mode=view&id=${String(id)}`)}>Back</button>
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

  return (
    <div className="card">
      <div className="row">
        <h2>
          Edit {collection.name} <span className="badge">#{String(getValue(record, 'id', 0))}</span>
        </h2>
        <button className="btn" onClick={() => router.push(`/${collectionName}/?mode=view&id=${String(id)}`)}>Back</button>
      </div>

      <div className="formGrid">
        {fields.map((f) => (
          <div key={f.name} className="fieldGroup">
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
            ) : f.type === 'image' ? (
              <ImageFieldInput
                manifest={manifest}
                value={form[f.name] ?? ''}
                disabled={txPhase === 'submitting' || txPhase === 'submitted' || txPhase === 'confirming'}
                onChange={(next) => setForm((prev) => ({ ...prev, [f.name]: next }))}
              />
            ) : f.type === 'reference' ? (
              <ReferenceFieldInput
                manifest={manifest}
                publicClient={publicClient}
                abi={abi}
                address={appAddress}
                collection={collection}
                field={f}
                value={form[f.name] ?? ''}
                disabled={txPhase === 'submitting' || txPhase === 'submitted' || txPhase === 'confirming'}
                onChange={(next) => setForm((prev) => ({ ...prev, [f.name]: next }))}
              />
            ) : (
              <input
                className="input"
                type={inputType(f)}
                value={form[f.name] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
                placeholder={f.type}
              />
            )}
          </div>
        ))}
      </div>

      <div className="actionGroup" style={{ marginTop: 16 }}>
        <button
          className="btn primary"
          onClick={() => void submit()}
          disabled={!abi || !publicClient || !appAddress || txPhase === 'submitting' || txPhase === 'submitted' || txPhase === 'confirming'}
        >
          Save
        </button>
        <button className="btn" onClick={() => router.push(`/${collectionName}/?mode=view&id=${String(id)}`)}>Cancel</button>
      </div>

      {status ? <div className="muted" style={{ marginTop: 12 }}>{status}</div> : null}
      <TxStatus phase={txPhase} hash={txHash} chainId={Number(deployment?.chainId ?? NaN)} error={error} />
      {error ? <div className="pre" style={{ marginTop: 12 }}>{error}</div> : null}
    </div>
  );
}
