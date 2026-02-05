import { createPublicClient, createWalletClient, custom, http } from 'viem';
import type { Chain } from 'viem';

export function resolveRpcUrl(chain: Chain, override?: string): string | null {
  if (override) return override;
  const httpUrls = chain.rpcUrls?.default?.http;
  if (Array.isArray(httpUrls) && httpUrls.length > 0) return httpUrls[0] ?? null;
  return null;
}

export function makePublicClient(chain: Chain, rpcUrl?: string): any {
  // Prefer explicit HTTP RPC for reads so chain mismatch in the user's wallet
  // doesn't silently read from the wrong network.
  const url = resolveRpcUrl(chain, rpcUrl);
  if (url) {
    return createPublicClient({
      chain,
      transport: http(url)
    });
  }

  // Fallback: read through the user's wallet provider.
  const eth = (globalThis as any).ethereum as any;
  if (eth) {
    return createPublicClient({
      chain,
      transport: custom(eth)
    });
  }

  throw new Error(`No RPC URL available for chainId ${chain.id}. Provide ?rpc=https://...`);
}

export function makeWalletClient(chain: Chain): any {
  const eth = (globalThis as any).ethereum as any;
  if (!eth) throw new Error('No injected wallet found (window.ethereum).');

  return createWalletClient({
    chain,
    transport: custom(eth)
  });
}

function extractErrorCode(e: any): string | number | null {
  const codes = [
    e?.code,
    e?.cause?.code,
    e?.cause?.cause?.code,
    e?.data?.code,
    e?.cause?.data?.code,
    e?.cause?.cause?.data?.code
  ];

  for (const c of codes) {
    if (c === undefined || c === null) continue;
    return c;
  }
  return null;
}

function extractErrorMessage(e: any): string {
  const parts = [
    e?.shortMessage,
    e?.message,
    e?.cause?.message,
    e?.cause?.cause?.message
  ]
    .filter(Boolean)
    .map(String);

  if (parts.length > 0) return parts.join(' | ');
  try {
    return JSON.stringify(e);
  } catch {
    return String(e ?? '');
  }
}

function isUserRejected(e: any): boolean {
  const code = extractErrorCode(e);
  const msg = extractErrorMessage(e);
  return String(code) === '4001' || /user rejected|rejected the request/i.test(msg);
}

export async function requestWalletAddress(chain: Chain): Promise<`0x${string}`> {
  const wallet = makeWalletClient(chain);

  // Connect first. Some wallets behave better if the dapp is already connected before switching networks.
  let addr: `0x${string}` | undefined;
  try {
    const addrs = await wallet.requestAddresses();
    addr = addrs?.[0];
  } catch (e: any) {
    if (isUserRejected(e)) {
      throw new Error('Wallet connection was rejected. Please approve the wallet connection prompt and retry.');
    }
    throw new Error(`Wallet connection failed. ${extractErrorMessage(e)}`);
  }

  if (!addr) throw new Error('No wallet address returned.');

  const currentChainId = await wallet.getChainId();
  if (currentChainId !== chain.id) {
    const rpcUrl = resolveRpcUrl(chain);
    const manualHint = rpcUrl
      ? `In MetaMask, add/switch to "${chain.name}" (chainId ${chain.id}) with RPC URL ${rpcUrl}.`
      : `Switch networks in your wallet to chainId ${chain.id}.`;

    try {
      await wallet.switchChain({ id: chain.id });
    } catch (e1: any) {
      if (isUserRejected(e1)) {
        throw new Error(
          `Wrong network. Wallet is on chainId ${currentChainId} but this app's primary deployment is chainId ${chain.id}. ` +
            `You rejected the network switch request. Please approve it and retry.`
        );
      }

      // Many wallets don't reliably surface the "unknown chain" code/message.
      // Try add+switch as a best-effort fallback.
      try {
        await wallet.addChain({ chain });
      } catch (eAdd: any) {
        if (isUserRejected(eAdd)) {
          throw new Error(
            `Wrong network. Wallet is on chainId ${currentChainId} but this app's primary deployment is chainId ${chain.id}. ` +
              `You rejected the request to add the network. ${manualHint}`
          );
        }
        // Ignore other addChain errors and still retry switching; the chain may already exist.
      }

      try {
        await wallet.switchChain({ id: chain.id });
      } catch (e2: any) {
        throw new Error(
          `Wrong network. Wallet is on chainId ${currentChainId} but this app's primary deployment is chainId ${chain.id}. ` +
            `Automatic network switch failed. ${manualHint} (${extractErrorMessage(e2)})`
        );
      }
    }
  }

  return addr;
}
