import { ths } from '../generated/ths';

export type ThsCollection = (typeof ths.collections)[number];
export type ThsField = ThsCollection['fields'][number];

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
