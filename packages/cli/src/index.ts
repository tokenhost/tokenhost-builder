import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import * as nodeHttp from 'node:http';
import * as nodeNet from 'node:net';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline/promises';
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { Command } from 'commander';

import { generateAppSolidity, type GeneratorLimits } from '@tokenhost/generator';
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
import { anvil, filecoin, filecoinCalibration, sepolia } from 'viem/chains';

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

function defaultStudioFormState(): ThsSchema {
  return {
    thsVersion: '2025-12',
    schemaVersion: '0.0.1',
    app: {
      name: 'My App',
      slug: 'my-app',
      description: '',
      features: { uploads: false, onChainIndexing: true, indexer: false, delegation: false },
      ui: {
        homePage: { mode: 'generated' },
        extensions: {}
      }
    },
    collections: [
      {
        name: 'Item',
        plural: 'Items',
        fields: [{ name: 'title', type: 'string', required: true }],
        createRules: { required: ['title'], access: 'public', auto: {} },
        visibilityRules: { gets: ['title'], access: 'public' },
        updateRules: { mutable: ['title'], access: 'owner', optimisticConcurrency: false },
        deleteRules: { softDelete: true, access: 'owner' },
        transferRules: { access: 'owner' },
        indexes: { unique: [], index: [] },
        relations: []
      }
    ],
    metadata: {}
  };
}

function buildStudioPreview(schema: ThsSchema): {
  app: { name: string; slug: string };
  ui: { homePageMode: string; extensionDirectory: string | null };
  collections: Array<{
    name: string;
    routes: string[];
    contractFns: string[];
  }>;
} {
  const collections = (schema.collections || []).map((c) => {
    const name = String(c?.name ?? '');
    const routes = [`/${name}/`, `/${name}/?mode=new`, `/${name}/?mode=view&id=1`];
    if (Array.isArray(c?.updateRules?.mutable) && c.updateRules.mutable.length > 0) {
      routes.push(`/${name}/?mode=edit&id=1`);
    }
    if (Boolean(c?.deleteRules?.softDelete)) {
      routes.push(`/${name}/?mode=delete&id=1`);
    }

    const contractFns = [`listIds${name}(uint256,uint256,bool)`, `get${name}(uint256)`, `create${name}(...)`];
    if (Array.isArray(c?.updateRules?.mutable) && c.updateRules.mutable.length > 0) {
      contractFns.push(`update${name}(...)`);
    }
    if (Boolean(c?.deleteRules?.softDelete)) {
      contractFns.push(`delete${name}(uint256)`);
    }
    if (c?.transferRules) {
      contractFns.push(`transfer${name}(uint256,address)`);
    }

    return { name, routes, contractFns };
  });

  return {
    app: {
      name: String(schema?.app?.name ?? ''),
      slug: String(schema?.app?.slug ?? '')
    },
    ui: {
      homePageMode: String(schema?.app?.ui?.homePage?.mode ?? 'generated'),
      extensionDirectory: schema?.app?.ui?.extensions?.directory ? String(schema.app.ui.extensions.directory) : null
    },
    collections
  };
}

function normalizeStudioFormState(input: any): ThsSchema {
  const state = input && typeof input === 'object' ? input : {};
  const appIn = state.app && typeof state.app === 'object' ? state.app : {};
  const collectionsIn = Array.isArray(state.collections) ? state.collections : [];
  const metadata = state.metadata && typeof state.metadata === 'object' ? state.metadata : {};

  const out: ThsSchema = {
    thsVersion: String(state.thsVersion ?? '2025-12'),
    schemaVersion: String(state.schemaVersion ?? '0.0.1'),
    app: {
      name: String(appIn.name ?? 'My App'),
      slug: String(appIn.slug ?? 'my-app'),
      description: appIn.description == null ? undefined : String(appIn.description),
      theme: appIn.theme && typeof appIn.theme === 'object' ? appIn.theme : undefined,
      features: {
        uploads: Boolean(appIn.features?.uploads),
        onChainIndexing: Boolean(appIn.features?.onChainIndexing),
        indexer: Boolean(appIn.features?.indexer),
        delegation: Boolean(appIn.features?.delegation)
      },
      ui: {
        homePage: {
          mode: appIn.ui?.homePage?.mode === 'custom' ? 'custom' : 'generated'
        },
        extensions:
          appIn.ui?.extensions && typeof appIn.ui.extensions === 'object'
            ? {
                directory:
                  appIn.ui.extensions.directory == null ? undefined : String(appIn.ui.extensions.directory)
              }
            : undefined
      }
    },
    collections: collectionsIn.map((c: any) => {
      const fields = Array.isArray(c?.fields) ? c.fields : [];
      const createRules = c?.createRules && typeof c.createRules === 'object' ? c.createRules : {};
      const visibilityRules = c?.visibilityRules && typeof c.visibilityRules === 'object' ? c.visibilityRules : {};
      const updateRules = c?.updateRules && typeof c.updateRules === 'object' ? c.updateRules : {};
      const deleteRules = c?.deleteRules && typeof c.deleteRules === 'object' ? c.deleteRules : {};
      const transferRules = c?.transferRules && typeof c.transferRules === 'object' ? c.transferRules : null;
      const indexes = c?.indexes && typeof c.indexes === 'object' ? c.indexes : {};
      const relations = Array.isArray(c?.relations) ? c.relations : [];

      return {
        name: String(c?.name ?? ''),
        plural: c?.plural == null ? undefined : String(c.plural),
        fields: fields.map((f: any) => ({
          name: String(f?.name ?? ''),
          type: String(f?.type ?? 'string') as any,
          required: Boolean(f?.required),
          decimals: f?.decimals == null || f?.decimals === '' ? undefined : Number(f.decimals),
          default: f?.default,
          validation: f?.validation && typeof f.validation === 'object' ? f.validation : undefined,
          ui:
            f?.ui && typeof f.ui === 'object'
              ? {
                  ...(f.ui || {}),
                  component:
                    f.ui.component === 'externalLink'
                      ? 'externalLink'
                      : f.ui.component === 'default'
                        ? 'default'
                        : undefined,
                  label: f.ui.label == null ? undefined : String(f.ui.label),
                  target: f.ui.target === '_self' ? '_self' : f.ui.target === '_blank' ? '_blank' : undefined
                }
              : undefined
        })),
        createRules: {
          required: Array.isArray(createRules.required) ? createRules.required.map((x: any) => String(x)) : [],
          auto: createRules.auto && typeof createRules.auto === 'object' ? createRules.auto : undefined,
          payment:
            createRules.payment && typeof createRules.payment === 'object'
              ? {
                  asset: String(createRules.payment.asset ?? 'native') as 'native',
                  amountWei: String(createRules.payment.amountWei ?? '0')
                }
              : undefined,
          access: String(createRules.access ?? 'public') as any
        },
        visibilityRules: {
          gets: Array.isArray(visibilityRules.gets) ? visibilityRules.gets.map((x: any) => String(x)) : [],
          access: String(visibilityRules.access ?? 'public') as any
        },
        updateRules: {
          mutable: Array.isArray(updateRules.mutable) ? updateRules.mutable.map((x: any) => String(x)) : [],
          access: String(updateRules.access ?? 'owner') as any,
          optimisticConcurrency: Boolean(updateRules.optimisticConcurrency)
        },
        deleteRules: {
          softDelete: Boolean(deleteRules.softDelete),
          access: String(deleteRules.access ?? 'owner') as any
        },
        transferRules: transferRules
          ? {
              access: String(transferRules.access ?? 'owner') as any
            }
          : undefined,
        indexes: {
          unique: Array.isArray(indexes.unique)
            ? indexes.unique.map((u: any) => ({
                field: String(u?.field ?? ''),
                scope: u?.scope == null ? undefined : String(u.scope) as any
              }))
            : [],
          index: Array.isArray(indexes.index)
            ? indexes.index.map((idx: any) => ({
                field: String(idx?.field ?? ''),
                mode:
                  idx?.mode === 'tokenized'
                    ? 'tokenized'
                    : idx?.mode === 'equality'
                      ? 'equality'
                      : undefined,
                tokenizer: idx?.tokenizer === 'hashtag' ? 'hashtag' : undefined
              }))
            : []
        },
        relations: relations.map((r: any) => ({
          field: String(r?.field ?? ''),
          to: String(r?.to ?? ''),
          enforce: Boolean(r?.enforce),
          reverseIndex: Boolean(r?.reverseIndex)
        })),
        ui: c?.ui && typeof c.ui === 'object' ? c.ui : undefined
      };
    }),
    metadata
  };

  return out;
}

function validateStudioFormState(formState: any): {
  ok: boolean;
  issues: Issue[];
  schemaHash: string | null;
  schema: ThsSchema | null;
  preview: ReturnType<typeof buildStudioPreview> | null;
} {
  const normalized = normalizeStudioFormState(formState);
  const structural = validateThsStructural(normalized);
  if (!structural.ok) {
    return {
      ok: false,
      issues: structural.issues,
      schemaHash: null,
      schema: null,
      preview: null
    };
  }

  const schema = structural.data!;
  const lintIssues = lintThs(schema);
  const issues = [...lintIssues];
  const hasErrors = issues.some((i) => i.severity === 'error');
  return {
    ok: !hasErrors,
    issues,
    schemaHash: computeSchemaHash(schema),
    schema,
    preview: buildStudioPreview(schema)
  };
}

type SharedThemeTokens = {
  colors: {
    bg: string;
    bgAlt: string;
    panel: string;
    panelStrong: string;
    border: string;
    text: string;
    muted: string;
    primary: string;
    primaryStrong: string;
    accent: string;
    success: string;
    danger: string;
  };
  radius: { sm: string; md: string; lg: string };
  spacing: { xs: string; sm: string; md: string; lg: string; xl: string };
  typography: { display: string; body: string; mono: string };
  motion: { fast: string; base: string };
};

const DEFAULT_THEME_PRESET = 'cyber-grid';
type SharedThemePreset = typeof DEFAULT_THEME_PRESET;

function defaultSharedThemeTokens(): SharedThemeTokens {
  return {
    colors: {
      bg: '#f2f5f7',
      bgAlt: '#fbfcfd',
      panel: '#ffffff',
      panelStrong: '#ffffff',
      border: '#d6dfeb',
      text: '#0f1729',
      muted: '#66758d',
      primary: '#ff80ff',
      primaryStrong: '#ff67f5',
      accent: '#1b9847',
      success: '#1b9847',
      danger: '#ef4444'
    },
    radius: { sm: '0px', md: '0px', lg: '0px' },
    spacing: { xs: '6px', sm: '10px', md: '16px', lg: '24px', xl: '38px' },
    typography: {
      display: '"Montserrat", "Avenir Next", "Segoe UI", sans-serif',
      body: '"Montserrat", "Avenir Next", "Segoe UI", sans-serif',
      mono: '"JetBrains Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    },
    motion: { fast: '140ms', base: '220ms' }
  };
}

function resolveSharedThemePreset(theme: Record<string, unknown> | undefined | null): SharedThemePreset {
  const preset = String(theme?.preset ?? DEFAULT_THEME_PRESET).trim();
  if (preset !== DEFAULT_THEME_PRESET) {
    throw new Error(`Unsupported theme preset "${preset}". Supported presets: ${DEFAULT_THEME_PRESET}.`);
  }
  return DEFAULT_THEME_PRESET;
}

function loadSharedThemeTokensForPreset(preset: SharedThemePreset): SharedThemeTokens {
  if (preset !== DEFAULT_THEME_PRESET) return defaultSharedThemeTokens();
  try {
    const templateDir = resolveNextExportUiTemplateDir();
    const tokenPath = path.join(templateDir, 'src', 'theme', 'tokens.json');
    if (!fs.existsSync(tokenPath)) return defaultSharedThemeTokens();
    return JSON.parse(fs.readFileSync(tokenPath, 'utf-8')) as SharedThemeTokens;
  } catch {
    return defaultSharedThemeTokens();
  }
}

function materializeUiThemePreset(uiDir: string, schema: ThsSchema) {
  const preset = resolveSharedThemePreset((schema.app.theme as Record<string, unknown> | undefined) ?? undefined);
  const tokens = loadSharedThemeTokensForPreset(preset);
  const tokenPath = path.join(uiDir, 'src', 'theme', 'tokens.json');
  ensureDir(path.dirname(tokenPath));
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2) + '\n');
}

function renderStudioThemeCssVars(tokens: SharedThemeTokens): string {
  return [
    `--th-bg:${tokens.colors.bg}`,
    `--th-bg-alt:${tokens.colors.bgAlt}`,
    `--th-panel:${tokens.colors.panel}`,
    `--th-panel-strong:${tokens.colors.panelStrong}`,
    `--th-border:${tokens.colors.border}`,
    `--th-text:${tokens.colors.text}`,
    `--th-muted:${tokens.colors.muted}`,
    `--th-primary:${tokens.colors.primary}`,
    `--th-primary-strong:${tokens.colors.primaryStrong}`,
    `--th-accent:${tokens.colors.accent}`,
    `--th-success:${tokens.colors.success}`,
    `--th-danger:${tokens.colors.danger}`,
    `--th-radius-sm:${tokens.radius.sm}`,
    `--th-radius-md:${tokens.radius.md}`,
    `--th-radius-lg:${tokens.radius.lg}`,
    `--th-space-xs:${tokens.spacing.xs}`,
    `--th-space-sm:${tokens.spacing.sm}`,
    `--th-space-md:${tokens.spacing.md}`,
    `--th-space-lg:${tokens.spacing.lg}`,
    `--th-space-xl:${tokens.spacing.xl}`,
    `--th-font-display:${tokens.typography.display}`,
    `--th-font-body:${tokens.typography.body}`,
    `--th-font-mono:${tokens.typography.mono}`,
    `--th-motion-fast:${tokens.motion.fast}`,
    `--th-motion-base:${tokens.motion.base}`
  ].join(';');
}

function loadStudioWordmarkSvg(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../assets/studio/Wordmark.svg'),
    path.resolve(here, '../../assets/studio/Wordmark.svg')
  ];

  const workspace = findUp('pnpm-workspace.yaml', process.cwd());
  if (workspace) {
    const root = path.dirname(workspace);
    candidates.push(path.join(root, 'packages', 'cli', 'assets', 'studio', 'Wordmark.svg'));
  }

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const raw = fs.readFileSync(candidate, 'utf-8');
    if (!raw.includes('<svg')) continue;
    if (raw.includes('class="brandSvg"')) return raw;
    return raw.replace('<svg ', '<svg class="brandSvg" ');
  }

  return '<div class="brandWordFallback">token host</div>';
}

