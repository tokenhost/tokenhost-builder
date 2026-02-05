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

function functionSignature(item) {
  if (!item || item.type !== 'function' || typeof item.name !== 'string') return null;
  const inputs = Array.isArray(item.inputs) ? item.inputs : [];
  const types = inputs.map((i) => String(i?.type ?? '')).join(',');
  return `${item.name}(${types})`;
}

function hasFunction(abi, nameOrSignature) {
  for (const item of abi) {
    const sig = functionSignature(item);
    if (!sig) continue;
    if (sig === nameOrSignature) return true;
    if (!nameOrSignature.includes('(') && item.name === nameOrSignature) return true;
  }
  return false;
}

function schemaForAbiSurface() {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: {
      name: 'ABI Surface Test',
      slug: 'abi-surface-test',
      features: { uploads: false, onChainIndexing: true }
    },
    collections: [
      {
        name: 'Candidate',
        fields: [{ name: 'name', type: 'string', required: true }],
        createRules: { required: ['name'], access: 'public' },
        visibilityRules: { gets: ['name'], access: 'public' },
        updateRules: { mutable: ['name'], access: 'owner' },
        deleteRules: { softDelete: true, access: 'owner' },
        transferRules: { access: 'owner' },
        indexes: { unique: [], index: [] }
      },
      {
        name: 'JobPosting',
        fields: [{ name: 'title', type: 'string', required: true }],
        createRules: { required: ['title'], access: 'public' },
        visibilityRules: { gets: ['title'], access: 'public' },
        updateRules: { mutable: [], access: 'owner' },
        deleteRules: { softDelete: true, access: 'owner' },
        indexes: { unique: [], index: [] }
      }
    ]
  };
}

describe('UI contract surface compatibility', function () {
  it('generated ABI contains all UI-required function names/signatures per collection', function () {
    this.timeout(60000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-abi-surface-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    const schema = schemaForAbiSurface();
    writeJson(schemaPath, schema);

    const buildRes = runTh(['build', schemaPath, '--out', outDir, '--no-ui'], process.cwd());
    expect(buildRes.status, buildRes.stderr || buildRes.stdout).to.equal(0);

    const compiled = JSON.parse(fs.readFileSync(path.join(outDir, 'compiled', 'App.json'), 'utf-8'));
    const abi = compiled?.abi;
    expect(Array.isArray(abi)).to.equal(true);
    expect(abi.length > 0).to.equal(true);

    for (const collection of schema.collections) {
      const name = collection.name;

      // Core functions used by list/view/create flows.
      expect(hasFunction(abi, `listIds${name}`), `missing listIds${name}`).to.equal(true);
      expect(hasFunction(abi, `get${name}(uint256)`), `missing get${name}(uint256)`).to.equal(true);
      expect(hasFunction(abi, `create${name}`), `missing create${name}`).to.equal(true);
      expect(hasFunction(abi, `delete${name}`), `missing delete${name}`).to.equal(true);

      // Optional functions depend on schema rules.
      const hasMutableFields = Array.isArray(collection.updateRules?.mutable) && collection.updateRules.mutable.length > 0;
      const hasTransfer = Boolean(collection.transferRules);

      expect(hasFunction(abi, `update${name}`), `unexpected update${name} presence`).to.equal(hasMutableFields);
      expect(hasFunction(abi, `transfer${name}`), `unexpected transfer${name} presence`).to.equal(hasTransfer);
    }
  });
});
