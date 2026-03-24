import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function runTh(args, cwd, extraEnv = {}) {
  return spawnSync('node', [path.resolve('packages/cli/dist/index.js'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...extraEnv }
  });
}

function uploadSchema() {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: {
      name: 'Upload Test App',
      slug: 'upload-test-app',
      features: { uploads: true, onChainIndexing: true }
    },
    collections: [
      {
        name: 'Post',
        fields: [
          { name: 'body', type: 'string', required: true },
          { name: 'image', type: 'image' }
        ],
        createRules: { required: ['body'], access: 'public' },
        visibilityRules: { gets: ['body', 'image'], access: 'public' },
        updateRules: { mutable: ['body', 'image'], access: 'owner' },
        deleteRules: { softDelete: true, access: 'owner' },
        indexes: { unique: [], index: [] }
      }
    ]
  };
}

describe('th build (upload config)', function () {
  it('emits upload runtime metadata in manifest when app.features.uploads=true', function () {
    this.timeout(60000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-build-uploads-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, uploadSchema());

    const res = runTh(['build', schemaPath, '--out', outDir, '--no-ui'], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    expect(manifest?.features?.uploads).to.equal(true);
    expect(manifest?.extensions?.uploads?.enabled).to.equal(true);
    expect(String(manifest?.extensions?.uploads?.baseUrl || '')).to.not.equal('');
    expect(String(manifest?.extensions?.uploads?.provider || '')).to.match(/local_file|filecoin_onchain_cloud/);
    expect(String(manifest?.extensions?.uploads?.runnerMode || '')).to.match(/local|remote|foc-process/);
    expect(Array.isArray(manifest?.extensions?.uploads?.accept)).to.equal(true);
  });

  it('emits exact remote upload endpoint metadata when remote runner env is configured', function () {
    this.timeout(60000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-build-uploads-remote-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, uploadSchema());

    const res = runTh(['build', schemaPath, '--out', outDir, '--no-ui'], process.cwd(), {
      TH_UPLOAD_RUNNER: 'remote',
      TH_UPLOAD_PROVIDER: 'foc',
      TH_UPLOAD_REMOTE_ENDPOINT_URL: 'https://uploads.example.com/api/upload',
      TH_UPLOAD_REMOTE_STATUS_URL: 'https://uploads.example.com/api/health/upload'
    });
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    expect(manifest?.extensions?.uploads?.runnerMode).to.equal('remote');
    expect(manifest?.extensions?.uploads?.provider).to.equal('filecoin_onchain_cloud');
    expect(manifest?.extensions?.uploads?.endpointUrl).to.equal('https://uploads.example.com/api/upload');
    expect(manifest?.extensions?.uploads?.statusUrl).to.equal('https://uploads.example.com/api/health/upload');
    expect(manifest?.extensions?.uploads?.baseUrl).to.equal('https://uploads.example.com/api/upload');
  });

  it('derives a default remote upload endpoint when given only a remote origin', function () {
    this.timeout(60000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-build-uploads-remote-origin-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, uploadSchema());

    const res = runTh(['build', schemaPath, '--out', outDir, '--no-ui'], process.cwd(), {
      TH_UPLOAD_REMOTE_BASE_URL: 'https://uploads.example.com'
    });
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    expect(manifest?.extensions?.uploads?.runnerMode).to.equal('remote');
    expect(manifest?.extensions?.uploads?.endpointUrl).to.equal('https://uploads.example.com/__tokenhost/upload');
    expect(manifest?.extensions?.uploads?.statusUrl).to.equal('https://uploads.example.com/__tokenhost/upload');
  });
});