function loadStudioBackgroundPngBuffer(): Buffer | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../assets/studio/Token BIG-01.cfe69f33.png'),
    path.resolve(here, '../../assets/studio/Token BIG-01.cfe69f33.png'),
    path.resolve(here, '../assets/studio/Token BIG-01@2x.png'),
    path.resolve(here, '../assets/studio/Token BIG-01.png')
  ];

  const workspace = findUp('pnpm-workspace.yaml', process.cwd());
  if (workspace) {
    const root = path.dirname(workspace);
    candidates.push(path.join(root, 'packages', 'cli', 'assets', 'studio', 'Token BIG-01.cfe69f33.png'));
    candidates.push(path.join(root, 'packages', 'cli', 'assets', 'studio', 'Token BIG-01@2x.png'));
    candidates.push(path.join(root, 'packages', 'cli', 'assets', 'studio', 'Token BIG-01.png'));
  }

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    return fs.readFileSync(candidate);
  }

  return null;
}

function renderStudioHtml(): string {
  // Keep this local-first and dependency-free for fast startup in any repo clone.
  const themeTokens = loadSharedThemeTokensForPreset(DEFAULT_THEME_PRESET);
  const cssVars = renderStudioThemeCssVars(themeTokens);
  const studioWordmarkSvg = loadStudioWordmarkSvg();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Token Host Studio (Local)</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
    :root { color-scheme: light; ${cssVars}; --ok:var(--th-success); --err:var(--th-danger); --warn:var(--th-accent); }
    * { box-sizing: border-box; }
    body { margin:0; font-family: "Montserrat", var(--th-font-body); background:#ffffff; color: #021a4d; position: relative; overflow-x: hidden; }
    .top-background { position: absolute; z-index: -1; top: -30vw; left: -10vh; width: 150vw; min-width: 600px; max-width: 150vw; display: inline-block; height: 200vh; background-image: url('/static/media/Token%20BIG-01.cfe69f33.png'); background-position: 0 0; background-size: contain; background-repeat: no-repeat; }
    .wrap { max-width: 1400px; margin: 0 auto; padding: 28px 24px 40px; position: relative; overflow: hidden; z-index: 1; }
    .hero, .panel, .row { position:relative; z-index:1; }
    .hero { margin-bottom: 18px; }
    .brandMark { margin-bottom: 6px; display:flex; align-items:center; }
    .brandSvg { width: min(470px, 74vw); height: auto; display:block; }
    .brandWordFallback { font-size: 64px; font-weight: 900; color: #001131; letter-spacing: .01em; line-height: 1; }
    .heroTitle { margin: 0; font-size: 34px; font-family: "Montserrat", var(--th-font-display); font-weight: 900; color: #0a43d8; letter-spacing: .01em; line-height:1.08; }
    .heroSub { margin-top: 6px; color: #375b9d; font-size: 15px; max-width: 900px; }
    .row { display:grid; grid-template-columns: 1.6fr 1fr; gap: 14px; }
    .panel { background: linear-gradient(180deg, #f4f8ff 0%, #eaf2ff 100%); border:1px solid #d7e4ff; border-radius: var(--th-radius-lg); padding: var(--th-space-md); box-shadow: 0 8px 24px #1345ac1a; }
    .title { margin:0 0 10px 0; font-size: 28px; font-family: "Montserrat", var(--th-font-display); font-weight: 900; color: #0a43d8; letter-spacing: .01em; line-height:1.1; }
    .muted { color: #4e6ea7; font-size: 13px; }
    textarea { width:100%; min-height: 120px; border-radius: var(--th-radius-sm); border:1px solid #c9dbff; background: #ffffff; color: #0a255f; padding: 10px; font-family: var(--th-font-mono); font-size: 13px; line-height: 1.35; }
    input[type=text], input[type=number], select { width: 100%; border-radius: var(--th-radius-sm); border:1px solid #c9dbff; background:#ffffff; color:#0a255f; padding: 8px; }
    input[type=text]:focus, input[type=number]:focus, select:focus, textarea:focus { outline: 2px solid #7fb5ff; outline-offset: 0; border-color: #7fb5ff; }
    label { display: block; font-size: 12px; color: #46689f; margin-bottom: 4px; font-weight: 600; }
    .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
    .grid3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; }
    .card { border:1px solid #d7e4ff; border-radius: var(--th-radius-sm); padding: 8px; margin-top: 8px; background: #ffffff; }
    .sectionTitle { font-size: 14px; font-weight: 800; margin-top: 10px; color: #0b3bb6; }
    .stack { display:flex; flex-direction:column; gap:8px; }
    .toolbar { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
    .configList { display:flex; flex-direction:column; gap:8px; max-height:260px; overflow:auto; }
    .configRow { display:grid; grid-template-columns: 1fr auto; gap:8px; align-items:center; border:1px solid #d7e4ff; border-radius: var(--th-radius-sm); padding:8px; background: #ffffff; }
    .configPath { font-family: var(--th-font-mono); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    button { border:1px solid #0f56e0; color:#ffffff; background:#0f56e0; border-radius: var(--th-radius-sm); padding:8px 10px; cursor:pointer; transition: transform var(--th-motion-fast) ease, background var(--th-motion-base) ease; font-weight: 800; font-family:"Montserrat", var(--th-font-display); }
    button:hover { background:#0943b8; }
    button:active { transform: translateY(1px); }
    .pill { display:inline-block; padding: 2px 8px; border-radius:999px; font-size: 12px; border:1px solid transparent; }
    .ok { color:#03552e; background: #d9f8e8; border-color: #97e0bc;}
    .err { color:#8a1a1d; background: #ffdfe0; border-color: #f2a3a6;}
    .warn { color:#6b5300; background: #fff2c8; border-color: #f2d266;}
    ul { margin: 8px 0 0 18px; padding:0; }
    li { margin: 2px 0; }
    pre { white-space: pre-wrap; word-break: break-word; background:#ffffff; border:1px solid #c9dbff; border-radius: var(--th-radius-sm); padding: 10px; max-height: 280px; overflow:auto; color: #0a255f; }
    @media (max-width: 980px) { .row { grid-template-columns: 1fr; } .grid3 { grid-template-columns: 1fr; } .heroTitle { font-size: 28px; } .brandSvg { width: min(360px, 88vw); } }
  </style>
</head>
<body>
  <div class="top-background" aria-hidden="true"></div>
  <div class="wrap">
    <header class="hero">
      <div class="brandMark">${studioWordmarkSvg}</div>
      <h1 class="heroTitle">Token Host Studio</h1>
      <div class="heroSub">Edit THS JSON, validate/lint in real-time, save/load files, and preview routes + contract surface.</div>
    </header>
    <section class="panel" style="margin-bottom:14px;">
      <h2 class="title">Config Manager</h2>
      <div class="grid3">
        <div><label for="newConfigName">App name</label><input id="newConfigName" type="text" placeholder="My App" /></div>
        <div><label for="newConfigSlug">App slug</label><input id="newConfigSlug" type="text" placeholder="my-app" /></div>
        <div><label for="newConfigPath">Path (optional)</label><input id="newConfigPath" type="text" placeholder="apps/my-app/schema.json" /></div>
      </div>
      <div class="toolbar" style="margin-top:8px;">
        <button id="refreshConfigsBtn">Refresh Configs</button>
        <button id="createConfigBtn">Create New Config</button>
        <span id="configsStatus" class="muted"></span>
      </div>
      <div id="configsList" class="configList"></div>
    </section>
    <div class="row">
      <section class="panel">
        <h2 class="title">Schema Builder</h2>
        <div class="toolbar">
          <button id="validateBtn">Validate Now</button>
          <button id="loadBtn">Load File</button>
          <button id="saveBtn">Save File</button>
          <button id="addCollectionBtn">Add Collection</button>
        </div>
        <label class="muted" for="schemaPath">Schema file path</label>
        <input id="schemaPath" type="text" placeholder="apps/example/job-board.schema.json" />
        <div id="formRoot" class="stack" style="margin-top:10px;"></div>
      </section>
      <section class="panel">
        <h2 class="title">Validation + Preview</h2>
        <div id="statusLine" class="muted">Starting...</div>
        <div style="height:8px;"></div>
        <div id="issues"></div>
        <div style="height:10px;"></div>
        <div class="muted">schemaHash</div>
        <pre id="schemaHash">(none)</pre>
        <div style="height:10px;"></div>
        <div class="muted">Generated surface preview</div>
        <pre id="preview">(none)</pre>
      </section>
    </div>
  </div>
  <script>
    const schemaPathEl = document.getElementById('schemaPath');
    const newConfigNameEl = document.getElementById('newConfigName');
    const newConfigSlugEl = document.getElementById('newConfigSlug');
    const newConfigPathEl = document.getElementById('newConfigPath');
    const refreshConfigsBtnEl = document.getElementById('refreshConfigsBtn');
    const createConfigBtnEl = document.getElementById('createConfigBtn');
    const configsStatusEl = document.getElementById('configsStatus');
    const configsListEl = document.getElementById('configsList');
    const formRootEl = document.getElementById('formRoot');
    const statusLineEl = document.getElementById('statusLine');
    const issuesEl = document.getElementById('issues');
    const schemaHashEl = document.getElementById('schemaHash');
    const previewEl = document.getElementById('preview');
    let timer = null;
    let selectedCollectionIndex = 0;
    let state = null;
    let workspaceRoot = '';
    const fieldTypes = ['string','uint256','int256','decimal','bool','address','bytes32','image','reference','externalReference'];
    const accessModes = ['public','owner','allowlist','role'];

    function setStatus(ok, issueCount) {
      const cls = ok ? 'ok' : 'err';
      const label = ok ? 'Valid' : 'Invalid';
      statusLineEl.innerHTML = '<span class=\"pill ' + cls + '\">' + label + '</span> <span class=\"muted\">issues: ' + issueCount + '</span>';
    }

    function relativePathForDisplay(filePath) {
      if (!workspaceRoot) return String(filePath || '');
      const normalizedRoot = workspaceRoot.endsWith('/') ? workspaceRoot : (workspaceRoot + '/');
      if (String(filePath || '').startsWith(normalizedRoot)) {
        return String(filePath).slice(normalizedRoot.length);
      }
      return String(filePath || '');
    }

    async function loadPathIntoStudio(targetPath) {
      const out = await postJson('/api/load', { path: targetPath });
      schemaPathEl.value = out.path || schemaPathEl.value;
      state = out.formState || state;
      selectedCollectionIndex = 0;
      renderForm();
      queueValidation();
    }

    function renderConfigsList(configs) {
      if (!Array.isArray(configs) || configs.length === 0) {
        configsListEl.innerHTML = '<div class="muted">No schema configs found under workspace root.</div>';
        return;
      }
      configsListEl.innerHTML = configs.map((cfg) => (
        '<div class="configRow">' +
          '<div class="configPath" title="' + esc(cfg) + '">' + esc(relativePathForDisplay(cfg)) + '</div>' +
          '<button data-action="load-config" data-path="' + esc(cfg) + '">Load</button>' +
        '</div>'
      )).join('');
    }

    async function refreshConfigs() {
      configsStatusEl.textContent = 'Refreshing...';
      try {
        const res = await fetch('/api/configs', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json || !json.ok) throw new Error(json && json.error ? json.error : ('HTTP ' + res.status));
        workspaceRoot = String(json.workspaceRoot || workspaceRoot || '');
        renderConfigsList(json.configs || []);
        configsStatusEl.textContent = (json.configs || []).length + ' config(s)';
      } catch (e) {
        configsStatusEl.textContent = 'Failed to load configs';
        renderConfigsList([]);
      }
    }

    function renderIssues(issues) {
      if (!issues || issues.length === 0) {
        issuesEl.innerHTML = '<span class=\"pill ok\">No issues</span>';
        return;
      }
      const html = issues.map((i) => {
        const cls = i.severity === 'error' ? 'err' : 'warn';
        return '<li><span class=\"pill ' + cls + '\">' + i.severity + '</span> <code>' + i.code + '</code> <code>' + i.path + '</code> ' + i.message + '</li>';
      }).join('');
      issuesEl.innerHTML = '<ul>' + html + '</ul>';
    }

    async function postJson(url, body) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok) {
        throw new Error(json && json.error ? json.error : ('HTTP ' + res.status));
      }
      return json;
    }

    function esc(s) {
      return String(s == null ? '' : s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('\"', '&quot;')
        .replaceAll(\"'\", '&#39;');
    }

    function opt(val, current) {
      return '<option value=\"' + esc(val) + '\"' + (String(current) === String(val) ? ' selected' : '') + '>' + esc(val) + '</option>';
    }

    function ensureState() {
      if (state) return;
      state = {
        thsVersion: '2025-12',
        schemaVersion: '0.0.1',
        app: {
          name: 'My App',
          slug: 'my-app',
          description: '',
          features: { uploads: false, onChainIndexing: true, indexer: false, delegation: false },
          ui: { homePage: { mode: 'generated' }, extensions: {} }
        },
        collections: [],
        metadata: {}
      };
    }

    function makeCollection() {
      return {
        name: 'Collection',
        plural: 'Collections',
        fields: [],
        createRules: { required: [], access: 'public', auto: {} },
        visibilityRules: { gets: [], access: 'public' },
        updateRules: { mutable: [], access: 'owner', optimisticConcurrency: false },
        deleteRules: { softDelete: true, access: 'owner' },
        transferRules: { access: 'owner' },
        indexes: { unique: [], index: [] },
        relations: []
      };
    }

    function makeField() {
      return { name: 'field', type: 'string', required: false, decimals: null, ui: { component: 'default', label: '', target: '_blank' } };
    }

    function setPath(path, value) {
      let cur = state;
      for (let i = 0; i < path.length - 1; i++) {
        if (cur[path[i]] == null) cur[path[i]] = {};
        cur = cur[path[i]];
      }
      cur[path[path.length - 1]] = value;
      queueValidation();
      renderForm();
    }

    function addItem(path, value) {
      let cur = state;
      for (const p of path) cur = cur[p];
      cur.push(value);
      queueValidation();
      renderForm();
    }

    function delItem(path, idx) {
      let cur = state;
      for (const p of path) cur = cur[p];
      cur.splice(idx, 1);
      if (selectedCollectionIndex >= state.collections.length) selectedCollectionIndex = Math.max(0, state.collections.length - 1);
      queueValidation();
      renderForm();
    }

    function toggleListItem(path, value, enabled) {
      let cur = state;
      for (const p of path) cur = cur[p];
      const pos = cur.indexOf(value);
      if (enabled && pos < 0) cur.push(value);
      if (!enabled && pos >= 0) cur.splice(pos, 1);
      queueValidation();
    }

    function renderCollectionEditor(c, ci) {
      const fieldChecks = (targetPath) => c.fields.map((f) => {
        const on = (targetPath.reduce((acc, p) => acc[p], c) || []).includes(f.name);
        return '<label><input type=\"checkbox\" data-type=\"check-list\" data-path=\"' + esc(targetPath.join('.')) + '\" data-value=\"' + esc(f.name) + '\" ' + (on ? 'checked' : '') + '> ' + esc(f.name) + '</label>';
      }).join('');
      return (
        '<div class=\"card\">' +
          '<div class=\"sectionTitle\">Collection</div>' +
          '<div class=\"grid2\">' +
            '<div><label>Name</label><input type=\"text\" data-bind=\"collections.' + ci + '.name\" value=\"' + esc(c.name) + '\"></div>' +
            '<div><label>Plural</label><input type=\"text\" data-bind=\"collections.' + ci + '.plural\" value=\"' + esc(c.plural || '') + '\"></div>' +
          '</div>' +
          '<div class=\"sectionTitle\">Fields</div>' +
          '<button data-action=\"add-field\" data-ci=\"' + ci + '\">Add Field</button>' +
          c.fields.map((f, fi) =>
            '<div class=\"card\">' +
              '<div class=\"grid3\">' +
                '<div><label>Name</label><input type=\"text\" data-bind=\"collections.' + ci + '.fields.' + fi + '.name\" value=\"' + esc(f.name) + '\"></div>' +
                '<div><label>Type</label><select data-bind=\"collections.' + ci + '.fields.' + fi + '.type\">' + fieldTypes.map((t) => opt(t, f.type)).join('') + '</select></div>' +
                '<div><label>Decimals</label><input type=\"number\" data-bind=\"collections.' + ci + '.fields.' + fi + '.decimals\" value=\"' + esc(f.decimals == null ? '' : f.decimals) + '\"></div>' +
              '</div>' +
              '<div class=\"grid3\">' +
                '<div><label>UI component</label><select data-bind=\"collections.' + ci + '.fields.' + fi + '.ui.component\">' + opt('default', f.ui?.component || 'default') + opt('externalLink', f.ui?.component || 'default') + '</select></div>' +
                '<div><label>UI label</label><input type=\"text\" data-bind=\"collections.' + ci + '.fields.' + fi + '.ui.label\" value=\"' + esc(f.ui?.label || '') + '\"></div>' +
                '<div><label>Link target</label><select data-bind=\"collections.' + ci + '.fields.' + fi + '.ui.target\">' + opt('_blank', f.ui?.target || '_blank') + opt('_self', f.ui?.target || '_blank') + '</select></div>' +
              '</div>' +
              '<label><input type=\"checkbox\" data-bind-check=\"collections.' + ci + '.fields.' + fi + '.required\" ' + (f.required ? 'checked' : '') + '> required</label> ' +
              '<button data-action=\"del-field\" data-ci=\"' + ci + '\" data-fi=\"' + fi + '\">Remove</button>' +
            '</div>'
          ).join('') +
          '<div class=\"sectionTitle\">Rules</div>' +
          '<div class=\"grid2\">' +
            '<div><label>Create access</label><select data-bind=\"collections.' + ci + '.createRules.access\">' + accessModes.map((a) => opt(a, c.createRules.access)).join('') + '</select></div>' +
            '<div><label>Visibility access</label><select data-bind=\"collections.' + ci + '.visibilityRules.access\">' + accessModes.map((a) => opt(a, c.visibilityRules.access)).join('') + '</select></div>' +
            '<div><label>Update access</label><select data-bind=\"collections.' + ci + '.updateRules.access\">' + accessModes.map((a) => opt(a, c.updateRules.access)).join('') + '</select></div>' +
            '<div><label>Delete access</label><select data-bind=\"collections.' + ci + '.deleteRules.access\">' + accessModes.map((a) => opt(a, c.deleteRules.access)).join('') + '</select></div>' +
          '</div>' +
          '<label><input type=\"checkbox\" data-bind-check=\"collections.' + ci + '.updateRules.optimisticConcurrency\" ' + (c.updateRules.optimisticConcurrency ? 'checked' : '') + '> optimisticConcurrency</label>' +
          '<label><input type=\"checkbox\" data-bind-check=\"collections.' + ci + '.deleteRules.softDelete\" ' + (c.deleteRules.softDelete ? 'checked' : '') + '> softDelete</label>' +
          '<label><input type=\"checkbox\" data-bind-check=\"collections.' + ci + '.hasTransfer\" ' + (c.transferRules ? 'checked' : '') + '> enable transfer</label>' +
          '<div><label>Transfer access</label><select data-bind=\"collections.' + ci + '.transferRules.access\" ' + (c.transferRules ? '' : 'disabled') + '>' + accessModes.map((a) => opt(a, c.transferRules?.access || 'owner')).join('') + '</select></div>' +
          '<div class=\"card\"><div class=\"muted\">createRules.required</div>' + fieldChecks(['createRules','required']) + '</div>' +
          '<div class=\"card\"><div class=\"muted\">visibilityRules.gets</div>' + fieldChecks(['visibilityRules','gets']) + '</div>' +
          '<div class=\"card\"><div class=\"muted\">updateRules.mutable</div>' + fieldChecks(['updateRules','mutable']) + '</div>' +
          '<div class=\"sectionTitle\">Payment (optional)</div>' +
          '<label><input type=\"checkbox\" data-bind-check=\"collections.' + ci + '.hasPayment\" ' + (c.createRules.payment ? 'checked' : '') + '> require native payment</label>' +
          '<div class=\"grid2\">' +
            '<div><label>asset</label><select data-bind=\"collections.' + ci + '.createRules.payment.asset\" ' + (c.createRules.payment ? '' : 'disabled') + '>' + opt('native', c.createRules.payment?.asset || 'native') + '</select></div>' +
            '<div><label>amountWei</label><input type=\"text\" data-bind=\"collections.' + ci + '.createRules.payment.amountWei\" value=\"' + esc(c.createRules.payment?.amountWei || '') + '\" ' + (c.createRules.payment ? '' : 'disabled') + '></div>' +
          '</div>' +
          '<div class=\"sectionTitle\">Indexes</div>' +
          '<button data-action=\"add-unique\" data-ci=\"' + ci + '\">Add Unique</button> <button data-action=\"add-index\" data-ci=\"' + ci + '\">Add Index</button>' +
          c.indexes.unique.map((u, ui) => '<div class=\"grid3\"><div><label>Unique field</label><input type=\"text\" data-bind=\"collections.' + ci + '.indexes.unique.' + ui + '.field\" value=\"' + esc(u.field) + '\"></div><div><label>scope</label><select data-bind=\"collections.' + ci + '.indexes.unique.' + ui + '.scope\">' + opt('', u.scope || '') + opt('active', u.scope || '') + opt('allTime', u.scope || '') + '</select></div><div><button data-action=\"del-unique\" data-ci=\"' + ci + '\" data-ui=\"' + ui + '\">Remove</button></div></div>').join('') +
          c.indexes.index.map((u, ui) => '<div class=\"grid3\"><div><label>Index field</label><input type=\"text\" data-bind=\"collections.' + ci + '.indexes.index.' + ui + '.field\" value=\"' + esc(u.field) + '\"></div><div></div><div><button data-action=\"del-index\" data-ci=\"' + ci + '\" data-ui=\"' + ui + '\">Remove</button></div></div>').join('') +
          '<div class=\"sectionTitle\">Relations</div>' +
          '<button data-action=\"add-relation\" data-ci=\"' + ci + '\">Add Relation</button>' +
          c.relations.map((r, ri) =>
            '<div class=\"card\">' +
              '<div class=\"grid2\">' +
                '<div><label>field</label><input type=\"text\" data-bind=\"collections.' + ci + '.relations.' + ri + '.field\" value=\"' + esc(r.field) + '\"></div>' +
                '<div><label>to collection</label><input type=\"text\" data-bind=\"collections.' + ci + '.relations.' + ri + '.to\" value=\"' + esc(r.to) + '\"></div>' +
              '</div>' +
              '<label><input type=\"checkbox\" data-bind-check=\"collections.' + ci + '.relations.' + ri + '.enforce\" ' + (r.enforce ? 'checked' : '') + '> enforce</label>' +
              '<label><input type=\"checkbox\" data-bind-check=\"collections.' + ci + '.relations.' + ri + '.reverseIndex\" ' + (r.reverseIndex ? 'checked' : '') + '> reverseIndex</label> ' +
              '<button data-action=\"del-relation\" data-ci=\"' + ci + '\" data-ri=\"' + ri + '\">Remove</button>' +
            '</div>'
          ).join('') +
        '</div>'
      );
    }

    function renderForm() {
      ensureState();
      const c = state.collections[selectedCollectionIndex] || makeCollection();
      const collectionsNav = state.collections.map((col, i) => '<button data-action=\"pick-collection\" data-ci=\"' + i + '\" ' + (i === selectedCollectionIndex ? 'style=\"outline:2px solid #0d5bff;\"' : '') + '>' + esc(col.name || ('Collection ' + (i + 1))) + '</button> <button data-action=\"del-collection\" data-ci=\"' + i + '\">x</button>').join(' ');
      formRootEl.innerHTML =
        '<div class=\"card\"><div class=\"sectionTitle\">Document</div><div class=\"grid2\">' +
          '<div><label>thsVersion</label><input type=\"text\" data-bind=\"thsVersion\" value=\"' + esc(state.thsVersion) + '\"></div>' +
          '<div><label>schemaVersion</label><input type=\"text\" data-bind=\"schemaVersion\" value=\"' + esc(state.schemaVersion) + '\"></div>' +
        '</div>' +
        '<div class=\"sectionTitle\">App</div><div class=\"grid2\">' +
          '<div><label>name</label><input type=\"text\" data-bind=\"app.name\" value=\"' + esc(state.app?.name || '') + '\"></div>' +
          '<div><label>slug</label><input type=\"text\" data-bind=\"app.slug\" value=\"' + esc(state.app?.slug || '') + '\"></div>' +
        '</div><div><label>description</label><input type=\"text\" data-bind=\"app.description\" value=\"' + esc(state.app?.description || '') + '\"></div>' +
        '<div class=\"grid2\"><label><input type=\"checkbox\" data-bind-check=\"app.features.uploads\" ' + (state.app?.features?.uploads ? 'checked' : '') + '> uploads</label>' +
        '<label><input type=\"checkbox\" data-bind-check=\"app.features.onChainIndexing\" ' + (state.app?.features?.onChainIndexing ? 'checked' : '') + '> onChainIndexing</label>' +
        '<label><input type=\"checkbox\" data-bind-check=\"app.features.indexer\" ' + (state.app?.features?.indexer ? 'checked' : '') + '> indexer</label>' +
        '<label><input type=\"checkbox\" data-bind-check=\"app.features.delegation\" ' + (state.app?.features?.delegation ? 'checked' : '') + '> delegation</label></div>' +
        '<div class=\"sectionTitle\">UI</div><div class=\"grid2\">' +
        '<div><label>home page mode</label><select data-bind=\"app.ui.homePage.mode\">' + opt('generated', state.app?.ui?.homePage?.mode || 'generated') + opt('custom', state.app?.ui?.homePage?.mode || 'generated') + '</select></div>' +
        '<div><label>extensions directory</label><input type=\"text\" data-bind=\"app.ui.extensions.directory\" value=\"' + esc(state.app?.ui?.extensions?.directory || '') + '\" placeholder=\"ui-overrides\"></div>' +
        '</div>' +
        '</div>' +
        '<div class=\"card\"><div class=\"sectionTitle\">Collections</div><div>' + collectionsNav + '</div>' + (state.collections.length > 0 ? renderCollectionEditor(c, selectedCollectionIndex) : '<div class=\"muted\">No collections yet.</div>') + '</div>';

      for (const el of formRootEl.querySelectorAll('[data-bind]')) {
        el.addEventListener('input', (ev) => {
          const target = ev.currentTarget;
          const path = target.getAttribute('data-bind').split('.');
          let value = target.value;
          if (path[path.length - 1] === 'decimals') value = value === '' ? null : Number(value);
          setPath(path, value);
        });
      }
      for (const el of formRootEl.querySelectorAll('[data-bind-check]')) {
        el.addEventListener('change', (ev) => {
          const target = ev.currentTarget;
          const pathStr = target.getAttribute('data-bind-check');
          const path = pathStr.split('.');
          if (pathStr === 'collections.' + selectedCollectionIndex + '.hasTransfer') {
            const c = state.collections[selectedCollectionIndex];
            c.transferRules = target.checked ? (c.transferRules || { access: 'owner' }) : undefined;
            queueValidation();
            renderForm();
            return;
          }
          if (pathStr === 'collections.' + selectedCollectionIndex + '.hasPayment') {
            const c = state.collections[selectedCollectionIndex];
            c.createRules.payment = target.checked ? (c.createRules.payment || { asset: 'native', amountWei: '0' }) : undefined;
            queueValidation();
            renderForm();
            return;
          }
          setPath(path, Boolean(target.checked));
        });
      }
      for (const el of formRootEl.querySelectorAll('[data-type=\"check-list\"]')) {
        el.addEventListener('change', (ev) => {
          const target = ev.currentTarget;
          const path = target.getAttribute('data-path').split('.');
          const value = target.getAttribute('data-value');
          toggleListItem(['collections', selectedCollectionIndex, ...path], value, Boolean(target.checked));
          renderForm();
        });
      }
      for (const el of formRootEl.querySelectorAll('[data-action]')) {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          const target = ev.currentTarget;
          const action = target.getAttribute('data-action');
          const ci = Number(target.getAttribute('data-ci'));
          if (action === 'add-field') addItem(['collections', ci, 'fields'], makeField());
          if (action === 'del-field') delItem(['collections', ci, 'fields'], Number(target.getAttribute('data-fi')));
          if (action === 'add-collection') addItem(['collections'], makeCollection());
          if (action === 'del-collection') delItem(['collections'], ci);
          if (action === 'pick-collection') { selectedCollectionIndex = ci; renderForm(); }
          if (action === 'add-unique') addItem(['collections', ci, 'indexes', 'unique'], { field: '', scope: 'active' });
          if (action === 'del-unique') delItem(['collections', ci, 'indexes', 'unique'], Number(target.getAttribute('data-ui')));
          if (action === 'add-index') addItem(['collections', ci, 'indexes', 'index'], { field: '' });
          if (action === 'del-index') delItem(['collections', ci, 'indexes', 'index'], Number(target.getAttribute('data-ui')));
          if (action === 'add-relation') addItem(['collections', ci, 'relations'], { field: '', to: '', enforce: false, reverseIndex: false });
          if (action === 'del-relation') delItem(['collections', ci, 'relations'], Number(target.getAttribute('data-ri')));
        });
      }
    }

    async function runValidation() {
      try {
        const out = await postJson('/api/validate', { formState: state });
        setStatus(Boolean(out.ok), Array.isArray(out.issues) ? out.issues.length : 0);
        renderIssues(out.issues || []);
        schemaHashEl.textContent = out.schemaHash || '(none)';
        previewEl.textContent = out.preview ? JSON.stringify(out.preview, null, 2) : '(none)';
      } catch (e) {
        setStatus(false, 1);
        renderIssues([{ severity: 'error', code: 'studio.validate', path: '$', message: String(e && e.message ? e.message : e) }]);
      }
    }

    function queueValidation() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(runValidation, 250);
    }

    document.getElementById('validateBtn').addEventListener('click', runValidation);
    document.getElementById('loadBtn').addEventListener('click', async () => {
      try {
        await loadPathIntoStudio(schemaPathEl.value);
      } catch (e) {
        alert(String(e && e.message ? e.message : e));
      }
    });
    document.getElementById('saveBtn').addEventListener('click', async () => {
      try {
        const out = await postJson('/api/save', { path: schemaPathEl.value, formState: state });
        schemaPathEl.value = out.path || schemaPathEl.value;
        queueValidation();
      } catch (e) {
        alert(String(e && e.message ? e.message : e));
      }
    });
    document.getElementById('addCollectionBtn').addEventListener('click', (ev) => {
      ev.preventDefault();
      ensureState();
      state.collections.push(makeCollection());
      selectedCollectionIndex = state.collections.length - 1;
      renderForm();
      queueValidation();
    });
    refreshConfigsBtnEl.addEventListener('click', async (ev) => {
      ev.preventDefault();
      await refreshConfigs();
    });
    createConfigBtnEl.addEventListener('click', async (ev) => {
      ev.preventDefault();
      try {
        const out = await postJson('/api/create-config', {
          name: newConfigNameEl.value,
          slug: newConfigSlugEl.value,
          path: newConfigPathEl.value
        });
        schemaPathEl.value = out.path || '';
        state = out.formState || state;
        selectedCollectionIndex = 0;
        renderForm();
        queueValidation();
        await refreshConfigs();
      } catch (e) {
        alert(String(e && e.message ? e.message : e));
      }
    });
    configsListEl.addEventListener('click', async (ev) => {
      const target = ev.target;
      if (!target || !target.getAttribute) return;
      if (target.getAttribute('data-action') !== 'load-config') return;
      const configPath = target.getAttribute('data-path');
      if (!configPath) return;
      try {
        await loadPathIntoStudio(configPath);
      } catch (e) {
        alert(String(e && e.message ? e.message : e));
      }
    });

    (async () => {
      try {
        const stateRes = await fetch('/api/state', { cache: 'no-store' });
        const stateResJson = await stateRes.json();
        schemaPathEl.value = stateResJson.schemaPath || '';
        workspaceRoot = String(stateResJson.workspaceRoot || '');
        state = stateResJson.formState || null;
        renderForm();
      } catch {
        ensureState();
        renderForm();
      }
      await refreshConfigs();
      queueValidation();
    })();
  </script>
</body>
</html>`;
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

function addGeneratedUiTestScaffold(uiDir: string, templateDir: string) {
  const scaffoldDir = path.join(templateDir, 'test-scaffold');
  if (!fs.existsSync(scaffoldDir)) {
    throw new Error(`Missing test scaffold template at ${scaffoldDir}`);
  }

  copyDir(scaffoldDir, uiDir);

  const packageJsonPath = path.join(uiDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const scripts = { ...(pkg.scripts || {}) };
  scripts.test = scripts.test || 'pnpm run test:contract && pnpm run test:ui';
  scripts['test:contract'] = scripts['test:contract'] || 'node tests/contract/integration.mjs';
  scripts['test:ui'] = scripts['test:ui'] || 'node tests/ui/smoke.mjs';
  pkg.scripts = scripts;
  const devDependencies = { ...(pkg.devDependencies || {}) };
  devDependencies.solc = devDependencies.solc || '0.8.24';
  devDependencies.web3 = devDependencies.web3 || '^1.3.5';
  pkg.devDependencies = devDependencies;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
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

function collectionRouteComponentName(name: string, suffix: string): string {
  const normalized = name.replace(/[^A-Za-z0-9_]/g, '_');
  const base = /^[A-Za-z_]/.test(normalized) ? normalized : `Collection_${normalized || 'Route'}`;
  return `${base}${suffix}`;
}

function materializeCollectionRoutes(uiDir: string, schema: ThsSchema) {
  const appDir = path.join(uiDir, 'app');
  ensureDir(appDir);

  for (const entry of fs.readdirSync(appDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const markerPath = path.join(appDir, entry.name, '.tokenhost-generated-route');
    if (fs.existsSync(markerPath)) {
      fs.rmSync(path.join(appDir, entry.name), { recursive: true, force: true });
    }
  }

  for (const collection of schema.collections || []) {
    const name = String(collection?.name ?? '').trim();
    if (!name) continue;

    const routeDir = path.join(appDir, name);
    ensureDir(routeDir);
    fs.writeFileSync(path.join(routeDir, '.tokenhost-generated-route'), `${name}\n`);

    const layoutComponentName = collectionRouteComponentName(name, 'Layout');
    const pageComponentName = collectionRouteComponentName(name, 'Page');

    fs.writeFileSync(
      path.join(routeDir, 'layout.tsx'),
      [
        `import type { ReactNode } from 'react';`,
        ``,
        `import CollectionLayout from '../../src/collection-route/CollectionLayout';`,
        ``,
        `export default function ${layoutComponentName}(props: { children: ReactNode }) {`,
        `  return <CollectionLayout collectionName=${JSON.stringify(name)}>{props.children}</CollectionLayout>;`,
        `}`
      ].join('\n') + '\n'
    );

    fs.writeFileSync(
      path.join(routeDir, 'page.tsx'),
      [
        `import CollectionPage from '../../src/collection-route/CollectionPage';`,
        ``,
        `export default function ${pageComponentName}() {`,
        `  return <CollectionPage collectionName=${JSON.stringify(name)} />;`,
        `}`
      ].join('\n') + '\n'
    );
  }
}

function syncUiOutput(args: {
  schema: ThsSchema;
  outDir: string;
  schemaPathForHints?: string;
  withTests?: boolean;
  compiledJson: string;
  manifestJson?: string | null;
}) {
  const resolvedOutDir = path.resolve(args.outDir);
  const templateDir = resolveNextExportUiTemplateDir();
  const uiDir = path.join(resolvedOutDir, 'ui');
  const preservedUiState = captureUiPackageManagerState(uiDir);

  fs.rmSync(uiDir, { recursive: true, force: true });
  copyDir(templateDir, uiDir);

  const thsTsPath = path.join(uiDir, 'src', 'generated', 'ths.ts');
  ensureDir(path.dirname(thsTsPath));
  fs.writeFileSync(thsTsPath, renderThsTs(args.schema));
  materializeUiThemePreset(uiDir, args.schema);
  materializeCollectionRoutes(uiDir, args.schema);

  const compiledPublicPath = path.join(uiDir, 'public', 'compiled', 'App.json');
  ensureDir(path.dirname(compiledPublicPath));
  fs.writeFileSync(compiledPublicPath, args.compiledJson);

  if (args.manifestJson) {
    ensureDir(path.join(uiDir, 'public', '.well-known', 'tokenhost'));
    fs.writeFileSync(path.join(uiDir, 'public', '.well-known', 'tokenhost', 'manifest.json'), args.manifestJson);
    fs.writeFileSync(path.join(uiDir, 'public', 'manifest.json'), args.manifestJson);
  }

  if (args.withTests) {
    addGeneratedUiTestScaffold(uiDir, templateDir);
    console.log(`Wrote ui/tests/ (generated app test scaffold)`);
  }

  applyUiExtensions(uiDir, args.schema, args.schemaPathForHints);
  restoreUiPackageManagerState(uiDir, preservedUiState);
  console.log(`Wrote ui/ (Next.js static export template)`);
}

type UiPackageManagerState = {
  priorPackageJson: string | null;
  lockfiles: Array<{ name: string; contents: Buffer }>;
  nodeModulesDir: string | null;
};

function captureUiPackageManagerState(uiDir: string): UiPackageManagerState {
  const packageJsonPath = path.join(uiDir, 'package.json');
  const lockfileNames = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'bun.lock'];
  const lockfiles: Array<{ name: string; contents: Buffer }> = [];
  for (const name of lockfileNames) {
    const filePath = path.join(uiDir, name);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    lockfiles.push({ name, contents: fs.readFileSync(filePath) });
  }

  let nodeModulesDir: string | null = null;
  const nodeModulesPath = path.join(uiDir, 'node_modules');
  if (fs.existsSync(nodeModulesPath) && fs.statSync(nodeModulesPath).isDirectory()) {
    nodeModulesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-ui-sync-node-modules-'));
    fs.renameSync(nodeModulesPath, nodeModulesDir);
  }

  return {
    priorPackageJson: fs.existsSync(packageJsonPath) ? fs.readFileSync(packageJsonPath, 'utf-8') : null,
    lockfiles,
    nodeModulesDir
  };
}

function restoreUiPackageManagerState(uiDir: string, state: UiPackageManagerState) {
  for (const lockfile of state.lockfiles) {
    fs.writeFileSync(path.join(uiDir, lockfile.name), lockfile.contents);
  }

  if (!state.nodeModulesDir) return;

  const currentPackageJsonPath = path.join(uiDir, 'package.json');
  const currentPackageJson = fs.existsSync(currentPackageJsonPath) ? fs.readFileSync(currentPackageJsonPath, 'utf-8') : null;
  if (state.priorPackageJson !== null && currentPackageJson === state.priorPackageJson) {
    fs.rmSync(path.join(uiDir, 'node_modules'), { recursive: true, force: true });
    fs.renameSync(state.nodeModulesDir, path.join(uiDir, 'node_modules'));
    return;
  }

  fs.rmSync(state.nodeModulesDir, { recursive: true, force: true });
}

function resolveUiExtensionsDir(schema: ThsSchema, schemaPathForHints?: string): string | null {
  const declared = String(schema.app?.ui?.extensions?.directory ?? '').trim();
  if (!declared) return null;
  const baseDir = schemaPathForHints ? path.dirname(path.resolve(schemaPathForHints)) : process.cwd();
  return path.resolve(baseDir, declared);
}

function ensureUiCustomizationConfig(schema: ThsSchema, schemaPathForHints?: string) {
  const extensionsDir = resolveUiExtensionsDir(schema, schemaPathForHints);
  const homePageMode = schema.app?.ui?.homePage?.mode ?? 'generated';

  if (homePageMode === 'custom') {
    if (!extensionsDir) {
      throw new Error('app.ui.homePage.mode is "custom" but app.ui.extensions.directory is not configured.');
    }
    const homeCandidates = ['app/page.tsx', 'app/page.jsx', 'app/page.ts', 'app/page.js'].map((relPath) => path.join(extensionsDir, relPath));
    if (!homeCandidates.some((candidate) => fs.existsSync(candidate))) {
      throw new Error(`app.ui.homePage.mode is "custom" but no custom home page was found in ${extensionsDir}. Expected app/page.tsx (or js/jsx/ts).`);
    }
  }

  if (extensionsDir && !fs.existsSync(extensionsDir)) {
    throw new Error(`Configured app.ui.extensions.directory does not exist: ${extensionsDir}`);
  }
}

function applyUiExtensions(uiDir: string, schema: ThsSchema, schemaPathForHints?: string) {
  ensureUiCustomizationConfig(schema, schemaPathForHints);
  const extensionsDir = resolveUiExtensionsDir(schema, schemaPathForHints);
  if (!extensionsDir) return;
  copyDir(extensionsDir, uiDir);
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

type CompileProfile = 'default' | 'large-app' | 'auto';
const MAX_EVM_RUNTIME_CODE_BYTES = 24576;

function shouldRetryWithViaIR(errors: any[]): boolean {
  const rendered = errors
    .map((e: any) => String(e?.formattedMessage || e?.message || ''))
    .join('\n');
  return /Stack too deep|YulException/i.test(rendered);
}

function deployedCodeBytes(output: any, sourcePath: string, contractName: string): number | null {
  const object = output?.contracts?.[sourcePath]?.[contractName]?.evm?.deployedBytecode?.object;
  if (typeof object !== 'string' || object.length === 0) return null;
  return object.length / 2;
}

function compileSolidity(sourcePath: string, contents: string, contractName: string, options: { profile?: CompileProfile } = {}): { abi: unknown; bytecode: string; deployedBytecode: string; viaIR: boolean } {
  const profile = options.profile ?? 'auto';
  const compileOnce = (viaIR: boolean) => {
    const input = {
      language: 'Solidity',
      sources: {
        [sourcePath]: { content: contents }
      },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        viaIR,
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object']
          }
        }
      }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const errors = (output.errors || []).filter((e: any) => e.severity === 'error');
    return { output, errors, viaIR };
  };

  const attempts =
    profile === 'default'
      ? [compileOnce(false)]
      : profile === 'large-app'
        ? [compileOnce(true)]
        : (() => {
            const first = compileOnce(false);
            const firstBytes = first.errors.length === 0 ? deployedCodeBytes(first.output, sourcePath, contractName) : null;
            if (first.errors.length > 0 && shouldRetryWithViaIR(first.errors)) {
              return [first, compileOnce(true)];
            }
            if (first.errors.length === 0 && firstBytes !== null && firstBytes > MAX_EVM_RUNTIME_CODE_BYTES) {
              return [first, compileOnce(true)];
            }
            return [first];
          })();

  const successful = (() => {
    if (attempts.length === 2 && attempts[0]!.errors.length === 0) {
      const fallback = attempts[1]!;
      if (fallback.errors.length === 0) {
        return fallback;
      }
    }
    return attempts.find((attempt) => attempt.errors.length === 0);
  })();
  if (!successful) {
    const last = attempts[attempts.length - 1]!;
    const msg = last.errors.map((e: any) => e.formattedMessage || e.message).join('\n');
    throw new Error(`Solidity compile failed:\n${msg}`);
  }

  const output = successful.output;
  const compiled = output.contracts?.[sourcePath]?.[contractName];
  if (!compiled) {
    throw new Error(`Solidity compile output missing ${contractName} in ${sourcePath}`);
  }

  const abi = compiled.abi;
  const bytecode = `0x${compiled.evm.bytecode.object}`;
  const deployedBytecode = `0x${compiled.evm.deployedBytecode.object}`;
  return { abi, bytecode, deployedBytecode, viaIR: successful.viaIR };
}

function normalizeCompileProfile(value?: string): CompileProfile {
  const normalized = String(value ?? 'auto').trim().toLowerCase();
  if (normalized === 'default' || normalized === 'large-app' || normalized === 'auto') {
    return normalized;
  }
  throw new Error(`Invalid compiler profile "${value}". Supported: auto, default, large-app`);
}

function compileProfileForLog(profile: CompileProfile, viaIR: boolean): string {
  if (profile === 'auto') {
    return viaIR ? 'auto(viaIR)' : 'auto';
  }
  return viaIR ? `${profile}(viaIR)` : profile;
}

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((p) => (p.length ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(' ');
}

type KnownChainName = 'anvil' | 'sepolia' | 'filecoin_calibration' | 'filecoin_mainnet';

const DEFAULT_GENERATION_LIMITS: Required<GeneratorLimits> = {
  listMaxLimit: 50,
  listMaxScanSteps: 1000,
  multicallMaxCalls: 20,
  tokenizedIndexMaxTokens: 8,
  tokenizedIndexMaxTokenLength: 32
};

const MAX_GENERATION_LIMITS: Required<GeneratorLimits> = {
  listMaxLimit: 100,
  listMaxScanSteps: 5000,
  multicallMaxCalls: 50,
  tokenizedIndexMaxTokens: 16,
  tokenizedIndexMaxTokenLength: 64
};

function clampGeneratorLimit(value: number | undefined, fallback: number, cap: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return fallback;
  return Math.min(Math.floor(numeric), cap);
}

function generationLimitsForChain(chainName?: KnownChainName): Required<GeneratorLimits> {
  const chainDefaults: Partial<Record<KnownChainName, Partial<Required<GeneratorLimits>>>> = {
    filecoin_calibration: {
      listMaxLimit: 25,
      listMaxScanSteps: 500,
      multicallMaxCalls: 12,
      tokenizedIndexMaxTokens: 6,
      tokenizedIndexMaxTokenLength: 24
    },
    filecoin_mainnet: {
      listMaxLimit: 25,
      listMaxScanSteps: 500,
      multicallMaxCalls: 12,
      tokenizedIndexMaxTokens: 6,
      tokenizedIndexMaxTokenLength: 24
    }
  };

  const selected = {
    ...DEFAULT_GENERATION_LIMITS,
    ...(chainName ? chainDefaults[chainName] ?? {} : {})
  };

  return {
    listMaxLimit: clampGeneratorLimit(selected.listMaxLimit, DEFAULT_GENERATION_LIMITS.listMaxLimit, MAX_GENERATION_LIMITS.listMaxLimit),
    listMaxScanSteps: clampGeneratorLimit(
      selected.listMaxScanSteps,
      DEFAULT_GENERATION_LIMITS.listMaxScanSteps,
      MAX_GENERATION_LIMITS.listMaxScanSteps
    ),
    multicallMaxCalls: clampGeneratorLimit(
      selected.multicallMaxCalls,
      DEFAULT_GENERATION_LIMITS.multicallMaxCalls,
      MAX_GENERATION_LIMITS.multicallMaxCalls
    ),
    tokenizedIndexMaxTokens: clampGeneratorLimit(
      selected.tokenizedIndexMaxTokens,
      DEFAULT_GENERATION_LIMITS.tokenizedIndexMaxTokens,
      MAX_GENERATION_LIMITS.tokenizedIndexMaxTokens
    ),
    tokenizedIndexMaxTokenLength: clampGeneratorLimit(
      selected.tokenizedIndexMaxTokenLength,
      DEFAULT_GENERATION_LIMITS.tokenizedIndexMaxTokenLength,
      MAX_GENERATION_LIMITS.tokenizedIndexMaxTokenLength
    )
  };
}

function resolveKnownChain(name: string): { chainName: KnownChainName; chain: any } {
  const n = name.toLowerCase().trim();
  if (n === 'anvil') return { chainName: 'anvil', chain: anvil };
  if (n === 'sepolia') return { chainName: 'sepolia', chain: sepolia };
  if (n === 'filecoincalibration' || n === 'filecoin_calibration' || n === 'calibration' || n === 'calibnet') {
    return { chainName: 'filecoin_calibration', chain: filecoinCalibration };
  }
  if (n === 'filecoin' || n === 'filecoinmainnet' || n === 'filecoin_mainnet' || n === 'filecoin-mainnet') {
    return { chainName: 'filecoin_mainnet', chain: filecoin };
  }
  throw new Error(`Unknown chain "${name}". Supported: anvil, sepolia, filecoin_calibration, filecoin_mainnet`);
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
  const generationLimits = generationLimitsForChain(args.chainName);

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
    limits: {
      lists: {
        maxLimit: generationLimits.listMaxLimit,
        maxScanSteps: generationLimits.listMaxScanSteps
      },
      multicall: {
        maxCalls: generationLimits.multicallMaxCalls
      },
      indexing: {
        tokenized: {
          maxTokens: generationLimits.tokenizedIndexMaxTokens,
          maxTokenLength: generationLimits.tokenizedIndexMaxTokenLength
        }
      }
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
  if (args.chainName === 'filecoin_calibration') {
    chainConfig.explorers = [
      {
        name: 'Filfox',
        url: 'https://calibration.filfox.info'
      }
    ];
  }
  if (args.chainName === 'filecoin_mainnet') {
    chainConfig.explorers = [
      {
        name: 'Filfox',
        url: 'https://filfox.info'
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

function supportsEtherscanVerifier(chainName: KnownChainName): boolean {
  return chainName === 'sepolia';
}

function supportsFilfoxVerifier(chainName: KnownChainName): boolean {
  return chainName === 'filecoin_calibration' || chainName === 'filecoin_mainnet';
}

function filfoxVerifyEndpoint(chainName: KnownChainName): string {
  if (chainName === 'filecoin_calibration') return 'https://calibration.filfox.info/api/v1/tools/verifyContract';
  if (chainName === 'filecoin_mainnet') return 'https://filfox.info/api/v1/tools/verifyContract';
  throw new Error(`Filfox verification is not supported for chain "${chainName}".`);
}

function normalizeFilfoxCompilerVersion(version: string): string {
  const trimmed = String(version || '').trim();
  const fallback = String(solc.version() || '').trim();
  const raw = trimmed || fallback;
  const match = raw.match(/v?(\d+\.\d+\.\d+\+commit\.[0-9a-fA-F]+)/);
  const normalized = (match?.[1] ?? raw.replace(/\.Emscripten\.clang$/i, '')).trim();
  return normalized.startsWith('v') ? normalized : `v${normalized}`;
}

function compilerProfileUsesViaIR(value: unknown): boolean {
  return String(value ?? '').toLowerCase().includes('viair');
}

function collectSoliditySources(sourceDir: string): Record<string, { content: string }> {
  const out: Record<string, { content: string }> = {};
  if (!fs.existsSync(sourceDir)) return out;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.sol')) continue;
      const rel = path.relative(sourceDir, abs).replace(/\\/g, '/');
      out[rel] = { content: fs.readFileSync(abs, 'utf-8') };
    }
  };

  walk(sourceDir);
  return out;
}

function filfoxLicenseFromSources(sourceFiles: Record<string, { content: string }>): string {
  const source = Object.values(sourceFiles)[0]?.content ?? '';
  const match = source.match(/SPDX-License-Identifier:\s*([^\s*]+)/i);
  const id = String(match?.[1] ?? '').trim().toUpperCase();
  if (id === 'MIT') return 'MIT License (MIT)';
  if (id === 'UNLICENSED' || id === 'NONE') return 'No License (None)';
  return '';
}

function buildFilfoxPayload(args: {
  address: string;
  manifest: any;
  compiled: any;
  sourceDir: string;
}) {
  const sourceFiles = collectSoliditySources(args.sourceDir);
  if (Object.keys(sourceFiles).length === 0) {
    throw new Error(`No Solidity source files found in ${args.sourceDir}`);
  }

  return {
    address: args.address,
    language: 'Solidity',
    compiler: normalizeFilfoxCompilerVersion(String(args.manifest?.toolchain?.solc ?? solc.version())),
    optimize: true,
    optimizeRuns: 200,
    optimizerDetails: '',
    sourceFiles,
    license: filfoxLicenseFromSources(sourceFiles),
    evmVersion: 'default',
    viaIR: Boolean(args.compiled?.viaIR ?? compilerProfileUsesViaIR(args.compiled?.compilerProfile ?? args.manifest?.toolchain?.compilerProfile)),
    libraries: '',
    metadata: ''
  };
}

function tailString(s: string, maxChars = 8000): string {
  if (!s) return '';
  return s.length <= maxChars ? s : s.slice(s.length - maxChars);
}

function redactCommandArgs(args: string[]): string[] {
  const out = [...args];
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    if (a === '--etherscan-api-key' && i + 1 < out.length) {
      out[i + 1] = '<redacted>';
      i += 1;
    }
  }
  return out;
}

function cmdString(cmd: string, args: string[]): string {
  return [cmd, ...args].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
}

function updateManifestVerificationState(args: {
  manifest: any;
  target: any;
  chainId: number;
  explorerKey: 'etherscan' | 'filfox';
  explorerWanted: boolean;
  explorerOk: boolean | null;
  explorerResult: { status: number | null; cmd: string | null; stdout?: string; stderr?: string } | null;
  sourcifyWanted: boolean;
  sourcifyOk: boolean | null;
  sourcifyResult: { status: number | null; cmd: string | null; stdout?: string; stderr?: string } | null;
}) {
  const explorerSatisfied = args.explorerWanted ? args.explorerOk === true : true;
  const sourcifySatisfied = args.sourcifyWanted ? args.sourcifyOk === true : true;
  const verified = explorerSatisfied && sourcifySatisfied;

  args.target.verified = verified;
  if (Array.isArray(args.target.contracts)) {
    for (const c of args.target.contracts) c.verified = verified;
  }

  args.manifest.extensions = args.manifest.extensions ?? {};
  args.manifest.extensions.verification = {
    ...(args.manifest.extensions.verification ?? {}),
    [String(args.chainId)]: {
      at: new Date().toISOString(),
      [args.explorerKey]: args.explorerWanted
        ? {
            ok: args.explorerOk,
            status: args.explorerResult?.status ?? null,
            cmd: args.explorerResult?.cmd ?? null,
            stdoutTail: tailString(args.explorerResult?.stdout ?? ''),
            stderrTail: tailString(args.explorerResult?.stderr ?? '')
          }
        : { ok: null },
      sourcify: args.sourcifyWanted
        ? {
            ok: args.sourcifyOk,
            status: args.sourcifyResult?.status ?? null,
            cmd: args.sourcifyResult?.cmd ?? null,
            stdoutTail: tailString(args.sourcifyResult?.stdout ?? ''),
            stderrTail: tailString(args.sourcifyResult?.stderr ?? '')
          }
        : { ok: null }
    }
  };

  return verified;
}

async function runFilfoxVerification(args: {
  chainName: KnownChainName;
  contractAddress: string;
  manifest: any;
  compiled: any;
  sourceDir: string;
  dryRun?: boolean;
}): Promise<{ ok: boolean; status: number | null; cmd: string; stdout: string; stderr: string }> {
  const endpoint = filfoxVerifyEndpoint(args.chainName);
  const payload = buildFilfoxPayload({
    address: args.contractAddress,
    manifest: args.manifest,
    compiled: args.compiled,
    sourceDir: args.sourceDir
  });

  const cmd = `POST ${endpoint}`;
  if (args.dryRun) {
    console.log(JSON.stringify({ verifier: 'filfox', endpoint, payload }, null, 2));
    return { ok: true, status: 0, cmd, stdout: JSON.stringify({ verifier: 'filfox', endpoint }, null, 2), stderr: '' };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();

  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {}

  const apiSuccess = parsed?.success === true || parsed?.errorCode === 6;
  const ok = response.ok && apiSuccess;
  const stdout = parsed ? JSON.stringify(parsed, null, 2) : text;
  const stderr = ok ? '' : `Filfox verification failed (${response.status}): ${stdout}`;
  return { ok, status: response.status, cmd, stdout, stderr };
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

async function findAvailableLocalPort(host: string): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = nodeNet.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a local port.')));
        return;
      }
      const port = address.port;
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve(port);
      });
    });
  });
}

function replaceRpcUrlPort(rpcUrl: string, port: number): string {
  const u = new URL(rpcUrl);
  u.port = String(port);
  return u.toString();
}

async function ensureAnvilRunning(
  rpcUrl: string,
  opts?: { start: boolean; expectedChainId?: number }
): Promise<{ child: ReturnType<typeof spawn> | null; rpcUrl: string; chainId: number }> {
  const expectedChainId = opts?.expectedChainId ?? 31337;
  const start = opts?.start ?? true;

  const chainId = await tryGetRpcChainId(rpcUrl, 500);
  if (chainId !== null) {
    if (chainId !== expectedChainId) {
      if (!start) {
        throw new Error(`RPC at ${rpcUrl} is chainId ${chainId}, expected ${expectedChainId}.`);
      }
      const local = isLocalHttpRpcUrl(rpcUrl);
      if (!local) {
        throw new Error(`RPC at ${rpcUrl} is chainId ${chainId}, expected ${expectedChainId}.`);
      }
      const altPort = await findAvailableLocalPort(local.host);
      const altRpcUrl = replaceRpcUrlPort(rpcUrl, altPort);
      console.log(`RPC at ${rpcUrl} is chainId ${chainId}, expected ${expectedChainId}. Starting dedicated anvil at ${altRpcUrl}.`);

      const child = spawn('anvil', ['--host', local.host, '--port', String(altPort), '--chain-id', String(expectedChainId)], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      if (child.stdout) pipeWithPrefix(child.stdout, '[anvil] ', process.stdout);
      if (child.stderr) pipeWithPrefix(child.stderr, '[anvil] ', process.stderr);

      const startedAt = Date.now();
      const timeoutMs = 10_000;
      while (Date.now() - startedAt < timeoutMs) {
        const nowChainId = await tryGetRpcChainId(altRpcUrl, 500);
        if (nowChainId === expectedChainId) return { child, rpcUrl: altRpcUrl, chainId: expectedChainId };
        await new Promise((r) => setTimeout(r, 200));
      }

      child.kill('SIGTERM');
      throw new Error(`Timed out waiting for dedicated anvil at ${altRpcUrl} to become ready.`);
    }
    return { child: null, rpcUrl, chainId };
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
    if (nowChainId === expectedChainId) return { child, rpcUrl, chainId: expectedChainId };
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

type TxMode = 'userPays' | 'sponsored';

type RelayConfig = {
  enabled: boolean;
  rpcUrl: string;
  chainId: number;
  from: Address;
};

type UploadRunnerMode = 'local' | 'remote' | 'foc-process';
type UploadProvider = 'local_file' | 'filecoin_onchain_cloud';

type UploadManifestConfig = {
  enabled: boolean;
  baseUrl: string;
  endpointUrl: string;
  statusUrl: string;
  provider: UploadProvider;
  runnerMode: UploadRunnerMode;
  accept: string[];
  maxBytes: number;
};

type UploadServerConfig = UploadManifestConfig & {
  localDir: string;
  foc?: {
    chainId: number;
    copies: number;
    withCDN: boolean;
    command: string;
  } | null;
};

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function trimTrailingSlash(value: string): string {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function deriveRemoteUploadUrls(input: string): { baseUrl: string; endpointUrl: string; statusUrl: string } {
  const trimmed = trimTrailingSlash(input);
  if (!trimmed) {
    return {
      baseUrl: '/__tokenhost/upload',
      endpointUrl: '/__tokenhost/upload',
      statusUrl: '/__tokenhost/upload'
    };
  }

  try {
    const url = new URL(trimmed);
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
    if (normalizedPath === '/') {
      const endpoint = new URL('/__tokenhost/upload', `${url.origin}/`).toString();
      return {
        baseUrl: endpoint,
        endpointUrl: endpoint,
        statusUrl: endpoint
      };
    }

    return {
      baseUrl: url.toString(),
      endpointUrl: url.toString(),
      statusUrl: url.toString()
    };
  } catch {
    if (trimmed.startsWith('/')) {
      const normalizedPath = trimmed || '/';
      const endpoint = normalizedPath === '/' ? '/__tokenhost/upload' : normalizedPath;
      return {
        baseUrl: endpoint,
        endpointUrl: endpoint,
        statusUrl: endpoint
      };
    }

    return {
      baseUrl: trimmed,
      endpointUrl: trimmed,
      statusUrl: trimmed
    };
  }
}

function resolveUploadManifestConfig(featuresUploads: boolean): UploadManifestConfig | null {
  if (!featuresUploads) return null;

  const remoteBaseUrl = String(process.env.TH_UPLOAD_REMOTE_BASE_URL ?? '').trim();
  const remoteEndpointUrl = String(process.env.TH_UPLOAD_REMOTE_ENDPOINT_URL ?? '').trim();
  const remoteStatusUrl = String(process.env.TH_UPLOAD_REMOTE_STATUS_URL ?? '').trim();
  const explicitRunner = String(process.env.TH_UPLOAD_RUNNER ?? '').trim().toLowerCase();
  const runnerMode: UploadRunnerMode =
    remoteBaseUrl || remoteEndpointUrl
      ? 'remote'
      : explicitRunner === 'foc-process' || explicitRunner === 'foc_process'
        ? 'foc-process'
        : explicitRunner === 'remote'
          ? 'remote'
          : 'local';
  const providerEnv = String(process.env.TH_UPLOAD_PROVIDER ?? '').trim().toLowerCase();
  const provider: UploadProvider =
    providerEnv === 'filecoin_onchain_cloud' || providerEnv === 'foc' || runnerMode === 'foc-process' || runnerMode === 'remote'
      ? 'filecoin_onchain_cloud'
      : 'local_file';
  const localBaseUrl = String(process.env.TH_UPLOAD_BASE_URL ?? '/__tokenhost/upload').trim() || '/__tokenhost/upload';
  const remoteUrls = deriveRemoteUploadUrls(remoteEndpointUrl || remoteBaseUrl);
  const baseUrl = runnerMode === 'remote' ? remoteUrls.baseUrl : localBaseUrl;
  const endpointUrl = runnerMode === 'remote' ? remoteUrls.endpointUrl : localBaseUrl;
  const statusUrl = runnerMode === 'remote' ? trimTrailingSlash(remoteStatusUrl) || remoteUrls.statusUrl : localBaseUrl;
  const accept = String(process.env.TH_UPLOAD_ACCEPT ?? 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const maxBytes = parsePositiveIntEnv(process.env.TH_UPLOAD_MAX_BYTES, 10 * 1024 * 1024);

  return {
    enabled: true,
    baseUrl,
    endpointUrl,
    statusUrl,
    provider,
    runnerMode,
    accept,
    maxBytes
  };
}

function shellQuote(s: string): string {
  return `'${String(s).replace(/'/g, `'\"'\"'`)}'`;
}

function detectUploadExtension(fileName: string, contentType: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext) return ext;
  switch (contentType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'image/svg+xml':
      return '.svg';
    default:
      return '.bin';
  }
}

function normalizeUploadFileName(fileName: string): string {
  const base = path.basename(fileName || 'upload.bin').replace(/[^A-Za-z0-9._-]+/g, '-');
  return base || 'upload.bin';
}

function normalizeFocUploadResult(parsed: any): { url: string; cid: string | null; size: number | null; metadata: Record<string, unknown> } {
  const result = parsed?.result;
  const copyResults = Array.isArray(result?.copyResults) ? result.copyResults : [];
  const firstCopy = copyResults.find((x: any) => x && typeof x.url === 'string' && x.url.trim()) ?? null;
  const url = firstCopy ? String(firstCopy.url) : '';
  if (!url) {
    throw new Error('foc-cli upload did not return a usable copyResults[].url value.');
  }
  return {
    url,
    cid: result?.pieceCid ? String(result.pieceCid) : null,
    size: Number.isFinite(Number(result?.size)) ? Number(result.size) : null,
    metadata: {
      pieceScannerUrl: result?.pieceScannerUrl ? String(result.pieceScannerUrl) : null,
      copyResults,
      copyFailures: Array.isArray(result?.copyFailures) ? result.copyFailures : []
    }
  };
}

function runFocCliUpload(config: NonNullable<UploadServerConfig['foc']>, filePath: string): { url: string; cid: string | null; size: number | null; metadata: Record<string, unknown> } {
  const command =
    `${config.command} upload ${shellQuote(filePath)} --format json --chain ${config.chainId} --copies ${config.copies}` +
    `${config.withCDN ? ' --withCDN true' : ''}`;
  const res = spawnSync(command, {
    shell: true,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (res.status !== 0) {
    throw new Error(String(res.stderr || res.stdout || `foc-cli failed with status ${res.status}`));
  }
  const parsed = JSON.parse(String(res.stdout || '{}'));
  return normalizeFocUploadResult(parsed);
}

function buildUploadServerConfig(manifest: any, uiSiteDir: string): UploadServerConfig | null {
  const ext = manifest?.extensions?.uploads;
  if (!ext || ext.enabled !== true) return null;
  const baseUrl = String(ext.baseUrl ?? '').trim() || '/__tokenhost/upload';
  const endpointUrl = String(ext.endpointUrl ?? baseUrl).trim() || '/__tokenhost/upload';
  const statusUrl = String(ext.statusUrl ?? endpointUrl).trim() || endpointUrl;
  const runnerMode = String(ext.runnerMode ?? 'local').trim() as UploadRunnerMode;
  if (runnerMode === 'remote') return null;
  if (!endpointUrl.startsWith('/')) return null;

  const provider = String(ext.provider ?? 'local_file').trim() === 'filecoin_onchain_cloud' ? 'filecoin_onchain_cloud' : 'local_file';
  const maxBytes = parsePositiveIntEnv(String(ext.maxBytes ?? ''), 10 * 1024 * 1024);
  const accept = Array.isArray(ext.accept) ? ext.accept.map((x: any) => String(x)).filter(Boolean) : ['image/*'];
  const localDir = path.join(uiSiteDir, '__tokenhost', 'uploads');
  const foc =
    runnerMode === 'foc-process'
      ? {
          chainId: parsePositiveIntEnv(process.env.TH_UPLOAD_FOC_CHAIN, 314159),
          copies: parsePositiveIntEnv(process.env.TH_UPLOAD_FOC_COPIES, 2),
          withCDN: parseBooleanEnv(process.env.TH_UPLOAD_FOC_WITH_CDN, false),
          command: String(process.env.TH_UPLOAD_FOC_COMMAND ?? 'npx -y foc-cli').trim() || 'npx -y foc-cli'
        }
      : null;

  return {
    enabled: true,
    baseUrl,
    endpointUrl,
    statusUrl,
    provider,
    runnerMode: runnerMode === 'foc-process' ? 'foc-process' : 'local',
    accept,
    maxBytes,
    localDir,
    foc
  };
}

function resolveTxMode(mode: string | undefined, chainId: number): TxMode {
  const normalized = String(mode ?? 'auto').toLowerCase().trim();
  if (normalized === 'sponsored') return 'sponsored';
  if (normalized === 'userpays' || normalized === 'user_pays' || normalized === 'user-pays') return 'userPays';
  // auto
  return chainId === anvil.id ? 'sponsored' : 'userPays';
}

function startUiSiteServer(args: {
  buildDir: string;
  host: string;
  port: number;
  faucet?: FaucetConfig | null;
  relay?: RelayConfig | null;
  upload?: UploadServerConfig | null;
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
  const relay = args.relay ?? null;
  const upload = args.upload ?? null;
  const faucetPath = '/__tokenhost/faucet';
  const relayPath = '/__tokenhost/relay';
  const uploadPath = upload?.endpointUrl && upload.endpointUrl.startsWith('/') ? upload.endpointUrl : '/__tokenhost/upload';
  const uploadStatusPath = upload?.statusUrl && upload.statusUrl.startsWith('/') ? upload.statusUrl : uploadPath;
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

  async function waitForReceipt(rpcUrl: string, txHash: string, timeoutMs = 30_000): Promise<any> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const receipt = await rpcRequest(rpcUrl, 'eth_getTransactionReceipt', [txHash], 2000);
      if (receipt) return receipt;
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`Timed out waiting for transaction receipt: ${txHash}`);
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

  function readBinaryBody(req: nodeHttp.IncomingMessage, maxBytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          reject(new Error('Request body too large.'));
          req.destroy();
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
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

    if (pathname === relayPath) {
      (async () => {
        const enabled = Boolean(relay?.enabled && relay.rpcUrl && relay.chainId === anvil.id && relay.from);
        if (req.method === 'GET' || req.method === 'HEAD') {
          return sendJson(res, 200, {
            ok: true,
            enabled,
            chainId: relay?.chainId ?? null,
            from: relay?.from ?? null,
            reason: enabled ? null : relay ? 'disabled' : 'not-configured'
          });
        }

        if (req.method !== 'POST') {
          res.setHeader('Allow', 'GET, HEAD, POST');
          return sendText(res, 405, 'Method Not Allowed');
        }

        if (!enabled) {
          return sendJson(res, 400, { ok: false, error: 'Relay is disabled.' });
        }

        try {
          const raw = await readBody(req);
          const parsed = raw.trim() ? JSON.parse(raw) : null;
          const to = normalizeAddress(String(parsed?.to ?? ''), 'to');
          const data = normalizeHexString(String(parsed?.data ?? ''), 'data');
          const valueInput = parsed?.value == null ? '0x0' : String(parsed.value);
          const value = normalizeHexString(valueInput, 'value');

          const rpcChainId = await tryGetRpcChainId(relay!.rpcUrl, 1000);
          if (rpcChainId === null) {
            return sendJson(res, 503, { ok: false, error: `RPC not reachable at ${relay!.rpcUrl}.` });
          }
          if (rpcChainId !== relay!.chainId) {
            return sendJson(res, 409, {
              ok: false,
              error: `RPC chainId mismatch. RPC=${rpcChainId} expected=${relay!.chainId}.`
            });
          }

          const txHash = (await rpcRequest(
            relay!.rpcUrl,
            'eth_sendTransaction',
            [{ from: relay!.from, to, data, value }],
            8_000
          )) as string;

          const receipt = await waitForReceipt(relay!.rpcUrl, txHash, 30_000);
          const status = String(receipt?.status ?? '').toLowerCase();
          if (status === '0x0') {
            return sendJson(res, 400, { ok: false, error: `Relayed tx reverted (${txHash}).`, txHash, receipt });
          }

          return sendJson(res, 200, { ok: true, txHash, receipt });
        } catch (e: any) {
          return sendJson(res, 400, { ok: false, error: String(e?.message ?? e) });
        }
      })();
      return;
    }

    if (pathname === uploadPath || pathname === uploadStatusPath) {
      (async () => {
        const enabled = Boolean(upload?.enabled);
        if (req.method === 'GET' || req.method === 'HEAD') {
          return sendJson(res, 200, {
            ok: true,
            enabled,
            provider: upload?.provider ?? null,
            runnerMode: upload?.runnerMode ?? null,
            maxBytes: upload?.maxBytes ?? null,
            accept: upload?.accept ?? [],
            endpointUrl: upload?.endpointUrl ?? null,
            statusUrl: upload?.statusUrl ?? null,
            reason: enabled ? null : upload ? 'disabled' : 'not-configured'
          });
        }

        if (req.method !== 'POST') {
          res.setHeader('Allow', 'GET, HEAD, POST');
          return sendText(res, 405, 'Method Not Allowed');
        }

        if (!enabled || !upload) {
          return sendJson(res, 400, { ok: false, error: 'Upload endpoint is disabled.' });
        }

        try {
          const fileName = normalizeUploadFileName(String(req.headers['x-tokenhost-upload-filename'] ?? 'upload.bin'));
          const contentType = String(req.headers['content-type'] ?? 'application/octet-stream').split(';')[0]!.trim().toLowerCase();
          const accept = Array.isArray(upload.accept) ? upload.accept : [];
          if (accept.length > 0 && !accept.some((pattern) => pattern === contentType || (pattern.endsWith('/*') && contentType.startsWith(pattern.slice(0, -1))))) {
            return sendJson(res, 415, { ok: false, error: `Unsupported content type "${contentType}".` });
          }

          const body = await readBinaryBody(req, upload.maxBytes);
          if (body.length === 0) return sendJson(res, 400, { ok: false, error: 'Empty upload body.' });

          if (upload.runnerMode === 'foc-process') {
            const ext = detectUploadExtension(fileName, contentType);
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-foc-upload-'));
            const tmpFile = path.join(tmpDir, `upload${ext}`);
            try {
              fs.writeFileSync(tmpFile, body);
              const uploaded = runFocCliUpload(upload.foc ?? {
                chainId: 314159,
                copies: 2,
                withCDN: false,
                command: 'npx -y foc-cli'
              }, tmpFile);
              return sendJson(res, 200, {
                ok: true,
                upload: {
                  url: uploaded.url,
                  cid: uploaded.cid,
                  size: uploaded.size ?? body.length,
                  provider: upload.provider,
                  runnerMode: upload.runnerMode,
                  contentType,
                  metadata: uploaded.metadata
                }
              });
            } finally {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            }
          }

          fs.mkdirSync(upload.localDir, { recursive: true });
          const ext = detectUploadExtension(fileName, contentType);
          const storedName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
          const storedPath = path.join(upload.localDir, storedName);
          fs.writeFileSync(storedPath, body);
          return sendJson(res, 200, {
            ok: true,
            upload: {
              url: `/__tokenhost/uploads/${storedName}`,
              cid: null,
              size: body.length,
              provider: upload.provider,
              runnerMode: upload.runnerMode,
              contentType,
              metadata: {
                originalFileName: fileName
              }
            }
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
  opts: {
    ui: boolean;
    quiet?: boolean;
    schemaPathForHints?: string;
    txMode?: string;
    relayBaseUrl?: string;
    targetChainId?: number;
    targetChainName?: KnownChainName;
    compileProfile?: CompileProfile;
  }
): { outDir: string; uiBundleDir: string | null; uiSiteDir: string | null } {
  const resolvedOutDir = path.resolve(outDir);
  ensureDir(resolvedOutDir);
  const generationLimits = generationLimitsForChain(opts.targetChainName);

  // 1) Generate Solidity source
  const appSol = generateAppSolidity(schema, { limits: generationLimits });
  ensureDir(path.join(resolvedOutDir, path.dirname(appSol.path)));
  fs.writeFileSync(path.join(resolvedOutDir, appSol.path), appSol.contents);

  // 2) Compile (solc-js)
  const sourceRelPath = appSol.path.replace(/\\\\/g, '/');
  const compileProfile = normalizeCompileProfile(opts.compileProfile);
  const compiled = compileSolidity(sourceRelPath, appSol.contents, 'App', { profile: compileProfile });
  const compiledArtifact = {
    contractName: 'App',
    abi: compiled.abi,
    bytecode: compiled.bytecode,
    deployedBytecode: compiled.deployedBytecode,
    compilerProfile: compileProfileForLog(compileProfile, compiled.viaIR)
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

    const uiTempRoot = path.join(resolvedOutDir, '.tokenhost-build-tmp');
    ensureDir(uiTempRoot);
    const uiWorkDir = fs.mkdtempSync(path.join(uiTempRoot, 'ui-build-'));
    try {
      const templateDir = resolveNextExportUiTemplateDir();
      copyDir(templateDir, uiWorkDir);

      // Inject schema for client-side routing/forms.
      const thsTsPath = path.join(uiWorkDir, 'src', 'generated', 'ths.ts');
      ensureDir(path.dirname(thsTsPath));
      fs.writeFileSync(thsTsPath, renderThsTs(schema));
      materializeUiThemePreset(uiWorkDir, schema);
      materializeCollectionRoutes(uiWorkDir, schema);

      // Ship ABI alongside the UI so it can operate without additional servers.
      const compiledPublicPath = path.join(uiWorkDir, 'public', 'compiled', 'App.json');
      ensureDir(path.dirname(compiledPublicPath));
      fs.writeFileSync(compiledPublicPath, compiledJson);

      // Do not bake a manifest into the UI bundle; it is published separately and signed.
      const bakedManifestPath = path.join(uiWorkDir, 'public', '.well-known', 'tokenhost', 'manifest.json');
      if (fs.existsSync(bakedManifestPath)) fs.rmSync(bakedManifestPath, { force: true });

      applyUiExtensions(uiWorkDir, schema, opts.schemaPathForHints);

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
      fs.rmSync(uiTempRoot, { recursive: true, force: true });
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
  const txMode = resolveTxMode(opts.txMode, Number(opts.targetChainId ?? anvil.id));
  const relayBaseUrl = String(opts.relayBaseUrl ?? process.env.TH_RELAY_BASE_URL ?? '/__tokenhost/relay').trim() || '/__tokenhost/relay';
  const uploadConfig = resolveUploadManifestConfig(features.uploads);

  const manifest = {
    manifestVersion: '0.1.0',
    thsVersion: schema.thsVersion,
    schemaVersion: schema.schemaVersion,
    schemaHash,
    generatorVersion: '0.0.0',
    toolchain: {
      node: process.version.replace(/^v/, ''),
      solc: solc.version(),
      compilerProfile: compileProfileForLog(compileProfile, compiled.viaIR)
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
    extensions: {
      ...(uploadConfig
        ? {
            uploads: {
              enabled: uploadConfig.enabled,
              baseUrl: uploadConfig.baseUrl,
              endpointUrl: uploadConfig.endpointUrl,
              statusUrl: uploadConfig.statusUrl,
              provider: uploadConfig.provider,
              runnerMode: uploadConfig.runnerMode,
              accept: uploadConfig.accept,
              maxBytes: uploadConfig.maxBytes
            }
          }
        : {}),
      tx:
        txMode === 'sponsored'
          ? {
              mode: 'sponsored',
              sponsored: {
                relayBaseUrl
              }
            }
          : {
              mode: 'userPays'
            }
    },
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
    console.log(`  th deploy ${resolvedOutDir} --chain filecoin_calibration # requires RPC + funded key`);
    if (uiBundleDir) {
      console.log(`  th preview ${resolvedOutDir}                # open http://127.0.0.1:3000/`);
    }
  }

  return { outDir: resolvedOutDir, uiBundleDir, uiSiteDir };
}

async function deployBuildDir(
  buildDir: string,
  opts: { chain: string; rpc?: string; privateKey?: string; admin?: string; treasury?: string; role: string; verify?: boolean }
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

  const shouldAutoVerify = opts.verify !== false && supportsFilfoxVerifier(chainName);
  if (shouldAutoVerify) {
    try {
      console.log(`Verifying on Filfox (${chainName})...`);
      const filfoxResult = await runFilfoxVerification({
        chainName,
        contractAddress: deployedAddress,
        manifest,
        compiled,
        sourceDir: path.join(resolvedBuildDir, 'contracts')
      });
      if (filfoxResult.stdout) process.stdout.write(`${filfoxResult.stdout}\n`);
      if (filfoxResult.stderr) process.stderr.write(`${filfoxResult.stderr}\n`);

      const verified = updateManifestVerificationState({
        manifest,
        target: deployment,
        chainId: chain.id,
        explorerKey: 'filfox',
        explorerWanted: true,
        explorerOk: filfoxResult.ok,
        explorerResult: filfoxResult,
        sourcifyWanted: false,
        sourcifyOk: null,
        sourcifyResult: null
      });

      const verificationSigningKey = loadManifestSigningKey();
      if (verificationSigningKey) {
        manifest.signatures = [signManifest(manifest, verificationSigningKey)];
      } else {
        manifest.signatures = [{ alg: 'none', sig: 'UNSIGNED' }];
      }

      const verificationValidation = validateManifest(manifest);
      if (!verificationValidation.ok) {
        throw new Error(`Updated manifest failed validation after Filfox verification:\n${JSON.stringify(verificationValidation.errors, null, 2)}`);
      }

      const verifiedManifestJson = JSON.stringify(manifest, null, 2);
      fs.writeFileSync(manifestPath, verifiedManifestJson);
      if (fs.existsSync(uiSiteDir)) {
        publishManifestToUiSite(uiSiteDir, verifiedManifestJson);
      }

      if (verified) {
        console.log(`Verified deployment on Filfox and updated ${manifestPath}`);
      } else {
        console.warn(`WARN deploy: Filfox verification did not complete successfully for ${deployedAddress}.`);
      }
    } catch (e: any) {
      console.warn(`WARN deploy: automatic Filfox verification failed: ${String(e?.message ?? e)}`);
    }
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
        },
        ui: {
          homePage: { mode: 'generated' }
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
  .command('studio')
  .description('Launch local Token Host Studio for THS authoring (load/save/validate/preview)')
  .option('--schema <file>', 'Schema file to load at startup')
  .option('--host <host>', 'Bind host', '127.0.0.1')
  .option('--port <n>', 'Bind port', '3210')
  .action((opts: { schema?: string; host: string; port: string }) => {
    const host = String(opts.host || '127.0.0.1');
    const port = Number.parseInt(String(opts.port || '3210'), 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid --port value: ${opts.port}`);
    }

    let schemaPath: string | null = opts.schema ? path.resolve(opts.schema) : null;
    let formState: ThsSchema = defaultStudioFormState();
    const workspaceRoot = process.cwd();
    const studioBackgroundPng = loadStudioBackgroundPngBuffer();
    if (schemaPath && fs.existsSync(schemaPath)) {
      const loaded = readJsonFile(schemaPath);
      const structural = validateThsStructural(loaded);
      if (structural.ok) formState = normalizeStudioFormState(structural.data);
    }

    function listLocalConfigs(root: string): string[] {
      const out: string[] = [];
      const stack = [root];
      const skipDirs = new Set([
        '.git',
        'node_modules',
        '.next',
        'dist',
        'out',
        'artifacts',
        'cache',
        'packages',
        'schemas'
      ]);

      while (stack.length > 0) {
        const dir = stack.pop()!;
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (skipDirs.has(entry.name)) continue;
            stack.push(full);
            continue;
          }
          if (!entry.isFile()) continue;
          if (!entry.name.endsWith('.json')) continue;
          if (entry.name === 'schema.json' || entry.name.endsWith('.schema.json')) {
            out.push(path.resolve(full));
          }
        }
      }

      return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b));
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

    async function parseJsonBody(req: nodeHttp.IncomingMessage): Promise<any> {
      const raw = await readBody(req);
      if (!raw.trim()) return {};
      return JSON.parse(raw);
    }

    const server = nodeHttp.createServer((req, res) => {
      if (!req.url) return sendText(res, 400, 'Bad Request');
      const parsedUrl = new URL(req.url, `http://${host}:${port}`);
      const pathname = parsedUrl.pathname;

      if (pathname === '/') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(renderStudioHtml());
        return;
      }

      const decodedPathname = decodeURIComponent(pathname);
      if (
        req.method === 'GET' &&
        (pathname === '/static/media/Token%20BIG-01.cfe69f33.png' || decodedPathname === '/static/media/Token BIG-01.cfe69f33.png')
      ) {
        if (!studioBackgroundPng) return sendText(res, 404, 'Not Found');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store');
        res.end(studioBackgroundPng);
        return;
      }

      if (pathname === '/api/state') {
        return sendJson(res, 200, {
          schemaPath,
          formState,
          workspaceRoot
        });
      }

      if (pathname === '/api/configs' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          workspaceRoot,
          configs: listLocalConfigs(workspaceRoot)
        });
      }

      if (pathname === '/api/validate' && req.method === 'POST') {
        (async () => {
          try {
            const body = await parseJsonBody(req);
            const incoming = body?.formState ?? formState;
            const out = validateStudioFormState(incoming);
            if (out.schema) formState = normalizeStudioFormState(out.schema);
            sendJson(res, 200, out);
          } catch (e: any) {
            sendJson(res, 400, { error: String(e?.message ?? e) });
          }
        })();
        return;
      }

      if (pathname === '/api/load' && req.method === 'POST') {
        (async () => {
          try {
            const body = await parseJsonBody(req);
            const requestedPath = String(body?.path ?? '').trim();
            if (!requestedPath) return sendJson(res, 400, { error: 'Missing path.' });
            const resolvedPath = path.resolve(requestedPath);
            if (!fs.existsSync(resolvedPath)) return sendJson(res, 404, { error: `File not found: ${resolvedPath}` });
            const loaded = readJsonFile(resolvedPath);
            const structural = validateThsStructural(loaded);
            if (!structural.ok) {
              return sendJson(res, 400, { error: 'Invalid THS file.', issues: structural.issues });
            }
            schemaPath = resolvedPath;
            formState = normalizeStudioFormState(structural.data);
            sendJson(res, 200, { ok: true, path: resolvedPath, formState });
          } catch (e: any) {
            sendJson(res, 400, { error: String(e?.message ?? e) });
          }
        })();
        return;
      }

      if (pathname === '/api/save' && req.method === 'POST') {
        (async () => {
          try {
            const body = await parseJsonBody(req);
            const requestedPath = String(body?.path ?? '').trim();
            const incoming = body?.formState ?? formState;
            if (!requestedPath) return sendJson(res, 400, { error: 'Missing path.' });

            const validated = validateStudioFormState(incoming);
            if (!validated.ok || !validated.schema) {
              return sendJson(res, 400, {
                error: 'Schema is invalid; fix errors before saving.',
                issues: validated.issues
              });
            }

            const resolvedPath = path.resolve(requestedPath);
            ensureDir(path.dirname(resolvedPath));
            const schemaJson = JSON.stringify(validated.schema, null, 2);
            fs.writeFileSync(resolvedPath, schemaJson.endsWith('\n') ? schemaJson : `${schemaJson}\n`);
            schemaPath = resolvedPath;
            formState = normalizeStudioFormState(validated.schema);
            sendJson(res, 200, { ok: true, path: resolvedPath });
          } catch (e: any) {
            sendJson(res, 400, { error: String(e?.message ?? e) });
          }
        })();
        return;
      }

      if (pathname === '/api/create-config' && req.method === 'POST') {
        (async () => {
          try {
            const body = await parseJsonBody(req);
            const slugRaw = String(body?.slug ?? 'new-app').trim();
            const slug = slugRaw
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '') || 'new-app';
            const appName = String(body?.name ?? 'New App').trim() || 'New App';
            const requestedPath = String(body?.path ?? '').trim();
            const targetPath = requestedPath
              ? path.resolve(requestedPath)
              : path.resolve(workspaceRoot, 'apps', slug, 'schema.json');

            if (fs.existsSync(targetPath)) {
              return sendJson(res, 409, { ok: false, error: `Config already exists: ${targetPath}` });
            }

            const defaults = defaultStudioFormState();
            const createdState = normalizeStudioFormState({
              ...defaults,
              app: {
                ...defaults.app,
                name: appName,
                slug
              }
            });

            const validated = validateStudioFormState(createdState);
            if (!validated.ok || !validated.schema) {
              return sendJson(res, 400, {
                ok: false,
                error: 'Generated config failed validation.',
                issues: validated.issues
              });
            }

            ensureDir(path.dirname(targetPath));
            fs.writeFileSync(targetPath, `${JSON.stringify(validated.schema, null, 2)}\n`);
            schemaPath = targetPath;
            formState = normalizeStudioFormState(validated.schema);
            return sendJson(res, 200, { ok: true, path: targetPath, formState, created: true });
          } catch (e: any) {
            return sendJson(res, 400, { ok: false, error: String(e?.message ?? e) });
          }
        })();
        return;
      }

      sendText(res, 404, 'Not Found');
    });

    server.on('error', (e: any) => {
      console.error(String(e?.message ?? e ?? 'Server error'));
      process.exitCode = 1;
    });

    const studioUrl = `http://${host}:${port}/`;
    server.listen(port, host, () => {
      console.log('Token Host Studio (local)');
      console.log(studioUrl);
      if (schemaPath) {
        console.log(`Loaded: ${schemaPath}`);
      }
    });
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
  .option('--chain <name>', 'Target chain for generation limits (anvil|sepolia|filecoin_calibration|filecoin_mainnet)')
  .option('--compiler-profile <profile>', 'Compiler profile (auto|default|large-app)', 'auto')
  .option('--with-tests', 'Emit generated app test scaffold', false)
  .action((schemaPath: string, opts: { out: string; ui: boolean; chain?: string; compilerProfile?: string; withTests: boolean }) => {
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
    const generationLimits = generationLimitsForChain(opts.chain ? resolveKnownChain(opts.chain).chainName : undefined);
    const appSol = generateAppSolidity(schema, { limits: generationLimits });
    const contractsDir = path.join(outDir, path.dirname(appSol.path));
    ensureDir(contractsDir);
    fs.writeFileSync(path.join(outDir, appSol.path), appSol.contents);

    const sourceRelPath = appSol.path.replace(/\\\\/g, '/');
    const compileProfile = normalizeCompileProfile(opts.compilerProfile);
    const compiled = compileSolidity(sourceRelPath, appSol.contents, 'App', { profile: compileProfile });
    const compiledArtifact = {
      contractName: 'App',
      abi: compiled.abi,
      bytecode: compiled.bytecode,
      deployedBytecode: compiled.deployedBytecode,
      compilerProfile: compileProfileForLog(compileProfile, compiled.viaIR)
    };
    const compiledJson = JSON.stringify(compiledArtifact, null, 2);
    const compiledOutPath = path.join(outDir, 'compiled', 'App.json');
    ensureDir(path.dirname(compiledOutPath));
    fs.writeFileSync(compiledOutPath, compiledJson);

    // Also persist an immutable copy of the schema input alongside the artifacts.
    ensureDir(outDir);
    fs.writeFileSync(path.join(outDir, 'schema.json'), JSON.stringify(schema, null, 2));

    if (opts.ui) {
      syncUiOutput({
        schema,
        outDir,
        schemaPathForHints: schemaPath,
        withTests: opts.withTests,
        compiledJson
      });
    }

    console.log(`Wrote compiled/App.json`);
    console.log(`Wrote ${appSol.path}`);
  });

program
  .command('ui')
  .description('UI-specific commands')
  .command('sync')
  .argument('<schema>', 'Path to THS schema JSON file')
  .option('--out <dir>', 'Output directory', 'artifacts')
  .option('--with-tests', 'Emit generated app test scaffold', false)
  .action((schemaPath: string, opts: { out: string; withTests: boolean }) => {
    const schema = loadThsSchemaOrThrow(schemaPath);
    const outDir = path.resolve(opts.out);
    const compiledPath = path.join(outDir, 'compiled', 'App.json');
    const manifestPath = path.join(outDir, 'manifest.json');
    if (!fs.existsSync(compiledPath)) {
      throw new Error(`Missing compiled/App.json in ${outDir}. Run \`th generate\`, \`th build\`, or \`th up\` first.`);
    }
    const compiledJson = fs.readFileSync(compiledPath, 'utf-8');
    const manifestJson = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf-8') : null;
    syncUiOutput({
      schema,
      outDir,
      schemaPathForHints: schemaPath,
      withTests: opts.withTests,
      compiledJson,
      manifestJson
    });
  });

program
  .command('build')
  .argument('<schema>', 'Path to THS schema JSON file')
  .option('--out <dir>', 'Output directory', 'artifacts')
  .option('--no-ui', 'Do not generate/build UI bundle')
  .option('--chain <name>', 'Target chain for generation limits (anvil|sepolia|filecoin_calibration|filecoin_mainnet)')
  .option('--compiler-profile <profile>', 'Compiler profile (auto|default|large-app)', 'auto')
  .option('--tx-mode <mode>', 'Transaction mode (auto|userPays|sponsored)', 'auto')
  .option('--relay-base-url <url>', 'Relay base URL for sponsored mode', '/__tokenhost/relay')
  .action((schemaPath: string, opts: { out: string; ui: boolean; chain?: string; compilerProfile?: string; txMode?: string; relayBaseUrl?: string }) => {
    try {
      const schema = loadThsSchemaOrThrow(schemaPath);
      const targetChainName = opts.chain ? resolveKnownChain(opts.chain).chainName : undefined;
      buildFromSchema(schema, opts.out, {
        ui: opts.ui,
        schemaPathForHints: schemaPath,
        compileProfile: normalizeCompileProfile(opts.compilerProfile),
        txMode: opts.txMode,
        relayBaseUrl: opts.relayBaseUrl,
        targetChainName,
        targetChainId: targetChainName ? resolveKnownChain(targetChainName).chain.id : undefined
      });
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
  .description('All-in-one local flow: validate + build + (start anvil) + deploy + preview + relay/faucet')
  .option('--out <dir>', 'Build output directory (defaults to artifacts/<appSlug>)')
  .option('--chain <name>', 'Chain name (anvil|sepolia|filecoin_calibration|filecoin_mainnet)', 'anvil')
  .option('--rpc <url>', 'RPC URL override')
  .option('--private-key <hex>', 'Private key (0x...) override')
  .option('--admin <address>', 'Admin address (defaults to deployer)')
  .option('--treasury <address>', 'Treasury address (defaults to deployer)')
  .option('--role <role>', 'Deployment role (primary|legacy)', 'primary')
  .option('--host <host>', 'Preview host', '127.0.0.1')
  .option('--port <n>', 'Preview port', '3000')
  .option('--interactive', 'Prompt for missing values', false)
  .option('--dry-run', 'Print what would run and exit', false)
  .option('--compiler-profile <profile>', 'Compiler profile (auto|default|large-app)', 'auto')
  .option('--tx-mode <mode>', 'Transaction mode (auto|userPays|sponsored)', 'auto')
  .option('--relay-base-url <url>', 'Relay base URL for sponsored mode', '/__tokenhost/relay')
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
        compilerProfile?: string;
        txMode?: string;
        relayBaseUrl?: string;
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
        const resolvedTxMode = resolveTxMode(opts.txMode, chain.id);
        const compileProfile = normalizeCompileProfile(opts.compilerProfile);

        if (opts.dryRun) {
          console.log('Plan:');
          console.log(`  - validate: ${resolvedSchemaPath}`);
          console.log(`  - build:    ${outDir}`);
          console.log(`  - compile:  ${compileProfile}`);
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
            console.log(`  - txMode:   ${resolvedTxMode}`);
            console.log(`  - faucet:   ${opts.faucet && chainName === 'anvil' && resolvedTxMode !== 'sponsored' ? 'ENABLED' : 'SKIP'}`);
            console.log(`  - relay:    ${chainName === 'anvil' && resolvedTxMode === 'sponsored' ? 'ENABLED' : 'SKIP'}`);
          }
          return;
        }

        console.log(`Schema: ${schema.app.slug} (${path.relative(process.cwd(), resolvedSchemaPath)})`);
        console.log(`Out:    ${path.relative(process.cwd(), outDir)}`);
        console.log(`Chain:  ${chainName} (${rpcUrl})`);
        console.log(`Tx:     ${resolvedTxMode}`);
        console.log(`Compile:${compileProfile}`);
        if (opts.preview) console.log(`UI:     ${previewUrl}`);
        console.log('');

        // If the user didn't explicitly set TH_UI_BASE_URL, set it to the preview URL so
        // the manifest's ui.baseUrl is meaningful during local dev.
        if (!originalUiBaseUrl && opts.preview) {
          process.env.TH_UI_BASE_URL = previewUrl;
        }

        // Start Anvil (if needed) while we build.
        const anvilPromise =
          chainName === 'anvil'
            ? ensureAnvilRunning(rpcUrl, { start: Boolean(opts.startAnvil), expectedChainId: chain.id })
            : Promise.resolve({ child: null, rpcUrl, chainId: chain.id });

        console.log('Building…');
        buildFromSchema(schema, outDir, {
          ui: true,
          quiet: true,
          schemaPathForHints: resolvedSchemaPath,
          compileProfile,
          txMode: opts.txMode,
          relayBaseUrl: opts.relayBaseUrl,
          targetChainId: chain.id,
          targetChainName: chainName
        });
        console.log('Build complete.');

        const ensured = await anvilPromise;
        anvilChild = ensured.child;
        const activeRpcUrl = ensured.rpcUrl;

        if (opts.deploy) {
          console.log('');
          console.log('Deploying…');
          await deployBuildDir(outDir, {
            chain: opts.chain,
            rpc: activeRpcUrl,
            privateKey: opts.privateKey,
            admin: opts.admin,
            treasury: opts.treasury,
            role: opts.role
          });
          console.log('Deploy complete.');
        }

        if (opts.preview) {
          console.log('');
          const faucetEnabled = Boolean(opts.faucet && chainName === 'anvil' && resolvedTxMode !== 'sponsored');
          const relayEnabled = Boolean(chainName === 'anvil' && resolvedTxMode === 'sponsored');
          const faucetTargetWei = 10n * 10n ** 18n;
          const relayFrom = privateKeyToAccount(resolvePrivateKey('anvil')).address as Address;
          let uploadConfig: UploadServerConfig | null = null;
          try {
            const manifest = readJsonFile(path.join(outDir, 'manifest.json')) as any;
            uploadConfig = buildUploadServerConfig(manifest, path.join(outDir, 'ui-site'));
          } catch {
            uploadConfig = null;
          }
          const { server, url } = startUiSiteServer({
            buildDir: outDir,
            host,
            port,
            faucet: faucetEnabled
              ? {
                  enabled: true,
                  rpcUrl: activeRpcUrl,
                  chainId: chain.id,
                  targetWei: faucetTargetWei
                }
              : null,
            relay: relayEnabled
              ? {
                  enabled: true,
                  rpcUrl: activeRpcUrl,
                  chainId: chain.id,
                  from: relayFrom
                }
              : null,
            upload: uploadConfig
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
      let relayConfig: RelayConfig | null = null;
      let uploadConfig: UploadServerConfig | null = null;
      let txMode: TxMode = 'userPays';
      let manifestChainId: number | null = null;
      let activePreviewRpcUrl: string | null = null;

      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = readJsonFile(manifestPath) as any;
          const deployments = Array.isArray(manifest?.deployments) ? manifest.deployments : [];
          const primaryDeployment = deployments.find((x: any) => x && x.role === 'primary') ?? deployments[0] ?? null;
          txMode = resolveTxMode(String(manifest?.extensions?.tx?.mode ?? 'auto'), Number(manifest?.deployments?.[0]?.chainId ?? anvil.id));
          manifestChainId = Number(primaryDeployment?.chainId ?? NaN);
          if (Number.isFinite(manifestChainId) && manifestChainId === anvil.id) {
            const { chainName, chain } = resolveKnownChain('anvil');
            activePreviewRpcUrl = resolveRpcUrl(chainName, chain, opts.rpc);
          }
          uploadConfig = buildUploadServerConfig(manifest, path.join(resolvedBuildDir, 'ui-site'));
        } catch {
          // ignore parse issues
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
            const rpcUrl = activePreviewRpcUrl ?? resolveRpcUrl(chainName, chain, opts.rpc);
            console.log(`Manifest is not deployed (0x0). Deploying automatically to ${chainName}...`);
            const ensured = await ensureAnvilRunning(rpcUrl, { start: Boolean(opts.startAnvil), expectedChainId: chain.id });
            anvilChild = ensured.child;
            activePreviewRpcUrl = ensured.rpcUrl;
            await deployBuildDir(resolvedBuildDir, { chain: 'anvil', rpc: activePreviewRpcUrl, role: 'primary' });
            console.log('Auto-deploy complete.');
            console.log('');
          }
        }
      }

      // Enable faucet when previewing an anvil build and the user hasn't disabled it.
      if (opts.faucet && txMode !== 'sponsored' && manifestChainId === anvil.id && activePreviewRpcUrl) {
        faucetConfig = { enabled: true, rpcUrl: activePreviewRpcUrl, chainId: manifestChainId, targetWei: faucetTargetWei };
      }

      // Enable local relay in sponsored mode for anvil chains.
      if (txMode === 'sponsored' && manifestChainId === anvil.id && activePreviewRpcUrl) {
        relayConfig = {
          enabled: true,
          rpcUrl: activePreviewRpcUrl,
          chainId: manifestChainId,
          from: privateKeyToAccount(resolvePrivateKey('anvil')).address as Address
        };
      }

      const port = Number(opts.port);
      const { server } = startUiSiteServer({
        buildDir: resolvedBuildDir,
        host: opts.host,
        port,
        faucet: faucetConfig,
        relay: relayConfig,
        upload: uploadConfig
      });

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
  .option('--chain <name>', 'Chain name (anvil|sepolia|filecoin_calibration|filecoin_mainnet)', 'anvil')
  .option('--rpc <url>', 'RPC URL override')
  .option('--private-key <hex>', 'Private key (0x...) override')
  .option('--admin <address>', 'Admin address (defaults to deployer)')
  .option('--treasury <address>', 'Treasury address (defaults to deployer)')
  .option('--role <role>', 'Deployment role (primary|legacy)', 'primary')
  .option('--no-verify', 'Skip automatic explorer verification after deploy')
  .action(async (buildDir: string, opts: { chain: string; rpc?: string; privateKey?: string; admin?: string; treasury?: string; role: string; verify?: boolean }) => {
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
  .description('Verify deployed contracts on explorers (Etherscan, Filfox, Sourcify)')
  .option('--chain <name>', 'Chain name (anvil|sepolia|filecoin_calibration|filecoin_mainnet)', 'sepolia')
  .option('--rpc <url>', 'RPC URL override (used by verifier tooling)')
  .option('--verifier <v>', 'Verifier to use (etherscan|filfox|sourcify|both)', 'both')
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
    let wantEtherscan = verifier === 'both' || verifier === 'etherscan';
    let wantFilfox = verifier === 'filfox' || (verifier === 'both' && supportsFilfoxVerifier(chainName));
    const wantSourcify = verifier === 'both' || verifier === 'sourcify';
    const etherscanSupported = supportsEtherscanVerifier(chainName);
    const filfoxSupported = supportsFilfoxVerifier(chainName);

    if (wantEtherscan && !etherscanSupported) {
      if (verifier === 'etherscan') {
        console.error(`Etherscan verification is not supported for chain "${chainName}". Use --verifier sourcify.`);
        process.exitCode = 1;
        return;
      }
      console.warn(`WARN verify: Etherscan is not supported for chain "${chainName}". Proceeding with Sourcify only.`);
      wantEtherscan = false;
    }
    if (wantFilfox && !filfoxSupported) {
      console.error(`Filfox verification is not supported for chain "${chainName}".`);
      process.exitCode = 1;
      return;
    }

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

    // Foundry is required for Etherscan/Sourcify verification (but allow --dry-run without forge installed).
    if (!opts.dryRun && (wantEtherscan || wantSourcify)) {
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
    let filfoxOk = false;
    let sourcifyOk = false;

    function runForge(args: string[]): { ok: boolean; status: number | null; cmd: string; stdout: string; stderr: string } {
      const cmd = cmdString('forge', redactCommandArgs(args));
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
    let filfoxResult: Awaited<ReturnType<typeof runFilfoxVerification>> | null = null;
    let sourcifyResult: ReturnType<typeof runForge> | null = null;

    (async () => {
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
          console.log(cmdString('forge', redactCommandArgs(args)));
        } else {
          console.log(`Verifying on Etherscan (${chainName})...`);
          etherscanResult = runForge(args);
          etherscanOk = etherscanResult.ok;
        }
      }

      if (wantFilfox) {
        if (opts.dryRun) {
          filfoxResult = await runFilfoxVerification({
            chainName,
            contractAddress,
            manifest,
            compiled,
            sourceDir: path.join(resolvedBuildDir, 'contracts'),
            dryRun: true
          });
          filfoxOk = true;
        } else {
          console.log(`Verifying on Filfox (${chainName})...`);
          filfoxResult = await runFilfoxVerification({
            chainName,
            contractAddress,
            manifest,
            compiled,
            sourceDir: path.join(resolvedBuildDir, 'contracts')
          });
          if (filfoxResult.stdout) process.stdout.write(`${filfoxResult.stdout}\n`);
          if (filfoxResult.stderr) process.stderr.write(`${filfoxResult.stderr}\n`);
          filfoxOk = filfoxResult.ok;
        }
      }

      if (wantSourcify) {
        const args = [...commonArgs, '--verifier', 'sourcify', contractAddress, contractId];
        if (opts.dryRun) {
          console.log(cmdString('forge', redactCommandArgs(args)));
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

    const verified = updateManifestVerificationState({
      manifest,
      target,
      chainId: chain.id,
      explorerKey: wantFilfox ? 'filfox' : 'etherscan',
      explorerWanted: wantFilfox || wantEtherscan,
      explorerOk: wantFilfox ? filfoxOk : etherscanOk,
      explorerResult: wantFilfox ? filfoxResult : etherscanResult,
      sourcifyWanted: wantSourcify,
      sourcifyOk,
      sourcifyResult
    });

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
  })().catch((e: any) => {
      console.error(String(e?.message ?? e));
      process.exitCode = 1;
    });
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
