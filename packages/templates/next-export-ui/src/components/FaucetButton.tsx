'use client';

import React, { useEffect, useRef, useState } from 'react';

import { fetchManifest, getPrimaryDeployment, getReadRpcUrl, getTxMode } from '../lib/manifest';
import { chainFromId } from '../lib/chains';
import { chainWithRpcOverride, requestWalletAddress } from '../lib/clients';

type FaucetStatus = {
  ok: boolean;
  enabled: boolean;
  chainId: number | null;
  targetEthDefault?: number;
  reason?: string | null;
};

function formatWeiHexAsEth(weiHex: unknown): string | null {
  if (typeof weiHex !== 'string' || !weiHex.startsWith('0x')) return null;
  try {
    const wei = BigInt(weiHex);
    const whole = wei / 10n ** 18n;
    const frac4 = (wei % 10n ** 18n) / 10n ** 14n;
    if (frac4 === 0n) return `${whole.toString()} ETH`;
    return `${whole.toString()}.${frac4.toString().padStart(4, '0')} ETH`;
  } catch {
    return null;
  }
}

async function tryFetchFaucetStatus(): Promise<FaucetStatus | null> {
  try {
    const res = await fetch('/__tokenhost/faucet', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as FaucetStatus;
    if (!json || typeof json !== 'object') return null;
    return json;
  } catch {
    return null;
  }
}

export default function FaucetButton() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const targetEthRef = useRef<number>(10);
  const noteTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setHasWallet(typeof (globalThis as any).ethereum !== 'undefined');
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (hasWallet !== true) return;
      try {
        const manifest = await fetchManifest();
        const deployment = getPrimaryDeployment(manifest);
        if (getTxMode(manifest) === 'sponsored') {
          if (!cancelled) {
            setEnabled(false);
            setReason(null);
          }
          return;
        }
        const chainId = Number(deployment?.chainId ?? NaN);
        if (!Number.isFinite(chainId) || chainId !== 31337) {
          if (!cancelled) {
            setEnabled(false);
            setReason('Faucet is available only for local anvil (chainId 31337).');
          }
          return;
        }

        const status = await tryFetchFaucetStatus();
        if (!status?.ok || !status.enabled) {
          if (!cancelled) {
            setEnabled(true);
            setReason('Faucet endpoint unavailable. Start preview via `th up` or `th preview`.');
          }
          return;
        }

        const targetEth = Number(status.targetEthDefault ?? 10);
        if (Number.isFinite(targetEth) && targetEth > 0) {
          targetEthRef.current = targetEth;
        }

        if (!cancelled) {
          setEnabled(true);
          setReason(null);
        }
      } catch {
        if (!cancelled) {
          setEnabled(true);
          setReason('Faucet endpoint unavailable. Start preview via `th up` or `th preview`.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasWallet]);

  function setTimedNote(message: string) {
    setNote(message);
    if (noteTimerRef.current !== null) {
      window.clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }
    noteTimerRef.current = window.setTimeout(() => setNote(null), 8000);
  }

  useEffect(() => {
    return () => {
      if (noteTimerRef.current !== null) window.clearTimeout(noteTimerRef.current);
    };
  }, []);

  async function requestFaucet() {
    if (!enabled || busy) return;
    setBusy(true);
    setNote(null);

    try {
      const manifest = await fetchManifest();
      const deployment = getPrimaryDeployment(manifest);
      const chainId = Number(deployment?.chainId ?? NaN);
      if (!Number.isFinite(chainId)) throw new Error('Missing chainId in manifest deployment.');

      const chain = chainWithRpcOverride(chainFromId(chainId), getReadRpcUrl(manifest) || undefined);
      const address = await requestWalletAddress(chain);

      const res = await fetch('/__tokenhost/faucet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address })
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        const msg = String(json?.error ?? `Faucet failed (HTTP ${res.status}).`);
        throw new Error(msg);
      }
      const oldEth = formatWeiHexAsEth(json?.oldBalanceWei);
      const newEth = formatWeiHexAsEth(json?.newBalanceWei);
      if (json?.didSet) {
        const detail = oldEth && newEth ? ` (${oldEth} -> ${newEth})` : '';
        setTimedNote(`Faucet funded${detail}`);
      } else if (newEth) {
        setTimedNote(`Already funded (${newEth})`);
      } else {
        setTimedNote(`Already funded (~${targetEthRef.current} ETH)`);
      }
    } catch (e: any) {
      setTimedNote(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  if (hasWallet === null || !enabled) return null;

  return (
    <div className="statusInline">
      <button className="btn" onClick={() => void requestFaucet()} disabled={busy || Boolean(reason)} title="Local faucet (anvil)">
        {busy ? 'Funding…' : 'Get test ETH'}
      </button>
      {reason ? <span className="badge controlNote">{reason}</span> : null}
      {note ? (
        <span className="badge controlNote" title={note} style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {note}
        </span>
      ) : null}
    </div>
  );
}
