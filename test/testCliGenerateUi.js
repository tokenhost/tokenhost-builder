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
  schema.app.brand = { primaryText: 'micro', accentText: 'blog' };
  schema.app.primaryCollection = 'Item';
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

function schemaWithReferenceRelation() {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: {
      name: 'Reference App',
      slug: 'reference-app',
      features: { uploads: false, onChainIndexing: true }
    },
    collections: [
      {
        name: 'Profile',
        fields: [{ name: 'handle', type: 'string', required: true }],
        createRules: { required: ['handle'], access: 'public' },
        visibilityRules: { gets: ['handle'], access: 'public' },
        updateRules: { mutable: ['handle'], access: 'owner' },
        deleteRules: { softDelete: true, access: 'owner' },
        transferRules: { access: 'owner' },
        indexes: { unique: [{ field: 'handle', scope: 'allTime' }], index: [] }
      },
      {
        name: 'Post',
        fields: [
          { name: 'authorProfile', type: 'reference', required: true },
          { name: 'body', type: 'string', required: true }
        ],
        createRules: { required: ['authorProfile', 'body'], access: 'public' },
        visibilityRules: { gets: ['authorProfile', 'body'], access: 'public' },
        updateRules: { mutable: ['body'], access: 'owner' },
        deleteRules: { softDelete: true, access: 'owner' },
        transferRules: { access: 'owner' },
        indexes: { unique: [], index: [{ field: 'authorProfile' }] },
        relations: [{ field: 'authorProfile', to: 'Profile', enforce: true, reverseIndex: true }]
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
    expect(layoutSource).to.not.include('href=\"/\">Overview</Link>');
    expect(layoutSource).to.include('Create {primaryModel.name}');
    expect(layoutSource).to.include('brandPrimary');

    const generatedTokens = fs.readFileSync(path.join(outDir, 'ui', 'src', 'theme', 'tokens.json'), 'utf-8');
    expect(generatedTokens).to.equal(readTemplateThemeTokens());
    expect(generatedTokens).to.include('"primary": "#00d4ff"');

    const generatedTx = fs.readFileSync(path.join(outDir, 'ui', 'src', 'lib', 'tx.ts'), 'utf-8');
    expect(generatedTx).to.include('const relayReceipt = body.receipt ?? null;');
    expect(generatedTx).to.include("if (relayReceipt) {");
    expect(generatedTx).to.include('assertWalletRpcMatchesDeployment');
    expect(generatedTx).to.include('Wallet RPC is not pointed at the same deployment as this app.');
    expect(generatedTx).to.include('async function estimateWriteGas');
    expect(generatedTx).to.include('const gas = await estimateWriteGas');
    expect(generatedTx).to.include('gas,');

    const generatedCollectionPage = fs.readFileSync(path.join(outDir, 'ui', 'app', '[collection]', 'ClientPage.tsx'), 'utf-8');
    expect(generatedCollectionPage).to.include('getReadRpcUrl');
    expect(generatedCollectionPage).to.include('rpcOverride || getReadRpcUrl(m) || undefined');

    const generatedRuntime = fs.readFileSync(path.join(outDir, 'ui', 'src', 'lib', 'runtime.ts'), 'utf-8');
    expect(generatedRuntime).to.include('getListMaxLimit');
    expect(generatedRuntime).to.include('function clampListPageSize');

    const generatedImageField = fs.readFileSync(path.join(outDir, 'ui', 'src', 'components', 'ImageFieldInput.tsx'), 'utf-8');
    expect(generatedImageField).to.include('onBusyChange');
    expect(generatedImageField).to.include('Long-running upload');
    expect(generatedImageField).to.include('Retry');

    const generatedUpload = fs.readFileSync(path.join(outDir, 'ui', 'src', 'lib', 'upload.ts'), 'utf-8');
    expect(generatedUpload).to.include('buildUploadNetworkError');
    expect(generatedUpload).to.include('xhr.timeout = 5 * 60 * 1000;');
    expect(generatedUpload).to.include("phase: 'accepted'");
    expect(generatedUpload).to.include('Token Host accepted the upload');

    const generatedClients = fs.readFileSync(path.join(outDir, 'ui', 'src', 'lib', 'clients.ts'), 'utf-8');
    expect(generatedClients).to.include('async function refreshWalletChainConfig');
    expect(generatedClients).to.include("requestProvider('wallet_addEthereumChain'");
    expect(generatedClients).to.include("requestProvider('wallet_switchEthereumChain'");
    expect(generatedClients).to.include('async function assertWalletTracksTargetLocalRpc');
    expect(generatedClients).to.include('export function makeInjectedPublicClient');
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
    expect(generatedThs).to.include('"primaryText": "micro"');
    expect(generatedThs).to.include('"primaryCollection": "Item"');

    const generatedTokens = fs.readFileSync(path.join(outDir, 'ui', 'src', 'theme', 'tokens.json'), 'utf-8');
    expect(generatedTokens).to.equal(readTemplateThemeTokens());

    const generatedThsLib = fs.readFileSync(path.join(outDir, 'ui', 'src', 'lib', 'ths.ts'), 'utf-8');
    expect(generatedThsLib).to.include('export function collectionNavLabel');

    const generatedLayout = fs.readFileSync(path.join(outDir, 'ui', 'app', 'layout.tsx'), 'utf-8');
    expect(generatedLayout).to.include('collectionNavLabel(collection)');
    expect(generatedLayout).to.not.include('<a className="navRailLink" href="/.well-known/tokenhost/manifest.json">Manifest</a>');
  });

  it('upstreams relation metadata into reference-aware generated CRUD UI', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-reference-'));
    const schemaPath = path.join(dir, 'schema.json');
    const outDir = path.join(dir, 'out');
    writeJson(schemaPath, schemaWithReferenceRelation());

    const res = runTh(['generate', schemaPath, '--out', outDir], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const generatedThs = fs.readFileSync(path.join(outDir, 'ui', 'src', 'generated', 'ths.ts'), 'utf-8');
    expect(generatedThs).to.include('"relations"');
    expect(generatedThs).to.include('"authorProfile"');
    expect(generatedThs).to.include('"to": "Profile"');

    const generatedReferenceField = fs.readFileSync(path.join(outDir, 'ui', 'src', 'components', 'ReferenceFieldInput.tsx'), 'utf-8');
    expect(generatedReferenceField).to.include('useOwnedReferenceOptions');
    expect(generatedReferenceField).to.include('Owned records appear first');
    expect(generatedReferenceField).to.include("href={`/${relatedCollection.name}/?mode=new`}");

    const generatedAccount = fs.readFileSync(path.join(outDir, 'ui', 'src', 'lib', 'account.ts'), 'utf-8');
    expect(generatedAccount).to.include("const ACCOUNT_EVENT_NAME = 'tokenhost:account-changed'");
    expect(generatedAccount).to.include('export function subscribeStoredAccount');

    const generatedResolvedReference = fs.readFileSync(path.join(outDir, 'ui', 'src', 'components', 'ResolvedReferenceValue.tsx'), 'utf-8');
    expect(generatedResolvedReference).to.include('getRelatedCollection');
    expect(generatedResolvedReference).to.include("href={`/${relatedCollection.name}/?mode=view&id=${String(id)}`}");

    const generatedRelations = fs.readFileSync(path.join(outDir, 'ui', 'src', 'lib', 'relations.ts'), 'utf-8');
    expect(generatedRelations).to.include('resolveReferenceRecords');
    expect(generatedRelations).to.include('listOwnedRecords');
    expect(generatedRelations).to.include('useOwnedReferenceOptions');
    expect(generatedRelations).to.include('useRequiredReferenceCreationGates');
    expect(generatedRelations).to.include('TH_REFERENCE_SELECTION');
    expect(generatedRelations).to.include('subscribeStoredAccount');
    expect(generatedRelations).to.include('maxRecords: 1');

    const generatedNewPage = fs.readFileSync(path.join(outDir, 'ui', 'app', '[collection]', 'new', 'ClientPage.tsx'), 'utf-8');
    expect(generatedNewPage).to.include('ReferenceFieldInput');
    expect(generatedNewPage).to.include("f.type === 'reference'");
    expect(generatedNewPage).to.include('You must create a');
    expect(generatedNewPage).to.include('Checking required linked records before showing the form.');
    expect(generatedNewPage).to.include('Waiting for media upload…');
    expect(generatedNewPage).to.include('textareaFeature');

    const generatedEditPage = fs.readFileSync(path.join(outDir, 'ui', 'app', '[collection]', 'edit', 'ClientPage.tsx'), 'utf-8');
    expect(generatedEditPage).to.include('ReferenceFieldInput');
    expect(generatedEditPage).to.include('Waiting for media upload…');
    expect(generatedEditPage).to.include('textareaFeature');

    const generatedViewPage = fs.readFileSync(path.join(outDir, 'ui', 'app', '[collection]', 'view', 'ClientPage.tsx'), 'utf-8');
    expect(generatedViewPage).to.include('ResolvedReferenceValue');

    const generatedRecordCard = fs.readFileSync(path.join(outDir, 'ui', 'src', 'components', 'RecordCard.tsx'), 'utf-8');
    expect(generatedRecordCard).to.include('ResolvedReferenceValue');

    const generatedApp = fs.readFileSync(path.join(outDir, 'ui', 'src', 'lib', 'app.ts'), 'utf-8');
    expect(generatedApp).to.include('function fnListOwnedIds');
    expect(generatedApp).to.include('function listOwnedRecordsPage');
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

  it('builds the canonical microblog example UI from generated feed/token config', function () {
    this.timeout(180000);

    const schemaPath = path.join(process.cwd(), 'apps', 'example', 'microblog.schema.json');
    const outDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'th-microblog-ui-')), 'out');

    const res = runTh(['generate', schemaPath, '--out', outDir], process.cwd());
    expect(res.status, res.stderr || res.stdout).to.equal(0);

    const uiDir = path.join(outDir, 'ui');
    expect(fs.existsSync(path.join(uiDir, 'app', 'page.tsx'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, 'app', 'tag', 'page.tsx'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, 'app', 'Post', 'page.tsx'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, 'src', 'components', 'GeneratedHomePageClient.tsx'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, 'src', 'components', 'GeneratedTokenPageClient.tsx'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, 'src', 'components', 'GeneratedFeedStream.tsx'))).to.equal(true);
    expect(fs.existsSync(path.join(uiDir, 'src', 'components', 'MicroblogHomeClient.tsx'))).to.equal(false);
    expect(fs.existsSync(path.join(uiDir, 'src', 'components', 'MicroblogTagClient.tsx'))).to.equal(false);
    const generatedThs = fs.readFileSync(path.join(uiDir, 'src', 'generated', 'ths.ts'), 'utf-8');
    expect(generatedThs).to.include('"preset": "cyber-grid"');
    expect(generatedThs).to.include('"authorProfile"');
    expect(generatedThs).to.not.include('"authorHandle"');
    expect(generatedThs).to.include('"homeSections"');
    expect(generatedThs).to.include('"tokenPages"');
    expect(generatedThs).to.include('"feeds"');
    expect(generatedThs).to.not.include('"extensions": {');

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
