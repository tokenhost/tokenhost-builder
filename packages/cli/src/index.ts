import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { Command } from 'commander';

import { generateAppSolidity } from '@tokenhost/generator';
import {
  computeSchemaHash,
  importLegacyContractsJson,
  lintThs,
  validateThsStructural,
  type Issue,
  type ThsSchema
} from '@tokenhost/schema';

import { createPublicClient, createWalletClient, http, isAddress, isHex, keccak256, toBytes, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { anvil, sepolia } from 'viem/chains';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020') as typeof import('ajv/dist/2020.js').default;
const addFormats = require('ajv-formats') as any;
const solc = require('solc') as any;

function readJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function sha256Digest(data: Buffer | string): string {
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return `sha256:${hash}`;
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    if (entry.isFile()) out.push(full);
  }
  return out;
}

function computeDirectoryDigest(dir: string): string {
  const files = fs.existsSync(dir) ? listFilesRecursive(dir) : [];
  const entries = files
    .map((filePath) => {
      const rel = path.relative(dir, filePath).replace(/\\\\/g, '/');
      const digest = sha256Digest(fs.readFileSync(filePath));
      return { path: rel, digest };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // RFC 8785 canonicalization + SHA-256 (SPEC 11.6.1).
  return computeSchemaHash({ version: 1, files: entries });
}

function formatIssues(issues: Issue[]): string {
  return issues
    .map((i) => `${i.severity.toUpperCase()} ${i.code} ${i.path} - ${i.message}`)
    .join('\n');
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function findUp(filename: string, startDir: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadRepoSchema(relPath: string): unknown {
  const found = findUp(relPath, process.cwd());
  if (!found) {
    throw new Error(`Could not find ${relPath} (searched upward from ${process.cwd()})`);
  }
  return JSON.parse(fs.readFileSync(found, 'utf-8'));
}

function compileSolidity(sourcePath: string, contents: string, contractName: string): { abi: unknown; bytecode: string; deployedBytecode: string } {
  const input = {
    language: 'Solidity',
    sources: {
      [sourcePath]: { content: contents }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((e: any) => e.severity === 'error');
  if (errors.length > 0) {
    const msg = errors.map((e: any) => e.formattedMessage || e.message).join('\n');
    throw new Error(`Solidity compile failed:\n${msg}`);
  }

  const compiled = output.contracts?.[sourcePath]?.[contractName];
  if (!compiled) {
    throw new Error(`Solidity compile output missing ${contractName} in ${sourcePath}`);
  }

  const abi = compiled.abi;
  const bytecode = `0x${compiled.evm.bytecode.object}`;
  const deployedBytecode = `0x${compiled.evm.deployedBytecode.object}`;
  return { abi, bytecode, deployedBytecode };
}

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((p) => (p.length ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(' ');
}

type KnownChainName = 'anvil' | 'sepolia';

function resolveKnownChain(name: string): { chainName: KnownChainName; chain: any } {
  const n = name.toLowerCase();
  if (n === 'anvil') return { chainName: 'anvil', chain: anvil };
  if (n === 'sepolia') return { chainName: 'sepolia', chain: sepolia };
  throw new Error(`Unknown chain "${name}". Supported: anvil, sepolia`);
}

function envKeyForChain(chainName: KnownChainName, suffix: string): string {
  return `${chainName.toUpperCase()}_${suffix}`;
}

function resolveRpcUrl(chainName: KnownChainName, chain: any, override?: string): string {
  if (override) return override;
  const env = process.env[envKeyForChain(chainName, 'RPC_URL')] || process.env.TH_RPC_URL;
  if (env) return env;
  const fromChain = chain?.rpcUrls?.default?.http?.[0];
  if (fromChain) return fromChain;
  throw new Error(`No RPC URL configured. Provide --rpc or set ${envKeyForChain(chainName, 'RPC_URL')} / TH_RPC_URL.`);
}

const ANVIL_DEFAULT_PRIVATE_KEY: Hex = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function normalizePrivateKey(privateKey: string): Hex {
  const trimmed = privateKey.trim();
  const hex = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('Invalid private key. Expected 32-byte hex string (0x + 64 hex chars).');
  }
  return hex as Hex;
}

function normalizeHexString(value: string, label: string): Hex {
  const trimmed = value.trim();
  const hex = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!isHex(hex)) throw new Error(`Invalid ${label} hex string.`);
  return hex as Hex;
}

function resolvePrivateKey(chainName: KnownChainName, override?: string): Hex {
  if (override) return normalizePrivateKey(override);

  const chainSpecific = process.env[envKeyForChain(chainName, 'PRIVATE_KEY')];
  if (chainSpecific) return normalizePrivateKey(chainSpecific);

  // Convenience for local dev. Avoid accidentally using a real PRIVATE_KEY on anvil.
  if (chainName === 'anvil') return ANVIL_DEFAULT_PRIVATE_KEY;

  const env = process.env.TH_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (env) return normalizePrivateKey(env);

  throw new Error(`Missing private key. Provide --private-key or set ${envKeyForChain(chainName, 'PRIVATE_KEY')} / TH_PRIVATE_KEY / PRIVATE_KEY.`);
}

function normalizeAddress(addr: string, label: string): Address {
  const trimmed = addr.trim();
  if (!isAddress(trimmed)) throw new Error(`Invalid ${label} address: ${addr}`);
  return trimmed as Address;
}

function findConstructorInputs(abi: any): any[] {
  if (!Array.isArray(abi)) return [];
  const ctor = abi.find((x) => x && typeof x === 'object' && x.type === 'constructor');
  return Array.isArray(ctor?.inputs) ? ctor.inputs : [];
}

function loadManifestSchema(): any {
  return loadRepoSchema('schemas/tokenhost-release-manifest.schema.json');
}

function validateManifest(manifest: any): { ok: boolean; errors: unknown } {
  const manifestSchema = loadManifestSchema();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  // Add standard JSON Schema format support (uri, date-time, ...).
  addFormats(ajv);
  const validate = ajv.compile(manifestSchema as any);
  const ok = Boolean(validate(manifest));
  return { ok, errors: validate.errors };
}

const program = new Command();

program.name('th').description('Token Host CLI (local)').version('0.0.0');

program
  .command('init')
  .argument('<slug>', 'App slug (used in URLs/domains)')
  .option('--name <name>', 'App display name (defaults from slug)')
  .option('--thsVersion <v>', 'THS document format version', '2025-12')
  .option('--schemaVersion <v>', 'Initial schema version', '0.0.1')
  .option('--dir <dir>', 'Output directory (defaults to apps/<slug>)')
  .action((slug: string, opts: { name?: string; thsVersion: string; schemaVersion: string; dir?: string }) => {
    const outDir = opts.dir ? opts.dir : path.join('apps', slug);
    ensureDir(outDir);

    const schema: ThsSchema = {
      thsVersion: opts.thsVersion,
      schemaVersion: opts.schemaVersion,
      app: {
        name: opts.name ?? titleFromSlug(slug),
        slug,
        features: {
          uploads: false,
          onChainIndexing: true
        }
      },
      collections: [
        {
          name: 'Item',
          fields: [{ name: 'title', type: 'string', required: true }],
          createRules: { required: ['title'], access: 'public' },
          visibilityRules: { gets: ['title'], access: 'public' },
          updateRules: { mutable: ['title'], access: 'owner' },
          deleteRules: { softDelete: true, access: 'owner' },
          indexes: { unique: [], index: [] }
        }
      ]
    };

    const schemaPath = path.join(outDir, 'schema.json');
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

    const readmePath = path.join(outDir, 'README.md');
    fs.writeFileSync(
      readmePath,
      [
        `# ${schema.app.name}`,
        '',
        '## Quickstart',
        '',
        '```bash',
        `pnpm th validate ${schemaPath}`,
        `pnpm th build ${schemaPath} --out ${path.join(outDir, 'build')}`,
        `pnpm th deploy ${path.join(outDir, 'build')} --chain anvil`,
        '```',
        ''
      ].join('\n')
    );

    console.log(`Wrote ${schemaPath}`);
    console.log(`Wrote ${readmePath}`);
  });

program
  .command('doctor')
  .description('Check local environment readiness')
  .action(() => {
    let ok = true;

    const nodeMajor = Number(process.versions.node.split('.')[0] || 0);
    if (nodeMajor < 20) {
      ok = false;
      console.error(`ERROR node: ${process.versions.node} (need >= 20)`);
    } else {
      console.log(`OK node: ${process.versions.node}`);
    }

    try {
      const v = solc.version?.() || 'unknown';
      console.log(`OK solc-js: ${v}`);
    } catch {
      ok = false;
      console.error('ERROR solc-js: failed to load');
    }

    for (const tool of ['anvil', 'forge'] as const) {
      const res = spawnSync(tool, ['--version'], { encoding: 'utf-8' });
      if (res.status === 0) {
        const line = (res.stdout || res.stderr || '').trim().split('\n')[0] || '';
        console.log(`OK ${tool}: ${line}`);
      } else {
        // Foundry is optional for pure build/compile, but required for some workflows.
        console.warn(`WARN ${tool}: not found or not runnable`);
      }
    }

    if (!ok) process.exitCode = 1;
  });

program
  .command('validate')
  .argument('<schema>', 'Path to THS schema JSON file')
  .option('--json', 'Output machine-readable JSON', false)
  .action((schemaPath: string, opts: { json: boolean }) => {
    const input = readJsonFile(schemaPath);
    const structural = validateThsStructural(input);
    if (!structural.ok) {
      if (opts.json) {
        console.log(JSON.stringify({ ok: false, issues: structural.issues }, null, 2));
      } else {
        console.error(formatIssues(structural.issues));
      }
      process.exitCode = 1;
      return;
    }

    const schema = structural.data!;
    const lintIssues = lintThs(schema);
    const schemaHash = computeSchemaHash(schema);

    const errors = lintIssues.filter((i) => i.severity === 'error');
    if (opts.json) {
      console.log(JSON.stringify({ ok: errors.length === 0, schemaHash, issues: lintIssues }, null, 2));
    } else {
      if (lintIssues.length > 0) console.log(formatIssues(lintIssues));
      console.log(`schemaHash: ${schemaHash}`);
    }

    if (errors.length > 0) process.exitCode = 1;
  });

program
  .command('import-legacy')
  .argument('<contractsJson>', 'Path to legacy contracts.json')
  .option('--thsVersion <v>', 'THS document format version', '2025-12')
  .option('--schemaVersion <v>', 'App schema version', '0.0.0')
  .option('--appName <name>', 'App name', 'Imported App')
  .option('--appSlug <slug>', 'App slug', 'imported-app')
  .option('--out <file>', 'Write output schema JSON to a file (defaults to stdout)')
  .action((legacyPath: string, opts: { thsVersion: string; schemaVersion: string; appName: string; appSlug: string; out?: string }) => {
    const input = readJsonFile(legacyPath) as any;
    const ths = importLegacyContractsJson(input, {
      thsVersion: opts.thsVersion,
      schemaVersion: opts.schemaVersion,
      appName: opts.appName,
      appSlug: opts.appSlug
    });
    const out = JSON.stringify(ths, null, 2);
    if (opts.out) {
      ensureDir(path.dirname(opts.out));
      fs.writeFileSync(opts.out, out);
    } else {
      console.log(out);
    }
  });

program
  .command('generate')
  .argument('<schema>', 'Path to THS schema JSON file')
  .option('--out <dir>', 'Output directory', 'artifacts')
  .action((schemaPath: string, opts: { out: string }) => {
    const input = readJsonFile(schemaPath);
    const structural = validateThsStructural(input);
    if (!structural.ok) {
      console.error(formatIssues(structural.issues));
      process.exitCode = 1;
      return;
    }

    const schema = structural.data!;
    const lintIssues = lintThs(schema);
    const errors = lintIssues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      console.error(formatIssues(lintIssues));
      process.exitCode = 1;
      return;
    }

    const outDir = opts.out;
    const appSol = generateAppSolidity(schema);
    const contractsDir = path.join(outDir, path.dirname(appSol.path));
    ensureDir(contractsDir);
    fs.writeFileSync(path.join(outDir, appSol.path), appSol.contents);

    // Also persist an immutable copy of the schema input alongside the artifacts.
    ensureDir(outDir);
    fs.writeFileSync(path.join(outDir, 'schema.json'), JSON.stringify(schema, null, 2));

    console.log(`Wrote ${appSol.path}`);
  });

program
  .command('build')
  .argument('<schema>', 'Path to THS schema JSON file')
  .option('--out <dir>', 'Output directory', 'artifacts')
  .action((schemaPath: string, opts: { out: string }) => {
    const input = readJsonFile(schemaPath);
    const structural = validateThsStructural(input);
    if (!structural.ok) {
      console.error(formatIssues(structural.issues));
      process.exitCode = 1;
      return;
    }

    const schema = structural.data!;
    const lintIssues = lintThs(schema);
    const errors = lintIssues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      console.error(formatIssues(lintIssues));
      process.exitCode = 1;
      return;
    }

    const outDir = opts.out;
    ensureDir(outDir);

    // 1) Generate Solidity source
    const appSol = generateAppSolidity(schema);
    ensureDir(path.join(outDir, path.dirname(appSol.path)));
    fs.writeFileSync(path.join(outDir, appSol.path), appSol.contents);

    // 2) Compile (solc-js)
    const sourceRelPath = appSol.path.replace(/\\\\/g, '/');
    const compiled = compileSolidity(sourceRelPath, appSol.contents, 'App');
    const compiledArtifact = {
      contractName: 'App',
      abi: compiled.abi,
      bytecode: compiled.bytecode,
      deployedBytecode: compiled.deployedBytecode
    };
    const compiledJson = JSON.stringify(compiledArtifact, null, 2);
    const compiledOutPath = path.join(outDir, 'compiled', 'App.json');
    ensureDir(path.dirname(compiledOutPath));
    fs.writeFileSync(compiledOutPath, compiledJson);

    // 3) Write schema copy
    fs.writeFileSync(path.join(outDir, 'schema.json'), JSON.stringify(schema, null, 2));

    // 4) Build a local (unsigned) manifest. This is spec-shaped but uses placeholders
    // for deployments/UI until `th deploy`/`th publish` are implemented.
    const schemaHash = computeSchemaHash(schema);
    const sourcesDigest = computeDirectoryDigest(path.join(outDir, path.dirname(appSol.path)));
    const compiledDigest = computeDirectoryDigest(path.join(outDir, 'compiled'));
    const abiDigest = sha256Digest(JSON.stringify(compiled.abi));
    const bytecodeDigest = sha256Digest(compiled.bytecode);
    const emptyUiBundleDigest = computeSchemaHash({ version: 1, files: [] });

    const features = {
      indexer: schema.app.features?.indexer ?? false,
      delegation: schema.app.features?.delegation ?? false,
      uploads: schema.app.features?.uploads ?? false,
      onChainIndexing: schema.app.features?.onChainIndexing ?? true
    };

    const collections = schema.collections.map((c) => ({
      name: c.name,
      collectionId: keccak256(toBytes(c.name))
    }));

    const zeroAddress = '0x0000000000000000000000000000000000000000';

    const manifest = {
      manifestVersion: '0.1.0',
      thsVersion: schema.thsVersion,
      schemaVersion: schema.schemaVersion,
      schemaHash,
      generatorVersion: '0.0.0',
      toolchain: {
        node: process.version.replace(/^v/, ''),
        solc: solc.version()
      },
      release: {
        releaseId: `rel_local_${Date.now()}`,
        supersedesReleaseId: null,
        publishedAt: new Date().toISOString()
      },
      app: {
        name: schema.app.name,
        slug: schema.app.slug
      },
      collections,
      artifacts: {
        soliditySources: { digest: sourcesDigest },
        compiledContracts: { digest: compiledDigest }
      },
      deployments: [
        {
          role: 'primary',
          chainId: 31337,
          chainName: 'local',
          deploymentMode: 'single',
          deploymentEntrypointAddress: zeroAddress,
          adminAddress: zeroAddress,
          treasuryAddress: anyPaidCreates(schema) ? zeroAddress : null,
          contracts: [
            {
              role: 'app',
              address: zeroAddress,
              verified: false,
              bytecodeDigest,
              abiDigest
            }
          ],
          verified: false,
          blockNumber: 0
        }
      ],
      ui: {
        bundleHash: emptyUiBundleDigest,
        baseUrl: 'http://localhost/',
        wellKnown: '/.well-known/tokenhost/manifest.json'
      },
      features,
      signatures: [{ alg: 'none', sig: 'UNSIGNED' }]
    };

    // Validate manifest shape against the local JSON schema.
    const { ok, errors: manifestErrors } = validateManifest(manifest);
    if (!ok) {
      console.error('Generated manifest did not validate against schemas/tokenhost-release-manifest.schema.json');
      console.error(JSON.stringify(manifestErrors, null, 2));
      process.exitCode = 1;
      return;
    }

    const manifestPath = path.join(outDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Wrote ${appSol.path}`);
    console.log(`Wrote compiled/App.json`);
    console.log(`Wrote manifest.json`);
  });

function anyPaidCreates(schema: ThsSchema): boolean {
  return schema.collections.some((c) => Boolean(c.createRules.payment));
}

program
  .command('deploy')
  .argument('<buildDir>', 'Directory created by `th build` (contains manifest.json)')
  .option('--chain <name>', 'Chain name (anvil|sepolia)', 'anvil')
  .option('--rpc <url>', 'RPC URL override')
  .option('--private-key <hex>', 'Private key (0x...) override')
  .option('--admin <address>', 'Admin address (defaults to deployer)')
  .option('--treasury <address>', 'Treasury address (defaults to deployer)')
  .option('--role <role>', 'Deployment role (primary|legacy)', 'primary')
  .action(async (buildDir: string, opts: { chain: string; rpc?: string; privateKey?: string; admin?: string; treasury?: string; role: string }) => {
    try {
      const resolvedBuildDir = path.resolve(buildDir);
      const manifestPath = path.join(resolvedBuildDir, 'manifest.json');
      const compiledPath = path.join(resolvedBuildDir, 'compiled', 'App.json');
      const schemaPath = path.join(resolvedBuildDir, 'schema.json');

      if (!fs.existsSync(manifestPath)) throw new Error(`Missing manifest.json in ${resolvedBuildDir}. Run \`th build\` first.`);
      if (!fs.existsSync(compiledPath)) throw new Error(`Missing compiled/App.json in ${resolvedBuildDir}. Run \`th build\` first.`);
      if (!fs.existsSync(schemaPath)) throw new Error(`Missing schema.json in ${resolvedBuildDir}. Run \`th build\` first.`);

      const manifest = readJsonFile(manifestPath) as any;
      const compiled = readJsonFile(compiledPath) as any;
      const schemaInput = readJsonFile(schemaPath);
      const schemaStructural = validateThsStructural(schemaInput);
      if (!schemaStructural.ok) throw new Error(`Invalid schema.json in buildDir:\n${formatIssues(schemaStructural.issues)}`);
      const schema = schemaStructural.data!;

      const { chainName, chain } = resolveKnownChain(opts.chain);
      const rpcUrl = resolveRpcUrl(chainName, chain, opts.rpc);
      const privateKey = resolvePrivateKey(chainName, opts.privateKey);
      const account = privateKeyToAccount(privateKey);

      const walletClient = createWalletClient({
        chain,
        account,
        transport: http(rpcUrl)
      });
      const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl)
      });

      const abi = compiled.abi;
      const bytecode: Hex = normalizeHexString(String(compiled.bytecode), 'bytecode');
      const ctorInputs = findConstructorInputs(abi);

      const deployer = account.address as Address;
      const admin = normalizeAddress(opts.admin ?? deployer, 'admin');
      const treasury = normalizeAddress(opts.treasury ?? deployer, 'treasury');

      const args = (() => {
        if (ctorInputs.length === 0) return [];
        if (ctorInputs.length === 2) return [admin, treasury];
        throw new Error(`Unsupported constructor arity (${ctorInputs.length}).`);
      })();

      console.log(`Deploying App to ${chainName} (${rpcUrl}) as ${deployer}...`);

      const txHash = await walletClient.deployContract({
        abi,
        bytecode,
        args,
        chain
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const deployedAddress = receipt.contractAddress;
      if (!deployedAddress) throw new Error('Deployment receipt missing contractAddress.');

      console.log(`Deployed App: ${deployedAddress}`);

      const bytecodeDigest = sha256Digest(String(compiled.bytecode));
      const abiDigest = sha256Digest(JSON.stringify(abi));

      const deployment = {
        role: opts.role,
        chainId: chain.id,
        chainName,
        deploymentMode: 'single',
        deploymentEntrypointAddress: deployedAddress,
        adminAddress: admin,
        treasuryAddress: ctorInputs.length === 2 ? treasury : null,
        contracts: [
          {
            role: 'app',
            address: deployedAddress,
            verified: false,
            bytecodeDigest,
            abiDigest
          }
        ],
        verified: false,
        blockNumber: Number(receipt.blockNumber ?? 0n)
      };

      // Replace existing deployment entry for (role, chainId) if it exists; otherwise append.
      manifest.deployments = Array.isArray(manifest.deployments) ? manifest.deployments : [];
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      const byRoleAndChainIdx = manifest.deployments.findIndex((d: any) => d && d.role === opts.role && d.chainId === chain.id);
      const placeholderIdx =
        byRoleAndChainIdx >= 0
          ? -1
          : manifest.deployments.findIndex(
              (d: any) => d && d.role === opts.role && String(d.deploymentEntrypointAddress || '').toLowerCase() === zeroAddress
            );
      const idx = byRoleAndChainIdx >= 0 ? byRoleAndChainIdx : placeholderIdx;
      if (idx >= 0) {
        manifest.deployments[idx] = deployment;
      } else {
        manifest.deployments.push(deployment);
      }

      // If the schema includes paid creates, make sure treasury is not null in manifest.
      if (anyPaidCreates(schema) && deployment.treasuryAddress === null) {
        throw new Error('Schema includes paid creates, but deployed contract has no treasuryAddress constructor.');
      }

      const validation = validateManifest(manifest);
      if (!validation.ok) {
        throw new Error(`Updated manifest failed validation:\n${JSON.stringify(validation.errors, null, 2)}`);
      }

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`Updated ${manifestPath}`);
    } catch (e: any) {
      console.error(String(e?.message ?? e));
      process.exitCode = 1;
    }
  });

