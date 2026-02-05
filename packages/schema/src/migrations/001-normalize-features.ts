import type { ThsSchema } from '../types.js';
import type { ThsMigration } from './types.js';

const DEFAULTS = {
  indexer: false,
  delegation: false,
  uploads: false,
  onChainIndexing: true
} as const;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export const migration001NormalizeFeatures: ThsMigration = {
  id: '001-normalize-features',
  description: 'Make implicit app.features defaults explicit (reversible).',
  up: (schema: ThsSchema): ThsSchema => {
    const out = clone(schema);
    out.app = out.app ?? ({} as any);
    const features = ((out.app as any).features ?? {}) as Record<string, unknown>;

    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (!(k in features)) features[k] = v;
    }

    (out.app as any).features = features;
    return out;
  },
  down: (schema: ThsSchema): ThsSchema => {
    const out = clone(schema);
    const features = (out.app as any)?.features;
    if (!features || typeof features !== 'object') return out;

    // Remove explicit defaults.
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if ((features as any)[k] === v) delete (features as any)[k];
    }

    if (Object.keys(features as any).length === 0) {
      delete (out.app as any).features;
    } else {
      (out.app as any).features = features;
    }

    return out;
  }
};

export default migration001NormalizeFeatures;

