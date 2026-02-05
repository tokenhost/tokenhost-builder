import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import * as nodeHttp from 'node:http';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline/promises';
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { Command } from 'commander';

import { generateAppSolidity } from '@tokenhost/generator';
import {
  computeSchemaHash,
  importLegacyContractsJson,
  lintThs,
  listThsMigrations,
  migrateThsSchema,
  validateThsStructural,
  type Issue,
  type ThsSchema
} from '@tokenhost/schema';

import { createPublicClient, createWalletClient, encodeAbiParameters, http, isAddress, isHex, keccak256, toBytes, type Address, type Hex } from 'viem';
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

function loadThsSchemaOrThrow(schemaPath: string): ThsSchema {
  const input = readJsonFile(schemaPath);
  const structural = validateThsStructural(input);
  if (!structural.ok) {
    throw new Error(formatIssues(structural.issues));
  }

  const schema = structural.data!;
  const lintIssues = lintThs(schema);
  const errors = lintIssues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new Error(formatIssues(lintIssues));
  }

  return schema;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(srcDir: string, destDir: string) {
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      // Avoid accidentally copying heavy build outputs if a template folder was used as a dev workspace.
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'out') continue;
      copyDir(src, dst);
      continue;
    }
    if (entry.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

function publishManifestToUiSite(uiSiteDir: string, manifestJson: string) {
  ensureDir(uiSiteDir);
  ensureDir(path.join(uiSiteDir, '.well-known', 'tokenhost'));
  fs.writeFileSync(path.join(uiSiteDir, '.well-known', 'tokenhost', 'manifest.json'), manifestJson);
  fs.writeFileSync(path.join(uiSiteDir, 'manifest.json'), manifestJson);
}

function resolveNextExportUiTemplateDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../templates/next-export-ui'),
    path.resolve(here, '../templates/next-export-ui'),
    path.resolve(here, 'templates/next-export-ui')
  ];

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) return c;
  }

  const workspace = findUp('pnpm-workspace.yaml', process.cwd());
  if (workspace) {
    const root = path.dirname(workspace);
    const c = path.join(root, 'packages', 'templates', 'next-export-ui');
    if (fs.existsSync(path.join(c, 'package.json'))) return c;
  }

  throw new Error(
    `Could not find Next.js export UI template directory (next-export-ui).\nLooked in:\n${candidates
      .map((c) => `  - ${c}`)
      .join('\n')}`
  );
}

