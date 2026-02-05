'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { chainFromId } from '../lib/chains';
import { ensureWalletChain } from '../lib/clients';
import { fetchManifest, getPrimaryDeployment } from '../lib/manifest';

export default function NetworkStatus() {
  const hasWallet = useMemo(() => typeof (globalThis as any).ethereum !== 'undefined', []);
  const [targetChainId, setTargetChainId] = useState<number | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (!hasWallet) return;
      try {
        const manifest = await fetchManifest();
        const deployment = getPrimaryDeployment(manifest);
        const target = Number(deployment?.chainId ?? NaN);
        if (!Number.isFinite(target)) return;
        const eth = (globalThis as any).ethereum as any;
        const current = await eth.request({ method: 'eth_chainId' });
        const parsed = Number.parseInt(String(current), 16);
        if (!cancelled) {
          setTargetChainId(target);
          setWalletChainId(Number.isFinite(parsed) ? parsed : null);
        }
      } catch {
        // ignore best-effort status.
      }
    }

    void refresh();
    const eth = (globalThis as any).ethereum as any;
    if (eth?.on) {
      eth.on('chainChanged', refresh);
    }
    return () => {
      cancelled = true;
      if (eth?.removeListener) {
        eth.removeListener('chainChanged', refresh);
      }
    };
  }, [hasWallet]);

  async function fixNetwork() {
    if (!targetChainId) return;
    setBusy(true);
    setNote(null);
    try {
      await ensureWalletChain(chainFromId(targetChainId));
      setWalletChainId(targetChainId);
      setNote('Wallet switched to expected network.');
    } catch (e: any) {
      setNote(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  if (!hasWallet || !targetChainId || walletChainId === null || walletChainId === targetChainId) return null;

  return (
    <div className="networkAlert">
      <div>
        <strong>Wrong network:</strong> wallet on chainId {walletChainId}, app deployment on chainId {targetChainId}.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn danger" disabled={busy} onClick={() => void fixNetwork()}>
          {busy ? 'Switching…' : 'Switch network'}
        </button>
        {note ? <span className="badge">{note}</span> : null}
      </div>
    </div>
  );
}
