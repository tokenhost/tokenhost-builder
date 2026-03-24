import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

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

describe('Standalone remote upload adapter example', function () {
  it('serves the generated UI upload contract in local mode', async function () {
    this.timeout(120000);

    const host = '127.0.0.1';
    const port = 47000 + Math.floor(Math.random() * 1000);
    const baseUrl = `http://${host}:${port}`;
    const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-remote-upload-adapter-'));
    const endpointPath = '/api/upload';
    const statusPath = '/api/upload/status';

    const proc = spawn('node', [path.resolve('examples/upload-adapters/foc-remote-adapter.mjs')], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HOST: host,
        PORT: String(port),
        TH_UPLOAD_ADAPTER_MODE: 'local',
        TH_UPLOAD_ENDPOINT_PATH: endpointPath,
        TH_UPLOAD_STATUS_PATH: statusPath,
        TH_UPLOAD_PUBLIC_BASE_URL: baseUrl,
        TH_UPLOAD_LOCAL_DIR: storageDir
      }
    });

    try {
      await waitForOutput(proc, new RegExp(`Token Host upload adapter listening at http://${host}:${port}`), 30000);

      const health = await request(`${baseUrl}/healthz`);
      expect(health.status).to.equal(200);
      expect(health.json?.ok).to.equal(true);

      const status = await request(`${baseUrl}${statusPath}`);
      expect(status.status).to.equal(200);
      expect(status.json?.ok).to.equal(true);
      expect(status.json?.runnerMode).to.equal('local');
      expect(status.json?.endpointUrl).to.equal(`${baseUrl}${endpointPath}`);
      expect(status.json?.statusUrl).to.equal(`${baseUrl}${statusPath}`);

      const payload = Buffer.from('standalone-upload-adapter-test', 'utf-8');
      const upload = await request(`${baseUrl}${endpointPath}`, {
        method: 'POST',
        headers: {
          'content-type': 'image/png',
          'x-tokenhost-upload-filename': 'adapter.png',
          'x-tokenhost-upload-size': String(payload.length)
        },
        body: payload
      });

      expect(upload.status).to.equal(200);
      expect(upload.json?.ok).to.equal(true);
      expect(String(upload.json?.upload?.url || '')).to.match(new RegExp(`^${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/uploads/.+`));

      const stored = await request(String(upload.json.upload.url));
      expect(stored.status).to.equal(200);
      expect(Buffer.compare(stored.buffer, payload)).to.equal(0);
      expect(String(stored.headers.get('content-type') || '')).to.match(/^image\/png/);
    } finally {
      proc.kill('SIGINT');
    }
  });
});
