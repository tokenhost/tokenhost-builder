import React from 'react';

import { explorerTxUrl } from '../lib/chains';

export type TxPhase = 'idle' | 'submitting' | 'submitted' | 'confirming' | 'confirmed' | 'failed';

function shortHash(hash: string): string {
  if (!hash || hash.length < 14) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function phaseLabel(phase: TxPhase): string {
  if (phase === 'submitting') return 'Submitting transaction…';
  if (phase === 'submitted') return 'Transaction submitted.';
  if (phase === 'confirming') return 'Waiting for confirmation…';
  if (phase === 'confirmed') return 'Transaction confirmed.';
  if (phase === 'failed') return 'Transaction failed.';
  return '';
}

export default function TxStatus(props: {
  phase: TxPhase;
  hash?: string | null;
  chainId?: number | null;
  error?: string | null;
}) {
  const { phase, hash, chainId, error } = props;
  if (phase === 'idle' && !error) return null;

  const toneClass = phase === 'failed' || error ? 'txStatus fail' : 'txStatus';
  const txUrl = hash && Number.isFinite(chainId) ? explorerTxUrl(chainId as number, hash) : null;

  return (
    <div className={toneClass}>
      <div className="txStatusHead">{phaseLabel(phase)}</div>
      {hash ? (
        <div className="txStatusRow">
          <span className="badge">{shortHash(hash)}</span>
          {txUrl ? (
            <a className="txStatusLink" href={txUrl} target="_blank" rel="noreferrer">
              View tx
            </a>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="pre" style={{ marginTop: 10 }}>{error}</div> : null}
    </div>
  );
}
