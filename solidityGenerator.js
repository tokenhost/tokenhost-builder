'use strict';

import fs from 'fs';

/**
 * Reads and parses the JSON file containing contract definitions.
 * @param {string} filename - The JSON file name.
 * @returns {Object} The parsed contracts object.
 */
function loadContracts(filename) {
  const rawData = fs.readFileSync(filename, 'utf8');
  const program = JSON.parse(rawData);
  return program.contracts;
}

/**
 * Processes the field types for each contract.
 * – Converts a field type of 'image' to 'string'
 * – If a field’s type matches another contract name then converts it to 'address'
 *   and records the reference.
 *
 * @param {Object} contracts - All contract definitions.
 * @returns {Object} An object containing:
 *   - contractReferences: mapping of a contract name to an array of referenced contract names.
 *   - fieldLookup: mapping to later find the field name by parent/reference.
 */
function processFieldTypes(contracts) {
  const contractReferences = {};
  const fieldLookup = {};

  for (const contractName in contracts) {
    const contract = contracts[contractName];
    const fields = contract.fields;

    for (const fieldName in fields) {
      let fieldType = fields[fieldName];

      // Convert 'image' types to 'string'
      if (fieldType === 'image') {
        fields[fieldName] = 'string';
      }

      // If the field type is one of the contract names, treat it as a reference.
      if (Object.keys(contracts).includes(fieldType)) {
        fields[fieldName] = 'address';
        if (!contractReferences[contractName]) {
          contractReferences[contractName] = [];
        }
        contractReferences[contractName].push(fieldType);

        if (!fieldLookup[contractName]) {
          fieldLookup[contractName] = {};
        }
        fieldLookup[contractName][fieldType] = fieldName;
      }
    }
  }
  return { contractReferences, fieldLookup };
}

/**
 * Creates an additional mapping (fields_types) for each contract
 * that adds "memory" to string types (and to 'image' if still present).
 *
 * @param {Object} contracts - All contract definitions.
 */
function applyMemoryToStringFields(contracts) {
  for (const contractName in contracts) {
    const contract = contracts[contractName];
    contract.fields_types = {};
    for (const fieldName in contract.fields) {
      const fieldType = contract.fields[fieldName];
      if (fieldType === 'image' || fieldType === 'string') {
        contract.fields_types[fieldName] = 'string memory';
      } else {
        contract.fields_types[fieldName] = fieldType;
      }
    }
  }
}

/**
 * Generates the complete Solidity source code based on the contracts.
 *
 * @param {Object} contracts - All contract definitions.
 * @param {Object} contractReferences - References detected between contracts.
 * @param {Object} fieldLookup - Lookup for referenced field names.
 * @returns {string} The Solidity source code.
 */
function generateSolidityCode(contracts, contractReferences, fieldLookup) {
  // Updated header with Solidity 0.8.20 (ABIEncoderV2 not needed anymore).
  let code = `
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

`;

  // Generate individual contract definitions.
  for (const contractName in contracts) {
    code += generateContractDefinition(contractName, contracts[contractName]);
  }

  // Generate the App contract that ties all contracts together.
  code += generateAppContract(contracts, contractReferences, fieldLookup);

  return code;
}

/**
 * Generates the Solidity code for an individual contract.
 *
 * This version:
 *  - Declares state variables (with auto–generated getters as public if desired).
 *  - Uses a constructor that accepts parameters with proper data locations (e.g. "string memory").
 *  - Declares a bundled struct (ContractNameData) that contains:
 *      • address self;
 *      • Each field from readRules.gets (using its original type, without a location).
 *  - Provides a single getAll() function returning that struct.
 *
 * @param {string} contractName - The contract name.
 * @param {Object} contract - The contract definition.
 * @returns {string} The Solidity code for this contract.
 */
