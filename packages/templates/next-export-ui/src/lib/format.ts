import { formatEther, formatUnits, parseUnits } from 'viem';

const UTC_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
type DateTimeVariant = 'full' | 'compact' | 'date';

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

function parseNumericDate(value: number): Date | null {
  if (!Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1e12) return new Date(value);
  if (abs >= 1e9) return new Date(value * 1000);
  return null;
}

function parseDateLike(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    return parseNumericDate(value);
  }

  if (typeof value === 'bigint') {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parseNumericDate(parsed) : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
      return parseNumericDate(Number(trimmed));
    }

    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }

  return null;
}

function isDateOnlyString(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function looksLikeIsoDateString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ||
    /^\d{4}-\d{2}-\d{2}[t\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:z|[+-]\d{2}:\d{2})?$/i.test(trimmed);
}

export function formatDateTime(value: unknown, variant: DateTimeVariant = 'full'): string {
  const parsed = parseDateLike(value);
  if (!parsed) {
    return value === null || value === undefined ? '' : String(value);
  }

  const year = parsed.getUTCFullYear();
  const month = UTC_MONTHS[parsed.getUTCMonth()] ?? 'Jan';
  const day = parsed.getUTCDate();
  if (variant === 'date' || isDateOnlyString(value)) {
    return `${month} ${day}, ${year}`;
  }

  const hours = String(parsed.getUTCHours()).padStart(2, '0');
  const minutes = String(parsed.getUTCMinutes()).padStart(2, '0');
  if (variant === 'compact') {
    return `${month} ${day}, ${year} · ${hours}:${minutes} UTC`;
  }

  const seconds = String(parsed.getUTCSeconds()).padStart(2, '0');
  return `${month} ${day}, ${year} · ${hours}:${minutes}:${seconds} UTC`;
}

export function isLikelyDateFieldName(fieldName?: string | null): boolean {
  if (!fieldName) return false;
  return /(?:created|updated|started|ended|opened|closed|published)At$/i.test(fieldName) ||
    /(?:date|time|timestamp)$/i.test(fieldName);
}

export function formatFieldValue(value: any, type: string, decimals?: number, fieldName?: string): string {
  if (isLikelyDateFieldName(fieldName) || (type === 'string' && looksLikeIsoDateString(value))) {
    return formatDateTime(value);
  }
  return formatNumeric(value, type, decimals);
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
