import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { generateAppSolidity } from '@tokenhost/generator';
import { lintThs, validateThsStructural } from '@tokenhost/schema';

const require = createRequire(import.meta.url);
const solc = require('solc');

function compileSolidity(sourcePath, contents, contractName) {
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
  const errors = (output.errors || []).filter((e) => e.severity === 'error');
  return { output, errors };
}

describe('Spec-aligned CRUD generator', function () {
  it('generates Solidity that compiles (job-board example)', function () {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const schemaPath = path.join(__dirname, '..', 'apps', 'example', 'job-board.schema.json');
    const raw = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    const structural = validateThsStructural(raw);
    expect(structural.ok).to.equal(true);

    const schema = structural.data;
    const lintIssues = lintThs(schema);
    const lintErrors = lintIssues.filter((i) => i.severity === 'error');
    expect(lintErrors).to.have.length(0);

    const appSol = generateAppSolidity(schema);
    expect(appSol.contents).to.include('pragma solidity ^0.8.24;');
    expect(appSol.contents).to.include('contract App');
    expect(appSol.contents).to.include('event RecordCreated');
    expect(appSol.contents).to.include('function createCandidate');
    expect(appSol.contents).to.include('function createJobPosting');

    const { errors } = compileSolidity(appSol.path, appSol.contents, 'App');
    expect(errors.map((e) => e.formattedMessage || e.message).join('\n')).to.equal('');
  });
});