function toFileUrl(p: string): string {
  return pathToFileURL(path.resolve(p)).toString();
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function runCommand(cmd: string, args: string[], opts?: { cwd?: string }) {
  const res = spawnSync(cmd, args, {
    cwd: opts?.cwd,
    stdio: 'inherit'
  });
  if (res.error && (res.error as any).code === 'ENOENT') {
    throw new Error(`${cmd} not found on PATH. Install it and retry.`);
  }
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${res.status ?? 'unknown'}`);
  }
}

function runPnpmCommand(args: string[], opts?: { cwd?: string }) {
  // Prefer local/global pnpm; fall back to corepack if pnpm isn't installed.
  const res = spawnSync('pnpm', args, { cwd: opts?.cwd, stdio: 'inherit' });
  if (res.error && (res.error as any).code === 'ENOENT') {
    const res2 = spawnSync('corepack', ['pnpm', ...args], { cwd: opts?.cwd, stdio: 'inherit' });
    if (res2.error && (res2.error as any).code === 'ENOENT') {
      throw new Error(`pnpm not found. Install pnpm or enable corepack, then retry.`);
    }
    if (res2.status !== 0) {
      throw new Error(`corepack pnpm ${args.join(' ')} failed with exit code ${res2.status ?? 'unknown'}`);
    }
    return;
  }
  if (res.status !== 0) {
    throw new Error(`pnpm ${args.join(' ')} failed with exit code ${res.status ?? 'unknown'}`);
  }
}

function renderThsTs(schema: ThsSchema): string {
  // Embed the full THS schema in the UI so it can render forms + routes without server-side code.
  return (
    `/*\n` +
    ` * GENERATED FILE\n` +
    ` *\n` +
    ` * This file is generated by \`th generate\` from the THS schema.\n` +
    ` */\n\n` +
    `export const ths = ${JSON.stringify(schema, null, 2)} as const;\n\n` +
    `export type Ths = typeof ths;\n`
  );
}

function ensureEd25519PrivateKey(key: crypto.KeyObject): crypto.KeyObject {
  const type = (key as any).asymmetricKeyType as string | undefined;
  if (type && type !== 'ed25519') {
    throw new Error(`Manifest signing key must be Ed25519 (got ${type}).`);
  }
  return key;
}

function loadManifestSigningKey(): crypto.KeyObject | null {
  const keyPath = process.env.TH_MANIFEST_SIGNING_KEY_PATH;
  if (keyPath) {
    const pem = fs.readFileSync(keyPath, 'utf-8');
    return ensureEd25519PrivateKey(crypto.createPrivateKey(pem));
  }

  const env = process.env.TH_MANIFEST_SIGNING_KEY || process.env.TH_MANIFEST_SIGNING_PRIVATE_KEY;
  if (!env) return null;

  const raw = env.trim();
  if (raw.startsWith('-----BEGIN')) {
    return ensureEd25519PrivateKey(crypto.createPrivateKey(raw));
  }

  // Assume base64-encoded PKCS#8 DER.
  const b64 = raw.startsWith('base64:') ? raw.slice('base64:'.length) : raw;
  const der = Buffer.from(b64, 'base64');
  return ensureEd25519PrivateKey(crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }));
}

function computeKeyIdEd25519(privateKey: crypto.KeyObject): string {
  const pub = crypto.createPublicKey(privateKey);
  const spki = pub.export({ format: 'der', type: 'spki' }) as Buffer;
  return sha256Digest(spki);
}

function signManifest(manifest: any, privateKey: crypto.KeyObject): { alg: string; keyId: string; sig: string } {
  // Sign the canonical manifest digest of the manifest with signatures removed.
  // Verifiers should recompute this same digest before verifying.
  const unsigned = { ...manifest, signatures: [] };
  const digest = computeSchemaHash(unsigned);
  const signature = crypto.sign(null, Buffer.from(digest, 'utf-8'), privateKey);
  return {
    alg: 'ed25519',
    keyId: computeKeyIdEd25519(privateKey),
    sig: signature.toString('base64')
  };
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

function buildChainConfigArtifact(args: { chainName: KnownChainName; chain: any; rpcUrl: string }): any {
  const now = new Date().toISOString();
  const isLocal = args.chainName === 'anvil';

  const chainConfig: any = {
    chainConfigVersion: '1.0.0',
    chainId: args.chain.id,
    name: String(args.chain?.name ?? args.chainName),
    type: 'external-evm',
    nativeCurrency: {
      name: String(args.chain?.nativeCurrency?.name ?? 'Native'),
      symbol: String(args.chain?.nativeCurrency?.symbol ?? 'NATIVE'),
      decimals: Number(args.chain?.nativeCurrency?.decimals ?? 18)
    },
    trust: isLocal ? { posture: 'external', notes: 'Local dev chain' } : { posture: 'external' },
    finality: {
      model: isLocal ? 'instant' : 'probabilistic',
      recommendedConfirmations: isLocal ? 0 : 2,
      typicalSeconds: isLocal ? 1 : 12
    },
    rpc: {
      endpoints: [
        {
          url: args.rpcUrl,
          kind: 'public',
          priority: 0,
          capabilities: {
            batching: true,
            subscriptions: args.rpcUrl.startsWith('ws') || args.rpcUrl.startsWith('wss')
          }
        }
      ]
    },
    issuer: {
      name: 'Token Host (local)',
      issuedAt: now
    },
    signatures: [{ alg: 'none', sig: 'UNSIGNED' }]
  };

  if (args.chainName === 'sepolia') {
    chainConfig.explorers = [
      {
        name: 'Etherscan',
        url: 'https://sepolia.etherscan.io',
        apiUrl: 'https://api-sepolia.etherscan.io/api'
      }
    ];
  }

  return chainConfig;
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

function loadChainConfigSchema(): any {
  return loadRepoSchema('schemas/tokenhost-chain-config.schema.json');
}

function validateChainConfig(chainConfig: any): { ok: boolean; errors: unknown } {
  const chainSchema = loadChainConfigSchema();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(chainSchema as any);
  const ok = Boolean(validate(chainConfig));
  return { ok, errors: validate.errors };
}

function listSchemaCandidates(rootDir: string): string[] {
  const out: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'dist' || entry.name === 'out') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.schema.json')) {
        out.push(full);
      }
    }
  }

  if (fs.existsSync(rootDir) && fs.statSync(rootDir).isDirectory()) {
    walk(rootDir);
  }

  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function rpcRequest(rpcUrl: string, method: string, params: any[] = [], timeoutMs = 1000): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`RPC HTTP ${res.status}`);
    }
    const json = await res.json();
    if (json?.error) {
      throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    }
    return json?.result;
  } finally {
    clearTimeout(t);
  }
}

async function tryGetRpcChainId(rpcUrl: string, timeoutMs = 1000): Promise<number | null> {
  try {
    const hex = await rpcRequest(rpcUrl, 'eth_chainId', [], timeoutMs);
    if (typeof hex !== 'string') return null;
    const n = Number.parseInt(hex, 16);
    if (!Number.isFinite(n)) return null;
    return n;
  } catch {
    return null;
  }
}

function isLocalHttpRpcUrl(rpcUrl: string): { host: string; port: number } | null {
  try {
    const u = new URL(rpcUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname;
    const isLocal = host === '127.0.0.1' || host === 'localhost';
    if (!isLocal) return null;
    const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
    return { host, port };
  } catch {
    return null;
  }
}

function pipeWithPrefix(stream: NodeJS.ReadableStream, prefix: string, dest: NodeJS.WriteStream) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += String(chunk);
    while (true) {
      const idx = buf.indexOf('\n');
      if (idx < 0) break;
      const line = buf.slice(0, idx + 1);
      buf = buf.slice(idx + 1);
      dest.write(`${prefix}${line}`);
    }
  });
  stream.on('end', () => {
    if (buf) dest.write(`${prefix}${buf}\n`);
  });
}

async function ensureAnvilRunning(rpcUrl: string, opts?: { start: boolean; expectedChainId?: number }): Promise<{ child: ReturnType<typeof spawn> | null }> {
  const expectedChainId = opts?.expectedChainId ?? 31337;
  const start = opts?.start ?? true;

  const chainId = await tryGetRpcChainId(rpcUrl, 500);
  if (chainId !== null) {
    if (chainId !== expectedChainId) {
      throw new Error(`RPC at ${rpcUrl} is chainId ${chainId}, expected ${expectedChainId}.`);
    }
    return { child: null };
  }

  if (!start) {
    throw new Error(`RPC at ${rpcUrl} is not reachable. Start anvil (or pass --no-start-anvil).`);
  }

  const local = isLocalHttpRpcUrl(rpcUrl);
  if (!local) {
    throw new Error(`--start-anvil only supports localhost RPC URLs (got ${rpcUrl}).`);
  }

  const anvilVersion = spawnSync('anvil', ['--version'], { encoding: 'utf-8' });
  if (anvilVersion.error && (anvilVersion.error as any).code === 'ENOENT') {
    throw new Error('Missing Foundry: `anvil` not found on PATH. Install Foundry from https://book.getfoundry.sh/getting-started/installation');
  }

  const child = spawn('anvil', ['--host', local.host, '--port', String(local.port), '--chain-id', String(expectedChainId)], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (child.stdout) pipeWithPrefix(child.stdout, '[anvil] ', process.stdout);
  if (child.stderr) pipeWithPrefix(child.stderr, '[anvil] ', process.stderr);

  const startedAt = Date.now();
  const timeoutMs = 10_000;
  while (Date.now() - startedAt < timeoutMs) {
    const nowChainId = await tryGetRpcChainId(rpcUrl, 500);
    if (nowChainId === expectedChainId) return { child };
    await new Promise((r) => setTimeout(r, 200));
  }

  child.kill('SIGTERM');
  throw new Error(`Timed out waiting for anvil at ${rpcUrl} to become ready.`);
}

type FaucetConfig = {
  enabled: boolean;
  rpcUrl: string;
  chainId: number;
  targetWei: bigint;
};

function startUiSiteServer(args: {
  buildDir: string;
  host: string;
  port: number;
  faucet?: FaucetConfig | null;
}): { server: nodeHttp.Server; url: string } {
  const resolvedBuildDir = path.resolve(args.buildDir);
  const uiSiteDir = path.join(resolvedBuildDir, 'ui-site');

  if (!fs.existsSync(uiSiteDir)) {
    throw new Error(`Missing ui-site/ in ${resolvedBuildDir}. Re-run \`th build\` without \`--no-ui\`.`);
  }

  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535) {
    throw new Error(`Invalid port: ${args.port}`);
  }

  const host = String(args.host || '127.0.0.1');
  const port = args.port;
  const rootAbs = path.resolve(uiSiteDir);
  const faucet = args.faucet ?? null;
  const faucetPath = '/__tokenhost/faucet';
  const faucetTargetEth = faucet?.targetWei ? Number(faucet.targetWei / 10n ** 18n) : 10;

  function contentTypeForPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.html':
        return 'text/html; charset=utf-8';
      case '.js':
        return 'application/javascript; charset=utf-8';
      case '.css':
        return 'text/css; charset=utf-8';
      case '.json':
      case '.map':
        return 'application/json; charset=utf-8';
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      case '.ico':
        return 'image/x-icon';
      case '.woff2':
        return 'font/woff2';
      case '.woff':
        return 'font/woff';
      case '.ttf':
        return 'font/ttf';
      case '.txt':
        return 'text/plain; charset=utf-8';
      default:
        return 'application/octet-stream';
    }
  }

  function sendText(res: nodeHttp.ServerResponse, status: number, text: string) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
  }

  function sendJson(res: nodeHttp.ServerResponse, status: number, value: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(value));
  }

  function toHexQuantity(n: bigint): string {
    if (n < 0n) throw new Error('Negative quantity not allowed.');
    return `0x${n.toString(16)}`;
  }

  async function trySetLocalBalance(rpcUrl: string, addr: string, wei: bigint): Promise<{ ok: boolean; method?: string; error?: string }> {
    const qty = toHexQuantity(wei);
    const methods = ['anvil_setBalance', 'hardhat_setBalance'];

    for (const method of methods) {
      try {
        await rpcRequest(rpcUrl, method, [addr, qty], 2000);
        return { ok: true, method };
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? '');
        const unsupported =
          /method not found/i.test(msg) ||
          /unsupported/i.test(msg) ||
          /does not exist/i.test(msg) ||
          /-32601/.test(msg);
        if (!unsupported) return { ok: false, method, error: msg };
      }
    }

    return { ok: false, error: 'No supported local balance RPC method found (anvil_setBalance, hardhat_setBalance).' };
  }

  function readBody(req: nodeHttp.IncomingMessage, maxBytes = 1024 * 1024): Promise<string> {
    return new Promise((resolve, reject) => {
      let raw = '';
      let total = 0;
      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          reject(new Error('Request body too large.'));
          req.destroy();
          return;
        }
        raw += chunk.toString('utf-8');
      });
      req.on('end', () => resolve(raw));
      req.on('error', reject);
    });
  }

  const server = nodeHttp.createServer((req, res) => {
    if (!req.url) return sendText(res, 400, 'Bad Request');

    let pathname = '/';
    try {
      pathname = new URL(req.url, `http://${host}:${port}`).pathname || '/';
    } catch {
      return sendText(res, 400, 'Bad Request');
    }

    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      return sendText(res, 400, 'Bad Request');
    }

    if (pathname === faucetPath) {
      (async () => {
        const enabled = Boolean(faucet?.enabled && faucet.rpcUrl && faucet.chainId === anvil.id);
        if (req.method === 'GET' || req.method === 'HEAD') {
          return sendJson(res, 200, {
            ok: true,
            enabled,
            chainId: faucet?.chainId ?? null,
            targetEthDefault: faucetTargetEth,
            reason: enabled ? null : faucet ? 'disabled' : 'not-configured'
          });
        }

        if (req.method !== 'POST') {
          res.setHeader('Allow', 'GET, HEAD, POST');
          return sendText(res, 405, 'Method Not Allowed');
        }

        if (!enabled) {
          return sendJson(res, 400, { ok: false, error: 'Faucet is disabled.' });
        }

        try {
          const raw = await readBody(req);
          const parsed = raw.trim() ? JSON.parse(raw) : null;
          const addr = normalizeAddress(String(parsed?.address ?? ''), 'address');

          const rpcChainId = await tryGetRpcChainId(faucet!.rpcUrl, 1000);
          if (rpcChainId === null) {
            return sendJson(res, 503, { ok: false, error: `RPC not reachable at ${faucet!.rpcUrl}. Start anvil and retry.` });
          }
          if (rpcChainId !== faucet!.chainId) {
            return sendJson(res, 409, {
              ok: false,
              error: `RPC chainId mismatch. RPC=${rpcChainId} expected=${faucet!.chainId}.`
            });
          }

          const oldHex = (await rpcRequest(faucet!.rpcUrl, 'eth_getBalance', [addr, 'latest'], 2000)) as string;
          const oldWei = BigInt(oldHex);
          const targetWei = faucet!.targetWei;

          let didSet = false;
          let setMethod: string | null = null;
          if (oldWei < targetWei) {
            const setResult = await trySetLocalBalance(faucet!.rpcUrl, addr, targetWei);
            if (!setResult.ok) {
              return sendJson(res, 400, { ok: false, error: setResult.error ?? 'Failed to set balance.' });
            }
            didSet = true;
            setMethod = setResult.method ?? null;
          }

          const newHex = (await rpcRequest(faucet!.rpcUrl, 'eth_getBalance', [addr, 'latest'], 2000)) as string;
          const newWei = BigInt(newHex);

          return sendJson(res, 200, {
            ok: true,
            address: addr,
            chainId: faucet!.chainId,
            targetWei: toHexQuantity(targetWei),
            oldBalanceWei: toHexQuantity(oldWei),
            newBalanceWei: toHexQuantity(newWei),
            method: setMethod,
            didSet
          });
        } catch (e: any) {
          return sendJson(res, 400, { ok: false, error: String(e?.message ?? e) });
        }
      })();
      return;
    }

    if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return sendText(res, 405, 'Method Not Allowed');
    }

    if (!pathname.startsWith('/')) pathname = `/${pathname}`;
    const rel = pathname.replace(/^\/+/, '');
    const unsafeAbs = path.resolve(rootAbs, rel);
    const withinRoot = unsafeAbs === rootAbs || unsafeAbs.startsWith(rootAbs + path.sep);
    if (!withinRoot) return sendText(res, 400, 'Bad Request');

    // Redirect to trailing-slash routes (Next export uses trailingSlash: true).
    if (!pathname.endsWith('/') && fs.existsSync(unsafeAbs) && fs.statSync(unsafeAbs).isDirectory()) {
      res.statusCode = 308;
      res.setHeader('Location', pathname + '/');
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }

    let filePath = unsafeAbs;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    } else if (!fs.existsSync(filePath)) {
      // Convenience: allow /foo -> /foo/index.html if present.
      const dirIndex = path.join(filePath, 'index.html');
      if (fs.existsSync(dirIndex)) {
        res.statusCode = 308;
        res.setHeader('Location', pathname.endsWith('/') ? pathname : pathname + '/');
        res.setHeader('Cache-Control', 'no-store');
        res.end();
        return;
      }

      return sendText(res, 404, 'Not Found');
    }

    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return sendText(res, 404, 'Not Found');

      res.statusCode = 200;
      res.setHeader('Content-Type', contentTypeForPath(filePath));
      res.setHeader('Content-Length', String(stat.size));
      res.setHeader('Cache-Control', 'no-store');

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      fs.createReadStream(filePath).pipe(res);
    } catch (e: any) {
      return sendText(res, 500, String(e?.message ?? e ?? 'Internal Server Error'));
    }
  });

  server.on('error', (e: any) => {
    console.error(String(e?.message ?? e ?? e));
    process.exitCode = 1;
  });

  const url = `http://${host}:${port}/`;
  server.listen(port, host, () => {
    console.log(`Serving ${uiSiteDir}`);
    console.log(url);

    const manifestCandidates = [
      path.join(uiSiteDir, '.well-known', 'tokenhost', 'manifest.json'),
      path.join(uiSiteDir, 'manifest.json'),
      path.join(resolvedBuildDir, 'manifest.json')
    ];
    const manifestPath = manifestCandidates.find((p) => fs.existsSync(p)) || null;
    if (manifestPath) {
      try {
        const manifest = readJsonFile(manifestPath) as any;
        const deployments = Array.isArray(manifest?.deployments) ? manifest.deployments : [];
        const deployment = deployments.find((d: any) => d && d.role === 'primary') ?? deployments[0] ?? null;
        const addr = String(deployment?.deploymentEntrypointAddress ?? '');
        const chainId = deployment?.chainId ?? null;
        console.log(`manifest: ${manifestPath}`);
        console.log(`deployment: chainId=${chainId ?? 'unknown'} address=${addr || 'unknown'}`);
        const zeroAddress = '0x0000000000000000000000000000000000000000';
        if (addr && addr.toLowerCase() === zeroAddress) {
          console.log('');
          console.log('Not deployed: deploymentEntrypointAddress is 0x0.');
          console.log(`Run: th deploy ${resolvedBuildDir} --chain anvil`);
          console.log('Then refresh this page.');
        }
      } catch {
        // Ignore manifest parse errors; the UI will surface them at runtime.
      }
    }
  });

  return { server, url };
}

