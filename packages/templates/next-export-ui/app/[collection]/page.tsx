'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import RecordCard from '../../src/components/RecordCard';
import { fetchAppAbi } from '../../src/lib/abi';
import { collectionId, listRecords } from '../../src/lib/app';
import { chainFromId } from '../../src/lib/chains';
import { makePublicClient } from '../../src/lib/clients';
import { fetchManifest, getPrimaryDeployment } from '../../src/lib/manifest';
import { getCollection } from '../../src/lib/ths';

const PAGE_SIZE = 10;

export default function CollectionListPage(props: { params: { collection: string } }) {
  const collectionName = props.params.collection;
  const collection = useMemo(() => getCollection(collectionName), [collectionName]);

  const search = useSearchParams();
  const rpcOverride = search.get('rpc') ?? undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [manifest, setManifest] = useState<any | null>(null);
  const [deployment, setDeployment] = useState<any | null>(null);
  const [abi, setAbi] = useState<any[] | null>(null);
  const [publicClient, setPublicClient] = useState<any | null>(null);

  const [cursor, setCursor] = useState<bigint>(0n);
  const [records, setRecords] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const appAddress = deployment?.deploymentEntrypointAddress as `0x${string}` | undefined;

  async function bootstrap() {
    setLoading(true);
    setError(null);
    try {
      const m = await fetchManifest();
      const d = getPrimaryDeployment(m);
      if (!d) throw new Error('Manifest has no deployments');

      const chain = chainFromId(Number(d.chainId));
      const pc = makePublicClient(chain, rpcOverride);

      setManifest(m);
      setDeployment(d);
      setPublicClient(pc);
      setAbi(null);

      const addr = String(d.deploymentEntrypointAddress || '').toLowerCase();
      const zero = '0x0000000000000000000000000000000000000000';
      if (addr && addr !== zero) {
        const a = await fetchAppAbi();
        setAbi(a);
      }

      // initial page
      setCursor(0n);
      setRecords([]);
      setHasMore(true);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function loadNextPage(nextCursor: bigint) {
    if (!publicClient || !abi || !appAddress) return;
    if (appAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') return;

    setLoading(true);
    setError(null);
    try {
      const { ids, records: recs } = await listRecords({
        publicClient,
        abi,
        address: appAddress,
        collectionName,
        cursorIdExclusive: nextCursor,
        limit: PAGE_SIZE
      });

      setRecords((prev) => [...prev, ...recs]);

      if (!ids || ids.length === 0) {
        setHasMore(false);
        return;
      }

      const newCursor = ids[ids.length - 1] ?? nextCursor;
      setCursor(newCursor);
      if (ids.length < PAGE_SIZE) setHasMore(false);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, rpcOverride]);

  // Fetch first page once bootstrap is done.
  useEffect(() => {
    if (!publicClient || !abi || !deployment) return;
    void loadNextPage(0n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, abi, deployment]);

  // Realtime-ish refresh (event-driven with polling fallback).
  useEffect(() => {
    if (!publicClient || !abi || !appAddress) return;
    if (appAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') return;

    const cid = collectionId(collectionName);
    const unwatchers: Array<() => void> = [];

    function refresh() {
      setRecords([]);
      setCursor(0n);
      setHasMore(true);
      void loadNextPage(0n);
    }

    // List pages should avoid broad RecordUpdated subscriptions (SPEC 8.9.2).
    for (const eventName of ['RecordCreated', 'RecordDeleted'] as const) {
      const unwatch = publicClient.watchContractEvent({
        address: appAddress,
        abi,
        eventName,
        args: { collectionId: cid },
        pollingInterval: 2000,
        onLogs: () => {
          refresh();
        }
      });
      unwatchers.push(unwatch);
    }

    return () => {
      for (const u of unwatchers) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, abi, appAddress, collectionName]);

  if (!collection) {
    return (
      <div className="card">
        <h2>Unknown collection</h2>
        <div className="pre">{collectionName}</div>
      </div>
    );
  }

  if (loading && records.length === 0) {
    return (
      <div className="card">
        <h2>Loading…</h2>
        <div className="muted">Fetching manifest + ABI + on-chain data.</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2>Error</h2>
        <div className="pre">{error}</div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => void bootstrap()}>Retry</button>
        </div>
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

  return (
    <>
      {records.length === 0 ? (
        <div className="card">
          <h2>No records yet</h2>
          <div className="muted">Create the first {collection.name}.</div>
        </div>
      ) : null}

      {records.map((r, idx) => (
        <RecordCard key={idx} collection={collection as any} record={r} />
      ))}

      <div className="card">
        <div className="row">
          <div className="muted">
            Showing {records.length} {collection.name} record(s)
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => void bootstrap()}>Refresh</button>
            <button className="btn primary" disabled={!hasMore || loading} onClick={() => void loadNextPage(cursor)}>
              {hasMore ? (loading ? 'Loading…' : 'Load more') : 'End'}
            </button>
          </div>
        </div>
      </div>

      {/* Debug */}
      {manifest ? (
        <div className="card">
          <h2>Deployment</h2>
          <div className="kv">
            <div>chainId</div>
            <div>{String(deployment?.chainId ?? '')}</div>
            <div>address</div>
            <div>{String(appAddress ?? '')}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
