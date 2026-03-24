import { keccak256, toBytes, type Hex } from 'viem';

function asciiLower(charCode: number): number {
  if (charCode >= 65 && charCode <= 90) return charCode + 32;
  return charCode;
}

function isHashtagBodyChar(charCode: number): boolean {
  return (
    (charCode >= 48 && charCode <= 57) ||
    (charCode >= 65 && charCode <= 90) ||
    (charCode >= 97 && charCode <= 122) ||
    charCode === 95
  );
}

export function normalizeHashtagToken(raw: string): string | null {
  const input = String(raw ?? '').trim();
  if (!input) return null;

  const body = input.startsWith('#') ? input.slice(1) : input;
  if (!body) return null;

  let normalized = '';
  for (let index = 0; index < body.length; index += 1) {
    const charCode = body.charCodeAt(index);
    if (!isHashtagBodyChar(charCode)) return null;
    normalized += String.fromCharCode(asciiLower(charCode));
  }

  return normalized || null;
}

export function extractHashtagTokens(text: string): string[] {
  const input = String(text ?? '');
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (let index = 0; index < input.length; index += 1) {
    if (input.charCodeAt(index) !== 35) continue;

    let cursor = index + 1;
    let token = '';
    while (cursor < input.length) {
      const charCode = input.charCodeAt(cursor);
      if (!isHashtagBodyChar(charCode)) break;
      token += String.fromCharCode(asciiLower(charCode));
      cursor += 1;
    }

    if (token && !seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }

  return tokens;
}

export function hashtagIndexKey(raw: string): Hex {
  const normalized = normalizeHashtagToken(raw);
  if (!normalized) {
    throw new Error(`Invalid hashtag token: ${raw}`);
  }
  return keccak256(toBytes(normalized));
}
