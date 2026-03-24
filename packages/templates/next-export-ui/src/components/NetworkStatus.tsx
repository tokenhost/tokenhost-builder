'use client';

import React, { useEffect, useState } from 'react';

import { chainFromId } from '../lib/chains';
import { chainWithRpcOverride, ensureWalletChain } from '../lib/clients';
import { fetchManifest, getPrimaryDeployment, getReadRpcUrl, getTxMode, type TxMode } from '../lib/manifest';

export default function NetworkStatus() {
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [targetChainId, setTargetChainId] = useState<number | null>(null);
  const [targetRpcUrl, setTargetRpcUrl] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [txMode, setTxMode] = useState<TxMode>('userPays');

  useEffect(() => {
    setHasWallet(typeof (globalThis as any).ethereum !== 'undefined');
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (hasWallet !== true) return;
      try {
        const manifest = await fetchManifest();
        const mode = getTxMode(manifest);
        if (!cancelled) setTxMode(mode);
        if (mode === 'sponsored') return;
        const deployment = getPrimaryDeployment(manifest);
        const target = Number(deployment?.chainId ?? NaN);
        if (!Number.isFinite(target)) return;
        const rpcUrl = getReadRpcUrl(manifest);
        const eth = (globalThis as any).ethereum as any;
        const current = await eth.request({ method: 'eth_chainId' });
        const parsed = Number.parseInt(String(current), 16);
        if (!cancelled) {
          setTargetChainId(target);
          setTargetRpcUrl(rpcUrl);
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
      await ensureWalletChain(chainWithRpcOverride(chainFromId(targetChainId), targetRpcUrl || undefined));
      setWalletChainId(targetChainId);
      setNote('Wallet switched to expected network.');
    } catch (e: any) {
      setNote(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  if (hasWallet === null || txMode === 'sponsored') return null;
  if (!hasWallet || !targetChainId || walletChainId === null || walletChainId === targetChainId) return null;

  return (
    <div className="networkAlert">
      <div className="networkAlertBody">
        <strong>Wrong network:</strong> wallet on chainId {walletChainId}, app deployment on chainId {targetChainId}.
      </div>
      <div className="networkAlertActions">
        <button className="btn danger" disabled={busy} onClick={() => void fixNetwork()}>
          {busy ? 'Switching…' : 'Switch network'}
        </button>
        {note ? <span className="badge">{note}</span> : null}
      </div>
    </div>
  );
}