function generateContractDefinition(contractName, contract) {
  let contractCode = `contract ${contractName}_contract {\n\n`;

  // Declare state variables.
  for (const field in contract.fields) {
    const fieldType = contract.fields[field];
    contractCode += `\t${fieldType} public ${field};\n`;
  }
  contractCode += `\n`;

  // Build the constructor parameters based on initRules.passIn.
  // Use "string memory" for strings (or images) instead of "image memory".
  const passInParams = contract.initRules.passIn
    .map(field => {
      let type;
      if (contract.fields[field] === 'string' || contract.fields[field] === 'image') {
        type = 'string memory';
      } else {
        type = contract.fields_types[field];
      }
      return `${type} _${field}`;
    })
    .join(', ');

  contractCode += `\tconstructor(${passInParams}) {\n`;

  // Initialize auto-assigned fields.
  for (const autoField in contract.initRules.auto) {
    const value = contract.initRules.auto[autoField];
    contractCode += `\t\t${autoField} = ${value};\n`;
  }
  // Assign pass-in parameters to state variables.
  contract.initRules.passIn.forEach(field => {
    contractCode += `\t\t${field} = _${field};\n`;
  });
  contractCode += `\t}\n\n`;

  // Generate bundled struct for getters.
  contractCode += `\tstruct ${contractName}Data {\n`;
  contractCode += `\t\taddress self;\n`;
  contract.readRules.gets.forEach(field => {
    const fieldType = contract.fields[field];
    contractCode += `\t\t${fieldType} ${field};\n`;
  });
  contractCode += `\t}\n\n`;

  // Generate a getAll() function returning the struct.
  contractCode += `\tfunction getAll() external view returns (${contractName}Data memory) {\n`;
  contractCode += `\t\treturn ${contractName}Data({\n`;
  contractCode += `\t\t\tself: address(this),\n`;
  contract.readRules.gets.forEach((field, index) => {
    const comma = index === contract.readRules.gets.length - 1 ? '' : ',';
    contractCode += `\t\t\t${field}: ${field}${comma}\n`;
  });
  contractCode += `\t\t});\n`;
  contractCode += `\t}\n\n`;

  contractCode += `}\n\n`;
  return contractCode;
}

/**
 * Generates the main App contract which:
 * – Declares arrays and getter functions for each contract type.
 * – Uses the bundled getAll() getters from the child contracts.
 * – Declares user–related functions and reference mappings.
 *
 * In the getters, the return type is referenced as:
 *   ContractName_contract.ContractNameData
 *
 * @param {Object} contracts - All contract definitions.
 * @param {Object} contractReferences - Contract reference mapping.
 * @param {Object} fieldLookup - Field lookup for references.
 * @returns {string} The Solidity code for the App contract.
 */
