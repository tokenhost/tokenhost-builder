import { createPublicClient, createWalletClient, custom, http } from 'viem';
import type { Chain } from 'viem';

export function chainWithRpcOverride(chain: Chain, rpcUrl?: string): Chain {
  if (!rpcUrl) return chain;
  return {
    ...chain,
    rpcUrls: {
      ...chain.rpcUrls,
      default: {
        ...(chain.rpcUrls?.default ?? {}),
        http: [rpcUrl]
      },
      public: {
        ...(chain.rpcUrls?.public ?? chain.rpcUrls?.default ?? {}),
        http: [rpcUrl]
      }
    }
  } as Chain;
}

export function resolveRpcUrl(chain: Chain, override?: string): string | null {
  const resolvedChain = chainWithRpcOverride(chain, override);
  const httpUrls = resolvedChain.rpcUrls?.default?.http;
  if (Array.isArray(httpUrls) && httpUrls.length > 0) return httpUrls[0] ?? null;
  return null;
}

export function makePublicClient(chain: Chain, rpcUrl?: string): any {
  // Prefer explicit HTTP RPC for reads so chain mismatch in the user's wallet
  // doesn't silently read from the wrong network.
  const resolvedChain = chainWithRpcOverride(chain, rpcUrl);
  const url = resolveRpcUrl(resolvedChain);
  if (url) {
    return createPublicClient({
      chain: resolvedChain,
      transport: http(url)
    });
  }

  // Fallback: read through the user's wallet provider.
  const eth = (globalThis as any).ethereum as any;
  if (eth) {
    return createPublicClient({
      chain: resolvedChain,
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

export function makeInjectedPublicClient(chain: Chain): any {
  const eth = (globalThis as any).ethereum as any;
  if (!eth) throw new Error('No injected wallet found (window.ethereum).');

  return createPublicClient({
    chain,
    transport: custom(eth)
  });
}

function getInjectedProvider(): any {
  const eth = (globalThis as any).ethereum as any;
  if (!eth) throw new Error('No injected wallet found (window.ethereum).');
  return eth;
}

function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

function isLocalRpcUrl(rpcUrl: string | null): boolean {
  if (!rpcUrl) return false;
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(rpcUrl);
}

function buildAddEthereumChainParams(chain: Chain): any {
  const rpcUrl = resolveRpcUrl(chain);
  return {
    chainId: toHexChainId(chain.id),
    chainName: chain.name,
    rpcUrls: rpcUrl ? [rpcUrl] : [],
    nativeCurrency: chain.nativeCurrency,
    blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : undefined
  };
}

async function requestProvider(method: string, params?: any[]): Promise<any> {
  const eth = getInjectedProvider();
  return await eth.request(params ? { method, params } : { method });
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

async function refreshWalletChainConfig(chain: Chain, currentChainId: number): Promise<void> {
  const rpcUrl = resolveRpcUrl(chain);
  if (!rpcUrl) return;

  try {
    await requestProvider('wallet_addEthereumChain', [buildAddEthereumChainParams(chain)]);
  } catch (e: any) {
    if (isUserRejected(e)) {
      throw new Error(
        `Wallet network entry for chainId ${chain.id} may still point at a stale RPC URL. ` +
          `Your wallet is currently using chainId ${currentChainId}. Please approve the network update or manually set the RPC URL to ${rpcUrl}.`
      );
    }
    // Some wallets reject duplicate addChain requests or do not support in-place updates.
    // In that case we keep going and rely on the current network config.
  }

  try {
    await requestProvider('wallet_switchEthereumChain', [{ chainId: toHexChainId(chain.id) }]);
  } catch (e: any) {
    if (isUserRejected(e)) {
      throw new Error(
        `Wallet network entry for chainId ${chain.id} may still point at a stale RPC URL. ` +
          `Your wallet is currently using chainId ${currentChainId}. Please approve the network update or manually set the RPC URL to ${rpcUrl}.`
      );
    }
  }
}

async function assertWalletTracksTargetLocalRpc(chain: Chain): Promise<void> {
  const rpcUrl = resolveRpcUrl(chain);
  if (!isLocalRpcUrl(rpcUrl)) return;

  const appReadClient = makePublicClient(chain, rpcUrl || undefined);
  const walletReadClient = makeInjectedPublicClient(chain);

  let appBlockHash = '0x';
  const appBlock = await appReadClient.getBlock({ blockTag: 'latest' });
  appBlockHash = String(appBlock?.hash ?? '0x').toLowerCase();

  for (const delayMs of [0, 250, 750, 1500, 2500]) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const walletBlock = await walletReadClient.getBlock({ blockTag: 'latest' });
    const walletBlockHash = String(walletBlock?.hash ?? '0x').toLowerCase();
    if (walletBlockHash && walletBlockHash !== '0x' && walletBlockHash === appBlockHash) return;
  }

  throw new Error(
    `Wallet network entry for chainId ${chain.id} is still not using the same local RPC as this app. ` +
      `Expected RPC: ${rpcUrl}. Please update the wallet network RPC and retry.`
  );
}

export async function ensureWalletChain(chain: Chain): Promise<void> {
  const wallet = makeWalletClient(chain);
  const currentChainId = await wallet.getChainId();
  const rpcUrl = resolveRpcUrl(chain);
  const manualHint = rpcUrl
    ? `In MetaMask, add/switch to "${chain.name}" (chainId ${chain.id}) with RPC URL ${rpcUrl}.`
    : `Switch networks in your wallet to chainId ${chain.id}.`;

  if (currentChainId === chain.id) {
    await refreshWalletChainConfig(chain, currentChainId);
    await assertWalletTracksTargetLocalRpc(chain);
    return;
  }

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
      await refreshWalletChainConfig(chain, currentChainId);
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

  await assertWalletTracksTargetLocalRpc(chain);
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
  await ensureWalletChain(chain);

  return addr;
}
