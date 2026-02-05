import type { ThsSchema } from '../types.js';
import type { ThsMigration } from './types.js';

import migration001 from './001-normalize-features.js';

export const THS_MIGRATIONS: ThsMigration[] = [migration001];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function readApplied(schema: any): string[] {
  const ids = schema?.metadata?.tokenhost?.appliedMigrations;
  return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
}

function writeApplied(schema: any, ids: string[]) {
  schema.metadata = schema.metadata ?? {};
  schema.metadata.tokenhost = schema.metadata.tokenhost ?? {};
  schema.metadata.tokenhost.appliedMigrations = ids;
}

export function listThsMigrations(): ThsMigration[] {
  return [...THS_MIGRATIONS];
}

export function migrateThsSchema(
  schema: ThsSchema,
  opts?: { direction?: 'up' | 'down'; steps?: number }
): { schema: ThsSchema; appliedNow: string[]; appliedTotal: string[] } {
  const direction = opts?.direction ?? 'up';
  const maxSteps = typeof opts?.steps === 'number' && Number.isFinite(opts.steps) ? Math.max(0, Math.floor(opts.steps)) : Number.POSITIVE_INFINITY;

  let out = clone(schema);
  const applied = readApplied(out);
  const appliedSet = new Set(applied);
  const appliedNow: string[] = [];

  if (direction === 'up') {
    let steps = 0;
    for (const m of THS_MIGRATIONS) {
      if (appliedSet.has(m.id)) continue;
      if (steps >= maxSteps) break;
      out = m.up(out);
      applied.push(m.id);
      appliedSet.add(m.id);
      appliedNow.push(m.id);
      steps++;
    }
  } else {
    // Down: revert from the end of the applied list.
    let steps = 0;
    while (steps < maxSteps && applied.length > 0) {
      const lastId = applied[applied.length - 1]!;
      const m = THS_MIGRATIONS.find((x) => x.id === lastId);
      if (!m) {
        throw new Error(`Cannot down-migrate unknown migration id: ${lastId}`);
      }
      out = m.down(out);
      applied.pop();
      appliedSet.delete(lastId);
      appliedNow.push(lastId);
      steps++;
    }
  }

  writeApplied(out, applied);
  return { schema: out, appliedNow, appliedTotal: applied };
}
