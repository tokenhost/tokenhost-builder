// test/compareSemanticCases.test.js
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processFieldTypes, applyMemoryToStringFields, generateSolidityCode } from '../solidityGenerator.js';

// For ES modules, determine __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Folder containing test cases.
// Each test case is represented by a pair: <name>.json (input) and <name>.sol (expected output)
const testFolder = path.join(__dirname, 'cases');

// Read all files in the test folder.
const files = fs.readdirSync(testFolder);

// Build test cases: for each .json file, there must be a matching .sol file.
const testCases = files
  .filter(file => file.endsWith('.json'))
  .map(jsonFile => {
    const baseName = path.basename(jsonFile, '.json');
    const solFile = `${baseName}.sol`;
    if (files.includes(solFile)) {
      return {
        name: baseName,
        jsonPath: path.join(testFolder, jsonFile),
        solPath: path.join(testFolder, solFile)
      };
    }
    return null;
  })
  .filter(Boolean);

describe('Solidity Builder Semantic Test Cases', function () {
  testCases.forEach(testCase => {
    it(`should generate correct Solidity output for ${testCase.name}`, function () {
      // Read the JSON test case.
      const jsonData = JSON.parse(fs.readFileSync(testCase.jsonPath, 'utf8'));
      const contracts = jsonData.contracts;

      // Process the contracts using the new builder.
      const { contractReferences, fieldLookup } = processFieldTypes(contracts);
      applyMemoryToStringFields(contracts);
      const newSolOutput = generateSolidityCode(contracts, contractReferences, fieldLookup).trim();

      // Read the expected Solidity output.
      const expectedSolOutput = fs.readFileSync(testCase.solPath, 'utf8').trim();

      // Compare the outputs.
      expect(newSolOutput).to.equal(expectedSolOutput);
    });
  });
});

