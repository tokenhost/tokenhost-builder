import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function runTh(args, cwd) {
  const res = spawnSync('node', [path.resolve('packages/cli/dist/index.js'), ...args], {
    cwd,
    encoding: 'utf-8'
  });
  return res;
}

function runCmd(cmd, args, cwd) {
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1'
    }
  });
  return res;
}

function minimalSchema() {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: {
      name: 'UI Test App',
      slug: 'ui-test-app',
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

describe('th generate (UI template)', function () {
  it('emits a Next.js export UI by default', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-gen-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['generate', schemaPath, '--out', outDir], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    expect(fs.existsSync(path.join(outDir, 'contracts', 'App.sol'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'schema.json'))).to.equal(true);

    expect(fs.existsSync(path.join(outDir, 'ui', 'package.json'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'ui', 'app', 'page.tsx'))).to.equal(true);

    const generatedThs = fs.readFileSync(path.join(outDir, 'ui', 'src', 'generated', 'ths.ts'), 'utf-8');
    expect(generatedThs).to.include('export const ths =');
    expect(generatedThs).to.include('"slug": "ui-test-app"');
  });

  it('generated UI builds (next export)', function () {
    this.timeout(180000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-build-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['generate', schemaPath, '--out', outDir], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const uiDir = path.join(outDir, 'ui');
    expect(fs.existsSync(path.join(uiDir, 'package.json'))).to.equal(true);

    // Install and build the generated UI to catch template/runtime regressions.
    const install = runCmd('pnpm', ['install'], uiDir);
    expect(install.status, install.stderr || install.stdout).to.equal(0);

    const build = runCmd('pnpm', ['build'], uiDir);
    expect(build.status, build.stderr || build.stdout).to.equal(0);

    // For `output: export`, Next writes a static export to `out/`.
    expect(fs.existsSync(path.join(uiDir, 'out', 'index.html'))).to.equal(true);
  });

  it('supports --no-ui', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-gen-no-ui-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['generate', schemaPath, '--out', outDir, '--no-ui'], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    expect(fs.existsSync(path.join(outDir, 'contracts', 'App.sol'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'ui'))).to.equal(false);
  });
});
