import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function mustExist(root, relPath) {
  const p = path.join(root, relPath);
  assert.equal(fs.existsSync(p), true, `Missing required generated file: ${relPath}`);
  return p;
}

const root = process.cwd();
const thsPath = mustExist(root, 'src/generated/ths.ts');
mustExist(root, 'src/lib/app.ts');
mustExist(root, 'src/lib/abi.ts');

const thsSource = fs.readFileSync(thsPath, 'utf-8');
assert.match(thsSource, /export const ths = /, 'Generated THS export is missing.');

console.log('PASS contract smoke scaffold');
