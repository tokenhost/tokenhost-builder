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

function minimalSchema() {
  return {
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
  };
}

describe('th studio local schema builder', function () {
  it('serves local UI and supports load/validate/save with preview output', async function () {
    this.timeout(120000);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-studio-'));
    const schemaPath = path.join(dir, 'schema.json');
    const savedPath = path.join(dir, 'saved.schema.json');
    const createdConfigPath = path.resolve(
      process.cwd(),
      'apps',
      `_studio-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      'schema.json'
    );
    fs.writeFileSync(schemaPath, `${JSON.stringify(minimalSchema(), null, 2)}\n`);

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
      expect(home.text).to.not.include('id="schemaText"');

      const state = await request(`${baseUrl}/api/state`);
      expect(state.status).to.equal(200);
      expect(state.json?.schemaPath).to.equal(path.resolve(schemaPath));
      expect(state.json?.formState?.app?.slug).to.equal('studio-test-app');
      expect(state.json?.workspaceRoot).to.equal(process.cwd());

      const configsRes = await request(`${baseUrl}/api/configs`);
      expect(configsRes.status).to.equal(200);
      expect(configsRes.json?.ok).to.equal(true);
      expect(Array.isArray(configsRes.json?.configs)).to.equal(true);

      const invalidValidation = await request(`${baseUrl}/api/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formState: { thsVersion: '2025-12', schemaVersion: '0.0.1', app: {}, collections: [] } })
      });
      expect(invalidValidation.status).to.equal(200);
      expect(invalidValidation.json?.ok).to.equal(false);

      const validValidation = await request(`${baseUrl}/api/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formState: minimalSchema() })
      });
      expect(validValidation.status).to.equal(200);
      expect(validValidation.json?.ok).to.equal(true);
      expect(validValidation.json?.preview?.collections?.[0]?.name).to.equal('Item');

      const saveRes = await request(`${baseUrl}/api/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: savedPath, formState: minimalSchema() })
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
      expect(loadRes.json?.formState?.app?.slug).to.equal('studio-test-app');

      const createRes = await request(`${baseUrl}/api/create-config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Created App',
          slug: 'created-app',
          path: createdConfigPath
        })
      });
      expect(createRes.status).to.equal(200);
      expect(createRes.json?.ok).to.equal(true);
      expect(createRes.json?.created).to.equal(true);
      expect(path.resolve(createRes.json?.path)).to.equal(path.resolve(createdConfigPath));
      expect(createRes.json?.formState?.app?.slug).to.equal('created-app');
      expect(fs.existsSync(createdConfigPath)).to.equal(true);
      expect(fs.readFileSync(createdConfigPath, 'utf-8')).to.include('"created-app"');

      const createdConfigsRes = await request(`${baseUrl}/api/configs`);
      expect(createdConfigsRes.status).to.equal(200);
      expect(createdConfigsRes.json?.configs).to.include(path.resolve(createdConfigPath));
    } finally {
      studio.kill('SIGINT');
      fs.rmSync(path.dirname(createdConfigPath), { recursive: true, force: true });
    }
  });
});
