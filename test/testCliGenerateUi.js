import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeCompiledArtifact(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        contractName: 'App',
        abi: [],
        bytecode: '0x00',
        deployedBytecode: '0x00',
        compilerProfile: 'default'
      },
      null,
      2
    )
  );
}

function writeManifest(filePath, overrides = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        appName: 'Test App',
        appSlug: 'test-app',
        ui: { baseUrl: 'http://127.0.0.1:3001/' },
        deployments: [
          {
            chainId: 314159,
            chainName: 'filecoin_calibration',
            contractAddress: '0x0000000000000000000000000000000000000001'
          }
        ],
        ...overrides
      },
      null,
      2
    )
  );
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

function readTemplateThemeTokens() {
  return fs.readFileSync(path.join(process.cwd(), 'packages', 'templates', 'next-export-ui', 'src', 'theme', 'tokens.json'), 'utf-8');
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

function minimalSchemaWithThemePreset() {
  const schema = minimalSchema();
  schema.app.theme = { preset: 'cyber-grid' };
  return schema;
}

function schemaWithUiOverrides() {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: {
      name: 'UI Extension App',
      slug: 'ui-extension-app',
      features: { uploads: false, onChainIndexing: true },
      ui: {
        homePage: { mode: 'custom' },
        extensions: { directory: 'ui-overrides' }
      }
    },
    collections: [
      {
        name: 'Artifact',
        fields: [
          {
            name: 'artifactUrl',
            type: 'string',
            required: true,
            ui: {
              component: 'externalLink',
              label: 'Open artifact',
              target: '_blank'
            }
          }
        ],
        createRules: { required: ['artifactUrl'], access: 'public' },
        visibilityRules: { gets: ['artifactUrl'], access: 'public' },
        updateRules: { mutable: ['artifactUrl'], access: 'owner' },
        deleteRules: { softDelete: true, access: 'owner' },
        indexes: { unique: [], index: [] }
      }
    ]
  };
}