function buildFromSchema(
  schema: ThsSchema,
  outDir: string,
  opts: { ui: boolean; quiet?: boolean; schemaPathForHints?: string }
): { outDir: string; uiBundleDir: string | null; uiSiteDir: string | null } {
  const resolvedOutDir = path.resolve(outDir);
  ensureDir(resolvedOutDir);

  // 1) Generate Solidity source
  const appSol = generateAppSolidity(schema);
  ensureDir(path.join(resolvedOutDir, path.dirname(appSol.path)));
  fs.writeFileSync(path.join(resolvedOutDir, appSol.path), appSol.contents);

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
  const compiledOutPath = path.join(resolvedOutDir, 'compiled', 'App.json');
  ensureDir(path.dirname(compiledOutPath));
  fs.writeFileSync(compiledOutPath, compiledJson);

  // 3) Write schema copy
  fs.writeFileSync(path.join(resolvedOutDir, 'schema.json'), JSON.stringify(schema, null, 2));

  // 4) Package build artifacts (SPEC 11)
  const sourcesTgzPath = path.join(resolvedOutDir, 'sources.tgz');
  const compiledTgzPath = path.join(resolvedOutDir, 'compiled.tgz');
  runCommand('tar', ['-czf', sourcesTgzPath, '-C', resolvedOutDir, path.dirname(appSol.path)]);
  runCommand('tar', ['-czf', compiledTgzPath, '-C', resolvedOutDir, 'compiled']);

  // 5) Build UI bundle (Next.js static export) (SPEC 8 / 11)
  const emptyUiBundleDigest = computeSchemaHash({ version: 1, files: [] });
  let uiBundleDigest = emptyUiBundleDigest;
  let uiBaseUrl = ensureTrailingSlash(process.env.TH_UI_BASE_URL ?? 'http://localhost/');
  let uiBundleDir: string | null = null;
  let uiSiteDir: string | null = null;

  if (opts.ui) {
    uiBundleDir = path.join(resolvedOutDir, 'ui-bundle');
    uiSiteDir = path.join(resolvedOutDir, 'ui-site');
    fs.rmSync(uiBundleDir, { recursive: true, force: true });
    ensureDir(uiBundleDir);

    const uiWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenhost-ui-build-'));
    try {
      const templateDir = resolveNextExportUiTemplateDir();
      copyDir(templateDir, uiWorkDir);

      // Inject schema for client-side routing/forms.
      const thsTsPath = path.join(uiWorkDir, 'src', 'generated', 'ths.ts');
      ensureDir(path.dirname(thsTsPath));
      fs.writeFileSync(thsTsPath, renderThsTs(schema));

      // Ship ABI alongside the UI so it can operate without additional servers.
      const compiledPublicPath = path.join(uiWorkDir, 'public', 'compiled', 'App.json');
      ensureDir(path.dirname(compiledPublicPath));
      fs.writeFileSync(compiledPublicPath, compiledJson);

      // Do not bake a manifest into the UI bundle; it is published separately and signed.
      const bakedManifestPath = path.join(uiWorkDir, 'public', '.well-known', 'tokenhost', 'manifest.json');
      if (fs.existsSync(bakedManifestPath)) fs.rmSync(bakedManifestPath, { force: true });

      runPnpmCommand(['install'], { cwd: uiWorkDir });
      runPnpmCommand(['build'], { cwd: uiWorkDir });

      const exportedDir = path.join(uiWorkDir, 'out');
      if (!fs.existsSync(exportedDir)) {
        throw new Error(`UI build did not produce an export directory at ${exportedDir}.`);
      }

      // Copy the static export output into the build output directory.
      copyDir(exportedDir, uiBundleDir);
    } finally {
      fs.rmSync(uiWorkDir, { recursive: true, force: true });
    }

    uiBundleDigest = computeDirectoryDigest(uiBundleDir);
    uiBaseUrl = ensureTrailingSlash(process.env.TH_UI_BASE_URL ?? toFileUrl(uiSiteDir));
  }

  // 6) Build a local manifest. This is spec-shaped but uses placeholder deployments
  // until `th deploy` updates it.
  const schemaHash = computeSchemaHash(schema);
  const sourcesDigest = computeDirectoryDigest(path.join(resolvedOutDir, path.dirname(appSol.path)));
  const compiledDigest = computeDirectoryDigest(path.join(resolvedOutDir, 'compiled'));
  const abiDigest = sha256Digest(JSON.stringify(compiled.abi));
  const bytecodeDigest = sha256Digest(compiled.bytecode);

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
      soliditySources: { digest: sourcesDigest, url: toFileUrl(sourcesTgzPath) },
      compiledContracts: { digest: compiledDigest, url: toFileUrl(compiledTgzPath) }
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
      bundleHash: uiBundleDigest,
      baseUrl: uiBaseUrl,
      wellKnown: '/.well-known/tokenhost/manifest.json'
    },
    features,
    signatures: [{ alg: 'none', sig: 'UNSIGNED' }]
  };

  const signingKey = loadManifestSigningKey();
  if (signingKey) {
    manifest.signatures = [signManifest(manifest, signingKey)];
  }

  // Validate manifest shape against the local JSON schema.
  const { ok, errors: manifestErrors } = validateManifest(manifest);
  if (!ok) {
    throw new Error(
      'Generated manifest did not validate against schemas/tokenhost-release-manifest.schema.json\n' + JSON.stringify(manifestErrors, null, 2)
    );
  }

  const manifestPath = path.join(resolvedOutDir, 'manifest.json');
  const manifestJsonOut = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(manifestPath, manifestJsonOut);

  // Convenience: create a self-hostable static site root that includes the UI bundle + manifest.
  // Note: ui.bundleHash is computed over ui-bundle/ (UI code only), not this directory.
  if (uiBundleDir && uiSiteDir) {
    fs.rmSync(uiSiteDir, { recursive: true, force: true });
    copyDir(uiBundleDir, uiSiteDir);
    publishManifestToUiSite(uiSiteDir, manifestJsonOut);
  }

  if (!opts.quiet) {
    console.log(`Wrote ${appSol.path}`);
    console.log(`Wrote compiled/App.json`);
    console.log(`Wrote sources.tgz`);
    console.log(`Wrote compiled.tgz`);
    if (uiBundleDir) {
      console.log(`Wrote ui-bundle/ (digest: ${uiBundleDigest})`);
      console.log(`Wrote ui-site/ (self-hostable static root)`);
    }
    console.log(`Wrote manifest.json`);

    console.log('');
    console.log('Next steps:');
    if (opts.schemaPathForHints) {
      console.log(`  th up ${opts.schemaPathForHints}             # build+deploy+preview (local)`);
    }
    console.log(`  th deploy ${resolvedOutDir} --chain anvil   # start anvil first`);
    console.log(`  th deploy ${resolvedOutDir} --chain sepolia # requires RPC + funded key`);
    if (uiBundleDir) {
      console.log(`  th preview ${resolvedOutDir}                # open http://127.0.0.1:3000/`);
    }
  }

  return { outDir: resolvedOutDir, uiBundleDir, uiSiteDir };
}

