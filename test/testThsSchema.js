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

  it('validateThsStructural accepts app.ui and field.ui primitives', function () {
    const input = minimalSchema({
      app: {
        name: 'Test App',
        slug: 'test-app',
        features: { uploads: false, onChainIndexing: true },
        ui: {
          homePage: { mode: 'custom' },
          extensions: { directory: 'ui-overrides' }
        }
      },
      collections: [
        {
          name: 'Item',
          fields: [
            {
              name: 'artifactUrl',
              type: 'string',
              ui: {
                component: 'externalLink',
                label: 'Open artifact',
                target: '_blank'
              }
            }
          ],
          createRules: { required: [], access: 'public' },
          visibilityRules: { gets: ['artifactUrl'], access: 'public' },
          updateRules: { mutable: ['artifactUrl'], access: 'owner' },
          deleteRules: { softDelete: true, access: 'owner' },
          indexes: { unique: [], index: [] }
        }
      ]
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
  });

  it('validateThsStructural accepts app.theme.preset for cyber-grid', function () {
    const input = minimalSchema({
      app: {
        name: 'Test App',
        slug: 'test-app',
        theme: { preset: 'cyber-grid' },
        features: { uploads: false, onChainIndexing: true }
      }
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
  });

  it('validateThsStructural accepts generated feed/token/home UI primitives', function () {
    const input = minimalSchema({
      app: {
        name: 'Test App',
        slug: 'test-app',
        features: { uploads: true, onChainIndexing: true },
        ui: {
          homePage: { mode: 'generated' },
          generated: {
            feeds: [
              {
                id: 'items',
                collection: 'Item',
                card: {
                  textField: 'title'
                }
              }
            ],
            tokenPages: [
              {
                id: 'itemTokens',
                collection: 'Item',
                field: 'title',
                tokenizer: 'hashtag',
                feed: 'items'
              }
            ],
            homeSections: [
              {
                type: 'hero',
                title: 'Test app'
              },
              {
                type: 'tokenList',
                tokenPage: 'itemTokens',
                title: 'Trending tags'
              },
              {
                type: 'feed',
                feed: 'items',
                title: 'Latest items'
              }
            ]
          }
        }
      }
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
  });

  it('validateThsStructural rejects unknown app.theme.preset values', function () {
    const input = minimalSchema({
      app: {
        name: 'Test App',
        slug: 'test-app',
        theme: { preset: 'not-a-theme' },
        features: { uploads: false, onChainIndexing: true }
      }
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(false);
    expect(res.issues.some((i) => i.path === '/app/theme/preset')).to.equal(true);
  });

  it('lintThs warns when custom home page is configured without extensions directory', function () {
    const input = minimalSchema({
      app: {
        name: 'Test App',
        slug: 'test-app',
        features: { uploads: false, onChainIndexing: true },
        ui: {
          homePage: { mode: 'custom' }
        }
      }
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
    const issues = lintThs(res.data);
    expect(issues.some((i) => i.code === 'lint.app.ui.custom_home_without_extensions')).to.equal(true);
  });

  it('lintThs rejects generated UI references to unknown feeds and token pages', function () {
    const input = minimalSchema({
      app: {
        name: 'Test App',
        slug: 'test-app',
        features: { uploads: false, onChainIndexing: true },
        ui: {
          homePage: { mode: 'generated' },
          generated: {
            feeds: [
              {
                id: 'items',
                collection: 'Item',
                card: {
                  textField: 'missingField'
                }
              }
            ],
            tokenPages: [
              {
                id: 'itemTokens',
                collection: 'Item',
                field: 'missingField',
                tokenizer: 'hashtag',
                feed: 'missingFeed'
              }
            ],
            homeSections: [
              {
                type: 'tokenList',
                tokenPage: 'missingTokenPage',
                title: 'Broken token page'
              },
              {
                type: 'feed',
                feed: 'missingFeed',
                title: 'Broken feed'
              }
            ]
          }
        }
      }
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
    const issues = lintThs(res.data);
    expect(issues.some((i) => i.code === 'lint.app.ui.generated.feed_unknown_field')).to.equal(true);
    expect(issues.some((i) => i.code === 'lint.app.ui.generated.token_unknown_field')).to.equal(true);
    expect(issues.some((i) => i.code === 'lint.app.ui.generated.section_unknown_token_page')).to.equal(true);
    expect(issues.some((i) => i.code === 'lint.app.ui.generated.section_unknown_feed')).to.equal(true);
  });

  it('validateThsStructural accepts tokenized query index primitives', function () {
    const input = minimalSchema({
      collections: [
        {
          name: 'Post',
          fields: [{ name: 'body', type: 'string', required: true }],
          createRules: { required: ['body'], access: 'public' },
          visibilityRules: { gets: ['body'], access: 'public' },
          updateRules: { mutable: ['body'], access: 'owner' },
          deleteRules: { softDelete: true, access: 'owner' },
          indexes: {
            unique: [],
            index: [{ field: 'body', mode: 'tokenized', tokenizer: 'hashtag' }]
          }
        }
      ]
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
  });

  it('lintThs rejects tokenized query indexes on unsupported field types', function () {
    const input = minimalSchema({
      collections: [
        {
          name: 'Post',
          fields: [{ name: 'imageRef', type: 'image', required: true }],
          createRules: { required: ['imageRef'], access: 'public' },
          visibilityRules: { gets: ['imageRef'], access: 'public' },
          updateRules: { mutable: ['imageRef'], access: 'owner' },
          deleteRules: { softDelete: true, access: 'owner' },
          indexes: {
            unique: [],
            index: [{ field: 'imageRef', mode: 'tokenized', tokenizer: 'hashtag' }]
          }
        }
      ]
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
    const issues = lintThs(res.data);
    expect(issues.some((i) => i.code === 'lint.indexes.index_tokenized_unsupported_type')).to.equal(true);
  });

  it('lintThs rejects duplicate query indexes on the same field', function () {
    const input = minimalSchema({
      collections: [
        {
          name: 'Post',
          fields: [{ name: 'body', type: 'string', required: true }],
          createRules: { required: ['body'], access: 'public' },
          visibilityRules: { gets: ['body'], access: 'public' },
          updateRules: { mutable: ['body'], access: 'owner' },
          deleteRules: { softDelete: true, access: 'owner' },
          indexes: {
            unique: [],
            index: [
              { field: 'body' },
              { field: 'body', mode: 'tokenized', tokenizer: 'hashtag' }
            ]
          }
        }
      ]
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
    const issues = lintThs(res.data);
    expect(issues.some((i) => i.code === 'lint.indexes.index_duplicate_field')).to.equal(true);
  });

  it('lintThs warns when query indexes are declared but on-chain indexing is disabled', function () {
    const input = minimalSchema({
      app: {
        name: 'Test App',
        slug: 'test-app',
        features: { uploads: false, onChainIndexing: false }
      },
      collections: [
        {
          name: 'Post',
          fields: [{ name: 'body', type: 'string', required: true }],
          createRules: { required: ['body'], access: 'public' },
          visibilityRules: { gets: ['body'], access: 'public' },
          updateRules: { mutable: ['body'], access: 'owner' },
          deleteRules: { softDelete: true, access: 'owner' },
          indexes: {
            unique: [],
            index: [{ field: 'body', mode: 'tokenized', tokenizer: 'hashtag' }]
          }
        }
      ]
    });

    const res = validateThsStructural(input);
    expect(res.ok).to.equal(true);
    const issues = lintThs(res.data);
    expect(issues.some((i) => i.code === 'lint.indexes.index_ignored_when_onchain_disabled')).to.equal(true);
  });
});