describe('th generate (UI template)', function () {
  this.timeout(180000);

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
    expect(layoutSource).to.include('themeBootScript');
    expect(layoutSource).to.not.include('/tokenhost/ops');

    const generatedTokens = fs.readFileSync(path.join(outDir, 'ui', 'src', 'theme', 'tokens.json'), 'utf-8');
    expect(generatedTokens).to.equal(readTemplateThemeTokens());
    expect(generatedTokens).to.include('"primary": "#00d4ff"');

    const generatedTx = fs.readFileSync(path.join(outDir, 'ui', 'src', 'lib', 'tx.ts'), 'utf-8');
    expect(generatedTx).to.include('const relayReceipt = body.receipt ?? null;');
    expect(generatedTx).to.include("if (relayReceipt) {");

    const generatedCollectionPage = fs.readFileSync(path.join(outDir, 'ui', 'app', '[collection]', 'ClientPage.tsx'), 'utf-8');
    expect(generatedCollectionPage).to.include('getReadRpcUrl');
    expect(generatedCollectionPage).to.include('rpcOverride || getReadRpcUrl(m) || undefined');

    const generatedClients = fs.readFileSync(path.join(outDir, 'ui', 'src', 'lib', 'clients.ts'), 'utf-8');
    expect(generatedClients).to.include('async function refreshWalletChainConfig');
    expect(generatedClients).to.include('wallet.addChain({ chain })');
  });

  it('materializes the explicit cyber-grid theme preset into generated UI output', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-theme-preset-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchemaWithThemePreset());

    const res = runTh(['generate', schemaPath, '--out', outDir], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const generatedThs = fs.readFileSync(path.join(outDir, 'ui', 'src', 'generated', 'ths.ts'), 'utf-8');
    expect(generatedThs).to.include('"preset": "cyber-grid"');

    const generatedTokens = fs.readFileSync(path.join(outDir, 'ui', 'src', 'theme', 'tokens.json'), 'utf-8');
    expect(generatedTokens).to.equal(readTemplateThemeTokens());
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

  it('applies schema-declared UI overrides during generate', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-overrides-'));
    const schemaPath = path.join(dir, 'schema.json');
    const overridesDir = path.join(dir, 'ui-overrides');
    const outDir = path.join(dir, 'out');

    writeJson(schemaPath, schemaWithUiOverrides());
    fs.mkdirSync(path.join(overridesDir, 'app', 'run'), { recursive: true });
    fs.writeFileSync(
      path.join(overridesDir, 'app', 'page.tsx'),
      "export default function HomePage(){return <div>custom-home-marker</div>;}\n"
    );
    fs.writeFileSync(
      path.join(overridesDir, 'app', 'run', 'page.tsx'),
      "export default function RunPage(){return <div>custom-run-page</div>;}\n"
    );

    const res = runTh(['generate', schemaPath, '--out', outDir], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const homePage = fs.readFileSync(path.join(outDir, 'ui', 'app', 'page.tsx'), 'utf-8');
    expect(homePage).to.include('custom-home-marker');
    expect(fs.existsSync(path.join(outDir, 'ui', 'app', 'run', 'page.tsx'))).to.equal(true);

    const generatedThs = fs.readFileSync(path.join(outDir, 'ui', 'src', 'generated', 'ths.ts'), 'utf-8');
    expect(generatedThs).to.include('"component": "externalLink"');
    expect(generatedThs).to.include('"directory": "ui-overrides"');
  });

  it('builds the canonical microblog example UI with custom home/tag routes', function () {
    this.timeout(180000);

    const schemaPath = path.join(process.cwd(), 'apps', 'example', 'microblog.schema.json');
    const outDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'th-microblog-ui-')), 'out');

    const res = runTh(['generate', schemaPath, '--out', outDir], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const uiDir = path.join(outDir, 'ui');
    expect(fs.existsSync(path.join(uiDir, 'app', 'page.tsx'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, 'app', 'tag', 'page.tsx'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, 'app', 'Post', 'page.tsx'))).to.equal(true);
    const generatedThs = fs.readFileSync(path.join(uiDir, 'src', 'generated', 'ths.ts'), 'utf-8');
    expect(generatedThs).to.include('"preset": "cyber-grid"');
    expect(generatedThs).to.include('"authorProfile"');
    expect(generatedThs).to.not.include('"authorHandle"');

    const install = runCmd('pnpm', ['install'], uiDir);
    expect(install.status, install.stderr || install.stdout).to.equal(0);

    const build = runCmd('pnpm', ['build'], uiDir);
    expect(build.status, build.stderr || build.stdout).to.equal(0);
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

  it('replaces stale generated UI output on repeated generate', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-regenerate-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());

    const first = runTh(['generate', schemaPath, '--out', outDir], process.cwd());
    expect(first.status, first.stderr || first.stdout).to.equal(0);

    const staleFile = path.join(outDir, 'ui', 'app', 'stale-marker.txt');
    fs.mkdirSync(path.dirname(staleFile), { recursive: true });
    fs.writeFileSync(staleFile, 'stale');
    expect(fs.existsSync(staleFile)).to.equal(true);

    const second = runTh(['generate', schemaPath, '--out', outDir], process.cwd());
    expect(second.status, second.stderr || second.stdout).to.equal(0);
    expect(fs.existsSync(staleFile)).to.equal(false);
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

describe('th ui sync', function () {
  this.timeout(180000);

  it('refreshes generated UI from existing compiled artifacts without regenerating contracts', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-sync-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());
    writeCompiledArtifact(path.join(outDir, 'compiled', 'App.json'));
    writeManifest(path.join(outDir, 'manifest.json'));

    const res = runTh(['ui', 'sync', schemaPath, '--out', outDir], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    expect(fs.existsSync(path.join(outDir, 'ui', 'package.json'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'ui', 'src', 'generated', 'ths.ts'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'ui', 'public', 'compiled', 'App.json'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'ui', 'public', 'manifest.json'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'ui', 'public', '.well-known', 'tokenhost', 'manifest.json'))).to.equal(true);
    expect(fs.existsSync(path.join(outDir, 'contracts', 'App.sol'))).to.equal(false);
  });

  it('replaces stale UI output during sync and reapplies schema-declared overrides', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-sync-overrides-'));
    const schemaPath = path.join(dir, 'schema.json');
    const overridesDir = path.join(dir, 'ui-overrides');
    const outDir = path.join(dir, 'out');

    writeJson(schemaPath, schemaWithUiOverrides());
    writeCompiledArtifact(path.join(outDir, 'compiled', 'App.json'));
    fs.mkdirSync(path.join(overridesDir, 'app', 'run'), { recursive: true });
    fs.writeFileSync(
      path.join(overridesDir, 'app', 'page.tsx'),
      "export default function HomePage(){return <div>custom-home-marker</div>;}\n"
    );
    fs.writeFileSync(
      path.join(overridesDir, 'app', 'run', 'page.tsx'),
      "export default function RunPage(){return <div>custom-run-page</div>;}\n"
    );

    const first = runTh(['ui', 'sync', schemaPath, '--out', outDir], process.cwd());
    expect(first.status, first.stderr || first.stdout).to.equal(0);

    const staleFile = path.join(outDir, 'ui', 'app', 'stale-marker.txt');
    fs.mkdirSync(path.dirname(staleFile), { recursive: true });
    fs.writeFileSync(staleFile, 'stale');

    const second = runTh(['ui', 'sync', schemaPath, '--out', outDir], process.cwd());
    expect(second.status, second.stderr || second.stdout).to.equal(0);
    expect(fs.existsSync(staleFile)).to.equal(false);

    const homePage = fs.readFileSync(path.join(outDir, 'ui', 'app', 'page.tsx'), 'utf-8');
    expect(homePage).to.include('custom-home-marker');
    expect(fs.existsSync(path.join(outDir, 'ui', 'app', 'run', 'page.tsx'))).to.equal(true);
  });

  it('preserves lockfiles and existing node_modules when package.json is unchanged', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-sync-preserve-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    const uiDir = path.join(outDir, 'ui');

    writeJson(schemaPath, minimalSchema());
    writeCompiledArtifact(path.join(outDir, 'compiled', 'App.json'));
    writeManifest(path.join(outDir, 'manifest.json'));

    const first = runTh(['ui', 'sync', schemaPath, '--out', outDir], process.cwd());
    expect(first.status, first.stderr || first.stdout).to.equal(0);

    fs.writeFileSync(path.join(uiDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    fs.mkdirSync(path.join(uiDir, 'node_modules', '.keep'), { recursive: true });
    fs.writeFileSync(path.join(uiDir, 'node_modules', '.keep', 'marker.txt'), 'present\n');

    const second = runTh(['ui', 'sync', schemaPath, '--out', outDir], process.cwd());
    expect(second.status, second.stderr || second.stdout).to.equal(0);
    expect(fs.readFileSync(path.join(uiDir, 'pnpm-lock.yaml'), 'utf-8')).to.equal('lockfileVersion: 9.0\n');
    expect(fs.readFileSync(path.join(uiDir, 'node_modules', '.keep', 'marker.txt'), 'utf-8')).to.equal('present\n');
  });

  it('fails clearly when compiled artifacts are missing', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-sync-missing-compiled-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, minimalSchema());

    const res = runTh(['ui', 'sync', schemaPath, '--out', outDir], process.cwd());
    expect(res.status).to.not.equal(0);
    expect(res.stderr || res.stdout).to.include('Missing compiled/App.json');
  });
});
