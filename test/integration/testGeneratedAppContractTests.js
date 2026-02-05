import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

function runTh(args, cwd) {
  return spawnSync('node', [path.resolve('packages/cli/dist/index.js'), ...args], {
    cwd,
    encoding: 'utf-8'
  });
}

function runCmd(cmd, args, cwd, extraEnv = {}) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...extraEnv }
  });
}

function hasAnvil() {
  const res = spawnSync('anvil', ['--version'], { encoding: 'utf-8' });
  if (res.error && res.error.code === 'ENOENT') return false;
  return res.status === 0;
}

async function tryGetChainIdHex(rpcUrl) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
  });
  if (!res.ok) return null;
  const json = await res.json();
  return typeof json?.result === 'string' ? json.result : null;
}

async function waitForRpc(rpcUrl, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const hex = await tryGetChainIdHex(rpcUrl);
      if (hex) return hex;
    } catch {
      // continue polling
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for RPC at ${rpcUrl}`);
}

describe('Generated app contract tests', function () {
  it('emits and runs schema-driven contract integration tests for canonical job-board output', async function () {
    this.timeout(240000);
    if (!hasAnvil()) this.skip();

    const schemaPath = path.join(process.cwd(), 'apps', 'example', 'job-board.schema.json');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-generated-app-tests-'));
    const uiDir = path.join(outDir, 'ui');

    const generateRes = runTh(['generate', schemaPath, '--out', outDir, '--with-tests'], process.cwd());
    expect(generateRes.status, generateRes.stderr || generateRes.stdout).to.equal(0);

    const installRes = runCmd('pnpm', ['install'], uiDir, { NEXT_TELEMETRY_DISABLED: '1' });
    expect(installRes.status, installRes.stderr || installRes.stdout).to.equal(0);

    const port = 45000 + Math.floor(Math.random() * 1000);
    const rpcUrl = `http://127.0.0.1:${port}`;
    const anvil = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
      await waitForRpc(rpcUrl, 15000);
      const testRes = runCmd('node', ['tests/contract/integration.mjs'], uiDir, {
        TH_RPC_URL: rpcUrl
      });
      expect(testRes.status, testRes.stderr || testRes.stdout).to.equal(0);
      expect(testRes.stdout).to.include('PASS contract integration scaffold');
    } finally {
      anvil.kill('SIGINT');
    }
  });
});
