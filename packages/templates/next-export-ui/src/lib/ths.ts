import { ths as thsConst } from '../generated/ths';

// Keep UI types schema-agnostic. The generated `ths` const is per-schema and would otherwise
// narrow unions (e.g. a schema without `uint256` fields would make `field.type === 'uint256'`
// a type error during `next build`).
export type FieldType =
  | 'string'
  | 'uint256'
  | 'int256'
  | 'decimal'
  | 'bool'
  | 'address'
  | 'bytes32'
  | 'image'
  | 'reference'
  | 'externalReference';

export type Access = 'public' | 'owner' | 'allowlist' | 'role';

export interface ThsField {
  name: string;
  type: FieldType;
  required?: boolean;
  decimals?: number;
  default?: unknown;
  validation?: Record<string, unknown>;
  ui?: Record<string, unknown>;
}

export interface PaymentRule {
  asset?: 'native';
  amountWei: string;
}

export interface ThsCollection {
  name: string;
  plural?: string;
  fields: ThsField[];
  createRules: {
    required: string[];
    payment?: PaymentRule;
    access: Access;
  };
  updateRules: {
    mutable: string[];
    access: Access;
    optimisticConcurrency?: boolean;
  };
  deleteRules: {
    softDelete: boolean;
    access: Access;
  };
  transferRules?: {
    access: Access;
  };
  relations?: Array<Record<string, unknown>>;
  indexes?: Record<string, unknown>;
  ui?: Record<string, unknown>;
}

export interface ThsSchema {
  thsVersion: string;
  schemaVersion: string;
  app: {
    name: string;
    slug: string;
    features?: Record<string, unknown>;
  };
  collections: ThsCollection[];
  metadata?: Record<string, unknown>;
}

export const ths = thsConst as unknown as ThsSchema;

export function getCollection(name: string): ThsCollection | null {
  return (ths.collections as any[]).find((c) => c && c.name === name) ?? null;
}

export function getField(collection: ThsCollection, fieldName: string): ThsField | null {
  return (collection.fields as any[]).find((f) => f && f.name === fieldName) ?? null;
}

export function displayField(collection: ThsCollection): ThsField | null {
  // Prefer first required field, else first string-like, else first.
  const required = Array.isArray(collection.createRules?.required) ? collection.createRules.required : [];
  for (const r of required) {
    const f = getField(collection, r);
    if (f) return f;
  }
  const stringy = (collection.fields as any[]).find((f) => f && (f.type === 'string' || f.type === 'image'));
  if (stringy) return stringy;
  return (collection.fields as any[])[0] ?? null;
}

export function createFields(collection: ThsCollection): ThsField[] {
  return (collection.fields as any[]) as ThsField[];
}

export function mutableFields(collection: ThsCollection): ThsField[] {
  const mutable = Array.isArray(collection.updateRules?.mutable) ? collection.updateRules.mutable : [];
  return mutable.map((name) => getField(collection, name)).filter(Boolean) as ThsField[];
}

export function requiredFieldNames(collection: ThsCollection): Set<string> {
  const required = Array.isArray(collection.createRules?.required) ? collection.createRules.required : [];
  return new Set(required);
}

export function hasCreatePayment(collection: ThsCollection): { amountWei: string } | null {
  const p = (collection.createRules as any)?.payment;
  if (!p || typeof p.amountWei !== 'string') return null;
  return { amountWei: p.amountWei };
}

export function transferEnabled(collection: ThsCollection): boolean {
  return Boolean((collection as any).transferRules);
}
