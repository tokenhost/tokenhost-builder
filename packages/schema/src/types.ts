export type ThsVersion = string;

export interface ThsAppFeatures {
  indexer?: boolean;
  delegation?: boolean;
  uploads?: boolean;
  onChainIndexing?: boolean;
}

export type ThsHomePageMode = 'generated' | 'custom';

export interface ThsAppUiHomePage {
  mode?: ThsHomePageMode;
}

export interface ThsAppUiExtensions {
  directory?: string;
}

export interface ThsGeneratedAction {
  label: string;
  href: string;
  variant?: 'default' | 'primary';
}

export interface ThsGeneratedFeedCard {
  referenceField?: string;
  textField?: string;
  mediaField?: string;
}

export interface ThsGeneratedFeed {
  id: string;
  collection: string;
  limit?: number;
  card?: ThsGeneratedFeedCard;
}

export interface ThsGeneratedTokenPage {
  id: string;
  collection: string;
  field: string;
  tokenizer: 'hashtag';
  feed?: string;
  limit?: number;
  title?: string;
  emptyTitle?: string;
  emptyBody?: string;
}

export interface ThsGeneratedHeroSection {
  type: 'hero';
  eyebrow?: string;
  title: string;
  accent?: string;
  description?: string;
  badges?: string[];
  actions?: ThsGeneratedAction[];
}

export interface ThsGeneratedFeedSection {
  type: 'feed';
  feed: string;
  title: string;
  emptyTitle?: string;
  emptyBody?: string;
}

export interface ThsGeneratedTokenListSection {
  type: 'tokenList';
  tokenPage: string;
  title: string;
  emptyBody?: string;
}

export type ThsGeneratedHomeSection = ThsGeneratedHeroSection | ThsGeneratedFeedSection | ThsGeneratedTokenListSection;

export interface ThsAppUiGenerated {
  feeds?: ThsGeneratedFeed[];
  tokenPages?: ThsGeneratedTokenPage[];
  homeSections?: ThsGeneratedHomeSection[];
}

export interface ThsAppUi {
  homePage?: ThsAppUiHomePage;
  extensions?: ThsAppUiExtensions;
  generated?: ThsAppUiGenerated;
}

export type ThsThemePreset = 'cyber-grid';

export interface ThsAppTheme {
  preset?: ThsThemePreset;
  [key: string]: unknown;
}

export interface ThsApp {
  name: string;
  slug: string;
  description?: string;
  theme?: ThsAppTheme;
  features?: ThsAppFeatures;
  ui?: ThsAppUi;
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
  ui?: {
    component?: 'default' | 'externalLink';
    label?: string;
    target?: '_blank' | '_self';
    [key: string]: unknown;
  };
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

export type QueryIndexMode = 'equality' | 'tokenized';
export type QueryIndexTokenizer = 'hashtag';

export interface QueryIndex {
  field: string;
  mode?: QueryIndexMode;
  tokenizer?: QueryIndexTokenizer;
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