async function deployBuildDir(
  buildDir: string,
  opts: { chain: string; rpc?: string; privateKey?: string; admin?: string; treasury?: string; role: string }
): Promise<void> {
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

  // Emit a chain config artifact and reference it from this deployment.
  const chainConfig = buildChainConfigArtifact({ chainName, chain, rpcUrl });
  const chainSigningKey = loadManifestSigningKey();
  if (chainSigningKey) {
    chainConfig.signatures = [signManifest(chainConfig, chainSigningKey)];
  }
  const chainCfgValidation = validateChainConfig(chainConfig);
  if (!chainCfgValidation.ok) {
    throw new Error(`Generated chain config did not validate:\n${JSON.stringify(chainCfgValidation.errors, null, 2)}`);
  }

  const chainConfigDir = path.join(resolvedBuildDir, 'chain-config');
  ensureDir(chainConfigDir);
  const chainConfigPath = path.join(chainConfigDir, `${chainName}.json`);
  fs.writeFileSync(chainConfigPath, JSON.stringify(chainConfig, null, 2));
  const chainConfigDigest = computeSchemaHash(chainConfig);
  (deployment as any).chainConfig = {
    url: toFileUrl(chainConfigPath),
    digest: chainConfigDigest,
    chainConfigVersion: chainConfig.chainConfigVersion
  };

  // Replace existing deployment entry for (role, chainId) if it exists; otherwise append.
  manifest.deployments = Array.isArray(manifest.deployments) ? manifest.deployments : [];
  const zeroAddress = '0x0000000000000000000000000000000000000000';
  const byRoleAndChainIdx = manifest.deployments.findIndex((d: any) => d && d.role === opts.role && d.chainId === chain.id);
  const placeholderIdx =
    byRoleAndChainIdx >= 0
      ? -1
      : manifest.deployments.findIndex((d: any) => d && d.role === opts.role && String(d.deploymentEntrypointAddress || '').toLowerCase() === zeroAddress);
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

  // Re-sign manifest after mutating deployments.
  const signingKey = loadManifestSigningKey();
  if (signingKey) {
    manifest.signatures = [signManifest(manifest, signingKey)];
  } else {
    const hadRealSig = Array.isArray(manifest.signatures) && manifest.signatures.some((s: any) => s && s.alg && s.alg !== 'none');
    if (hadRealSig) {
      console.warn('WARN manifest: signing key not provided; clearing signatures and marking UNSIGNED');
    }
    manifest.signatures = [{ alg: 'none', sig: 'UNSIGNED' }];
  }

  const validation = validateManifest(manifest);
  if (!validation.ok) {
    throw new Error(`Updated manifest failed validation:\n${JSON.stringify(validation.errors, null, 2)}`);
  }

  const manifestJsonOut = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(manifestPath, manifestJsonOut);
  console.log(`Updated ${manifestPath}`);

  const uiSiteDir = path.join(resolvedBuildDir, 'ui-site');
  if (fs.existsSync(uiSiteDir)) {
    publishManifestToUiSite(uiSiteDir, manifestJsonOut);
    console.log(`Published manifest to ui-site/`);
  }

  if (fs.existsSync(uiSiteDir)) {
    console.log('');
    console.log('Next steps:');
    console.log(`  th preview ${resolvedBuildDir}  # open http://127.0.0.1:3000/`);
  }
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
        `pnpm th doctor`,
        `pnpm th up ${schemaPath}`,
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
  .option('--no-ui', 'Do not generate UI output')
  .action((schemaPath: string, opts: { out: string; ui: boolean }) => {
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

    if (opts.ui) {
      const templateDir = resolveNextExportUiTemplateDir();
      const uiDir = path.join(outDir, 'ui');
      copyDir(templateDir, uiDir);

      const thsTsPath = path.join(uiDir, 'src', 'generated', 'ths.ts');
      ensureDir(path.dirname(thsTsPath));
      fs.writeFileSync(thsTsPath, renderThsTs(schema));

      console.log(`Wrote ui/ (Next.js static export template)`);
    }

    console.log(`Wrote ${appSol.path}`);
  });

program
  .command('build')
  .argument('<schema>', 'Path to THS schema JSON file')
  .option('--out <dir>', 'Output directory', 'artifacts')
  .option('--no-ui', 'Do not generate/build UI bundle')
  .action((schemaPath: string, opts: { out: string; ui: boolean }) => {
    try {
      const schema = loadThsSchemaOrThrow(schemaPath);
      buildFromSchema(schema, opts.out, { ui: opts.ui, schemaPathForHints: schemaPath });
    } catch (e: any) {
      console.error(String(e?.message ?? e));
      process.exitCode = 1;
    }
  });

function anyPaidCreates(schema: ThsSchema): boolean {
  return schema.collections.some((c) => Boolean(c.createRules.payment));
}

program
  .command('up')
  .alias('run')
  .alias('dev')
  .argument('[schema]', 'Path to THS schema JSON file (defaults to an example schema when available)')
  .description('All-in-one local flow: validate + build + (start anvil) + deploy + preview + faucet')
  .option('--out <dir>', 'Build output directory (defaults to artifacts/<appSlug>)')
  .option('--chain <name>', 'Chain name (anvil|sepolia)', 'anvil')
  .option('--rpc <url>', 'RPC URL override')
  .option('--private-key <hex>', 'Private key (0x...) override')
  .option('--admin <address>', 'Admin address (defaults to deployer)')
  .option('--treasury <address>', 'Treasury address (defaults to deployer)')
  .option('--role <role>', 'Deployment role (primary|legacy)', 'primary')
  .option('--host <host>', 'Preview host', '127.0.0.1')
  .option('--port <n>', 'Preview port', '3000')
  .option('--interactive', 'Prompt for missing values', false)
  .option('--dry-run', 'Print what would run and exit', false)
  .option('--no-start-anvil', 'Do not start anvil automatically (anvil chain only)')
  .option('--no-deploy', 'Skip deployment (UI will show Not deployed)')
  .option('--no-preview', 'Skip preview server')
  .option('--no-faucet', 'Disable local faucet endpoint in preview server')
  .action(
    async (
      schemaArg: string | undefined,
      opts: {
        out?: string;
        chain: string;
        rpc?: string;
        privateKey?: string;
        admin?: string;
        treasury?: string;
        role: string;
        host: string;
        port: string;
        interactive: boolean;
        dryRun: boolean;
        startAnvil: boolean;
        deploy: boolean;
        preview: boolean;
        faucet: boolean;
      }
    ) => {
      let rl: ReadlineInterface | null = null;
      let anvilChild: ReturnType<typeof spawn> | null = null;
      const originalUiBaseUrl = process.env.TH_UI_BASE_URL;

      try {
        const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
        const interactive = Boolean(opts.interactive || (isTty && !schemaArg));
        if (interactive) {
          rl = createInterface({ input: process.stdin, output: process.stdout });
        }

        async function ask(question: string, def?: string): Promise<string> {
          if (!rl) throw new Error('Interactive prompt requested but stdin/stdout is not a TTY.');
          const suffix = def ? ` [${def}]` : '';
          const ans = await rl.question(`${question}${suffix}: `);
          const v = ans.trim();
          return v || def || '';
        }

        // Resolve schema path.
        let schemaPath = schemaArg?.trim() || '';
        if (!schemaPath) {
          const example = path.join('apps', 'example', 'job-board.schema.json');
          if (fs.existsSync(example)) {
            schemaPath = example;
            console.log(`Using example schema: ${schemaPath}`);
          } else {
            const appsDir = path.join(process.cwd(), 'apps');
            const candidates = listSchemaCandidates(appsDir);
            if (candidates.length === 1) {
              schemaPath = candidates[0]!;
              console.log(`Using schema: ${path.relative(process.cwd(), schemaPath)}`);
            } else if (candidates.length > 1) {
              if (!interactive) {
                console.error('Multiple schema candidates found. Pass one explicitly:');
                for (const c of candidates) console.error(`  - ${path.relative(process.cwd(), c)}`);
                process.exitCode = 1;
                return;
              }
              console.log('Select a schema:');
              candidates.forEach((c, idx) => console.log(`  ${idx + 1}) ${path.relative(process.cwd(), c)}`));
              const pick = await ask('Schema number', '1');
              const idx = Number(pick) - 1;
              if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
                throw new Error(`Invalid selection: ${pick}`);
              }
              schemaPath = candidates[idx]!;
            } else {
              if (!interactive) {
                console.error('No schema provided and none found under apps/.');
                console.error('Run: th up <path/to/schema.schema.json>');
                process.exitCode = 1;
                return;
              }
              schemaPath = await ask('Schema path');
            }
          }
        }

        const resolvedSchemaPath = path.resolve(schemaPath);
        if (!fs.existsSync(resolvedSchemaPath) || !fs.statSync(resolvedSchemaPath).isFile()) {
          throw new Error(`Schema not found: ${resolvedSchemaPath}`);
        }

        const schema = loadThsSchemaOrThrow(resolvedSchemaPath);
        const outDir = path.resolve(opts.out ? String(opts.out) : path.join('artifacts', schema.app.slug));

        const host = String(opts.host || '127.0.0.1');
        const port = Number(opts.port);
        const previewUrl = `http://${host}:${port}/`;

        // Resolve chain + RPC early so dry-run shows the real target.
        const { chainName, chain } = resolveKnownChain(opts.chain);
        const rpcUrl = resolveRpcUrl(chainName, chain, opts.rpc);

        if (opts.dryRun) {
          console.log('Plan:');
          console.log(`  - validate: ${resolvedSchemaPath}`);
          console.log(`  - build:    ${outDir}`);
          if (chainName === 'anvil') {
            console.log(`  - anvil:    ${opts.startAnvil ? `ensure running at ${rpcUrl}` : `SKIP (rpc=${rpcUrl})`}`);
          }
          if (opts.deploy) {
            console.log(`  - deploy:   chain=${chainName} rpc=${rpcUrl}`);
          } else {
            console.log(`  - deploy:   SKIP`);
          }
          if (opts.preview) {
            console.log(`  - preview:  ${previewUrl}`);
          } else {
            console.log(`  - preview:  SKIP`);
          }
          if (opts.preview) {
            console.log(`  - faucet:   ${opts.faucet && chainName === 'anvil' ? 'ENABLED' : 'SKIP'}`);
          }
          return;
        }

        console.log(`Schema: ${schema.app.slug} (${path.relative(process.cwd(), resolvedSchemaPath)})`);
        console.log(`Out:    ${path.relative(process.cwd(), outDir)}`);
        console.log(`Chain:  ${chainName} (${rpcUrl})`);
        if (opts.preview) console.log(`UI:     ${previewUrl}`);
        console.log('');

        // If the user didn't explicitly set TH_UI_BASE_URL, set it to the preview URL so
        // the manifest's ui.baseUrl is meaningful during local dev.
        if (!originalUiBaseUrl && opts.preview) {
          process.env.TH_UI_BASE_URL = previewUrl;
        }

        // Start Anvil (if needed) while we build.
        const anvilPromise =
          chainName === 'anvil' ? ensureAnvilRunning(rpcUrl, { start: Boolean(opts.startAnvil), expectedChainId: chain.id }) : Promise.resolve({ child: null });

        console.log('Building…');
        buildFromSchema(schema, outDir, { ui: true, quiet: true, schemaPathForHints: resolvedSchemaPath });
        console.log('Build complete.');

        const ensured = await anvilPromise;
        anvilChild = ensured.child;

        if (opts.deploy) {
          console.log('');
          console.log('Deploying…');
          await deployBuildDir(outDir, {
            chain: opts.chain,
            rpc: opts.rpc,
            privateKey: opts.privateKey,
            admin: opts.admin,
            treasury: opts.treasury,
            role: opts.role
          });
          console.log('Deploy complete.');
        }

        if (opts.preview) {
          console.log('');
          const faucetEnabled = Boolean(opts.faucet && chainName === 'anvil');
          const faucetTargetWei = 10n * 10n ** 18n;
          const { server, url } = startUiSiteServer({
            buildDir: outDir,
            host,
            port,
            faucet: faucetEnabled
              ? {
                  enabled: true,
                  rpcUrl,
                  chainId: chain.id,
                  targetWei: faucetTargetWei
                }
              : null
          });
          console.log('');
          console.log(`Ready: ${url}`);
          console.log('Press Ctrl+C to stop.');

          const cleanup = () => {
            try {
              server.close(() => {});
            } catch {}
            if (anvilChild) {
              try {
                anvilChild.kill('SIGTERM');
              } catch {}
            }
            process.exit(0);
          };

          process.on('SIGINT', cleanup);
          process.on('SIGTERM', cleanup);
        } else {
          // If we started Anvil ourselves, shut it down on exit unless we're staying alive to serve the UI.
          if (anvilChild) {
            try {
              anvilChild.kill('SIGTERM');
            } catch {}
            anvilChild = null;
          }
        }
      } catch (e: any) {
        console.error(String(e?.message ?? e));
        process.exitCode = 1;
        if (anvilChild) {
          try {
            anvilChild.kill('SIGTERM');
          } catch {}
        }
      } finally {
        if (rl) rl.close();
        if (originalUiBaseUrl !== undefined) {
          process.env.TH_UI_BASE_URL = originalUiBaseUrl;
        } else {
          delete process.env.TH_UI_BASE_URL;
        }
      }
    }
  );

