import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function runTh(args, cwd, env = {}) {
  return spawnSync('node', [path.resolve('packages/cli/dist/index.js'), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...env }
  });
}

function writeVerifyFixtureBuild(outDir) {
  const manifest = {
    manifestVersion: '0.1.0',
    app: { slug: 'verify-test', title: 'Verify Test' },
    schema: { version: '0.0.1', thsVersion: '2025-12', schemaHash: 'sha256:test' },
    build: {
      generatedAt: new Date().toISOString(),
      toolchain: { node: '20.x', solc: '0.8.24' }
    },
    deployments: [
      {
        role: 'primary',
        chainId: 11155111,
        deploymentEntrypointAddress: '0x1111111111111111111111111111111111111111',
        blockNumber: 1,
        txHash: '0x' + '1'.repeat(64),
        adminAddress: '0x2222222222222222222222222222222222222222',
        treasuryAddress: '0x3333333333333333333333333333333333333333',
        contracts: [
          {
            name: 'App',
            address: '0x1111111111111111111111111111111111111111',
            verified: false
          }
        ],
        verified: false
      }
    ],
    artifacts: {
      soliditySources: { digest: 'sha256:test', url: 'file:///tmp/sources.tgz' },
      compiledContracts: { digest: 'sha256:test', url: 'file:///tmp/compiled.tgz' }
    },
    signatures: [{ alg: 'none', sig: 'UNSIGNED' }]
  };

  writeJson(path.join(outDir, 'manifest.json'), manifest);
  writeJson(path.join(outDir, 'compiled', 'App.json'), {
    abi: [],
    evm: {
      bytecode: { object: '6080604052348015600f57600080fd5b50600080fdfea2646970667358221220' },
      deployedBytecode: { object: '6080604052600080fdfea2646970667358221220' }
    }
  });
  fs.mkdirSync(path.join(outDir, 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'contracts', 'App.sol'),
    [
      '// SPDX-License-Identifier: MIT',
      'pragma solidity ^0.8.24;',
      '',
      'contract App {',
      '  function ping() external pure returns (uint256) { return 1; }',
      '}',
      ''
    ].join('\n')
  );
}

describe('th verify', function () {
  it('fails when Etherscan key is missing', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-verify-no-key-'));
    writeVerifyFixtureBuild(dir);

    const res = runTh(['verify', dir, '--chain', 'sepolia', '--verifier', 'etherscan', '--dry-run'], process.cwd(), {
      ETHERSCAN_API_KEY: ''
    });

    expect(res.status).to.not.equal(0);
    expect(res.stderr).to.include('Missing Etherscan API key');
  });

  it('redacts Etherscan key in dry-run output', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-verify-redact-'));
    writeVerifyFixtureBuild(dir);
    const secret = 'SUPER_SECRET_ETHERSCAN_KEY';

    const res = runTh(
      ['verify', dir, '--chain', 'sepolia', '--verifier', 'etherscan', '--dry-run', '--etherscan-api-key', secret],
      process.cwd()
    );

    expect(res.status, res.stderr || res.stdout).to.equal(0);
    expect(res.stdout).to.include('forge verify-contract');
    expect(res.stdout).to.include('--etherscan-api-key <redacted>');
    expect(res.stdout).to.not.include(secret);
  });

  it('supports sourcify dry-run without forge installed', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-verify-sourcify-'));
    writeVerifyFixtureBuild(dir);

    const res = runTh(['verify', dir, '--chain', 'sepolia', '--verifier', 'sourcify', '--dry-run'], process.cwd());

    expect(res.status, res.stderr || res.stdout).to.equal(0);
    expect(res.stdout).to.include('--verifier sourcify');
    expect(res.stdout).to.include('Dry run complete');
  });
});
