import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

function runTh(args, cwd) {
  return spawnSync('node', [path.resolve('packages/cli/dist/index.js'), ...args], {
    cwd,
    encoding: 'utf-8'
  });
}

describe('th build (benchmark registry schema)', function () {
  it('builds the benchmark registry schema that previously overflowed generator stack pressure', function () {
    this.timeout(60000);

    const schemaPath = path.resolve('test/fixtures/benchmark-registry.schema.json');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-benchmark-registry-'));
    const res = runTh(['build', schemaPath, '--out', outDir, '--no-ui'], process.cwd());

    expect(res.status, res.stderr || res.stdout).to.equal(0);
    expect(fs.existsSync(path.join(outDir, 'contracts', 'App.sol'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'compiled', 'App.json'))).to.equal(true);

    const appSol = fs.readFileSync(path.join(outDir, 'contracts', 'App.sol'), 'utf-8');
    expect(appSol).to.include('struct CreateBenchmarkRunInput');
    expect(appSol).to.include('function createBenchmarkRun(CreateBenchmarkRunInput calldata input)');
    expect(appSol).to.include('function _recordHashBenchmarkRun');

    const compiled = JSON.parse(fs.readFileSync(path.join(outDir, 'compiled', 'App.json'), 'utf-8'));
    expect(String(compiled.compilerProfile || '')).to.match(/auto|large-app/);
  });

  it('generates a local dev UI scaffold with the compiled ABI published into public/', function () {
    this.timeout(60000);

    const schemaPath = path.resolve('test/fixtures/benchmark-registry.schema.json');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-benchmark-registry-generate-'));
    const res = runTh(['generate', schemaPath, '--out', outDir], process.cwd());

    expect(res.status, res.stderr || res.stdout).to.equal(0);
    expect(fs.existsSync(path.join(outDir, 'compiled', 'App.json'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'ui', 'public', 'compiled', 'App.json'))).to.equal(true);
  });
});
