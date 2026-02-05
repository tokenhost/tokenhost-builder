import { formatEther, formatUnits, parseUnits } from 'viem';

export function shortAddress(addr: string, chars = 4): string {
  if (!addr) return '';
  if (addr.length < 2 + chars * 2) return addr;
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export function formatWei(amountWei: string): string {
  try {
    return formatEther(BigInt(amountWei));
  } catch {
    return amountWei;
  }
}

export function formatNumeric(value: any, type: string, decimals?: number): string {
  if (value === null || value === undefined) return '';

  if (type === 'decimal') {
    const d = typeof decimals === 'number' ? decimals : 0;
    try {
      return formatUnits(BigInt(value), d);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export function parseFieldValue(raw: string, type: string, decimals?: number): any {
  if (type === 'bool') {
    return raw === 'true';
  }
  if (type === 'uint256' || type === 'int256' || type === 'reference') {
    return BigInt(raw || '0');
  }
  if (type === 'decimal') {
    const d = typeof decimals === 'number' ? decimals : 0;
    return parseUnits(raw || '0', d);
  }
  // address, bytes32, string, image, externalReference
  return raw;
}
