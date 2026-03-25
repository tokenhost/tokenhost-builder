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

  it('uses stricter chain-targeted generation limits when build is given a target chain', function () {
    this.timeout(60000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-build-chain-limits-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['build', schemaPath, '--out', outDir, '--no-ui', '--chain', 'filecoin_calibration'], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const appSol = fs.readFileSync(path.join(outDir, 'contracts', 'App.sol'), 'utf-8');
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    expect(appSol).to.include('uint256 public constant MAX_LIST_LIMIT = 25;');
    expect(appSol).to.include('uint256 public constant MAX_SCAN_STEPS = 500;');
    expect(appSol).to.include('uint256 public constant MAX_MULTICALL_CALLS = 12;');
    expect(appSol).to.include('uint256 public constant MAX_TOKENIZED_INDEX_TOKENS = 6;');
    expect(appSol).to.include('uint256 public constant MAX_TOKENIZED_INDEX_TOKEN_LENGTH = 24;');
    expect(manifest?.extensions?.chainLimits?.lists?.maxLimit).to.equal(25);
    expect(manifest?.extensions?.chainLimits?.lists?.maxScanSteps).to.equal(500);
    expect(manifest?.extensions?.chainLimits?.multicall?.maxCalls).to.equal(12);
  });

  it('cleans its temporary UI build workspace after a successful build', function () {
    this.timeout(180000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-build-ui-temp-cleanup-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['build', schemaPath, '--out', outDir], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    expect(fs.existsSync(path.join(outDir, '.tokenhost-build-tmp'))).to.equal(false);
    expect(fs.existsSync(path.join(outDir, 'ui-bundle', 'index.html'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'ui-site', 'index.html'))).to.equal(true);
  });

  it('emits Netlify upload scaffolding when schema opts into Netlify background uploads', function () {
    this.timeout(180000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-build-netlify-uploads-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(
      schemaPath,
      minimalSchema({
        app: {
          name: 'Netlify Upload Test',
          slug: 'netlify-upload-test',
          features: { uploads: true, onChainIndexing: true },
          deploy: {
            netlify: {
              uploads: {
                provider: 'filecoin_onchain_cloud',
                runner: 'background-function'
              }
            }
          }
        }
      })
    );

    const res = runTh(['build', schemaPath, '--out', outDir], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    for (const p of [
      'netlify.toml',
      'package.json',
      'NETLIFY-UPLOADS.md',
      'netlify/functions/_tokenhost-upload-shared.mjs',
      'netlify/functions/tokenhost-upload-start.mjs',
      'netlify/functions/tokenhost-upload-status.mjs',
      'netlify/functions/tokenhost-upload-worker-background.mjs'
    ]) {
      expect(fs.existsSync(path.join(outDir, p)), `missing ${p}`).to.equal(true);
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    expect(manifest?.extensions?.uploads?.endpointUrl).to.equal('/__tokenhost/upload');
    expect(manifest?.extensions?.uploads?.statusUrl).to.equal('/__tokenhost/upload-status');
    expect(manifest?.extensions?.uploads?.provider).to.equal('filecoin_onchain_cloud');
    expect(manifest?.extensions?.uploads?.runnerMode).to.equal('remote');
  });
});
