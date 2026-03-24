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

  it('supports async foc-process uploads with job polling', async function () {
    this.timeout(180000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-upload-preview-foc-async-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    const fakeCliPath = path.join(dir, 'fake-foc-cli.mjs');
    writeJson(schemaPath, uploadSchema());

    fs.writeFileSync(
      fakeCliPath,
      `#!/usr/bin/env node
import fs from 'fs';
const args = process.argv.slice(2);
const cmd = args[0];
if (cmd === 'wallet' && args[1] === 'init') {
  const keyIndex = args.indexOf('--privateKey');
  const privateKey = keyIndex >= 0 ? String(args[keyIndex + 1] || '') : '';
  const configDir = process.env.XDG_CONFIG_HOME
    ? process.env.XDG_CONFIG_HOME + '/foc-cli-nodejs'
    : process.env.HOME + '/.config/foc-cli-nodejs';
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configDir + '/config.json', JSON.stringify({ privateKey }, null, 2));
  process.stdout.write(JSON.stringify({ ok: true, data: { privateKey } }));
  process.exit(0);
}
if (cmd === 'upload') {
  const fileArg = args.find((value) => value && !value.startsWith('-') && value !== 'upload') || '';
  const stat = fs.statSync(fileArg);
  await new Promise((resolve) => setTimeout(resolve, 250));
  process.stdout.write(JSON.stringify({
    ok: true,
    data: {
      status: 'uploaded',
      result: {
        pieceCid: 'bafkfakeasyncuploadcid',
        pieceScannerUrl: 'https://scanner.example/piece/bafkfakeasyncuploadcid',
        size: stat.size,
        copyResults: [
          {
            url: 'https://uploads.example.test/piece/bafkfakeasyncuploadcid',
            providerRole: 'primary'
          }
        ],
        copyFailures: []
      },
      processLog: [
        { step: 'Reading file', status: 'done' },
        { step: 'Uploading file', status: 'done' }
      ]
    }
  }));
  process.exit(0);
}
process.stderr.write(JSON.stringify({ ok: false, error: { message: 'unsupported fake foc command', args } }));
process.exit(1);
`
    );
    fs.chmodSync(fakeCliPath, 0o755);

    const buildRes = runTh(['build', schemaPath, '--out', outDir], process.cwd(), {
      TH_UPLOAD_RUNNER: 'foc-process',
      TH_UPLOAD_PROVIDER: 'foc'
    });
    expect(buildRes.status, buildRes.stderr || buildRes.stdout).to.equal(0);

    const port = 45200 + Math.floor(Math.random() * 1000);
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
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TH_UPLOAD_RUNNER: 'foc-process',
          TH_UPLOAD_PROVIDER: 'foc',
          TH_UPLOAD_FOC_COMMAND: `node ${fakeCliPath}`,
          TH_UPLOAD_FOC_DEBUG: '1',
          TH_UPLOAD_FOC_COPIES: '1',
          TH_UPLOAD_FOC_CHAIN: '314159',
          PRIVATE_KEY: 'fff91c6963a11a8ff48f13297185f110678b47086992b0f1612b7a1467d11f0c',
          XDG_CONFIG_HOME: path.join(dir, 'xdg-config')
        }
      }
    );

    try {
      await waitForOutput(preview, new RegExp(`http://${host}:${port}/`), 60000);

      const uploadStatus = await request(`${baseUrl}/__tokenhost/upload`);
      expect(uploadStatus.status).to.equal(200);
      expect(uploadStatus.json?.ok).to.equal(true);
      expect(uploadStatus.json?.runnerMode).to.equal('foc-process');
      expect(uploadStatus.json?.provider).to.equal('filecoin_onchain_cloud');

      const payload = Buffer.from('fake-foc-async-upload', 'utf-8');
      const accepted = await request(`${baseUrl}/__tokenhost/upload`, {
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          'x-tokenhost-upload-filename': 'async.png',
          'x-tokenhost-upload-size': String(payload.length),
          'x-tokenhost-upload-mode': 'async'
        },
        body: payload
      });

      expect(accepted.status).to.equal(202);
      expect(accepted.json?.ok).to.equal(true);
      expect(accepted.json?.pending).to.equal(true);
      expect(String(accepted.json?.jobId || '')).to.not.equal('');
      expect(String(accepted.json?.statusUrl || '')).to.match(/^\/__tokenhost\/upload\?jobId=/);

      let completed = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const polled = await request(`${baseUrl}${accepted.json.statusUrl}`);
        expect(polled.status).to.equal(200);
        if (polled.json?.pending) continue;
        completed = polled.json;
        break;
      }

      expect(completed?.ok).to.equal(true);
      expect(completed?.done).to.equal(true);
      expect(completed?.upload?.url).to.equal('https://uploads.example.test/piece/bafkfakeasyncuploadcid');
      expect(completed?.upload?.cid).to.equal('bafkfakeasyncuploadcid');

      const finalStatus = await request(`${baseUrl}/__tokenhost/upload`);
      expect(finalStatus.status).to.equal(200);
      expect(finalStatus.json?.lastError).to.equal(null);
      expect(String(finalStatus.json?.lastSuccessAt || '')).to.not.equal('');
    } finally {
      preview.kill('SIGINT');
    }
  });
});
