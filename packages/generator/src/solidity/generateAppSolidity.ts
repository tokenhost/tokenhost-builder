import type { Access, Collection, FieldType, Relation, ThsField, ThsSchema, UniqueIndex } from '@tokenhost/schema';
import { computeSchemaHash } from '@tokenhost/schema';

type SolidityType = 'string' | 'uint256' | 'int256' | 'bool' | 'address' | 'bytes32';

function solidityStorageType(t: FieldType): SolidityType {
  switch (t) {
    case 'string':
    case 'image':
      return 'string';
    case 'uint256':
    case 'decimal':
    case 'reference':
      return 'uint256';
    case 'int256':
      return 'int256';
    case 'bool':
      return 'bool';
    case 'address':
    case 'externalReference':
      return 'address';
    case 'bytes32':
      return 'bytes32';
    default:
      // Exhaustiveness guard
      return 'string';
  }
}

function solidityParamType(t: FieldType): string {
  const st = solidityStorageType(t);
  if (st === 'string') return 'string calldata';
  return st;
}

function pascalToVar(name: string): string {
  return name.length === 0 ? name : name[0]!.toLowerCase() + name.slice(1);
}

function isOwnerAccess(access: Access): boolean {
  return access === 'owner';
}

function hasPaidCreates(collection: Collection): boolean {
  return Boolean(collection.createRules.payment);
}

function uniqueScope(index: UniqueIndex): 'active' | 'allTime' {
  return index.scope ?? 'active';
}

class W {
  private lines: string[] = [];
  private indent = 0;

  line(s = '') {
    this.lines.push(`${'  '.repeat(this.indent)}${s}`);
  }