program
  .command('preview')
  .argument('<buildDir>', 'Directory created by `th build` (contains ui-site/)')
  .description('Serve the generated static UI locally (no Python required)')
  .option('--port <n>', 'Port to listen on', '3000')
  .option('--host <host>', 'Host to bind (default: 127.0.0.1)', '127.0.0.1')
  .option('--rpc <url>', 'RPC URL override (used for auto-deploy and faucet)')
  .option('--no-deploy', 'Do not auto-deploy when the manifest has a placeholder 0x0 address')
  .option('--no-start-anvil', 'Do not start anvil automatically (anvil chain only)')
  .option('--no-faucet', 'Disable local faucet endpoint')
  .action(async (buildDir: string, opts: { port: string; host: string; rpc?: string; deploy: boolean; startAnvil: boolean; faucet: boolean }) => {
    let anvilChild: ReturnType<typeof spawn> | null = null;
    try {
      const resolvedBuildDir = path.resolve(buildDir);
      const manifestPath = path.join(resolvedBuildDir, 'manifest.json');
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      const faucetTargetWei = 10n * 10n ** 18n;
      let faucetConfig: FaucetConfig | null = null;

      // Enable faucet when previewing an anvil build (chainId 31337) and the user hasn't disabled it.
      if (opts.faucet && fs.existsSync(manifestPath)) {
        try {
          const manifest = readJsonFile(manifestPath) as any;
          const deployments = Array.isArray(manifest?.deployments) ? manifest.deployments : [];
          const d = deployments.find((x: any) => x && x.role === 'primary') ?? deployments[0] ?? null;
          const chainId = Number(d?.chainId ?? NaN);
          if (chainId === anvil.id) {
            const { chainName, chain } = resolveKnownChain('anvil');
            const rpcUrl = resolveRpcUrl(chainName, chain, opts.rpc);
            faucetConfig = { enabled: true, rpcUrl, chainId, targetWei: faucetTargetWei };
          }
        } catch {
          // Ignore manifest parsing issues; serving static UI still works.
        }
      }

      // If the manifest is still at the placeholder address, auto-deploy on anvil by default.
      if (opts.deploy && fs.existsSync(manifestPath)) {
        const manifest = readJsonFile(manifestPath) as any;
        const deployments = Array.isArray(manifest?.deployments) ? manifest.deployments : [];
        const d = deployments.find((x: any) => x && x.role === 'primary') ?? deployments[0] ?? null;
        const addr = String(d?.deploymentEntrypointAddress ?? '');
        const chainId = Number(d?.chainId ?? NaN);

        if (addr && addr.toLowerCase() === zeroAddress && Number.isFinite(chainId)) {
          const chainNameFromId = chainId === anvil.id ? ('anvil' as const) : chainId === sepolia.id ? ('sepolia' as const) : null;
          if (chainNameFromId === 'anvil') {
            const { chainName, chain } = resolveKnownChain('anvil');
            const rpcUrl = resolveRpcUrl(chainName, chain, opts.rpc);
            console.log(`Manifest is not deployed (0x0). Deploying automatically to ${chainName}...`);
            const ensured = await ensureAnvilRunning(rpcUrl, { start: Boolean(opts.startAnvil), expectedChainId: chain.id });
            anvilChild = ensured.child;
            await deployBuildDir(resolvedBuildDir, { chain: 'anvil', rpc: opts.rpc, role: 'primary' });
            console.log('Auto-deploy complete.');
            console.log('');
          }
        }
      }

      const port = Number(opts.port);
      const { server } = startUiSiteServer({ buildDir: resolvedBuildDir, host: opts.host, port, faucet: faucetConfig });

      const cleanup = () => {
        try {
          server.close(() => {});
        } catch {}
        if (anvilChild) {
          try {
            anvilChild.kill('SIGTERM');
          } catch {}
        }
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    } catch (e: any) {
      console.error(String(e?.message ?? e));
      process.exitCode = 1;
      if (anvilChild) {
        try {
          anvilChild.kill('SIGTERM');
        } catch {}
      }
    }
  });

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
      await deployBuildDir(buildDir, opts);
    } catch (e: any) {
      console.error(String(e?.message ?? e));
      process.exitCode = 1;
    }
  });

