import { encodeFunctionData, type Address } from 'viem';

import { makeWalletClient, requestWalletAddress } from './clients';
import { getRelayBaseUrl, getTxMode } from './manifest';
import type { TxPhase } from '../components/TxStatus';

export type SubmitWriteTxResult = {
  hash: `0x${string}`;
  receipt: any;
};

export async function submitWriteTx(args: {
  manifest: any;
  deployment: any;
  chain: any;
  publicClient: any;
  address: `0x${string}`;
  abi: any[];
  functionName: string;
  contractArgs: any[];
  value?: bigint;
  setStatus?: (s: string | null) => void;
  onPhase?: (phase: TxPhase) => void;
  onHash?: (hash: `0x${string}`) => void;
}): Promise<SubmitWriteTxResult> {
  const mode = getTxMode(args.manifest);

  if (mode === 'sponsored') {
    args.onPhase?.('submitting');
    args.setStatus?.('Submitting sponsored transaction…');
    const data = encodeFunctionData({
      abi: args.abi,
      functionName: args.functionName,
      args: args.contractArgs
    });

    const relayBaseUrl = getRelayBaseUrl(args.manifest).replace(/\/+$/, '');
    const relayUrl = relayBaseUrl.endsWith('/__tokenhost/relay') ? relayBaseUrl : `${relayBaseUrl}/__tokenhost/relay`;
    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: args.address,
        data,
        value: args.value ? `0x${args.value.toString(16)}` : undefined
      })
    });

    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok || !body?.txHash) {
      const msg = String(body?.error ?? `Relay request failed (HTTP ${res.status}).`);
      throw new Error(msg);
    }

    const hash = String(body.txHash) as `0x${string}`;
    args.onHash?.(hash);
    args.onPhase?.('submitted');
    args.setStatus?.(`Submitted ${hash.slice(0, 10)}…`);
    args.onPhase?.('confirming');
    args.setStatus?.('Waiting for confirmation…');
    const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
    args.onPhase?.('confirmed');
    args.setStatus?.(`Confirmed ${hash.slice(0, 10)}…`);
    return { hash, receipt };
  }

  args.onPhase?.('submitting');
  args.setStatus?.('Connecting wallet…');
  const account = await requestWalletAddress(args.chain);
  const walletClient = makeWalletClient(args.chain);
  args.setStatus?.('Sending transaction…');
  const hash = (await walletClient.writeContract({
    address: args.address as Address,
    abi: args.abi,
    functionName: args.functionName,
    args: args.contractArgs,
    account,
    value: args.value,
    chain: args.chain
  })) as `0x${string}`;
  args.onHash?.(hash);
  args.onPhase?.('submitted');
  args.setStatus?.(`Submitted ${hash.slice(0, 10)}…`);
  args.onPhase?.('confirming');
  args.setStatus?.('Waiting for confirmation…');
  const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
  args.onPhase?.('confirmed');
  args.setStatus?.(`Confirmed ${hash.slice(0, 10)}…`);
  return { hash, receipt };
}
