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
    expect(fs.existsSync(path.join(outDir, 'ui', 'src', 'theme', 'tokens.json'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'ui', 'src', 'components', 'NetworkStatus.tsx'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'ui', 'tests'))).to.equal(false);

    const generatedThs = fs.readFileSync(path.join(outDir, 'ui', 'src', 'generated', 'ths.ts'), 'utf-8');
    expect(generatedThs).to.include('export const ths =');
    expect(generatedThs).to.include('"slug": "ui-test-app"');

    const layoutSource = fs.readFileSync(path.join(outDir, 'ui', 'app', 'layout.tsx'), 'utf-8');
    expect(layoutSource).to.include('NetworkStatus');
    expect(layoutSource).to.include('rootStyleVars');
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

  it('emits generated app test scaffold with --with-tests', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-gen-tests-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['generate', schemaPath, '--out', outDir, '--with-tests'], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const uiDir = path.join(outDir, 'ui');
    expect(fs.existsSync(path.join(uiDir, 'tests', 'contract', 'smoke.mjs'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, 'tests', 'contract', 'integration.mjs'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, 'tests', 'ui', 'smoke.mjs'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, '.github', 'workflows', 'generated-app-ci.yml'))).to.equal(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(uiDir, 'package.json'), 'utf-8'));
    expect(pkg?.scripts?.test).to.equal('pnpm run test:contract && pnpm run test:ui');
    expect(pkg?.scripts?.['test:contract']).to.equal('node tests/contract/integration.mjs');
    expect(pkg?.scripts?.['test:ui']).to.equal('node tests/ui/smoke.mjs');
    expect(pkg?.devDependencies?.solc).to.equal('0.8.24');
    expect(pkg?.devDependencies?.web3).to.equal('^1.3.5');

    const contractSmoke = runCmd('node', ['tests/contract/smoke.mjs'], uiDir);
    expect(contractSmoke.status, contractSmoke.stderr || contractSmoke.stdout).to.equal(0);

    const uiSmoke = runCmd('node', ['tests/ui/smoke.mjs'], uiDir);
    expect(uiSmoke.status, uiSmoke.stderr || uiSmoke.stdout).to.equal(0);

    const workflow = fs.readFileSync(path.join(uiDir, '.github', 'workflows', 'generated-app-ci.yml'), 'utf-8');
    expect(workflow).to.include('pnpm run test:contract');
    expect(workflow).to.include('pnpm run test:ui');
    expect(workflow).to.include('TH_SKIP_CONTRACT_TESTS');
    expect(workflow).to.include('TH_SKIP_UI_TESTS');
    expect(workflow).to.include('TH_INSTALL_BROWSER_DEPS');
  });
});
