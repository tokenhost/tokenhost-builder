import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import Web3 from 'web3';

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

async function request(url, init) {
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

describe('Job Board canonical app integration', function () {
  it('validates end-to-end behavior for build + preview + contract CRUD/payment paths', async function () {
    this.timeout(240000);
    if (!hasAnvil()) this.skip();

    const schemaPath = path.join(process.cwd(), 'apps', 'example', 'job-board.schema.json');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-job-board-'));

    const buildRes = runTh(['build', schemaPath, '--out', outDir], process.cwd());
    expect(buildRes.status, buildRes.stderr || buildRes.stdout).to.equal(0);

    const port = 44000 + Math.floor(Math.random() * 1000);
    const host = '127.0.0.1';
    const baseUrl = `http://${host}:${port}`;

    const preview = spawn(
      'node',
      [path.resolve('packages/cli/dist/index.js'), 'preview', outDir, '--host', host, '--port', String(port)],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
    );

    try {
      await waitForOutput(preview, new RegExp(`http://${host}:${port}/`), 90000);

      const manifestRes = await request(`${baseUrl}/.well-known/tokenhost/manifest.json`);
      expect(manifestRes.status).to.equal(200);

      const deployment = manifestRes.json?.deployments?.find((d) => d?.role === 'primary') ?? manifestRes.json?.deployments?.[0];
      expect(deployment?.deploymentEntrypointAddress).to.match(/^0x[0-9a-fA-F]{40}$/);
      const appAddress = deployment.deploymentEntrypointAddress;
      expect(String(appAddress).toLowerCase()).to.not.equal('0x0000000000000000000000000000000000000000');

      // Route health checks for canonical UI routes.
      for (const route of ['/', '/Candidate/', '/Candidate/new/', '/JobPosting/', '/JobPosting/new/']) {
        const routeRes = await request(`${baseUrl}${route}`);
        expect(routeRes.status, `route ${route} should return 200`).to.equal(200);
      }

      const compiled = JSON.parse(fs.readFileSync(path.join(outDir, 'compiled', 'App.json'), 'utf-8'));
      const abi = compiled.abi;
      expect(Array.isArray(abi)).to.equal(true);

      const web3 = new Web3('http://127.0.0.1:8545');
      const account = web3.eth.accounts.privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      );
      web3.eth.accounts.wallet.add(account);
      web3.eth.defaultAccount = account.address;

      const app = new web3.eth.Contract(abi, appAddress);

      // Candidate create + list + get + update + delete
      await app.methods
        .createCandidate('alice', 'initial bio', 'https://example.com/alice.png')
        .send({ from: account.address, gas: 3_000_000 });

      const candidateIds = await app.methods.listIdsCandidate(0, 10, false).call();
      expect(Array.isArray(candidateIds)).to.equal(true);
      expect(candidateIds.length).to.be.greaterThan(0);
      expect(String(candidateIds[0])).to.equal('1');

      const candidateGet = await app.methods['getCandidate(uint256)'](1).call();
      expect(candidateGet.handle).to.equal('alice');
      expect(candidateGet.bio).to.equal('initial bio');

      await app.methods
        .updateCandidate(1, 'updated bio', 'https://example.com/alice-new.png')
        .send({ from: account.address, gas: 3_000_000 });
      const candidateUpdated = await app.methods['getCandidate(uint256)'](1).call();
      expect(candidateUpdated.bio).to.equal('updated bio');

      await app.methods.deleteCandidate(1).send({ from: account.address, gas: 3_000_000 });
      const candidateWithDeleted = await app.methods['getCandidate(uint256,bool)'](1, true).call();
      expect(Boolean(candidateWithDeleted.isDeleted)).to.equal(true);
      const candidateActiveIds = await app.methods.listIdsCandidate(0, 10, false).call();
      expect(candidateActiveIds.length).to.equal(0);

      // JobPosting paid creates: fail without value, then succeed with required payment.
      let unpaidCreateFailed = false;
      try {
        await app.methods.createJobPosting('Engineer', 'Remote role', '150000').send({
          from: account.address,
          gas: 3_000_000
        });
      } catch {
        unpaidCreateFailed = true;
      }
      expect(unpaidCreateFailed).to.equal(true);

      await app.methods.createJobPosting('Engineer', 'Remote role', '150000').send({
        from: account.address,
        gas: 3_000_000,
        value: '10000000000000000'
      });

      const jobIds = await app.methods.listIdsJobPosting(0, 10, false).call();
      expect(Array.isArray(jobIds)).to.equal(true);
      expect(jobIds.length).to.equal(1);

      const job = await app.methods['getJobPosting(uint256)'](1).call();
      expect(job.title).to.equal('Engineer');

      await app.methods.updateJobPosting(1, 'Updated desc', '175000').send({
        from: account.address,
        gas: 3_000_000
      });
      const jobUpdated = await app.methods['getJobPosting(uint256)'](1).call();
      expect(jobUpdated.description).to.equal('Updated desc');

      await app.methods.deleteJobPosting(1).send({ from: account.address, gas: 3_000_000 });
      const jobWithDeleted = await app.methods['getJobPosting(uint256,bool)'](1, true).call();
      expect(Boolean(jobWithDeleted.isDeleted)).to.equal(true);
    } finally {
      preview.kill('SIGINT');
    }
  });
});
