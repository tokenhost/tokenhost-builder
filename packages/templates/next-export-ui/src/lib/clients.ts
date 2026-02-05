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

export async function requestWalletAddress(chain: Chain): Promise<`0x${string}`> {
  const wallet = makeWalletClient(chain);
  const currentChainId = await wallet.getChainId();
  if (currentChainId !== chain.id) {
    try {
      await wallet.switchChain({ id: chain.id });
    } catch (e: any) {
      const code = e?.cause?.code ?? e?.code ?? null;
      const msg = String(e?.shortMessage ?? e?.message ?? e ?? '');

      // MetaMask uses 4902 for "Unrecognized chain" when switching to a chain that hasn't been added.
      const looksUnrecognized =
        String(code) === '4902' ||
        /4902/.test(msg) ||
        /unrecognized chain|unknown chain|not added/i.test(msg);

      if (looksUnrecognized) {
        try {
          // Attempt to add the chain to the wallet, then retry the switch.
          await wallet.addChain({ chain });
          await wallet.switchChain({ id: chain.id });
        } catch (e2: any) {
          const msg2 = String(e2?.shortMessage ?? e2?.message ?? e2 ?? '');
          throw new Error(
            `Wrong network. Wallet is on chainId ${currentChainId} but this app's primary deployment is chainId ${chain.id}. ` +
              `We tried to add/switch the chain automatically but it failed. ` +
              `Add/switch networks in your wallet and retry. ${msg2 ? `(${msg2})` : ''}`
          );
        }
      }

      throw new Error(
        `Wrong network. Wallet is on chainId ${currentChainId} but this app's primary deployment is chainId ${chain.id}. ` +
          `Switch networks in your wallet and retry. ${msg ? `(${msg})` : ''}`
      );
    }
  }
  const addrs = await wallet.requestAddresses();
  const addr = addrs?.[0];
  if (!addr) throw new Error('No wallet address returned.');
  return addr;
}
