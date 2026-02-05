import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function mustExist(root, relPath) {
  const p = path.join(root, relPath);
  assert.equal(fs.existsSync(p), true, `Missing required generated UI file: ${relPath}`);
}

const root = process.cwd();

for (const relPath of [
  'app/layout.tsx',
  'app/page.tsx',
  'app/[collection]/layout.tsx',
  'app/[collection]/page.tsx',
  'app/[collection]/new/page.tsx'
]) {
  mustExist(root, relPath);
}

console.log('PASS ui smoke scaffold');