function generateAppContract(contracts, contractReferences, fieldLookup) {
  let appCode = `contract App {\n\n`;

  // For each contract, create list variables and getter functions.
  for (const contractName in contracts) {
    appCode += `\taddress[] public ${contractName}_list;\n\n`;

    // Single-instance getter using getAll().
    appCode += `\tfunction get_${contractName}_N(uint256 index) public view returns (${contractName}_contract.${contractName}Data memory) {\n`;
    appCode += `\t\treturn ${contractName}_contract(${contractName}_list[index]).getAll();\n`;
    appCode += `\t}\n\n`;

    // Function to get the first N instances.
    appCode += `\tfunction get_first_${contractName}_N(uint256 count, uint256 offset) public view returns (${contractName}_contract.${contractName}Data[] memory) {\n`;
    appCode += `\t\trequire(offset + count <= ${contractName}_list.length, "Offset + count out of bounds");\n`;
    appCode += `\t\t${contractName}_contract.${contractName}Data[] memory results = new ${contractName}_contract.${contractName}Data[](count);\n`;
    appCode += `\t\tfor (uint i = 0; i < count; i++) {\n`;
    appCode += `\t\t\tresults[i] = ${contractName}_contract(${contractName}_list[i + offset]).getAll();\n`;
    appCode += `\t\t}\n`;
    appCode += `\t\treturn results;\n`;
    appCode += `\t}\n\n`;

    // Function to get the last N instances.
    appCode += `\tfunction get_last_${contractName}_N(uint256 count, uint256 offset) public view returns (${contractName}_contract.${contractName}Data[] memory) {\n`;
    appCode += `\t\trequire(count + offset <= ${contractName}_list.length, "Count + offset out of bounds");\n`;
    appCode += `\t\t${contractName}_contract.${contractName}Data[] memory results = new ${contractName}_contract.${contractName}Data[](count);\n`;
    appCode += `\t\tuint len = ${contractName}_list.length;\n`;
    appCode += `\t\tfor (uint i = 0; i < count; i++) {\n`;
    appCode += `\t\t\tuint idx = len - i - offset - 1;\n`;
    appCode += `\t\t\tresults[i] = ${contractName}_contract(${contractName}_list[idx]).getAll();\n`;
    appCode += `\t\t}\n`;
    appCode += `\t\treturn results;\n`;
    appCode += `\t}\n\n`;

    // Return length Number of instances
    appCode += `\tfunction get_${contractName}_list_length() public view returns (uint256) { return ${contractName}_list.length; }\n`;

    // User–related functions.
    appCode += `\tfunction get_${contractName}_user_length(address user) public view returns (uint256) {\n`;
    appCode += `\t\treturn user_map[user].${contractName}_list.length;\n`;
    appCode += `\t}\n\n`;

    appCode += `\tfunction get_${contractName}_user_N(address user, uint256 index) public view returns (${contractName}_contract.${contractName}Data memory) {\n`;
    appCode += `\t\treturn ${contractName}_contract(user_map[user].${contractName}_list[index]).getAll();\n`;
    appCode += `\t}\n\n`;

    appCode += `\tfunction get_last_${contractName}_user_N(address user, uint256 count, uint256 offset) public view returns (${contractName}_contract.${contractName}Data[] memory) {\n`;
    appCode += `\t\trequire(count + offset <= user_map[user].${contractName}_list.length, "Count + offset out of bounds");\n`;
    appCode += `\t\t${contractName}_contract.${contractName}Data[] memory results = new ${contractName}_contract.${contractName}Data[](count);\n`;
    appCode += `\t\tuint len = user_map[user].${contractName}_list.length;\n`;
    appCode += `\t\tfor (uint i = 0; i < count; i++) {\n`;
    appCode += `\t\t\tuint idx = len - i - offset - 1;\n`;
    appCode += `\t\t\tresults[i] = ${contractName}_contract(user_map[user].${contractName}_list[idx]).getAll();\n`;
    appCode += `\t\t}\n`;
    appCode += `\t\treturn results;\n`;
    appCode += `\t}\n\n`;
  }

  // Generate mapping structures and functions for contract references.
  appCode += generateReferenceMappings(contractReferences, contracts, fieldLookup);

  // Generate the UserInfo struct and mapping.
  appCode += generateUserInfo(contracts);

  // Generate functions to create new contracts.
  const allContractNames = Object.keys(contracts);
  for (const contractName in contracts) {
    appCode += generateNewContractFunction(
      contractName,
      contracts[contractName],
      contractReferences,
      fieldLookup,
      allContractNames
    );
  }

  appCode += `}\n`;
  return appCode;
}

// The following helper functions (generateFirstNGetter, generateLastNGetter, generateUserFunctions)
// are now deprecated since their functionality is integrated into generateAppContract.
function generateFirstNGetter(contractName, contractData) {
  return '';
}

function generateLastNGetter(contractName, contractData) {
  return '';
}

function generateUserFunctions(contractName, contractData) {
  return '';
}

/**
 * Generates mapping structures and functions for contract references.
 *
 * @param {Object} contractReferences - Mapping from parent contract to array of referenced contracts.
 * @param {Object} contracts - All contract definitions.
 * @param {Object} fieldLookup - Lookup for field names used in references.
 * @returns {string} The Solidity code for reference mappings.
 */