program
  .command('verify')
  .argument('<buildDir>', 'Directory created by `th build` (contains manifest.json)')
  .description('Verify deployed contracts on explorers (Etherscan + Sourcify)')
  .option('--chain <name>', 'Chain name (anvil|sepolia)', 'sepolia')
  .option('--rpc <url>', 'RPC URL override (used by verifier tooling)')
  .option('--verifier <v>', 'Verifier to use (etherscan|sourcify|both)', 'both')
  .option('--etherscan-api-key <key>', 'Etherscan API key override')
  .option('--no-watch', 'Do not wait for verification results')
  .option('--dry-run', 'Print forge commands and exit', false)
  .action((buildDir: string, opts: { chain: string; rpc?: string; verifier: string; etherscanApiKey?: string; watch: boolean; dryRun: boolean }) => {
    const resolvedBuildDir = path.resolve(buildDir);
    const manifestPath = path.join(resolvedBuildDir, 'manifest.json');
    const compiledPath = path.join(resolvedBuildDir, 'compiled', 'App.json');
    const sourcePath = path.join(resolvedBuildDir, 'contracts', 'App.sol');

    if (!fs.existsSync(manifestPath)) {
      console.error(`Missing manifest.json in ${resolvedBuildDir}. Run \`th build\` first.`);
      process.exitCode = 1;
      return;
    }
    if (!fs.existsSync(compiledPath)) {
      console.error(`Missing compiled/App.json in ${resolvedBuildDir}. Run \`th build\` first.`);
      process.exitCode = 1;
      return;
    }
    if (!fs.existsSync(sourcePath)) {
      console.error(`Missing contracts/App.sol in ${resolvedBuildDir}. Run \`th build\` first.`);
      process.exitCode = 1;
      return;
    }

    const manifest = readJsonFile(manifestPath) as any;
    const compiled = readJsonFile(compiledPath) as any;
    const source = fs.readFileSync(sourcePath, 'utf-8');

    const { chainName, chain } = resolveKnownChain(opts.chain);
    const rpcUrl = resolveRpcUrl(chainName, chain, opts.rpc);

    const deployments = Array.isArray(manifest.deployments) ? manifest.deployments : [];
    const target = deployments.find((d: any) => d && d.role === 'primary' && d.chainId === chain.id);
    if (!target) {
      console.error(`No primary deployment found for chainId ${chain.id} in manifest.json`);
      process.exitCode = 1;
      return;
    }

    const addr = String(target.deploymentEntrypointAddress || '');
    const zeroAddress = '0x0000000000000000000000000000000000000000';
    if (addr.toLowerCase() === zeroAddress) {
      console.error('deploymentEntrypointAddress is 0x0. Run `th deploy` first.');
      process.exitCode = 1;
      return;
    }
    const contractAddress = normalizeAddress(addr, 'deploymentEntrypointAddress');

    const verifier = String(opts.verifier || 'both').toLowerCase();
    const wantEtherscan = verifier === 'both' || verifier === 'etherscan';
    const wantSourcify = verifier === 'both' || verifier === 'sourcify';

    const etherscanKey = (() => {
      if (!wantEtherscan) return null;
      if (opts.etherscanApiKey) return opts.etherscanApiKey;
      return process.env[envKeyForChain(chainName, 'ETHERSCAN_API_KEY')] || process.env.ETHERSCAN_API_KEY || null;
    })();

    if (wantEtherscan && !etherscanKey) {
      console.error(`Missing Etherscan API key. Set ${envKeyForChain(chainName, 'ETHERSCAN_API_KEY')} or ETHERSCAN_API_KEY (or pass --etherscan-api-key).`);
      process.exitCode = 1;
      return;
    }

    // Encode constructor args if needed.
    const ctorInputs = findConstructorInputs(compiled?.abi);
    const ctorArgsEncoded = (() => {
      if (ctorInputs.length === 0) return null;
      if (ctorInputs.length === 2) {
        const adminAddress = normalizeAddress(String(target.adminAddress || ''), 'adminAddress');
        const treasuryAddress = normalizeAddress(String(target.treasuryAddress || ''), 'treasuryAddress');
        const params = ctorInputs.map((i: any) => ({ type: String(i.type) }));
        return encodeAbiParameters(params as any, [adminAddress, treasuryAddress] as any);
      }
      const inputs = ctorInputs
        .map((i: any) => `${String(i.type ?? '')}${i.name ? ` ${String(i.name)}` : ''}`)
        .join(', ');
      throw new Error(
        `Unsupported constructor for verification. ` +
          `Expected 0 inputs, or 2 inputs (adminAddress, treasuryAddress), got ${ctorInputs.length}: ${inputs || '(unknown)'}.`
      );
    })();

    // Foundry is required for verification (but allow --dry-run without forge installed).
    if (!opts.dryRun) {
      const forgeVersion = spawnSync('forge', ['--version'], { encoding: 'utf-8' });
      if (forgeVersion.error && (forgeVersion.error as any).code === 'ENOENT') {
        console.error('Missing Foundry: `forge` not found on PATH.');
        console.error('Install Foundry from https://book.getfoundry.sh/getting-started/installation and retry.');
        process.exitCode = 1;
        return;
      }
    }

    const verifyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tokenhost-verify-'));
    const foundryToml = [
      '[profile.default]',
      'src = "contracts"',
      'out = "out"',
      'libs = ["lib"]',
      'solc_version = "0.8.24"',
      'optimizer = true',
      'optimizer_runs = 200',
      ''
    ].join('\n');

    let etherscanOk = false;
    let sourcifyOk = false;

    function tail(s: string, maxChars = 8000): string {
      if (!s) return '';
      return s.length <= maxChars ? s : s.slice(s.length - maxChars);
    }

    function cmdString(cmd: string, args: string[]): string {
      return [cmd, ...args].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
    }

    function runForge(args: string[]): { ok: boolean; status: number | null; cmd: string; stdout: string; stderr: string } {
      const cmd = cmdString('forge', args);
      const res = spawnSync('forge', args, { encoding: 'utf-8' });
      const stdout = res.stdout ?? '';
      const stderr = res.stderr ?? '';
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (res.error && (res.error as any).code === 'ENOENT') {
        return { ok: false, status: null, cmd, stdout: '', stderr: 'forge not found (ENOENT)' };
      }
      return { ok: res.status === 0, status: res.status ?? null, cmd, stdout, stderr };
    }

    let etherscanResult: ReturnType<typeof runForge> | null = null;
    let sourcifyResult: ReturnType<typeof runForge> | null = null;

    try {
      ensureDir(path.join(verifyRoot, 'contracts'));
      fs.writeFileSync(path.join(verifyRoot, 'contracts', 'App.sol'), source);
      fs.writeFileSync(path.join(verifyRoot, 'foundry.toml'), foundryToml);

      const contractId = 'contracts/App.sol:App';
      const commonArgs: string[] = [
        'verify-contract',
        '--root',
        verifyRoot,
        '--chain',
        String(chain.id),
        '--rpc-url',
        rpcUrl,
        '--compiler-version',
        '0.8.24',
        '--num-of-optimizations',
        '200'
      ];

      if (opts.watch) commonArgs.push('--watch');
      if (ctorArgsEncoded) commonArgs.push('--constructor-args', ctorArgsEncoded);

      if (wantEtherscan) {
        const args = [
          ...commonArgs,
          '--verifier',
          'etherscan',
          '--etherscan-api-key',
          String(etherscanKey),
          contractAddress,
          contractId
        ];
        if (opts.dryRun) {
          console.log(cmdString('forge', args));
        } else {
          console.log(`Verifying on Etherscan (${chainName})...`);
          etherscanResult = runForge(args);
          etherscanOk = etherscanResult.ok;
        }
      }

      if (wantSourcify) {
        const args = [...commonArgs, '--verifier', 'sourcify', contractAddress, contractId];
        if (opts.dryRun) {
          console.log(cmdString('forge', args));
        } else {
          console.log(`Verifying on Sourcify (${chainName})...`);
          sourcifyResult = runForge(args);
          sourcifyOk = sourcifyResult.ok;
        }
      }

      if (opts.dryRun) {
        console.log('Dry run complete (no manifest changes written).');
        return;
      }

    } catch (e: any) {
      console.error(String(e?.message ?? e));
      process.exitCode = 1;
      return;
    } finally {
      fs.rmSync(verifyRoot, { recursive: true, force: true });
    }

    const verified = (wantEtherscan ? etherscanOk : true) && (wantSourcify ? sourcifyOk : true);

    // Update manifest verification flags.
    target.verified = verified;
    if (Array.isArray(target.contracts)) {
      for (const c of target.contracts) c.verified = verified;
    }

    manifest.extensions = manifest.extensions ?? {};
    manifest.extensions.verification = {
      ...(manifest.extensions.verification ?? {}),
      [String(chain.id)]: {
        at: new Date().toISOString(),
        etherscan: wantEtherscan
          ? {
              ok: etherscanOk,
              status: etherscanResult?.status ?? null,
              cmd: etherscanResult?.cmd ?? null,
              stdoutTail: tail(etherscanResult?.stdout ?? ''),
              stderrTail: tail(etherscanResult?.stderr ?? '')
            }
          : { ok: null },
        sourcify: wantSourcify
          ? {
              ok: sourcifyOk,
              status: sourcifyResult?.status ?? null,
              cmd: sourcifyResult?.cmd ?? null,
              stdoutTail: tail(sourcifyResult?.stdout ?? ''),
              stderrTail: tail(sourcifyResult?.stderr ?? '')
            }
          : { ok: null }
      }
    };

    // Re-sign manifest after mutating verification status.
    const signingKey = loadManifestSigningKey();
    if (signingKey) {
      manifest.signatures = [signManifest(manifest, signingKey)];
    } else {
      manifest.signatures = [{ alg: 'none', sig: 'UNSIGNED' }];
    }

    const validation = validateManifest(manifest);
    if (!validation.ok) {
      console.error(`Updated manifest failed validation:\n${JSON.stringify(validation.errors, null, 2)}`);
      process.exitCode = 1;
      return;
    }

    const manifestJsonOut = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(manifestPath, manifestJsonOut);

    const uiSiteDir = path.join(resolvedBuildDir, 'ui-site');
    if (fs.existsSync(uiSiteDir)) {
      publishManifestToUiSite(uiSiteDir, manifestJsonOut);
      console.log(`Published manifest to ui-site/`);
    }

    if (!verified) {
      console.error('Verification did not fully succeed.');
      process.exitCode = 1;
      return;
    }

    console.log(`Verified and updated ${manifestPath}`);
  });

