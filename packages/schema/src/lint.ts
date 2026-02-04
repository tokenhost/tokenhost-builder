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
    for (const [k, index] of c.indexes.index.entries()) {
      if (!fieldsByName.has(index.field)) {
        issues.push(err(`${cPath}/indexes/index/${k}/field`, 'lint.indexes.index_unknown', `Query index references unknown field "${index.field}".`));
      }
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

