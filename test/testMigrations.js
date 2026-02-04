import { expect } from 'chai';

import { migrateThsSchema, validateThsStructural } from '@tokenhost/schema';

function minimalSchema(overrides = {}) {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: { name: 'Test App', slug: 'test-app' },
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

describe('THS schema migrations', function () {
  it('up migration makes app.features defaults explicit', function () {
    const input = minimalSchema();
    const structural = validateThsStructural(input);
    expect(structural.ok).to.equal(true);

    const res = migrateThsSchema(structural.data, { direction: 'up' });
    expect(res.appliedNow).to.include('001-normalize-features');

    expect(res.schema.app).to.have.property('features');
    expect(res.schema.app.features).to.deep.include({
      indexer: false,
      delegation: false,
      uploads: false,
      onChainIndexing: true
    });
  });

  it('down migration reverts explicit defaults', function () {
    const input = minimalSchema();
    const up = migrateThsSchema(input, { direction: 'up' });
    const down = migrateThsSchema(up.schema, { direction: 'down', steps: 1 });

    // Features become optional again after down.
    expect((down.schema.app || {}).features).to.equal(undefined);
    expect((down.schema.metadata || {}).tokenhost?.appliedMigrations || []).to.deep.equal([]);
  });
});