program
  .command('migrate')
  .argument('<schema>', 'Path to THS schema JSON file')
  .description('Apply local THS schema migrations')
  .option('--list', 'List known migrations and exit', false)
  .option('--down', 'Apply down migrations (revert)', false)
  .option('--steps <n>', 'Number of migrations to apply (default: all for up; 1 for down)')
  .option('--in-place', 'Overwrite the input schema file', false)
  .option('--out <file>', 'Write migrated schema JSON to a file (defaults to stdout)')
  .action((schemaPath: string, opts: { list: boolean; down: boolean; steps?: string; inPlace: boolean; out?: string }) => {
    if (opts.list) {
      const migrations = listThsMigrations();
      for (const m of migrations) {
        console.log(`${m.id} - ${m.description}`);
      }
      return;
    }

    if (opts.inPlace && opts.out) {
      console.error('ERROR: --in-place and --out are mutually exclusive.');
      process.exitCode = 1;
      return;
    }

    const input = readJsonFile(schemaPath);
    const structural = validateThsStructural(input);
    if (!structural.ok) {
      console.error(formatIssues(structural.issues));
      process.exitCode = 1;
      return;
    }

    const schema = structural.data!;

    const steps = (() => {
      if (typeof opts.steps !== 'string' || opts.steps.trim() === '') return undefined;
      const n = Number(opts.steps);
      if (!Number.isFinite(n) || n < 0) throw new Error('Invalid --steps value. Expected a non-negative number.');
      return Math.floor(n);
    })();

    const direction = opts.down ? 'down' : 'up';
    const effectiveSteps = steps ?? (direction === 'down' ? 1 : undefined);

    const res = migrateThsSchema(schema, { direction, steps: effectiveSteps });
    const migrated = res.schema;

    // Ensure the migrated schema still validates and lints cleanly.
    const lintIssues = lintThs(migrated);
    const errors = lintIssues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      console.error(formatIssues(lintIssues));
      process.exitCode = 1;
      return;
    }

    const outJson = JSON.stringify(migrated, null, 2);
    if (opts.inPlace) {
      fs.writeFileSync(schemaPath, outJson);
    } else if (opts.out) {
      ensureDir(path.dirname(opts.out));
      fs.writeFileSync(opts.out, outJson);
    } else {
      console.log(outJson);
    }

    const appliedMsg = res.appliedNow.length > 0 ? res.appliedNow.join(', ') : '(none)';
    console.error(`migrations (${direction}) applied: ${appliedMsg}`);
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
