import { expect } from 'chai';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

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

function getAvailablePort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((err) => {
        if (err) reject(err);
        else if (!port) reject(new Error('Unable to determine an available port.'));
        else resolve(port);
      });
    });
  });
}

describe('Microblog example remote upload adapter flow', function () {
  it('builds the canonical microblog app against a standalone remote upload adapter', async function () {
    this.timeout(180000);

    const schemaPath = path.join(process.cwd(), 'apps', 'example', 'microblog.schema.json');
    const outDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'th-microblog-remote-')), 'out');

    const adapterHost = '127.0.0.1';
    const adapterPort = await getAvailablePort(adapterHost);
    const adapterBaseUrl = `http://${adapterHost}:${adapterPort}`;
    const adapterEndpointPath = '/api/upload';
    const adapterStatusPath = '/api/upload/status';
    const adapterStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-microblog-remote-storage-'));

    const adapter = spawn('node', [path.resolve('examples/upload-adapters/foc-remote-adapter.mjs')], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HOST: adapterHost,
        PORT: String(adapterPort),
        TH_UPLOAD_ADAPTER_MODE: 'local',
        TH_UPLOAD_ENDPOINT_PATH: adapterEndpointPath,
        TH_UPLOAD_STATUS_PATH: adapterStatusPath,
        TH_UPLOAD_PUBLIC_BASE_URL: adapterBaseUrl,
        TH_UPLOAD_LOCAL_DIR: adapterStorageDir
      }
    });

    const previewHost = '127.0.0.1';
    const previewPort = await getAvailablePort(previewHost);
    const previewBaseUrl = `http://${previewHost}:${previewPort}`;

    let preview = null;
    try {
      await waitForOutput(adapter, new RegExp(`Token Host upload adapter listening at http://${adapterHost}:${adapterPort}`), 30000);

      const buildRes = runTh(['build', schemaPath, '--out', outDir], process.cwd(), {
        TH_UPLOAD_RUNNER: 'remote',
        TH_UPLOAD_REMOTE_ENDPOINT_URL: `${adapterBaseUrl}${adapterEndpointPath}`,
        TH_UPLOAD_REMOTE_STATUS_URL: `${adapterBaseUrl}${adapterStatusPath}`,
        TH_UPLOAD_PROVIDER: 'foc'
      });
      expect(buildRes.status, buildRes.stderr || buildRes.stdout).to.equal(0);

      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
      expect(manifest?.extensions?.uploads?.runnerMode).to.equal('remote');
      expect(manifest?.extensions?.uploads?.endpointUrl).to.equal(`${adapterBaseUrl}${adapterEndpointPath}`);
      expect(manifest?.extensions?.uploads?.statusUrl).to.equal(`${adapterBaseUrl}${adapterStatusPath}`);

      preview = spawn(
        'node',
        [
          path.resolve('packages/cli/dist/index.js'),
          'preview',
          outDir,
          '--host',
          previewHost,
          '--port',
          String(previewPort),
          '--no-deploy',
          '--no-start-anvil',
          '--no-faucet'
        ],
        { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
      );

      await waitForOutput(preview, new RegExp(`${previewBaseUrl}/`), 60000);

      const manifestRes = await request(`${previewBaseUrl}/.well-known/tokenhost/manifest.json`);
      expect(manifestRes.status).to.equal(200);
      expect(manifestRes.json?.extensions?.uploads?.runnerMode).to.equal('remote');
      expect(manifestRes.json?.extensions?.uploads?.endpointUrl).to.equal(`${adapterBaseUrl}${adapterEndpointPath}`);

      const adapterStatus = await request(`${adapterBaseUrl}${adapterStatusPath}`);
      expect(adapterStatus.status).to.equal(200);
      expect(adapterStatus.json?.ok).to.equal(true);
      expect(adapterStatus.json?.endpointUrl).to.equal(`${adapterBaseUrl}${adapterEndpointPath}`);

      const payload = Buffer.from('microblog-remote-upload', 'utf-8');
      const uploadRes = await request(`${adapterBaseUrl}${adapterEndpointPath}`, {
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          'x-tokenhost-upload-filename': 'microblog.png',
          'x-tokenhost-upload-size': String(payload.length)
        },
        body: payload
      });

      expect(uploadRes.status).to.equal(200);
      expect(uploadRes.json?.ok).to.equal(true);
      expect(String(uploadRes.json?.upload?.url || '')).to.match(/^http:\/\/127\.0\.0\.1:\d+\/uploads\/.+/);
    } finally {
      if (preview) preview.kill('SIGINT');
      adapter.kill('SIGINT');
    }
  });
});
