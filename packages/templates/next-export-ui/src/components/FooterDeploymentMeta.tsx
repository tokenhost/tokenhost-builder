'use client';

import React, { type ReactNode, useEffect, useState } from 'react';

import { explorerAddressUrl } from '../lib/chains';
import { fetchManifest, getPrimaryDeployment } from '../lib/manifest';

function shortAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export default function FooterDeploymentMeta(props: { children?: ReactNode }) {
  const [chainId, setChainId] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const manifest = await fetchManifest();
        const deployment = getPrimaryDeployment(manifest);
        if (cancelled || !deployment) return;
        const parsedChainId = Number(deployment.chainId);
        const parsedAddress = String(deployment.deploymentEntrypointAddress ?? '');
        if (Number.isFinite(parsedChainId)) setChainId(parsedChainId);
        if (parsedAddress && parsedAddress !== '0x0000000000000000000000000000000000000000') {
          setAddress(parsedAddress);
        }
      } catch {
        // Footer metadata is best-effort and should never fail rendering.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const link = address && chainId !== null ? explorerAddressUrl(chainId, address) : null;

  return (
    <div className="footerMeta">
      <span className="eyebrow">/tokenhost/runtime</span>
      <span>Powered by Token Host</span>
      {props.children}
      <span className="badge">public RPC reads</span>
      {chainId !== null ? <span className="badge">chain {String(chainId)}</span> : null}
      {address ? (
        link ? (
          <a className="footerLink" href={link} target="_blank" rel="noreferrer">
            <span className="badge">{shortAddress(address)}</span>
          </a>
        ) : (
          <span className="badge">{shortAddress(address)}</span>
        )
      ) : null}
    </div>
  );
}
