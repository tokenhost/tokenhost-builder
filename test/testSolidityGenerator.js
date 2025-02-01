// test/testSolidityGenerator.js
import { expect } from 'chai';

// Import all the exported functions from your generator module.
import {
  loadContracts,
  processFieldTypes,
  applyMemoryToStringFields,
  generateSolidityCode,
  generateContractDefinition,
  generateAppContract,
  generateFirstNGetter,
  generateLastNGetter,
  generateUserFunctions,
  generateReferenceMappings,
  generateUserInfo,
  generateNewContractFunction
} from '../solidityGenerator.js';

// Sample fixture for our contracts.json data.
const testContractsRaw = {
  "Test": {
    "fields": {
      "name": "string",
      "photo": "image",
      "ref": "OtherContract"
    },
    "initRules": {
      "passIn": ["name", "photo"],
      "auto": {
        "timestamp": "block.timestamp"
      }
    },
    "readRules": {
      "gets": ["name", "photo", "timestamp"]
    },
    "writeRules": {
      "index": ["name"]
    }
  },
  "OtherContract": {
    "fields": {
      "description": "string"
    },
    "initRules": {
      "passIn": ["description"],
      "auto": {}
    },
    "readRules": {
      "gets": ["description"]
    },
    "writeRules": {
      "index": []
    }
  }
};

describe('Solidity Generator Test Suite', function() {
  let testContracts;

  beforeEach(function() {
    // Deep clone to ensure a fresh copy for each test.
    testContracts = JSON.parse(JSON.stringify(testContractsRaw));
  });

  describe('processFieldTypes', function() {
    it('should convert "image" fields to "string" and convert contract references to "address"', function() {
      const { contractReferences, fieldLookup } = processFieldTypes(testContracts);
      expect(testContracts.Test.fields.photo).to.equal('string');
      expect(testContracts.Test.fields.ref).to.equal('address');
      expect(contractReferences.Test).to.include('OtherContract');
      expect(fieldLookup.Test.OtherContract).to.equal('ref');
    });
  });

  describe('applyMemoryToStringFields', function() {
    it('should add "memory" to string fields in fields_types', function() {
      processFieldTypes(testContracts);
      applyMemoryToStringFields(testContracts);
      expect(testContracts.Test.fields_types.name).to.equal('string memory');
      expect(testContracts.Test.fields_types.photo).to.equal('string memory');
      expect(testContracts.OtherContract.fields_types.description).to.equal('string memory');
    });
  });

  describe('generateContractDefinition', function() {
    it('should generate valid Solidity code for a single contract', function() {
      processFieldTypes(testContracts);
      applyMemoryToStringFields(testContracts);
      const testCode = generateContractDefinition('Test', testContracts.Test);
      expect(testCode).to.include('contract Test_contract {');
      expect(testCode).to.include('constructor(');
      expect(testCode).to.include('function getall() public view returns');
    });
  });

  describe('generateSolidityCode', function() {
    it('should generate full Solidity code with header, contract definitions, and the App contract', function() {
      processFieldTypes(testContracts);
      applyMemoryToStringFields(testContracts);
      const { contractReferences, fieldLookup } = processFieldTypes(testContracts);
      const solidityCode = generateSolidityCode(testContracts, contractReferences, fieldLookup);
      expect(solidityCode).to.include('//SPDX-License-Identifier: UNLICENSED');
      expect(solidityCode).to.include('pragma solidity ^0.8.2;');
      expect(solidityCode).to.include('contract Test_contract {');
      expect(solidityCode).to.include('contract OtherContract_contract {');
      expect(solidityCode).to.include('contract App {');
    });
  });

  describe('generateAppContract', function() {
    it('should generate the App contract code with list variables, getter structs, and user functions', function() {
      processFieldTypes(testContracts);
      applyMemoryToStringFields(testContracts);
      const appCode = generateAppContract(testContracts, {}, {});
      expect(appCode).to.include('contract App {');
      expect(appCode).to.include('function get_Test_list_length()');
      expect(appCode).to.include('struct Test_getter {');
    });
  });

  describe('generateNewContractFunction', function() {
    it('should generate the new_<Contract> function with event declaration, uniqueness checks, and parameters', function() {
      processFieldTypes(testContracts);
      applyMemoryToStringFields(testContracts);
      const newContractCode = generateNewContractFunction('Test', testContracts.Test, {}, {}, Object.keys(testContracts));
      expect(newContractCode).to.include('event NewTest(address sender);');
      expect(newContractCode).to.include('function new_Test(');
      expect(newContractCode).to.include('unique_map_Test');
      expect(newContractCode).to.include('name');
      expect(newContractCode).to.include('photo');
    });
  });

  describe('generateFirstNGetter and generateLastNGetter', function() {
    it('should generate getter functions for the first and last N elements', function() {
      processFieldTypes(testContracts);
      applyMemoryToStringFields(testContracts);
      const firstGetter = generateFirstNGetter('Test', testContracts.Test);
      const lastGetter = generateLastNGetter('Test', testContracts.Test);
      expect(firstGetter).to.include('function get_first_Test_N');
      expect(lastGetter).to.include('function get_last_Test_N');
    });
  });

  describe('Additional helper functions', function() {
    it('should generate user functions correctly', function() {
      processFieldTypes(testContracts);
      applyMemoryToStringFields(testContracts);
      const userFuncs = generateUserFunctions('Test', testContracts.Test);
      expect(userFuncs).to.include('function get_Test_user_length(address user)');
      expect(userFuncs).to.include('function get_last_Test_user_N(address user, uint256 count, uint256 offset)');
    });

    it('should generate reference mappings correctly', function() {
      // Process the contracts only once.
      const { contractReferences, fieldLookup } = processFieldTypes(testContracts);
      applyMemoryToStringFields(testContracts);
      const refMappings = generateReferenceMappings(contractReferences, testContracts, fieldLookup);
      expect(refMappings).to.include('mapping(address => Test_OtherContract)');
    });


    it('should generate user info struct correctly', function() {
      const userInfoCode = generateUserInfo(testContracts);
      expect(userInfoCode).to.include('struct UserInfo {');
      expect(userInfoCode).to.include('address[] Test_list;');
      expect(userInfoCode).to.include('uint256 Test_list_length;');
      expect(userInfoCode).to.include('mapping(address => UserInfo) public user_map;');
    });
  });
});


