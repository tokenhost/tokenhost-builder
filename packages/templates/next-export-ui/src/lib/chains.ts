import { anvil, mainnet, sepolia } from 'viem/chains';
import type { Chain } from 'viem';

export function chainFromId(chainId: number): Chain {
  if (chainId === anvil.id) return anvil;
  if (chainId === sepolia.id) return sepolia;
  if (chainId === mainnet.id) return mainnet;

  // Minimal fallback for unknown chains.
  return {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Native', symbol: 'NATIVE', decimals: 18 },
    rpcUrls: { default: { http: [] } }
  } as const as Chain;
}