program
  .command('verify')
  .argument('<buildDir>', 'Directory created by `th build` (contains manifest.json)')
  .description('Verify deployed contracts on explorers (stub)')
  .option('--chain <name>', 'Chain name (anvil|sepolia)', 'sepolia')
  .option('--set-verified', 'Mark deployment verified in manifest (manual override)', false)
  .action((buildDir: string, opts: { chain: string; setVerified: boolean }) => {
    const resolvedBuildDir = path.resolve(buildDir);
    const manifestPath = path.join(resolvedBuildDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.error(`Missing manifest.json in ${resolvedBuildDir}. Run \`th build\` first.`);
      process.exitCode = 1;
      return;
    }

    const manifest = readJsonFile(manifestPath) as any;
    const { chain } = resolveKnownChain(opts.chain);

    const deployments = Array.isArray(manifest.deployments) ? manifest.deployments : [];
    const target = deployments.find((d: any) => d && d.role === 'primary' && d.chainId === chain.id);
    if (!target) {
      console.error(`No primary deployment found for chainId ${chain.id} in manifest.json`);
      process.exitCode = 1;
      return;
    }

    if (opts.setVerified) {
      target.verified = true;
      if (Array.isArray(target.contracts)) {
        for (const c of target.contracts) c.verified = true;
      }
      const validation = validateManifest(manifest);
      if (!validation.ok) {
        console.error(`Updated manifest failed validation:\n${JSON.stringify(validation.errors, null, 2)}`);
        process.exitCode = 1;
        return;
      }
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`Marked verified in ${manifestPath}`);
      return;
    }

    console.log('Explorer verification is not implemented yet.');
    console.log('For now, verify manually and re-run:');
    console.log(`  th verify ${resolvedBuildDir} --chain ${opts.chain} --set-verified`);
  });

program
  .command('migrate')
  .argument('<schema>', 'Path to THS schema JSON file')
  .description('Apply schema migrations locally (stub)')
  .action(() => {
    console.error('th migrate is not implemented yet (no migrations registry wired).');
    process.exitCode = 1;
  });

program
  .command('migrate-chain')
  .description('Migrate primary deployment to a new chain (stub)')
  .action(() => {
    console.error('th migrate-chain is not implemented yet.');
    process.exitCode = 1;
  });

program
  .command('indexer')
  .description('Generate/deploy indexer configuration (stub)')
  .action(() => {
    console.error('th indexer is not implemented yet.');
    process.exitCode = 1;
  });

await program.parseAsync(process.argv);