function generateReferenceMappings(contractReferences, contracts, fieldLookup) {
  let code = '';

  for (const parentContract in contractReferences) {
    contractReferences[parentContract].forEach(referenceContract => {
      code += `\tstruct ${parentContract}_${referenceContract} {\n`;
      code += `\t\tbool exists;\n`;
      code += `\t\taddress[] ${parentContract}_list;\n`;
      code += `\t}\n`;
      code += `\tmapping(address => ${parentContract}_${referenceContract}) public ${parentContract}_${referenceContract}_map;\n\n`;

      code += `\tfunction get_length_${parentContract}_${referenceContract}_map(address hash) public view returns (uint256) {\n`;
      code += `\t\treturn ${parentContract}_${referenceContract}_map[hash].${parentContract}_list.length;\n`;
      code += `\t}\n\n`;

      code += `\tfunction get_last_${parentContract}_${referenceContract}_map_N(address hash, uint256 count, uint256 offset) public view returns (${parentContract}_contract.${parentContract}Data[] memory) {\n`;
      code += `\t\t${parentContract}_contract.${parentContract}Data[] memory results = new ${parentContract}_contract.${parentContract}Data[](count);\n`;
      code += `\t\tfor (uint i = 0; i < count; i++) {\n`;
      code += `\t\t\t${parentContract}_contract instance = ${parentContract}_contract(${parentContract}_${referenceContract}_map[hash].${parentContract}_list[${parentContract}_${referenceContract}_map[hash].${parentContract}_list.length - i - offset - 1]);\n`;
      code += `\t\t\tresults[i] = instance.getAll();\n`;
      code += `\t\t}\n`;
      code += `\t\treturn results;\n`;
      code += `\t}\n\n`;
    });
  }
  return code;
}

/**
 * Generates the UserInfo struct and associated mappings.
 *
 * @param {Object} contracts - All contract definitions.
 * @returns {string} The Solidity code for user info.
 */
function generateUserInfo(contracts) {
  let code = `\tstruct UserInfo {\n`;
  code += `\t\taddress owner;\n`;
  code += `\t\tbool exists;\n`;
  for (const contractName in contracts) {
    code += `\t\taddress[] ${contractName}_list;\n`;
    code += `\t\tuint256 ${contractName}_list_length;\n`;
  }
  code += `\t}\n`;
  code += `\tmapping(address => UserInfo) public user_map;\n`;
  code += `\taddress[] public UserInfoList;\n`;
  code += `\tuint256 public UserInfoListLength;\n\n`;
  return code;
}

