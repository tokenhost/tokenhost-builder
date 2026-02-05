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

describe('Generated app UI tests', function () {
  it('emits schema-aware UI smoke tests that pass against canonical job-board preview', async function () {
    this.timeout(240000);
    if (!hasAnvil()) this.skip();

    const schemaPath = path.join(process.cwd(), 'apps', 'example', 'job-board.schema.json');
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-generated-ui-tests-'));
    const generateOut = path.join(rootDir, 'generated');
    const buildOut = path.join(rootDir, 'build');
    const uiDir = path.join(generateOut, 'ui');

    const generateRes = runTh(['generate', schemaPath, '--out', generateOut, '--with-tests'], process.cwd());
    expect(generateRes.status, generateRes.stderr || generateRes.stdout).to.equal(0);

    const installRes = runCmd('pnpm', ['install'], uiDir, { NEXT_TELEMETRY_DISABLED: '1' });
    expect(installRes.status, installRes.stderr || installRes.stdout).to.equal(0);

    const buildRes = runTh(['build', schemaPath, '--out', buildOut], process.cwd());
    expect(buildRes.status, buildRes.stderr || buildRes.stdout).to.equal(0);

    const host = '127.0.0.1';
    const port = 46000 + Math.floor(Math.random() * 1000);
    const baseUrl = `http://${host}:${port}`;
    const preview = spawn(
      'node',
      [path.resolve('packages/cli/dist/index.js'), 'preview', buildOut, '--host', host, '--port', String(port)],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
    );

    try {
      await waitForOutput(preview, new RegExp(`${baseUrl}/`), 90000);
      const uiTestRes = runCmd('pnpm', ['run', 'test:ui'], uiDir, {
        NEXT_TELEMETRY_DISABLED: '1',
        TH_UI_BASE_URL: baseUrl
      });
      expect(uiTestRes.status, uiTestRes.stderr || uiTestRes.stdout).to.equal(0);
      expect(uiTestRes.stdout).to.include('PASS ui smoke scaffold (live checks @');
    } finally {
      preview.kill('SIGINT');
    }
  });
});
