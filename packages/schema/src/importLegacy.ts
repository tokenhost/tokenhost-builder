import type { FieldType, Relation, ThsSchema } from './types.js';

type LegacyContract = {
  fields: Record<string, string>;
  initRules: {
    passIn: string[];
    auto: Record<string, string>;
  };
  writeRules?: {
    unique?: string[];
    index?: string[];
  };
  readRules: {
    gets: string[];
  };
};

type LegacyContractsJson = {
  contracts: Record<string, LegacyContract>;
};

function toCamel(name: string): string {
  if (!name) return name;
  return name[0]!.toLowerCase() + name.slice(1);
}

function mapLegacyType(type: string, contractNames: Set<string>): { type: FieldType; refTo?: string } {
  if (contractNames.has(type)) return { type: 'reference', refTo: type };
  if (type === 'uint') return { type: 'uint256' };
  if (type === 'int') return { type: 'int256' };
  if (type === 'image') return { type: 'image' };
  if (type === 'string') return { type: 'string' };
  if (type === 'bool') return { type: 'bool' };
  if (type === 'address') return { type: 'address' };
  if (type === 'bytes32') return { type: 'bytes32' };
  // Best-effort fallback.
  return { type: 'string' };
}

function mapAutoExpr(expr: string): string {
  if (expr === 'tx.origin') return '_msgSender()';
  if (expr === 'msg.sender') return '_msgSender()';
  return expr;
}

export function importLegacyContractsJson(
  legacy: LegacyContractsJson,
  opts?: { thsVersion?: string; schemaVersion?: string; appName?: string; appSlug?: string }
): ThsSchema {
  const thsVersion = opts?.thsVersion ?? '2025-12';
  const schemaVersion = opts?.schemaVersion ?? '0.0.0';
  const appName = opts?.appName ?? 'Imported App';
  const appSlug = opts?.appSlug ?? 'imported-app';

  const contractNames = new Set(Object.keys(legacy.contracts));

  const collections = Object.entries(legacy.contracts).map(([contractName, contract]) => {
    const fields = Object.entries(contract.fields).map(([legacyFieldName, legacyType]) => {
      const name = toCamel(legacyFieldName);
      const mapped = mapLegacyType(legacyType, contractNames);
      return {
        name,
        type: mapped.type
      };
    });

    const required = contract.initRules.passIn.map(toCamel);
    const auto: Record<string, string> = {};
    for (const [k, v] of Object.entries(contract.initRules.auto ?? {})) {
      auto[toCamel(k)] = mapAutoExpr(v);
    }

    const uniqueLegacy = contract.writeRules?.unique ?? [];
    const indexLegacy = contract.writeRules?.index ?? [];

    const relations: Relation[] = [];
    for (const [legacyFieldName, legacyType] of Object.entries(contract.fields)) {
      const mapped = mapLegacyType(legacyType, contractNames);
      if (mapped.type !== 'reference' || !mapped.refTo) continue;
      relations.push({
        field: toCamel(legacyFieldName),
        to: mapped.refTo,
        enforce: false,
        reverseIndex: true
      });
    }

    return {
      name: contractName,
      fields,
      createRules: {
        required,
        auto,
        access: 'public' as const
      },
      visibilityRules: {
        gets: contract.readRules.gets.map(toCamel),
        access: 'public' as const
      },
      updateRules: {
        mutable: [],
        access: 'owner' as const
      },
      deleteRules: {
        softDelete: true,
        access: 'owner' as const
      },
      indexes: {
        unique: uniqueLegacy.map((f) => ({ field: toCamel(f), scope: 'active' as const })),
        index: indexLegacy.map((f) => ({ field: toCamel(f) }))
      },
      relations: relations.length > 0 ? relations : undefined
    };
  });

  return {
    thsVersion,
    schemaVersion,
    app: {
      name: appName,
      slug: appSlug,
      features: {
        onChainIndexing: true
      }
    },
    collections
  };
}
