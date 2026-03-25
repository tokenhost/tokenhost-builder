import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
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
      name: 'Netlify Upload Function Test',
      slug: 'netlify-upload-function-test',
      features: { uploads: true, onChainIndexing: true },
      deploy: {
        netlify: {
          uploads: {
            provider: 'filecoin_onchain_cloud',
            runner: 'background-function'
          }
        }
      }
    },
    collections: [
      {
        name: 'Item',
        fields: [{ name: 'image', type: 'image' }],
        createRules: { required: [], access: 'public' },
        visibilityRules: { gets: ['image'], access: 'public' },
        updateRules: { mutable: ['image'], access: 'owner' },
        deleteRules: { softDelete: true, access: 'owner' },
        indexes: { unique: [], index: [] }
      }
    ],
    ...overrides
  };
}

function installNetlifyBlobsStub(outDir) {
  const pkgDir = path.join(outDir, 'node_modules', '@netlify', 'blobs');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify(
      {
        name: '@netlify/blobs',
        type: 'module',
        exports: './index.js'
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(pkgDir, 'index.js'),
    `const stores = globalThis.__tokenhostNetlifyBlobStores ?? (globalThis.__tokenhostNetlifyBlobStores = new Map());

export function getStore(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  const store = stores.get(name);
  return {
    async setJSON(key, value) {
      store.set(key, JSON.parse(JSON.stringify(value)));
    },
    async get(key, options = {}) {
      if (!store.has(key)) return null;
      const value = store.get(key);
      return options.type === 'json' ? JSON.parse(JSON.stringify(value)) : value;
    },
    async delete(key) {
      store.delete(key);
    }
  };
}
`
  );
}

async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe('Generated Netlify upload functions', function () {
  it('processes an async upload job end to end with generated functions', async function () {
    this.timeout(180000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-netlify-functions-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());

    const build = runTh(['build', schemaPath, '--out', outDir], process.cwd());
    expect(build.status, build.stderr || build.stdout).to.equal(0);

    installNetlifyBlobsStub(outDir);

    const startPath = pathToFileURL(path.join(outDir, 'netlify', 'functions', 'tokenhost-upload-start.mjs')).href;
    const statusPath = pathToFileURL(path.join(outDir, 'netlify', 'functions', 'tokenhost-upload-status.mjs')).href;
    const workerPath = pathToFileURL(path.join(outDir, 'netlify', 'functions', 'tokenhost-upload-worker-background.mjs')).href;

    const previousFetch = globalThis.fetch;
    const previousPrivateKey = process.env.TH_UPLOAD_FOC_PRIVATE_KEY;
    const previousCommand = process.env.TH_UPLOAD_FOC_COMMAND;

    process.env.TH_UPLOAD_FOC_PRIVATE_KEY = '0x1234';
    process.env.TH_UPLOAD_FOC_COMMAND = `node ${path.resolve('test/fixtures/fake-foc-cli.mjs')}`;

    try {
      const workerModule = await import(workerPath);
      globalThis.fetch = async (url, init = {}) => {
        if (String(url).includes('/.netlify/functions/tokenhost-upload-worker-background')) {
          return await workerModule.default(
            new Request(String(url), {
              method: init.method || 'POST',
              headers: init.headers,
              body: init.body
            })
          );
        }
        throw new Error(`Unexpected fetch in test: ${String(url)}`);
      };

      const startModule = await import(startPath);
      const statusModule = await import(statusPath);

      const health = await startModule.default(new Request('https://example.net/__tokenhost/upload', { method: 'GET' }));
      const healthJson = await readJsonResponse(health);
      expect(health.status).to.equal(200);
      expect(healthJson?.enabled).to.equal(true);
      expect(healthJson?.provider).to.equal('filecoin_onchain_cloud');

      const payload = Buffer.from('tokenhost-netlify-upload-test', 'utf-8');
      const startRes = await startModule.default(
        new Request('https://example.net/__tokenhost/upload', {
          method: 'POST',
          headers: {
            'content-type': 'image/png',
            'x-tokenhost-upload-filename': 'test.png',
            'x-tokenhost-upload-size': String(payload.length)
          },
          body: payload
        })
      );
      const startJson = await readJsonResponse(startRes);

      expect(startRes.status).to.equal(202);
      expect(startJson?.ok).to.equal(true);
      expect(startJson?.pending).to.equal(true);
      expect(startJson?.jobId).to.be.a('string');

      const pollRes = await statusModule.default(
        new Request(`https://example.net/__tokenhost/upload-status?jobId=${encodeURIComponent(startJson.jobId)}`, {
          method: 'GET'
        })
      );
      const pollJson = await readJsonResponse(pollRes);

      expect(pollRes.status).to.equal(200);
      expect(pollJson?.ok).to.equal(true);
      expect(pollJson?.pending).to.equal(false);
      expect(pollJson?.upload?.url).to.equal('https://calibration.example.invalid/piece/bafkqaaaafakecidfornetlifyuploadtest');
      expect(pollJson?.upload?.cid).to.equal('bafkqaaaafakecidfornetlifyuploadtest');
      expect(pollJson?.upload?.provider).to.equal('filecoin_onchain_cloud');
      expect(pollJson?.upload?.runnerMode).to.equal('netlify-background');
    } finally {
      globalThis.fetch = previousFetch;
      if (previousPrivateKey === undefined) delete process.env.TH_UPLOAD_FOC_PRIVATE_KEY;
      else process.env.TH_UPLOAD_FOC_PRIVATE_KEY = previousPrivateKey;
      if (previousCommand === undefined) delete process.env.TH_UPLOAD_FOC_COMMAND;
      else process.env.TH_UPLOAD_FOC_COMMAND = previousCommand;
    }
  });
});