function generateNewContractFunction(contractName, contract, contractReferences, fieldLookup, allContractNames) {
  let code = '';

  // Declare the event.
  code += `\tevent New${contractName}(address indexed sender, address indexed contractAddress);\n\n`;

  // --- UNIQUE INDEX SETUP ---
  // If the writeRules contain a "unique" field, create a mapping and a getter function for it.
	// TODO handle multiple unique fields in a contract
	// TODO handle multiple contracts with same named unique field ie namespace field by contract name
  if (contract.writeRules.unique && contract.writeRules.unique.length > 0) {
    contract.writeRules.unique.forEach(uniqueField => {
      code += `\tmapping(bytes32 => address) unique_map_${uniqueField};\n\n`;
      code += `\tfunction get_unique_map_${contractName}(string memory ${uniqueField}) public view returns (address) {\n`;
      code += `\t\tbytes32 hash = keccak256(abi.encodePacked(${uniqueField}));\n`;
      code += `\t\treturn unique_map_${uniqueField}[hash];\n`;
      code += `\t}\n\n`;
    });
  }

  // New contract function header.
  code += `\tfunction new_${contractName}(`;
  code += contract.initRules.passIn
    .map(field => `${contract.fields_types[field]} ${field}`)
    .join(', ');
  code += `) public returns (address) {\n`;

  // --- UNIQUE INDEX CHECKS ---
  // For each unique field, compute the hash and require that it hasn't been used already.
  if (contract.writeRules.unique && contract.writeRules.unique.length > 0) {
    contract.writeRules.unique.forEach(uniqueField => {
      code += `\t\tbytes32 hash_${uniqueField} = keccak256(abi.encodePacked(${uniqueField}));\n`;
      code += `\t\trequire(unique_map_${uniqueField}[hash_${uniqueField}] == address(0), "Unique constraint violation for ${uniqueField}");\n`;
    });
  }

  // Instantiate the new contract.
  code += `\t\taddress mynew = address(new ${contractName}_contract({\n`;
  code += contract.initRules.passIn
    .map(field => `\t\t\t_${field} : ${field}`)
    .join(',\n');
  code += `\n\t\t}));\n\n`;

  // --- UPDATE UNIQUE INDEX MAPPINGS ---
  // For each unique field, update the mapping with the new instance.
  if (contract.writeRules.unique && contract.writeRules.unique.length > 0) {
    contract.writeRules.unique.forEach(uniqueField => {
      code += `\t\tunique_map_${uniqueField}[hash_${uniqueField}] = mynew;\n\n`;
    });
  }

  // Continue with the rest of the function (reference mappings, user data, etc.)
  if (contractReferences[contractName] && contractReferences[contractName].length > 0) {
    contractReferences[contractName].forEach(referenceContract => {
      const fieldName = fieldLookup[contractName][referenceContract];
      code += `\t\tif(!${contractName}_${referenceContract}_map[${fieldName}].exists) {\n`;
      code += `\t\t\t${contractName}_${referenceContract}_map[${fieldName}] = create_index_on_new_${contractName}_${referenceContract}();\n`;
      code += `\t\t}\n`;
      code += `\t\t${contractName}_${referenceContract}_map[${fieldName}].${contractName}_list.push(mynew);\n\n`;
    });
  }

  code += `\t\tif(!user_map[tx.origin].exists) {\n`;
  code += `\t\t\tuser_map[tx.origin] = create_user_on_new_${contractName}(mynew);\n`;
  code += `\t\t}\n`;
  code += `\t\tuser_map[tx.origin].${contractName}_list.push(mynew);\n`;
  code += `\t\tuser_map[tx.origin].${contractName}_list_length += 1;\n\n`;

  code += `\t\t${contractName}_list.push(mynew);\n`;
  code += `\t\t// The length of ${contractName}_list is tracked by the array length\n\n`;

  code += `\t\temit New${contractName}(tx.origin, mynew);\n\n`;
  code += `\t\treturn mynew;\n`;
  code += `\t}\n\n`;

  code += `\tfunction create_user_on_new_${contractName}(address addr) private returns (UserInfo memory) {\n`;
  const initLines = allContractNames.map(name => `\t\taddress[] memory ${name}_list_ = new address[](0);`);
  code += initLines.join('\n') + '\n';
  code += `\t\tUserInfoList.push(addr);\n`;
  code += `\t\treturn UserInfo({\n`;
  code += `\t\t\texists: true,\n\t\t\towner: addr,\n`;
  const userFields = allContractNames
    .map(name => `\t\t\t${name}_list: ${name}_list_,\n\t\t\t${name}_list_length: 0`)
    .join(',\n');
  code += userFields + `\n\t\t});\n`;
  code += `\t}\n\n`;

  if (contractReferences[contractName] && contractReferences[contractName].length > 0) {
    contractReferences[contractName].forEach(referenceContract => {
      code += `\tfunction create_index_on_new_${contractName}_${referenceContract}() private pure returns (${contractName}_${referenceContract} memory) {\n`;
      code += `\t\taddress[] memory tmp = new address[](0);\n`;
      code += `\t\treturn ${contractName}_${referenceContract}({exists: true, ${contractName}_list: tmp});\n`;
      code += `\t}\n\n`;
    });
  }

  return code;
}

// Main execution: load contracts from the provided file (or default to "contracts.json"),
// process field types, and generate the Solidity code.
(function main() {
  try {
    const args = process.argv.slice(2);
    const jsonFile = args[0] || 'contracts.json';

    const contracts = loadContracts(jsonFile);
    const { contractReferences, fieldLookup } = processFieldTypes(contracts);
    applyMemoryToStringFields(contracts);
    const solidityCode = generateSolidityCode(contracts, contractReferences, fieldLookup);
    console.log(solidityCode);
  } catch (error) {
    console.error('Error generating Solidity code:', error);
  }
})();

export {
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
};


