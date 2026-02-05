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
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

function minimalSchemaText() {
  return JSON.stringify(
    {
      thsVersion: '2025-12',
      schemaVersion: '0.0.1',
      app: {
        name: 'Studio Test App',
        slug: 'studio-test-app',
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
          transferRules: { access: 'owner' },
          indexes: { unique: [], index: [] }
        }
      ]
    },
    null,
    2
  );
}

describe('th studio local schema builder', function () {
  it('serves local UI and supports load/validate/save with preview output', async function () {
    this.timeout(120000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-studio-'));
    const schemaPath = path.join(dir, 'schema.json');
    const savedPath = path.join(dir, 'saved.schema.json');
    fs.writeFileSync(schemaPath, `${minimalSchemaText()}\n`);

    const host = '127.0.0.1';
    const port = 47000 + Math.floor(Math.random() * 1000);
    const baseUrl = `http://${host}:${port}`;

    const studio = spawn(
      'node',
      [path.resolve('packages/cli/dist/index.js'), 'studio', '--schema', schemaPath, '--host', host, '--port', String(port)],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
    );

    try {
      await waitForOutput(studio, new RegExp(`${baseUrl}/`), 30000);

      const home = await request(`${baseUrl}/`);
      expect(home.status).to.equal(200);
      expect(home.text).to.include('Token Host Studio (Local)');

      const state = await request(`${baseUrl}/api/state`);
      expect(state.status).to.equal(200);
      expect(state.json?.schemaPath).to.equal(path.resolve(schemaPath));
      expect(String(state.json?.schemaText || '')).to.include('"studio-test-app"');

      const invalidValidation = await request(`${baseUrl}/api/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schemaText: '{invalid' })
      });
      expect(invalidValidation.status).to.equal(200);
      expect(invalidValidation.json?.ok).to.equal(false);

      const validValidation = await request(`${baseUrl}/api/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schemaText: minimalSchemaText() })
      });
      expect(validValidation.status).to.equal(200);
      expect(validValidation.json?.ok).to.equal(true);
      expect(validValidation.json?.preview?.collections?.[0]?.name).to.equal('Item');

      const saveRes = await request(`${baseUrl}/api/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: savedPath, schemaText: minimalSchemaText() })
      });
      expect(saveRes.status).to.equal(200);
      expect(saveRes.json?.ok).to.equal(true);
      expect(fs.existsSync(savedPath)).to.equal(true);
      expect(fs.readFileSync(savedPath, 'utf-8')).to.include('"studio-test-app"');

      const loadRes = await request(`${baseUrl}/api/load`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: savedPath })
      });
      expect(loadRes.status).to.equal(200);
      expect(loadRes.json?.ok).to.equal(true);
      expect(String(loadRes.json?.schemaText || '')).to.include('"studio-test-app"');
    } finally {
      studio.kill('SIGINT');
    }
  });
});
