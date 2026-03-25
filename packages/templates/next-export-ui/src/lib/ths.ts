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

export interface ThsFieldUi {
  component?: 'default' | 'externalLink';
  label?: string;
  target?: '_blank' | '_self';
  [key: string]: unknown;
}

export interface ThsField {
  name: string;
  type: FieldType;
  required?: boolean;
  decimals?: number;
  default?: unknown;
  validation?: Record<string, unknown>;
  ui?: ThsFieldUi;
}

export interface PaymentRule {
  asset?: 'native';
  amountWei: string;
}

export interface ThsRelation {
  field: string;
  to: string;
  enforce?: boolean;
  mustOwn?: boolean;
  reverseIndex?: boolean;
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
  relations?: ThsRelation[];
  indexes?: Record<string, unknown>;
  ui?: Record<string, unknown>;
}

export interface ThsSchema {
  thsVersion: string;
  schemaVersion: string;
  app: {
    name: string;
    slug: string;
    brand?: {
      primaryText?: string;
      accentText?: string;
    };
    primaryCollection?: string;
    features?: Record<string, unknown>;
    ui?: {
      homePage?: {
        mode?: 'generated' | 'custom';
      };
      extensions?: {
        directory?: string;
      };
      generated?: {
        feeds?: Array<{
          id: string;
          collection: string;
          limit?: number;
          card?: {
            referenceField?: string;
            textField?: string;
            mediaField?: string;
          };
        }>;
        tokenPages?: Array<{
          id: string;
          collection: string;
          field: string;
          tokenizer: 'hashtag';
          feed?: string;
          limit?: number;
          title?: string;
          emptyTitle?: string;
          emptyBody?: string;
        }>;
        homeSections?: Array<
          | {
              type: 'hero';
              eyebrow?: string;
              title: string;
              accent?: string;
              description?: string;
              badges?: string[];
              actions?: Array<{ label: string; href: string; variant?: 'default' | 'primary' }>;
            }
          | {
              type: 'feed';
              feed: string;
              title: string;
              emptyTitle?: string;
              emptyBody?: string;
            }
          | {
              type: 'tokenList';
              tokenPage: string;
              title: string;
              emptyBody?: string;
            }
        >;
      };
    };
  };
  collections: ThsCollection[];
  metadata?: Record<string, unknown>;
}

export const ths = thsConst as unknown as ThsSchema;

export function getCollection(name: string): ThsCollection | null {
  return (ths.collections as any[]).find((c) => c && c.name === name) ?? null;
}

export function primaryCollection(): ThsCollection | null {
  const configured = typeof ths.app.primaryCollection === 'string' ? ths.app.primaryCollection.trim() : '';
  if (configured) return getCollection(configured);
  return (ths.collections as any[])[0] ?? null;
}

export function getField(collection: ThsCollection, fieldName: string): ThsField | null {
  return (collection.fields as any[]).find((f) => f && f.name === fieldName) ?? null;
}

export function getRelationForField(collection: ThsCollection, fieldName: string): ThsRelation | null {
  const relations = Array.isArray(collection.relations) ? collection.relations : [];
  return relations.find((relation) => relation && relation.field === fieldName) ?? null;
}

export function getRelatedCollection(collection: ThsCollection, fieldName: string): ThsCollection | null {
  const relation = getRelationForField(collection, fieldName);
  if (!relation?.to) return null;
  return getCollection(relation.to);
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

export function fieldLinkUi(field: ThsField): { label: string | null; target: '_blank' | '_self' } | null {
  if (field.ui?.component !== 'externalLink') return null;
  return {
    label: typeof field.ui.label === 'string' && field.ui.label.trim() ? field.ui.label : null,
    target: field.ui.target === '_self' ? '_self' : '_blank'
  };
}

export function fieldDisplayName(field: ThsField): string {
  if (typeof field.ui?.label === 'string' && field.ui.label.trim()) return field.ui.label.trim();
  return field.name;
}

export function collectionNavLabel(collection: ThsCollection): string {
  const explicitPlural = typeof collection.plural === 'string' ? collection.plural.trim() : '';
  if (explicitPlural) return explicitPlural;

  const name = String(collection.name ?? '').trim();
  if (!name) return 'Records';
  if (/(s|x|z|sh|ch)$/i.test(name)) return `${name}es`;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}
