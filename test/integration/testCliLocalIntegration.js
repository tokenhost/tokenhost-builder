import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

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

function hasAnvil() {
  const res = spawnSync('anvil', ['--version'], { encoding: 'utf-8' });
  if (res.error && res.error.code === 'ENOENT') return false;
  return res.status === 0;
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

async function requestJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function schemaForIntegration() {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: {
      name: 'Integration Test App',
      slug: 'integration-test-app',
      features: { uploads: false, onChainIndexing: true }
    },
    collections: [
      {
        name: 'Candidate',
        fields: [{ name: 'name', type: 'string', required: true }],
        createRules: { required: ['name'], access: 'public' },
        visibilityRules: { gets: ['name'], access: 'public' },
        updateRules: { mutable: ['name'], access: 'owner' },
        deleteRules: { softDelete: true, access: 'owner' },
        transferRules: { access: 'owner' },
        indexes: { unique: [], index: [] }
      }
    ]
  };
}

describe('CLI local integration (anvil + preview + relay)', function () {
  it('builds, auto-deploys in preview, serves manifest, and accepts sponsored relay tx', async function () {
    this.timeout(180000);

    if (!hasAnvil()) this.skip();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-integration-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    const schema = schemaForIntegration();
    writeJson(schemaPath, schema);

    const buildRes = runTh(['build', schemaPath, '--out', outDir], process.cwd());
    expect(buildRes.status, buildRes.stderr || buildRes.stdout).to.equal(0);

    const port = 42000 + Math.floor(Math.random() * 2000);
    const host = '127.0.0.1';
    const baseUrl = `http://${host}:${port}`;

    const preview = spawn(
      'node',
      [path.resolve('packages/cli/dist/index.js'), 'preview', outDir, '--host', host, '--port', String(port)],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
    );

    try {
      const previewReadyPattern = new RegExp(`http://${host}:${port}/`);
      await waitForOutput(preview, previewReadyPattern, 60000);

      const home = await requestJson(`${baseUrl}/`);
      expect(home.status).to.equal(200);

      const manifestRes = await requestJson(`${baseUrl}/.well-known/tokenhost/manifest.json`);
      expect(manifestRes.status).to.equal(200);
      expect(manifestRes.json?.deployments?.[0]?.deploymentEntrypointAddress).to.match(/^0x[0-9a-fA-F]{40}$/);
      expect(manifestRes.json?.deployments?.[0]?.deploymentEntrypointAddress.toLowerCase()).to.not.equal(
        '0x0000000000000000000000000000000000000000'
      );

      const relayStatus = await requestJson(`${baseUrl}/__tokenhost/relay`);
      expect(relayStatus.status).to.equal(200);
      expect(relayStatus.json?.ok).to.equal(true);
      expect(relayStatus.json?.enabled).to.equal(true);
      expect(relayStatus.json?.chainId).to.equal(31337);

      const manifest = manifestRes.json;
      const contractAddress = manifest?.deployments?.[0]?.deploymentEntrypointAddress;
      expect(contractAddress).to.match(/^0x[0-9a-fA-F]{40}$/);

      const compiled = JSON.parse(fs.readFileSync(path.join(outDir, 'compiled', 'App.json'), 'utf-8'));
      const createFn = (compiled?.abi ?? []).find((x) => x && x.type === 'function' && x.name === 'createCandidate');
      expect(createFn).to.be.ok;

      const web3AbiMod = await import('web3-eth-abi');
      const web3Abi = web3AbiMod.default ?? web3AbiMod;
      const calldata = web3Abi.encodeFunctionCall(createFn, [{ name: 'Relay User' }]);

      const relaySubmit = await requestJson(`${baseUrl}/__tokenhost/relay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: contractAddress, data: calldata })
      });
      expect(relaySubmit.status).to.equal(200);
      expect(relaySubmit.json?.ok).to.equal(true);
      expect(String(relaySubmit.json?.txHash || '')).to.match(/^0x[0-9a-fA-F]{64}$/);
    } finally {
      preview.kill('SIGINT');
    }
  });
});
