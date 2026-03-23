import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

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

function waitForOutput(proc, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let combined = '';
    let done = false;

    function cleanup() {
      if (done) return;
      done = true;
      clearInterval(timer);
      proc.stdout?.off('data', onData);
      proc.stderr?.off('data', onData);
    }

    function onData(chunk) {
      combined += String(chunk ?? '');
      if (pattern.test(combined)) {
        cleanup();
        resolve(combined);
      }
    }

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);

    const timer = setInterval(() => {
      if (Date.now() - startedAt < timeoutMs) return;
      cleanup();
      reject(new Error(`Timed out waiting for output match: ${pattern}\nOutput:\n${combined}`));
    }, 200);
  });
}

async function request(url, init) {
  const res = await fetch(url, init);
  const buffer = Buffer.from(await res.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(buffer.toString('utf-8'));
  } catch {
    json = null;
  }
  return { status: res.status, json, buffer, headers: res.headers };
}

function uploadSchema() {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: {
      name: 'Upload Integration App',
      slug: 'upload-integration-app',
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

describe('CLI local preview upload integration', function () {
  it('serves a local upload endpoint and stores uploaded bytes for generated apps with uploads enabled', async function () {
    this.timeout(180000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-upload-preview-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, uploadSchema());

    const buildRes = runTh(['build', schemaPath, '--out', outDir], process.cwd());
    expect(buildRes.status, buildRes.stderr || buildRes.stdout).to.equal(0);

    const port = 43000 + Math.floor(Math.random() * 2000);
    const host = '127.0.0.1';
    const baseUrl = `http://${host}:${port}`;

    const preview = spawn(
      'node',
      [
        path.resolve('packages/cli/dist/index.js'),
        'preview',
        outDir,
        '--host',
        host,
        '--port',
        String(port),
        '--no-deploy',
        '--no-start-anvil',
        '--no-faucet'
      ],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
    );

    try {
      await waitForOutput(preview, new RegExp(`http://${host}:${port}/`), 60000);

      const uploadStatus = await request(`${baseUrl}/__tokenhost/upload`);
      expect(uploadStatus.status).to.equal(200);
      expect(uploadStatus.json?.ok).to.equal(true);
      expect(uploadStatus.json?.enabled).to.equal(true);
      expect(String(uploadStatus.json?.runnerMode || '')).to.equal('local');

      const payload = Buffer.from('not-a-real-png-but-good-enough-for-local-upload-test', 'utf-8');
      const uploadRes = await request(`${baseUrl}/__tokenhost/upload`, {
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          'x-tokenhost-upload-filename': 'tiny.png',
          'x-tokenhost-upload-size': String(payload.length)
        },
        body: payload
      });

      expect(uploadRes.status).to.equal(200);
      expect(uploadRes.json?.ok).to.equal(true);
      expect(String(uploadRes.json?.upload?.url || '')).to.match(/^\/__tokenhost\/uploads\/.+/);

      const uploadedUrl = `${baseUrl}${uploadRes.json.upload.url}`;
      const stored = await request(uploadedUrl);
      expect(stored.status).to.equal(200);
      expect(Buffer.compare(stored.buffer, payload)).to.equal(0);
      expect(String(stored.headers.get('content-type') || '')).to.match(/^image\/png/);
    } finally {
      preview.kill('SIGINT');
    }
  });

  it('serves uploads from a custom local endpoint path when configured', async function () {
    this.timeout(180000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-upload-preview-custom-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, uploadSchema());

    const buildRes = runTh(['build', schemaPath, '--out', outDir], process.cwd(), {
      TH_UPLOAD_BASE_URL: '/api/uploads'
    });
    expect(buildRes.status, buildRes.stderr || buildRes.stdout).to.equal(0);

    const port = 45000 + Math.floor(Math.random() * 1000);
    const host = '127.0.0.1';
    const baseUrl = `http://${host}:${port}`;

    const preview = spawn(
      'node',
      [
        path.resolve('packages/cli/dist/index.js'),
        'preview',
        outDir,
        '--host',
        host,
        '--port',
        String(port),
        '--no-deploy',
        '--no-start-anvil',
        '--no-faucet'
      ],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
    );

    try {
      await waitForOutput(preview, new RegExp(`http://${host}:${port}/`), 60000);

      const uploadStatus = await request(`${baseUrl}/api/uploads`);
      expect(uploadStatus.status).to.equal(200);
      expect(uploadStatus.json?.ok).to.equal(true);
      expect(uploadStatus.json?.endpointUrl).to.equal('/api/uploads');
      expect(uploadStatus.json?.statusUrl).to.equal('/api/uploads');

      const payload = Buffer.from('custom-path-upload', 'utf-8');
      const uploadRes = await request(`${baseUrl}/api/uploads`, {
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          'x-tokenhost-upload-filename': 'custom.png',
          'x-tokenhost-upload-size': String(payload.length)
        },
        body: payload
      });

      expect(uploadRes.status).to.equal(200);
      expect(uploadRes.json?.ok).to.equal(true);
      expect(String(uploadRes.json?.upload?.url || '')).to.match(/^\/__tokenhost\/uploads\/.+/);
    } finally {
      preview.kill('SIGINT');
    }
  });
});
