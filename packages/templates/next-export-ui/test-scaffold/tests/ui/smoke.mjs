import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function mustExist(root, relPath) {
  const p = path.join(root, relPath);
  assert.equal(fs.existsSync(p), true, `Missing required generated UI file: ${relPath}`);
  return p;
}

function loadGeneratedThs(root) {
  const thsPath = mustExist(root, 'src/generated/ths.ts');
  const source = fs.readFileSync(thsPath, 'utf-8');
  const match = source.match(/export const ths = ([\s\S]*?) as const;/);
  assert.ok(match, 'Unable to parse generated THS from src/generated/ths.ts');
  return JSON.parse(match[1]);
}

async function fetchOrThrow(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  return { status: res.status, text, res };
}

async function assertRoute200(baseUrl, route) {
  const u = `${baseUrl}${route}`;
  const out = await fetchOrThrow(u);
  assert.equal(out.status, 200, `Expected ${u} to return 200, got ${out.status}`);
  assert.equal(
    out.text.includes('not found on ABI'),
    false,
    `Route ${u} rendered an ABI lookup error. Check generated UI function names vs ABI overload handling.`
  );
}

async function runLiveChecks(root, baseUrl, ths) {
  await assertRoute200(baseUrl, '/');

  for (const collection of ths.collections || []) {
    const name = String(collection?.name ?? '');
    if (!name) continue;

    await assertRoute200(baseUrl, `/${name}/`);
    await assertRoute200(baseUrl, `/${name}/new/`);
    await assertRoute200(baseUrl, `/${name}/view/?id=1`);

    const canEdit = Array.isArray(collection?.updateRules?.mutable) && collection.updateRules.mutable.length > 0;
    if (canEdit) await assertRoute200(baseUrl, `/${name}/edit/?id=1`);

    const canDelete = Boolean(collection?.deleteRules?.softDelete);
    if (canDelete) await assertRoute200(baseUrl, `/${name}/delete/?id=1`);
  }

  const manifestRes = await fetchOrThrow(`${baseUrl}/.well-known/tokenhost/manifest.json`);
  assert.equal(manifestRes.status, 200, 'Manifest is missing from /.well-known/tokenhost/manifest.json');

  const manifest = JSON.parse(manifestRes.text);
  const deployments = Array.isArray(manifest?.deployments) ? manifest.deployments : [];
  const primary = deployments.find((d) => d && d.role === 'primary') ?? deployments[0] ?? null;
  assert.ok(primary, 'Manifest has no deployments.');

  const address = String(primary?.deploymentEntrypointAddress ?? '');
  assert.match(address, /^0x[0-9a-fA-F]{40}$/, 'Manifest deploymentEntrypointAddress is not a valid address.');
  assert.notEqual(
    address.toLowerCase(),
    '0x0000000000000000000000000000000000000000',
    'Manifest deploymentEntrypointAddress is 0x0. Run th deploy / preview auto-deploy first.'
  );
}

const root = process.cwd();
const ths = loadGeneratedThs(root);

for (const relPath of [
  'app/layout.tsx',
  'app/page.tsx',
  'app/[collection]/layout.tsx',
  'app/[collection]/page.tsx',
  'app/[collection]/new/page.tsx',
  'src/theme/tokens.json',
  'src/components/NetworkStatus.tsx'
]) {
  mustExist(root, relPath);
}

const baseUrlEnv = process.env.TH_UI_BASE_URL?.trim();
if (baseUrlEnv) {
  const baseUrl = baseUrlEnv.replace(/\/+$/, '');
  await runLiveChecks(root, baseUrl, ths);
  console.log(`PASS ui smoke scaffold (live checks @ ${baseUrl})`);
} else {
  console.log('PASS ui smoke scaffold (static checks only)');
}
