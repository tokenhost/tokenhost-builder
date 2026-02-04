export type ThsVersion = string;

export interface ThsAppFeatures {
  indexer?: boolean;
  delegation?: boolean;
  uploads?: boolean;
  onChainIndexing?: boolean;
}

export interface ThsApp {
  name: string;
  slug: string;
  description?: string;
  theme?: Record<string, unknown>;
  features?: ThsAppFeatures;
}

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

export interface ThsField {
  name: string;
  type: FieldType;
  required?: boolean;
  decimals?: number;
  default?: unknown;
  validation?: Record<string, unknown>;
  ui?: Record<string, unknown>;
}

export type Access = 'public' | 'owner' | 'allowlist' | 'role';

export interface PaymentRule {
  asset: 'native';
  amountWei: string;
}

export interface CreateRules {
  required: string[];
  auto?: Record<string, string>;
  payment?: PaymentRule;
  access: Access;
}

export interface VisibilityRules {
  gets: string[];
  access: Access;
}

export interface UpdateRules {
  mutable: string[];
  access: Access;
  optimisticConcurrency?: boolean;
}

export interface DeleteRules {
  softDelete: boolean;
  access: Access;
}

export interface TransferRules {
  access: Access;
}

export interface UniqueIndex {
  field: string;
  scope?: 'active' | 'allTime';
}

export interface QueryIndex {
  field: string;
}

export interface Indexes {
  unique: UniqueIndex[];
  index: QueryIndex[];
}

export interface Relation {
  field: string;
  to: string;
  enforce?: boolean;
  reverseIndex?: boolean;
}

export interface Collection {
  name: string;
  plural?: string;
  fields: ThsField[];
  createRules: CreateRules;
  visibilityRules: VisibilityRules;
  updateRules: UpdateRules;
  deleteRules: DeleteRules;
  transferRules?: TransferRules;
  indexes: Indexes;
  relations?: Relation[];
  ui?: Record<string, unknown>;
}

export interface ThsSchema {
  thsVersion: ThsVersion;
  schemaVersion: string;
  app: ThsApp;
  collections: Collection[];
  metadata?: Record<string, unknown>;
}

