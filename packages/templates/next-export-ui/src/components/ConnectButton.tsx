'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { shortAddress } from '../lib/format';

function hasInjectedWallet(): boolean {
  return typeof (globalThis as any).ethereum !== 'undefined';
}

export default function ConnectButton() {
  const [account, setAccount] = useState<string | null>(null);

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

  async function connect() {
    const eth = (globalThis as any).ethereum as any;
    if (!eth) return;

    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
    const a = accounts?.[0] ?? null;
    setAccount(a);
    try {
      if (a) localStorage.setItem('TH_ACCOUNT', a);
    } catch {
      // ignore
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
    return <span className="badge">No wallet</span>;
  }

  if (!account) {
    return (
      <button className="btn primary" onClick={() => void connect()}>
        Connect
      </button>
    );
  }

  return (
    <button className="btn" onClick={() => disconnect()} title={account}>
      {shortAddress(account)}
    </button>
  );
}