  block(header: string, body: () => void) {
    this.line(`${header} {`);
    this.indent++;
    body();
    this.indent--;
    this.line('}');
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

type RelationIndex = {
  rel: Relation;
  from: Collection;
  fromField: ThsField;
};

function buildRelationIndexes(schema: ThsSchema): RelationIndex[] {
  const byName = new Map(schema.collections.map((c) => [c.name, c]));
  const out: RelationIndex[] = [];

  for (const c of schema.collections) {
    if (!c.relations) continue;
    const fields = new Map(c.fields.map((f) => [f.name, f]));
    for (const rel of c.relations) {
      const fromField = fields.get(rel.field);
      const to = byName.get(rel.to);
      if (!fromField || !to) continue;
      out.push({ rel, from: c, fromField });
    }
  }
  return out;
}

function bytes32FromSha256(schemaHash: string): string {
  // schemaHash format: sha256:<hex>
  const m = /^sha256:([0-9a-f]{64})$/.exec(schemaHash);
  if (!m) throw new Error(`Invalid schemaHash: ${schemaHash}`);
  return `0x${m[1]}`;
}

function recordHashFnName(collectionName: string): string {
  return `_hashRecord${collectionName}`;
}

export function generateAppSolidity(schema: ThsSchema): { path: string; contents: string } {
  const w = new W();

  const schemaHash = computeSchemaHash(schema);
  const schemaHashBytes32 = bytes32FromSha256(schemaHash);

  const onChainIndexing = schema.app.features?.onChainIndexing ?? true;
  const anyPaidCreates = schema.collections.some(hasPaidCreates);

  w.line('// SPDX-License-Identifier: UNLICENSED');
  w.line('pragma solidity ^0.8.24;');
  w.line();

  // Minimal OpenZeppelin Context compatible shim for _msgSender().
  w.block('abstract contract Context', () => {
    w.block('function _msgSender() internal view virtual returns (address)', () => {
      w.line('return msg.sender;');
    });
    w.block('function _msgData() internal view virtual returns (bytes calldata)', () => {
      w.line('return msg.data;');
    });
  });
  w.line();

  w.block('contract App is Context', () => {
    // ---- Metadata ----
    w.line(`string public constant THS_VERSION = "${schema.thsVersion}";`);
    w.line(`string public constant SCHEMA_VERSION = "${schema.schemaVersion}";`);
    w.line(`string public constant APP_SLUG = "${schema.app.slug}";`);
    w.line(`bytes32 public constant SCHEMA_HASH = bytes32(${schemaHashBytes32});`);
    w.line();

    w.line(`bool public constant ON_CHAIN_INDEXING = ${onChainIndexing ? 'true' : 'false'};`);
    w.line('uint256 public constant MAX_LIST_LIMIT = 50;');
    w.line('uint256 public constant MAX_SCAN_STEPS = 1000;');
    w.line('uint256 public constant MAX_MULTICALL_CALLS = 20;');
    w.line();

    // Errors
    w.line('error Unauthorized();');
    w.line('error RecordNotFound();');
    w.line('error RecordIsDeleted();');
    w.line('error InvalidLimit();');
    w.line('error UniqueViolation();');
    w.line('error InvalidPayment(uint256 expected, uint256 got);');
    w.line('error TransferDisabled();');
    w.line('error InvalidRecipient();');
    w.line('error VersionMismatch(uint256 expected, uint256 got);');
    w.line();

    // Events (SPEC 7.9)
    w.line('event RecordCreated(bytes32 indexed collectionId, uint256 indexed recordId, address indexed actor, uint256 timestamp, bytes32 dataHash);');
    w.line('event RecordUpdated(bytes32 indexed collectionId, uint256 indexed recordId, address indexed actor, uint256 timestamp, bytes32 changedFieldsHash);');
    w.line('event RecordDeleted(bytes32 indexed collectionId, uint256 indexed recordId, address indexed actor, uint256 timestamp, bool isHardDelete);');
    w.line('event RecordTransferred(bytes32 indexed collectionId, uint256 indexed recordId, address indexed fromOwner, address toOwner, address actor, uint256 timestamp);');
    w.line();

    // Admin/treasury only if there are paid creates
    if (anyPaidCreates) {
      w.line('address public immutable adminAddress;');
      w.line('address public immutable treasuryAddress;');
      w.line();
      w.block('modifier onlyAdmin()', () => {
        w.line('if (_msgSender() != adminAddress) revert Unauthorized();');
        w.line('_;');
      });
      w.line();
    }

    // Collections list
    w.line('string[] public collectionNames;');
    w.line('bytes32[] public collectionIds;');
    w.line();

    // Constructor
    if (anyPaidCreates) {
      w.block('constructor(address _adminAddress, address _treasuryAddress)', () => {
        w.line('adminAddress = _adminAddress;');
        w.line('treasuryAddress = _treasuryAddress;');
        for (const c of schema.collections) {
          w.line(`collectionNames.push("${c.name}");`);
          w.line(`collectionIds.push(keccak256(bytes("${c.name}")));`);
        }
      });
    } else {
      w.block('constructor()', () => {
        for (const c of schema.collections) {
          w.line(`collectionNames.push("${c.name}");`);
          w.line(`collectionIds.push(keccak256(bytes("${c.name}")));`);
        }
      });
    }
    w.line();

    if (anyPaidCreates) {
      w.block('receive() external payable', () => {
        // allow receiving native currency
      });
      w.line();
      w.block('function withdraw(uint256 amountWei) external onlyAdmin', () => {
        w.line('if (amountWei > address(this).balance) revert InvalidPayment(address(this).balance, amountWei);');
        w.line('(bool ok, ) = payable(treasuryAddress).call{value: amountWei}("");');
        w.line('require(ok, "withdraw failed");');
      });
      w.line();
    }

    // multicall (SPEC 7.11)
    w.block('function multicall(bytes[] calldata calls) external returns (bytes[] memory results)', () => {
      w.line('if (calls.length > MAX_MULTICALL_CALLS) revert InvalidLimit();');
      w.line('results = new bytes[](calls.length);');
      w.block('for (uint256 i = 0; i < calls.length; i++)', () => {
        w.line('(bool ok, bytes memory res) = address(this).delegatecall(calls[i]);');
        w.block('if (!ok)', () => {
          // bubble up revert data (best-effort)
          w.block('assembly', () => {
            w.line('revert(add(res, 32), mload(res))');
          });
        });
        w.line('results[i] = res;');
      });
    });
    w.line();

    const relationIndexes = buildRelationIndexes(schema);

    // ---- Per-collection storage + methods ----
    for (const c of schema.collections) {
      const C = c.name;
      const cVar = pascalToVar(C);
      const record = `Record${C}`;
      const collectionIdExpr = `keccak256(bytes("${C}"))`;

      w.line(`// ===== Collection: ${C} =====`);
      w.line(`bytes32 public constant COLLECTION_ID_${C} = ${collectionIdExpr};`);
      w.line();

      // Record struct
      w.block(`struct ${record}`, () => {
        w.line('uint256 id;');
        w.line('uint256 createdAt;');
        w.line('address createdBy;');
        w.line('address owner;');
        w.line('uint256 updatedAt;');
        w.line('address updatedBy;');
        w.line('bool isDeleted;');
        w.line('uint256 deletedAt;');
        w.line('uint256 version;');
        for (const f of c.fields) {
          w.line(`${solidityStorageType(f.type)} ${f.name};`);
        }
      });
      w.line();

      // Record hashing helper (used for event integrity without stack-too-deep risk).
      // Note: this uses ABI encoding of the full record tuple; callers can recompute
      // from decoded record values.
      w.block(`function ${recordHashFnName(C)}(${record} memory r) internal pure returns (bytes32)`, () => {
        w.line(`return keccak256(abi.encode(COLLECTION_ID_${C}, r));`);
      });
      w.line();

      w.line(`mapping(uint256 => ${record}) private ${cVar}Records;`);
      w.line(`uint256 public nextId${C} = 1;`);
      w.line(`uint256 public activeCount${C} = 0;`);
      w.line();

      // Unique mappings
      for (const u of c.indexes.unique) {
        w.line(`mapping(bytes32 => uint256) private unique_${C}_${u.field};`);
      }
      if (c.indexes.unique.length > 0) w.line();

      // Reverse reference indexes (append-only)
      if (onChainIndexing) {
        const rels = relationIndexes.filter((r) => r.from.name === C && r.rel.reverseIndex);
        for (const r of rels) {
          w.line(`mapping(uint256 => uint256[]) private refIndex_${C}_${r.rel.field};`);
        }
        if (rels.length > 0) w.line();
      }

      // exists / getCount
      w.block(`function exists${C}(uint256 id) public view returns (bool)`, () => {
        w.line(`${record} storage r = ${cVar}Records[id];`);
        w.line('if (r.createdBy == address(0)) return false;');
        w.line('if (r.isDeleted) return false;');
        w.line('return true;');
      });
      w.line();

      w.block(`function getCount${C}(bool includeDeleted) external view returns (uint256)`, () => {
        w.line('if (includeDeleted) {');
        w.line(`  return nextId${C} - 1;`);
        w.line('}');
        w.line(`return activeCount${C};`);
      });
      w.line();

      // get
      w.block(`function get${C}(uint256 id, bool includeDeleted) public view returns (${record} memory)`, () => {
        w.line(`${record} storage r = ${cVar}Records[id];`);
        w.line('if (r.createdBy == address(0)) revert RecordNotFound();');
        w.line('if (!includeDeleted && r.isDeleted) revert RecordIsDeleted();');
        w.line('return r;');
      });
      w.line();

      w.block(`function get${C}(uint256 id) external view returns (${record} memory)`, () => {
        w.line(`return get${C}(id, false);`);
      });
      w.line();

      // listIds
      w.block(
        `function listIds${C}(uint256 cursorIdExclusive, uint256 limit, bool includeDeleted) external view returns (uint256[] memory)`,
        () => {
          w.line('if (limit > MAX_LIST_LIMIT) revert InvalidLimit();');
          w.line(`uint256 cursor = cursorIdExclusive;`);
          w.line(`uint256 nextId = nextId${C};`);
          w.line('if (cursor == 0 || cursor > nextId) {');
          w.line('  cursor = nextId;');
          w.line('}');
          w.line('uint256[] memory tmp = new uint256[](limit);');
          w.line('uint256 found = 0;');
          w.line('uint256 steps = 0;');
          w.line('uint256 id = cursor;');
          w.block('while (id > 1 && found < limit && steps < MAX_SCAN_STEPS)', () => {
            w.line('id--;');
            w.line('steps++;');
            w.line(`${record} storage r = ${cVar}Records[id];`);
            w.line('if (r.createdBy == address(0)) { continue; }');
            w.line('if (!includeDeleted && r.isDeleted) { continue; }');
            w.line('tmp[found] = id;');
            w.line('found++;');
          });
          w.line('uint256[] memory out = new uint256[](found);');
          w.block('for (uint256 i = 0; i < found; i++)', () => {
            w.line('out[i] = tmp[i];');
          });
          w.line('return out;');
        }
      );
      w.line();

      // Reverse reference accessor(s)
      if (onChainIndexing && c.relations) {
        for (const rel of c.relations.filter((r) => r.reverseIndex)) {
          w.block(
            `function listByRef${C}_${rel.field}(uint256 refId, uint256 offset, uint256 limit) external view returns (uint256[] memory)`,
            () => {
              w.line('if (limit > MAX_LIST_LIMIT) revert InvalidLimit();');
              w.line(`uint256[] storage bucket = refIndex_${C}_${rel.field}[refId];`);
              w.line('if (offset >= bucket.length) {');
              w.line('  return new uint256[](0);');
              w.line('}');
              w.line('uint256 end = offset + limit;');
              w.line('if (end > bucket.length) end = bucket.length;');
              w.line('uint256 outLen = end - offset;');
              w.line('uint256[] memory out = new uint256[](outLen);');
              w.block('for (uint256 i = 0; i < outLen; i++)', () => {
                w.line('out[i] = bucket[offset + i];');
              });
              w.line('return out;');
            }
          );
          w.line();
        }
      }

      // create
      const createFnName = `create${C}`;
      const createParams = c.fields.map((f) => `${solidityParamType(f.type)} ${f.name}`).join(', ');
      const payable = hasPaidCreates(c) ? ' payable' : '';
      w.block(`function ${createFnName}(${createParams}) external${payable} returns (uint256)`, () => {
        // access control (v1: public/owner only)
        if (c.createRules.access !== 'public' && c.createRules.access !== 'owner') {
          w.line('revert Unauthorized(); // access mode not implemented in this generator version');
        }

        if (hasPaidCreates(c)) {
          const expected = c.createRules.payment!.amountWei;
          w.line(`if (msg.value != ${expected}) revert InvalidPayment(${expected}, msg.value);`);
        }

        // Required field checks (basic representable checks)
        for (const req of c.createRules.required) {
          const f = c.fields.find((x) => x.name === req);
          if (!f) continue;
          const st = solidityStorageType(f.type);
          if (st === 'string') {
            w.line(`if (bytes(${req}).length == 0) revert Unauthorized(); // required field empty`);
          } else if (st === 'address') {
            w.line(`if (${req} == address(0)) revert Unauthorized(); // required field empty`);
          }
        }

        // relation enforcement
        if (c.relations) {
          for (const rel of c.relations.filter((r) => r.enforce)) {
            w.line(`_requireExists${rel.to}(${rel.field});`);
          }
        }

        // uniqueness enforcement
        for (const u of c.indexes.unique) {
          const f = c.fields.find((x) => x.name === u.field);
          if (!f) continue;
          const st = solidityStorageType(f.type);
          const keyExpr =
            st === 'string'
              ? `keccak256(bytes(${u.field}))`
              : `keccak256(abi.encode(${u.field}))`;
          w.line(`bytes32 key_${u.field} = ${keyExpr};`);
          w.line(`if (unique_${C}_${u.field}[key_${u.field}] != 0) revert UniqueViolation();`);
        }

        w.line(`uint256 id = nextId${C};`);
        w.line(`nextId${C} = id + 1;`);
        w.line(`activeCount${C} += 1;`);

        w.line(`${record} storage r = ${cVar}Records[id];`);
        w.line('r.id = id;');
        w.line('r.createdAt = block.timestamp;');
        w.line('r.createdBy = _msgSender();');
        w.line('r.owner = _msgSender();');
        w.line('r.updatedAt = 0;');
        w.line('r.updatedBy = address(0);');
        w.line('r.isDeleted = false;');
        w.line('r.deletedAt = 0;');
        w.line('r.version = 0;');
        for (const f of c.fields) {
          w.line(`r.${f.name} = ${f.name};`);
        }

        // update unique maps after storage write
        for (const u of c.indexes.unique) {
          w.line(`unique_${C}_${u.field}[key_${u.field}] = id;`);
        }

        // reverse index maintenance
        if (onChainIndexing && c.relations) {
          for (const rel of c.relations.filter((r) => r.reverseIndex)) {
            w.line(`refIndex_${C}_${rel.field}[${rel.field}].push(id);`);
          }
        }

        w.line(`${record} memory m = r;`);
        w.line(`bytes32 dataHash = ${recordHashFnName(C)}(m);`);
        w.line(`emit RecordCreated(COLLECTION_ID_${C}, id, _msgSender(), block.timestamp, dataHash);`);
        w.line('return id;');
      });
      w.line();

      // update
      if (c.updateRules.mutable.length > 0) {
        const paramParts: string[] = ['uint256 id'];
        for (const name of c.updateRules.mutable) {
          const f = c.fields.find((x) => x.name === name);
          if (!f) continue;
          paramParts.push(`${solidityParamType(f.type)} ${name}`);
        }
        if (c.updateRules.optimisticConcurrency) {
          paramParts.push('uint256 expectedVersion');
        }

        w.block(`function update${C}(${paramParts.join(', ')}) external`, () => {
          w.line(`${record} storage r = ${cVar}Records[id];`);
          w.line('if (r.createdBy == address(0)) revert RecordNotFound();');
          w.line('if (r.isDeleted) revert RecordIsDeleted();');
          if (isOwnerAccess(c.updateRules.access)) {
            w.line('if (r.owner != _msgSender()) revert Unauthorized();');
          } else if (c.updateRules.access !== 'public') {
            w.line('revert Unauthorized(); // access mode not implemented in this generator version');
          }

          if (c.updateRules.optimisticConcurrency) {
            w.line('if (r.version != expectedVersion) revert VersionMismatch(expectedVersion, r.version);');
          }

          // uniqueness updates for mutable unique fields
          const uniqueByField = new Map(c.indexes.unique.map((u) => [u.field, u]));
          for (const field of c.updateRules.mutable) {
            const u = uniqueByField.get(field);
            if (!u) continue;
            const f = c.fields.find((x) => x.name === field);
            if (!f) continue;
            const st = solidityStorageType(f.type);
            const oldKey = st === 'string' ? `keccak256(bytes(r.${field}))` : `keccak256(abi.encode(r.${field}))`;
            const newKey = st === 'string' ? `keccak256(bytes(${field}))` : `keccak256(abi.encode(${field}))`;
            w.line(`bytes32 oldKey_${field} = ${oldKey};`);
            w.line(`bytes32 newKey_${field} = ${newKey};`);
            w.line(`if (oldKey_${field} != newKey_${field}) {`);
            w.line(`  if (unique_${C}_${field}[newKey_${field}] != 0) revert UniqueViolation();`);
            w.line(`  unique_${C}_${field}[oldKey_${field}] = 0;`);
            w.line(`  unique_${C}_${field}[newKey_${field}] = id;`);
            w.line('}');
          }

          for (const field of c.updateRules.mutable) {
            w.line(`r.${field} = ${field};`);
          }
          w.line('r.updatedAt = block.timestamp;');
          w.line('r.updatedBy = _msgSender();');
          w.line('r.version += 1;');
          w.line(`${record} memory m = r;`);
          w.line(`bytes32 changedFieldsHash = ${recordHashFnName(C)}(m);`);
          w.line(`emit RecordUpdated(COLLECTION_ID_${C}, id, _msgSender(), block.timestamp, changedFieldsHash);`);
        });
        w.line();
      }

      // delete (soft delete only for now)
      w.block(`function delete${C}(uint256 id) external`, () => {
        w.line(`${record} storage r = ${cVar}Records[id];`);
        w.line('if (r.createdBy == address(0)) revert RecordNotFound();');
        w.line('if (r.isDeleted) revert RecordIsDeleted();');
        if (isOwnerAccess(c.deleteRules.access)) {
          w.line('if (r.owner != _msgSender()) revert Unauthorized();');
        } else {
          w.line('revert Unauthorized(); // access mode not implemented in this generator version');
        }
        if (c.deleteRules.softDelete) {
          w.line('r.isDeleted = true;');
          w.line('r.deletedAt = block.timestamp;');
          w.line(`activeCount${C} -= 1;`);
          // Clear unique mappings for scope=active
          for (const u of c.indexes.unique) {
            if (uniqueScope(u) !== 'active') continue;
            const f = c.fields.find((x) => x.name === u.field);
            if (!f) continue;
            const st = solidityStorageType(f.type);
            const keyExpr = st === 'string' ? `keccak256(bytes(r.${u.field}))` : `keccak256(abi.encode(r.${u.field}))`;
            w.line(`unique_${C}_${u.field}[${keyExpr}] = 0;`);
          }
          w.line(`emit RecordDeleted(COLLECTION_ID_${C}, id, _msgSender(), block.timestamp, false);`);
        } else {
          // hard delete not implemented
          w.line('revert Unauthorized();');
        }
      });
      w.line();

      // transfer
      const transferRules = c.transferRules;
      if (transferRules) {
        w.block(`function transfer${C}(uint256 id, address to) external`, () => {
          w.line(`${record} storage r = ${cVar}Records[id];`);
          w.line('if (r.createdBy == address(0)) revert RecordNotFound();');
          w.line('if (r.isDeleted) revert RecordIsDeleted();');
          w.line('if (to == address(0)) revert InvalidRecipient();');
          if (isOwnerAccess(transferRules.access)) {
            w.line('if (r.owner != _msgSender()) revert Unauthorized();');
          } else {
            w.line('revert Unauthorized(); // access mode not implemented in this generator version');
          }
          w.line('address fromOwner = r.owner;');
          w.line('r.owner = to;');
          w.line('r.updatedAt = block.timestamp;');
          w.line('r.updatedBy = _msgSender();');
          w.line('r.version += 1;');
          w.line(`emit RecordTransferred(COLLECTION_ID_${C}, id, fromOwner, to, _msgSender(), block.timestamp);`);
        });
        w.line();
      }

      // internal exists requirement for relations
      w.block(`function _requireExists${C}(uint256 id) internal view`, () => {
        w.line(`${record} storage r = ${cVar}Records[id];`);
        w.line('if (r.createdBy == address(0)) revert RecordNotFound();');
        w.line('if (r.isDeleted) revert RecordIsDeleted();');
      });
      w.line();
    }
  });

  return { path: 'contracts/App.sol', contents: w.toString() };
}
