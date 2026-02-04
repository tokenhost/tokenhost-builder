import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const canonicalize = require('canonicalize') as (input: unknown) => string | undefined;

export function computeSchemaHash(schema: unknown): string {
  const canon = canonicalize(schema);
  if (typeof canon !== 'string') {
    throw new Error('Failed to canonicalize schema for hashing.');
  }
  const digest = crypto.createHash('sha256').update(canon).digest('hex');
  return `sha256:${digest}`;
}
