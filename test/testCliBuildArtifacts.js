import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function runTh(args, cwd) {
  return spawnSync('node', [path.resolve('packages/cli/dist/index.js'), ...args], {
    cwd,
    encoding: 'utf-8'
  });
}

function minimalSchema(overrides = {}) {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: {
      name: 'Build Artifacts Test',
      slug: 'build-artifacts-test',
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

describe('th build (artifacts)', function () {
  it('emits sources.tgz + compiled.tgz + manifest (no UI)', function () {
    this.timeout(60000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-build-artifacts-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['build', schemaPath, '--out', outDir, '--no-ui'], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    for (const p of [
      'schema.json',
      'contracts/App.sol',
      'compiled/App.json',
      'manifest.json',
      'sources.tgz',
      'compiled.tgz'
    ]) {
      expect(fs.existsSync(path.join(outDir, p)), `missing ${p}`).to.equal(true);
    }

    expect(fs.existsSync(path.join(outDir, 'ui-bundle'))).to.equal(false);
    expect(fs.existsSync(path.join(outDir, 'ui-site'))).to.equal(false);

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    expect(manifest?.artifacts?.soliditySources?.url).to.match(/^file:\/\//);
    expect(manifest?.artifacts?.compiledContracts?.url).to.match(/^file:\/\//);
    expect(manifest?.signatures?.[0]?.sig).to.be.a('string');
  });
});

