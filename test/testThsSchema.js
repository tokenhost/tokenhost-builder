import { expect } from 'chai';

import { computeSchemaHash, lintThs, validateThsStructural } from '@tokenhost/schema';

function minimalSchema(overrides = {}) {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: {
      name: 'Test App',
      slug: 'test-app',
      features: { uploads: false, onChainIndexing: true }
    },
    collections: [
      {
        name: 'Item',
        fields: [{ name: 'title', type: 'string', required: true }],
        createRules: { required: ['title'], access: 'public' },
        visibilityRules: { gets: ['title'], access: 'public' },
        updateRules: { mutable: ['title'], access: 'owner' },
        deleteRules: { softDelete: true, access: 'owner' },
        indexes: { unique: [], index: [] }
      }
    ],
    ...overrides
  };
}

describe('THS schema validation + lint', function () {
  it('validateThsStructural accepts a minimal valid schema', function () {
    const input = minimalSchema();
    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
    expect(res.data).to.be.an('object');
  });

  it('computeSchemaHash is deterministic across key ordering', function () {
    const a = minimalSchema();
    const b = {
      collections: a.collections,
      app: a.app,
      schemaVersion: a.schemaVersion,
      thsVersion: a.thsVersion
    };
    expect(computeSchemaHash(a)).to.equal(computeSchemaHash(b));
  });

  it('lintThs rejects reserved system field names', function () {
    const input = minimalSchema({
      collections: [
        {
          name: 'Bad',
          fields: [{ name: 'id', type: 'uint256' }],
          createRules: { required: [], access: 'public' },
          visibilityRules: { gets: [], access: 'public' },
          updateRules: { mutable: [], access: 'owner' },
          deleteRules: { softDelete: true, access: 'owner' },
          indexes: { unique: [], index: [] }
        }
      ]
    });
    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
    const issues = lintThs(res.data);
    expect(issues.some((i) => i.code === 'lint.field.reserved_system')).to.equal(true);
  });

  it('lintThs requires relations[] metadata for reference fields', function () {
    const input = minimalSchema({
      collections: [
        {
          name: 'A',
          fields: [{ name: 'b', type: 'reference' }],
          createRules: { required: [], access: 'public' },
          visibilityRules: { gets: [], access: 'public' },
          updateRules: { mutable: [], access: 'owner' },
          deleteRules: { softDelete: true, access: 'owner' },
          indexes: { unique: [], index: [] }
        },
        {
          name: 'B',
          fields: [{ name: 'name', type: 'string' }],
          createRules: { required: [], access: 'public' },
          visibilityRules: { gets: [], access: 'public' },
          updateRules: { mutable: [], access: 'owner' },
          deleteRules: { softDelete: true, access: 'owner' },
          indexes: { unique: [], index: [] }
        }
      ]
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
    const issues = lintThs(res.data);
    expect(issues.some((i) => i.code === 'lint.relations.missing')).to.equal(true);
  });
});

