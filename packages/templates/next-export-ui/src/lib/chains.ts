import { anvil, mainnet, sepolia } from 'viem/chains';
import type { Chain } from 'viem';

const FILECOIN_CALIBRATION_CHAIN_ID = 314159;
const FILECOIN_MAINNET_CHAIN_ID = 314;
const filecoinCalibration = {
  id: FILECOIN_CALIBRATION_CHAIN_ID,
  name: 'Filecoin Calibration',
  nativeCurrency: { name: 'tFIL', symbol: 'tFIL', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://api.calibration.node.glif.io/rpc/v1']
    }
  },
  blockExplorers: {
    default: {
      name: 'Filfox',
      url: 'https://calibration.filfox.info/en'
    }
  }
} as const satisfies Chain;

const filecoinMainnet = {
  id: FILECOIN_MAINNET_CHAIN_ID,
  name: 'Filecoin',
  nativeCurrency: { name: 'FIL', symbol: 'FIL', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://api.node.glif.io']
    }
  },
  blockExplorers: {
    default: {
      name: 'Filfox',
      url: 'https://filfox.info/en'
    }
  }
} as const satisfies Chain;

export function chainFromId(chainId: number): Chain {
  if (chainId === anvil.id) return anvil;
  if (chainId === sepolia.id) return sepolia;
  if (chainId === mainnet.id) return mainnet;
  if (chainId === FILECOIN_CALIBRATION_CHAIN_ID) return filecoinCalibration;
  if (chainId === FILECOIN_MAINNET_CHAIN_ID) return filecoinMainnet;

  // Minimal fallback for unknown chains.
  return {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Native', symbol: 'NATIVE', decimals: 18 },
    rpcUrls: { default: { http: [] } }
  } as const as Chain;
}

export function explorerTxUrl(chainId: number, hash: string): string | null {
  if (!hash) return null;
  if (chainId === sepolia.id) return `https://sepolia.etherscan.io/tx/${hash}`;
  if (chainId === mainnet.id) return `https://etherscan.io/tx/${hash}`;
  if (chainId === FILECOIN_CALIBRATION_CHAIN_ID) return `https://calibration.filfox.info/en/message/${hash}`;
  if (chainId === FILECOIN_MAINNET_CHAIN_ID) return `https://filfox.info/en/message/${hash}`;
  return null;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  if (!address) return null;
  if (chainId === sepolia.id) return `https://sepolia.etherscan.io/address/${address}`;
  if (chainId === mainnet.id) return `https://etherscan.io/address/${address}`;
  if (chainId === FILECOIN_CALIBRATION_CHAIN_ID) return `https://calibration.filfox.info/en/address/${address}`;
  if (chainId === FILECOIN_MAINNET_CHAIN_ID) return `https://filfox.info/en/address/${address}`;
  return null;
}
