import type { Issue } from './issues.js';
import type { Collection, ThsField, ThsSchema } from './types.js';

const SYSTEM_FIELDS = new Set([
  'id',
  'createdAt',
  'createdBy',
  'owner',
  'updatedAt',
  'updatedBy',
  'isDeleted',
  'deletedAt',
  'version'
]);

// Not exhaustive, but catches common collisions early.
const RESERVED_SOLIDITY = new Set([
  'address',
  'bool',
  'bytes',
  'bytes32',
  'contract',
  'enum',
  'event',
  'function',
  'import',
  'int',
  'int256',
  'mapping',
  'modifier',
  'pragma',
  'public',
  'private',
  'return',
  'returns',
  'string',
  'struct',
  'uint',
  'uint256'
]);

function err(path: string, code: string, message: string): Issue {
  return { severity: 'error', path, code, message };
}

function warn(path: string, code: string, message: string): Issue {
  return { severity: 'warning', path, code, message };
}

function fieldMap(collection: Collection): Map<string, ThsField> {
  const map = new Map<string, ThsField>();
  for (const f of collection.fields) map.set(f.name, f);
  return map;
}

function queryIndexMode(index: { mode?: string }): 'equality' | 'tokenized' {
  return index.mode === 'tokenized' ? 'tokenized' : 'equality';
}

function isSafeAutoExpr(expr: string): boolean {
  if (expr === 'block.timestamp') return true;
  if (expr === '_msgSender()') return true;
  if (expr === 'msg.sender') return true;
  if (expr === 'tx.origin') return false;
  if (expr === 'true' || expr === 'false') return true;
  if (/^[0-9]+$/.test(expr)) return true;
  if (/^0x[0-9a-fA-F]+$/.test(expr)) return true;
  return false;
}

