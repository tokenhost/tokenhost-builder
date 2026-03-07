'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { chainFromId } from '../lib/chains';
import { requestWalletAddress } from '../lib/clients';
import { shortAddress } from '../lib/format';
import { fetchManifest, getPrimaryDeployment, getTxMode, type TxMode } from '../lib/manifest';

function hasInjectedWallet(): boolean {
  return typeof (globalThis as any).ethereum !== 'undefined';
}

export default function ConnectButton() {
  const [account, setAccount] = useState<string | null>(null);
  const [targetChainId, setTargetChainId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txMode, setTxMode] = useState<TxMode>('userPays');

  const canConnect = useMemo(() => hasInjectedWallet(), []);

  useEffect(() => {
    // Best-effort: hydrate from localStorage.
    try {
      const cached = localStorage.getItem('TH_ACCOUNT');
      if (cached) setAccount(cached);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const manifest = await fetchManifest();
        const mode = getTxMode(manifest);
        if (!cancelled) setTxMode(mode);
        if (mode === 'sponsored') return;
        const deployment = getPrimaryDeployment(manifest);
        const chainId = Number(deployment?.chainId ?? NaN);
        if (!cancelled && Number.isFinite(chainId)) {
          setTargetChainId(chainId);
        }
      } catch {
        // ignore best-effort chain hint.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect() {
    if (!canConnect) return;
    try {
      setStatus('Connecting wallet...');
      const target = targetChainId && Number.isFinite(targetChainId) ? chainFromId(targetChainId) : null;
      const a = target ? await requestWalletAddress(target) : null;
      const accountAddr = a ?? null;
      setAccount(accountAddr);
      setStatus(null);
      try {
        if (accountAddr) localStorage.setItem('TH_ACCOUNT', accountAddr);
      } catch {
        // ignore
      }
    } catch (e: any) {
      setStatus(String(e?.message ?? e));
    }
  }

  function disconnect() {
    // Wallets don't support programmatic disconnect reliably; clear local state only.
    setAccount(null);
    try {
      localStorage.removeItem('TH_ACCOUNT');
    } catch {
      // ignore
    }
  }

  if (!canConnect) {
    return <span className="badge controlNote">No wallet</span>;
  }

  if (txMode === 'sponsored') return null;

  if (!account) {
    return (
      <div className="statusStack">
        <button className="btn primary" onClick={() => void connect()}>
          Connect wallet
        </button>
        {targetChainId ? <span className="badge controlNote">target chain {targetChainId}</span> : null}
        {status ? <span className="badge controlNote">{status}</span> : null}
      </div>
    );
  }

  return (
    <div className="statusStack">
      <button className="btn" onClick={() => disconnect()} title={account}>
        {shortAddress(account)}
      </button>
      {targetChainId ? <span className="badge controlNote">chain {targetChainId}</span> : null}
    </div>
  );
}
