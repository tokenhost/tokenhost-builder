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
      name: 'Dev Command Test',
      slug: 'dev-command-test',
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

describe('th up/run/dev', function () {
  it('supports --dry-run (no side effects) via th up', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-dev-'));
    const schemaPath = path.join(dir, 'schema.json');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['up', schemaPath, '--dry-run'], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);
    expect(res.stdout).to.include('Plan:');
    expect(res.stdout).to.include('- build:');
    expect(res.stdout).to.include('- deploy:');
    expect(res.stdout).to.include('- preview:');
  });

  it('supports --dry-run via th run alias', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-run-'));
    const schemaPath = path.join(dir, 'schema.json');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['run', schemaPath, '--dry-run'], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);
    expect(res.stdout).to.include('Plan:');
  });

  it('keeps th dev alias working', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-dev-'));
    const schemaPath = path.join(dir, 'schema.json');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['dev', schemaPath, '--dry-run'], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);
    expect(res.stdout).to.include('Plan:');
  });
});