export function lintThs(schema: ThsSchema): Issue[] {
  const issues: Issue[] = [];
  const themePreset = String(schema.app.theme?.preset ?? '').trim();
  const generatedUi = schema.app.ui?.generated;

  if (themePreset && themePreset !== 'cyber-grid') {
    issues.push(
      err('/app/theme/preset', 'lint.app.theme.unknown_preset', `Unknown theme preset "${themePreset}". Supported presets: cyber-grid.`)
    );
  }

  if (schema.app.ui?.homePage?.mode === 'custom' && !String(schema.app.ui?.extensions?.directory ?? '').trim()) {
    issues.push(
      warn(
        '/app/ui/extensions/directory',
        'lint.app.ui.custom_home_without_extensions',
        'app.ui.homePage.mode is "custom" but no app.ui.extensions.directory is configured.'
      )
    );
  }

  const generatedFeedIds = new Set<string>();
  const generatedFeeds = Array.isArray(generatedUi?.feeds) ? generatedUi.feeds : [];
  for (const [index, feed] of generatedFeeds.entries()) {
    const feedPath = `/app/ui/generated/feeds/${index}`;
    if (generatedFeedIds.has(feed.id)) {
      issues.push(err(`${feedPath}/id`, 'lint.app.ui.generated.feed_duplicate', `Duplicate generated feed id "${feed.id}".`));
    }
    generatedFeedIds.add(feed.id);
    const collection = schema.collections.find((candidate) => candidate.name === feed.collection);
    if (!collection) {
      issues.push(err(`${feedPath}/collection`, 'lint.app.ui.generated.feed_unknown_collection', `Generated feed references unknown collection "${feed.collection}".`));
      continue;
    }
    const fields = fieldMap(collection);
    for (const key of ['referenceField', 'textField', 'mediaField'] as const) {
      const value = feed.card?.[key];
      if (value && !fields.has(value)) {
        issues.push(err(`${feedPath}/card/${key}`, 'lint.app.ui.generated.feed_unknown_field', `Generated feed card references unknown field "${value}".`));
      }
    }
  }

  const generatedTokenPageIds = new Set<string>();
  const generatedTokenPages = Array.isArray(generatedUi?.tokenPages) ? generatedUi.tokenPages : [];
  for (const [index, tokenPage] of generatedTokenPages.entries()) {
    const tokenPath = `/app/ui/generated/tokenPages/${index}`;
    if (generatedTokenPageIds.has(tokenPage.id)) {
      issues.push(err(`${tokenPath}/id`, 'lint.app.ui.generated.token_duplicate', `Duplicate generated token page id "${tokenPage.id}".`));
    }
    generatedTokenPageIds.add(tokenPage.id);
    const collection = schema.collections.find((candidate) => candidate.name === tokenPage.collection);
    if (!collection) {
      issues.push(err(`${tokenPath}/collection`, 'lint.app.ui.generated.token_unknown_collection', `Generated token page references unknown collection "${tokenPage.collection}".`));
      continue;
    }
    const field = fieldMap(collection).get(tokenPage.field);
    if (!field) {
      issues.push(err(`${tokenPath}/field`, 'lint.app.ui.generated.token_unknown_field', `Generated token page references unknown field "${tokenPage.field}".`));
      continue;
    }
    if (field.type !== 'string') {
      issues.push(err(`${tokenPath}/field`, 'lint.app.ui.generated.token_field_type', `Generated token page field "${tokenPage.field}" must be type "string".`));
    }
    if (tokenPage.feed && !generatedFeedIds.has(tokenPage.feed)) {
      issues.push(err(`${tokenPath}/feed`, 'lint.app.ui.generated.token_unknown_feed', `Generated token page references unknown generated feed "${tokenPage.feed}".`));
    }
  }

  const homeSections = Array.isArray(generatedUi?.homeSections) ? generatedUi.homeSections : [];
  for (const [index, section] of homeSections.entries()) {
    const sectionPath = `/app/ui/generated/homeSections/${index}`;
    if (section.type === 'feed' && !generatedFeedIds.has(section.feed)) {
      issues.push(err(`${sectionPath}/feed`, 'lint.app.ui.generated.section_unknown_feed', `Generated home section references unknown feed "${section.feed}".`));
    }
    if (section.type === 'tokenList' && !generatedTokenPageIds.has(section.tokenPage)) {
      issues.push(err(`${sectionPath}/tokenPage`, 'lint.app.ui.generated.section_unknown_token_page', `Generated home section references unknown token page "${section.tokenPage}".`));
    }
  }

  const collectionNames = new Set<string>();
  for (let i = 0; i < schema.collections.length; i++) {
    const c = schema.collections[i]!;
    const cPath = `/collections/${i}`;

    if (collectionNames.has(c.name)) {
      issues.push(err(`${cPath}/name`, 'lint.collection.duplicate', `Duplicate collection name "${c.name}".`));
    }
    collectionNames.add(c.name);

    const fieldsByName = fieldMap(c);
    const seenFields = new Set<string>();
    for (let j = 0; j < c.fields.length; j++) {
      const f = c.fields[j]!;
      const fPath = `${cPath}/fields/${j}`;

      if (seenFields.has(f.name)) {
        issues.push(err(`${fPath}/name`, 'lint.field.duplicate', `Duplicate field name "${f.name}".`));
      }
      seenFields.add(f.name);

      if (SYSTEM_FIELDS.has(f.name)) {
        issues.push(err(`${fPath}/name`, 'lint.field.reserved_system', `Field name "${f.name}" is reserved as a system field.`));
      }
      if (RESERVED_SOLIDITY.has(f.name)) {
        issues.push(err(`${fPath}/name`, 'lint.field.reserved_solidity', `Field name "${f.name}" is reserved in Solidity.`));
      }

      if (f.type === 'decimal') {
        if (typeof f.decimals !== 'number') {
          issues.push(err(`${fPath}/decimals`, 'lint.field.decimal_missing', 'Decimal fields must define "decimals".'));
        } else if (f.decimals < 0 || f.decimals > 18) {
          issues.push(err(`${fPath}/decimals`, 'lint.field.decimal_range', '"decimals" must be in the range 0..18.'));
        }
      }

      if (f.ui?.component === 'externalLink' && !['string', 'image', 'externalReference'].includes(f.type)) {
        issues.push(
          warn(
            `${fPath}/ui/component`,
            'lint.field.ui.external_link_type',
            `Field "${f.name}" uses ui.component="externalLink" but has type "${f.type}". Link rendering is usually intended for string/image/externalReference fields.`
          )
        );
      }
    }

    // createRules.required
    for (const name of c.createRules.required) {
      if (!fieldsByName.has(name)) {
        issues.push(err(`${cPath}/createRules/required`, 'lint.createRules.required_unknown', `createRules.required references unknown field "${name}".`));
      }
    }

    // visibilityRules.gets
    for (const name of c.visibilityRules.gets) {
      if (!fieldsByName.has(name) && !SYSTEM_FIELDS.has(name)) {
        issues.push(err(`${cPath}/visibilityRules/gets`, 'lint.visibilityRules.gets_unknown', `visibilityRules.gets references unknown field "${name}".`));
      }
    }

    // updateRules.mutable
    for (const name of c.updateRules.mutable) {
      if (!fieldsByName.has(name)) {
        issues.push(err(`${cPath}/updateRules/mutable`, 'lint.updateRules.mutable_unknown', `updateRules.mutable references unknown field "${name}".`));
      }
    }

    // indexes.unique + indexes.index
    for (const [k, index] of c.indexes.unique.entries()) {
      if (!fieldsByName.has(index.field)) {
        issues.push(err(`${cPath}/indexes/unique/${k}/field`, 'lint.indexes.unique_unknown', `Unique index references unknown field "${index.field}".`));
      }
    }
    const seenQueryIndexFields = new Set<string>();
    for (const [k, index] of c.indexes.index.entries()) {
      const f = fieldsByName.get(index.field);
      if (!f) {
        issues.push(err(`${cPath}/indexes/index/${k}/field`, 'lint.indexes.index_unknown', `Query index references unknown field "${index.field}".`));
        continue;
      }
      if (seenQueryIndexFields.has(index.field)) {
        issues.push(
          err(
            `${cPath}/indexes/index/${k}/field`,
            'lint.indexes.index_duplicate_field',
            `Duplicate query index for field "${index.field}" is not supported.`
          )
        );
      }
      seenQueryIndexFields.add(index.field);

      const mode = queryIndexMode(index);
      if (mode === 'tokenized') {
        if (f.type !== 'string') {
          issues.push(
            err(
              `${cPath}/indexes/index/${k}/field`,
              'lint.indexes.index_tokenized_unsupported_type',
              `Tokenized query index on field "${index.field}" requires type "string"; got "${f.type}".`
            )
          );
        }
        if (index.tokenizer !== 'hashtag') {
          issues.push(
            err(
              `${cPath}/indexes/index/${k}/tokenizer`,
              'lint.indexes.index_tokenized_missing_tokenizer',
              'Tokenized query indexes currently require tokenizer="hashtag".'
            )
          );
        }
      } else if (index.tokenizer !== undefined) {
        issues.push(
          err(
            `${cPath}/indexes/index/${k}/tokenizer`,
            'lint.indexes.index_tokenizer_without_tokenized_mode',
            'query index tokenizer is only valid when mode="tokenized".'
          )
        );
      }
    }

    if ((schema.app.features?.onChainIndexing ?? true) === false && c.indexes.index.length > 0) {
      issues.push(
        warn(
          `${cPath}/indexes/index`,
          'lint.indexes.index_ignored_when_onchain_disabled',
          'app.features.onChainIndexing is false; query indexes will be omitted from generated contracts and on-chain browsing will require fallback behavior.'
        )
      );
    }

    // relations
    const relationFields = new Set<string>();
    if (c.relations) {
      for (let r = 0; r < c.relations.length; r++) {
        const rel = c.relations[r]!;
        const rPath = `${cPath}/relations/${r}`;
        relationFields.add(rel.field);

        const f = fieldsByName.get(rel.field);
        if (!f) {
          issues.push(err(`${rPath}/field`, 'lint.relations.field_unknown', `Relation references unknown field "${rel.field}".`));
          continue;
        }
        if (f.type !== 'reference') {
          issues.push(err(`${rPath}/field`, 'lint.relations.field_not_reference', `Relation field "${rel.field}" must have type "reference".`));
        }
        if (!collectionNames.has(rel.to) && !schema.collections.some((x) => x.name === rel.to)) {
          issues.push(err(`${rPath}/to`, 'lint.relations.to_unknown', `Relation target collection "${rel.to}" does not exist.`));
        }
      }
    }

    // Require relation metadata for reference fields (otherwise "to" is unknown).
    for (const [name, f] of fieldsByName.entries()) {
      if (f.type === 'reference' && !relationFields.has(name)) {
        issues.push(err(`${cPath}/relations`, 'lint.relations.missing', `Reference field "${name}" must have a matching relations[] entry to define its target collection.`));
      }
    }

    // createRules.auto expression linting
    if (c.createRules.auto) {
      for (const [fieldName, expr] of Object.entries(c.createRules.auto)) {
        const aPath = `${cPath}/createRules/auto/${fieldName}`;
        if (!fieldsByName.has(fieldName) && !SYSTEM_FIELDS.has(fieldName)) {
          issues.push(err(aPath, 'lint.createRules.auto_unknown_field', `createRules.auto sets unknown field "${fieldName}".`));
        }
        if (expr === 'tx.origin') {
          issues.push(err(aPath, 'lint.createRules.auto_tx_origin', 'tx.origin is not allowed. Use _msgSender().'));
        } else if (!isSafeAutoExpr(expr)) {
          issues.push(err(aPath, 'lint.createRules.auto_unsafe_expr', `Unsupported auto expression "${expr}".`));
        }
      }
    }

    // Warn if visibilityRules implies privacy.
    if (c.visibilityRules.access !== 'public') {
      issues.push(
        warn(
          `${cPath}/visibilityRules/access`,
          'lint.visibilityRules.not_confidential',
          'visibilityRules do not provide confidentiality for on-chain data; ensure UI copy is clear.'
        )
      );
    }
  }

  // Root-level safety checks
  if (schema.app.slug.length > 63) {
    issues.push(warn('/app/slug', 'lint.app.slug_length', 'App slug is unusually long; consider shortening for domains/URLs.'));
  }

  return issues;
}
