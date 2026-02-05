'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { fetchAppAbi } from '../../../src/lib/abi';
import { fnCreate } from '../../../src/lib/app';
import { chainFromId } from '../../../src/lib/chains';
import { makePublicClient, makeWalletClient, requestWalletAddress } from '../../../src/lib/clients';
import { formatWei, parseFieldValue } from '../../../src/lib/format';
import { fetchManifest, getPrimaryDeployment } from '../../../src/lib/manifest';
import { createFields, getCollection, hasCreatePayment, requiredFieldNames, type ThsField } from '../../../src/lib/ths';

function inputType(field: ThsField): 'text' | 'number' {
  if (field.type === 'uint256' || field.type === 'int256' || field.type === 'decimal' || field.type === 'reference') return 'number';
  return 'text';
}

export default function CreateRecordPage(props: { params: { collection: string } }) {
  const collectionName = props.params.collection;
  const collection = useMemo(() => getCollection(collectionName), [collectionName]);

  const router = useRouter();
  const search = useSearchParams();
  const rpcOverride = search.get('rpc') ?? undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [deployment, setDeployment] = useState<any | null>(null);
  const [abi, setAbi] = useState<any[] | null>(null);
  const [publicClient, setPublicClient] = useState<any | null>(null);

  const [form, setForm] = useState<Record<string, string>>({});

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

  if (!collection) {
    return (
      <div className="card">
        <h2>Unknown collection</h2>
        <div className="pre">{collectionName}</div>
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

  const fields = createFields(collection);
  const required = requiredFieldNames(collection);
  const payment = hasCreatePayment(collection);

  async function submit() {
    if (!deployment || !abi || !publicClient || !appAddress) return;
    if (appAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
      setError('App is not deployed yet (manifest has 0x0 address).');
      return;
    }

    setError(null);
    setStatus(null);

    for (const f of fields) {
      if (!required.has(f.name)) continue;
      const v = (form[f.name] ?? '').trim();
      if (!v) {
        setError(`Missing required field: ${f.name}`);
        return;
      }
    }

    try {
      setStatus('Connecting wallet…');
      const chain = chainFromId(Number(deployment.chainId));
      const account = await requestWalletAddress(chain);
      const walletClient = makeWalletClient(chain);

      const args = fields.map((f) => parseFieldValue(form[f.name] ?? '', f.type, (f as any).decimals));

      setStatus('Sending transaction…');
      const hash = await walletClient.writeContract({
        address: appAddress,
        abi,
        functionName: fnCreate(collectionName),
        args,
        account,
        value: payment ? BigInt(payment.amountWei) : undefined,
        chain
      });

      setStatus('Waiting for confirmation…');
      await publicClient.waitForTransactionReceipt({ hash });

      setStatus('Created.');
      router.push(`/${collectionName}/`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus(null);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <h2>Loading…</h2>
        <div className="muted">Preparing form and loading manifest.</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2>Error</h2>
        <div className="pre">{error}</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Create {collection.name}</h2>
      {payment ? (
        <div className="muted">
          Fee: <span className="badge">{formatWei(payment.amountWei)} ETH</span> ({payment.amountWei} wei)
        </div>
      ) : (
        <div className="muted">No create fee.</div>
      )}

      {fields.map((f) => (
        <div key={f.name}>
          <label className="label">
            {f.name} {required.has(f.name) ? <span className="badge">required</span> : null}
          </label>
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
          Create
        </button>
        <button className="btn" onClick={() => router.push(`/${collectionName}/`)}>Cancel</button>
      </div>

      {status ? <div className="muted" style={{ marginTop: 12 }}>{status}</div> : null}
      {error ? <div className="pre" style={{ marginTop: 12 }}>{error}</div> : null}
    </div>
  );
}
