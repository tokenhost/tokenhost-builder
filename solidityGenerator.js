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
  // Solidity header and pragmas.
  let code = `
//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;

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
 * @param {string} contractName - The contract name.
 * @param {Object} contract - The contract definition.
 * @returns {string} The Solidity code for this contract.
 */
function generateContractDefinition(contractName, contract) {
  let contractCode = `contract ${contractName}_contract {\n\n`;

  // Declare state variables.
  for (const field in contract.fields) {
    const fieldType = contract.fields[field];
    contractCode += `\t${fieldType} ${field};\n`;
  }
  contractCode += `\n`;

  // Build the constructor parameters based on initRules.passIn.
  const passInParams = contract.initRules.passIn
    .map(field => `${contract.fields_types[field]} _${field}`)
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

  // Generate a getter that returns all values.
  const getFields = contract.readRules.gets;
  const getTypes = getFields.map(field => contract.fields_types[field]).join(', ');
  const getFieldsList = getFields.join(', ');
  contractCode += `\tfunction getall() public view returns (address, ${getTypes}) {\n`;
  contractCode += `\t\treturn (address(this), ${getFieldsList});\n`;
  contractCode += `\t}\n\n`;

  // Generate individual getter functions.
  getFields.forEach(field => {
    const type = contract.fields_types[field];
    contractCode += `\tfunction get_${field}() public view returns (${type}) {\n`;
    contractCode += `\t\treturn ${field};\n`;
    contractCode += `\t}\n`;
  });

  contractCode += `}\n\n`;
  return contractCode;
}

/**
 * Generates the main App contract which:
 * – Declares arrays and getter functions for each contract type.
 * – Creates mappings for user data.
 * – Includes functions to instantiate new contracts.
 *
 * @param {Object} contracts - All contract definitions.
 * @param {Object} contractReferences - Contract reference mapping.
 * @param {Object} fieldLookup - Field lookup for references.
 * @returns {string} The Solidity code for the App contract.
 */
function generateAppContract(contracts, contractReferences, fieldLookup) {
  let appCode = `contract App {\n\n`;

  // For each contract, create list variables and getter structs.
  for (const contractName in contracts) {
    appCode += `\taddress[] ${contractName}_list;\n`;
    appCode += `\tuint256 ${contractName}_list_length;\n\n`;
    appCode += `\tfunction get_${contractName}_list_length() public view returns (uint256) {\n`;
    appCode += `\t\treturn ${contractName}_list_length;\n`;
    appCode += `\t}\n\n`;

    // Define a struct to hold getter results.
    appCode += `\tstruct ${contractName}_getter {\n`;
    appCode += `\t\taddress _address;\n`;
    contracts[contractName].readRules.gets.forEach(field => {
      const fieldType = contracts[contractName].fields[field];
      appCode += `\t\t${fieldType} ${field};\n`;
    });
    appCode += `\t}\n\n`;

    // Function to get a single contract instance by index.
    const getFields = contracts[contractName].readRules.gets;
    const getTypes = getFields
      .map(field => (contracts[contractName].fields[field] === 'string' ? 'string memory' : contracts[contractName].fields[field]))
      .join(', ');
    appCode += `\tfunction get_${contractName}_N(uint256 index) public view returns (address, ${getTypes}) {\n`;
    appCode += `\t\treturn ${contractName}_contract(${contractName}_list[index]).getall();\n`;
    appCode += `\t}\n\n`;

    // Generate functions to return the first and last N elements.
    appCode += generateFirstNGetter(contractName, contracts[contractName]);
    appCode += generateLastNGetter(contractName, contracts[contractName]);

    // Generate user–related getter functions.
    appCode += generateUserFunctions(contractName, contracts[contractName]);
  }

  // Generate mapping structures and functions for contract references.
  appCode += generateReferenceMappings(contractReferences, contracts, fieldLookup);

  // Generate the user info struct and mapping.
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

/**
 * Generates a function that returns the first N contract getters.
 *
 * @param {string} contractName - The contract name.
 * @param {Object} contractData - The contract definition.
 * @returns {string} The Solidity code for the getter function.
 */
function generateFirstNGetter(contractName, contractData) {
  let code = `\tfunction get_first_${contractName}_N(uint256 count, uint256 offset) public view returns (${contractName}_getter[] memory) {\n`;
  code += `\t\t${contractName}_getter[] memory getters = new ${contractName}_getter[](count);\n`;
  code += `\t\tfor (uint i = offset; i < count; i++) {\n`;
  code += `\t\t\t${contractName}_contract my${contractName} = ${contractName}_contract(${contractName}_list[i + offset]);\n`;
  code += `\t\t\tgetters[i - offset]._address = address(my${contractName});\n`;
  contractData.readRules.gets.forEach(field => {
    code += `\t\t\tgetters[i - offset].${field} = my${contractName}.get_${field}();\n`;
  });
  code += `\t\t}\n`;
  code += `\t\treturn getters;\n`;
  code += `\t}\n\n`;
  return code;
}

/**
 * Generates a function that returns the last N contract getters.
 *
 * @param {string} contractName - The contract name.
 * @param {Object} contractData - The contract definition.
 * @returns {string} The Solidity code for the getter function.
 */
function generateLastNGetter(contractName, contractData) {
  let code = `\tfunction get_last_${contractName}_N(uint256 count, uint256 offset) public view returns (${contractName}_getter[] memory) {\n`;
  code += `\t\t${contractName}_getter[] memory getters = new ${contractName}_getter[](count);\n`;
  code += `\t\tfor (uint i = 0; i < count; i++) {\n`;
  code += `\t\t\t${contractName}_contract my${contractName} = ${contractName}_contract(${contractName}_list[${contractName}_list_length - i - offset - 1]);\n`;
  code += `\t\t\tgetters[i]._address = address(my${contractName});\n`;
  contractData.readRules.gets.forEach(field => {
    code += `\t\t\tgetters[i].${field} = my${contractName}.get_${field}();\n`;
  });
  code += `\t\t}\n`;
  code += `\t\treturn getters;\n`;
  code += `\t}\n\n`;
  return code;
}

/**
 * Generates user–related getter functions.
 *
 * @param {string} contractName - The contract name.
 * @param {Object} contractData - The contract definition.
 * @returns {string} The Solidity code for user functions.
 */
function generateUserFunctions(contractName, contractData) {
  let code = `\tfunction get_${contractName}_user_length(address user) public view returns (uint256) {\n`;
  code += `\t\treturn user_map[user].${contractName}_list_length;\n`;
  code += `\t}\n\n`;

  const getFields = contractData.readRules.gets;
  const getTypes = getFields
    .map(field =>
      contractData.fields[field] === 'string' ? 'string memory' : contractData.fields[field]
    )
    .join(', ');
  code += `\tfunction get_${contractName}_user_N(address user, uint256 index) public view returns (address, ${getTypes}) {\n`;
  code += `\t\treturn ${contractName}_contract(user_map[user].${contractName}_list[index]).getall();\n`;
  code += `\t}\n\n`;

  code += `\tfunction get_last_${contractName}_user_N(address user, uint256 count, uint256 offset) public view returns (${contractName}_getter[] memory) {\n`;
  code += `\t\t${contractName}_getter[] memory getters = new ${contractName}_getter[](count);\n`;
  code += `\t\tfor (uint i = offset; i < count; i++) {\n`;
  code += `\t\t\tgetters[i - offset]._address = user_map[user].${contractName}_list[i + offset];\n`;
  getFields.forEach(field => {
    code += `\t\t\tgetters[i - offset].${field} = ${contractName}_contract(user_map[user].${contractName}_list[i + offset]).get_${field}();\n`;
  });
  code += `\t\t}\n`;
  code += `\t\treturn getters;\n`;
  code += `\t}\n\n`;
  return code;
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

  // For each parent contract that references other contracts…
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

      code += `\tfunction get_last_${parentContract}_${referenceContract}_map_N(address hash, uint256 count, uint256 offset) public view returns (${parentContract}_getter[] memory) {\n`;
      code += `\t\t${parentContract}_getter[] memory getters = new ${parentContract}_getter[](count);\n`;
      code += `\t\tfor (uint i = 0; i < count; i++) {\n`;
      code += `\t\t\t${parentContract}_contract my${parentContract} = ${parentContract}_contract(${parentContract}_${referenceContract}_map[hash].${parentContract}_list[${parentContract}_${referenceContract}_map[hash].${parentContract}_list.length - i - offset - 1]);\n`;
      code += `\t\t\tgetters[i]._address = address(my${parentContract});\n`;
      contracts[parentContract].readRules.gets.forEach(field => {
        code += `\t\t\tgetters[i].${field} = my${parentContract}.get_${field}();\n`;
      });
      code += `\t\t}\n`;
      code += `\t\treturn getters;\n`;
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
  code += `\taddress[] UserInfoList;\n`;
  code += `\tuint256 UserInfoListLength;\n\n`;
  return code;
}

/**
 * Generates the function for creating a new instance of a given contract.
 * This function:
 *  – Checks for unique indexes (if defined)
 *  – Instantiates the new contract
 *  – Updates any reference mappings and user data.
 *
 * @param {string} contractName - The contract name.
 * @param {Object} contract - The contract definition.
 * @param {Object} contractReferences - Mapping of contract references.
 * @param {Object} fieldLookup - Lookup for referenced field names.
 * @param {Array<string>} allContractNames - All contract names (for user initialization).
 * @returns {string} The Solidity code for the new_<contractName> function.
 */
function generateNewContractFunction(contractName, contract, contractReferences, fieldLookup, allContractNames) {
  let code = '';

  // Declare the event.
  code += `\tevent New${contractName}(address sender);\n\n`;

  // If the contract has index rules, create a unique mapping.
  if (contract.writeRules.index && contract.writeRules.index.length > 0) {
    code += `\tmapping(bytes32 => address) unique_map_${contractName};\n\n`;
    code += `\tfunction get_unique_map_${contractName}(`;
    code += contract.writeRules.index
      .map(indexField => `${contract.fields_types[indexField]} ${indexField}`)
      .join(', ');
    code += `) public view returns (address) {\n`;
    code += `\t\tbytes32 hash_${contractName} = keccak256(abi.encodePacked(${contract.writeRules.index.join(', ')}));\n`;
    code += `\t\treturn unique_map_${contractName}[hash_${contractName}];\n`;
    code += `\t}\n\n`;
  }

  // Create the new_<contractName> function.
  code += `\tfunction new_${contractName}(`;
  code += contract.initRules.passIn
    .map(field => `${contract.fields_types[field]} ${field}`)
    .join(', ');
  code += `) public returns (address) {\n`;

  // Check for uniqueness if an index is defined.
  if (contract.writeRules.index && contract.writeRules.index.length > 0) {
    code += `\t\tbytes32 hash_${contractName} = keccak256(abi.encodePacked(${contract.writeRules.index.join(', ')}));\n`;
    code += `\t\trequire(unique_map_${contractName}[hash_${contractName}] == address(0));\n`;
  }

  // Instantiate the new contract.
  code += `\t\taddress mynew = address(new ${contractName}_contract({\n`;
  code += contract.initRules.passIn
    .map(field => `\t\t\t_${field} : ${field}`)
    .join(',\n');
  code += `\n\t\t}));\n\n`;

  // Update the unique mapping if necessary.
  if (contract.writeRules.index && contract.writeRules.index.length > 0) {
    code += `\t\tunique_map_${contractName}[hash_${contractName}] = mynew;\n\n`;
  }

  // Update any reference mappings.
  if (contractReferences[contractName] && contractReferences[contractName].length > 0) {
    contractReferences[contractName].forEach(referenceContract => {
      const fieldName = fieldLookup[contractName][referenceContract];
      code += `\t\tif(!${contractName}_${referenceContract}_map[${fieldName}].exists) {\n`;
      code += `\t\t\t${contractName}_${referenceContract}_map[${fieldName}] = create_index_on_new_${contractName}_${referenceContract}();\n`;
      code += `\t\t}\n`;
      code += `\t\t${contractName}_${referenceContract}_map[${fieldName}].${contractName}_list.push(mynew);\n\n`;
    });
  }

  // Update user mappings.
  code += `\t\tif(!user_map[tx.origin].exists) {\n`;
  code += `\t\t\tuser_map[tx.origin] = create_user_on_new_${contractName}(mynew);\n`;
  code += `\t\t}\n`;
  code += `\t\tuser_map[tx.origin].${contractName}_list.push(mynew);\n`;
  code += `\t\tuser_map[tx.origin].${contractName}_list_length += 1;\n\n`;

  // Update global contract list.
  code += `\t\t${contractName}_list.push(mynew);\n`;
  code += `\t\t${contractName}_list_length += 1;\n\n`;

  code += `\t\temit New${contractName}(tx.origin);\n\n`;
  code += `\t\treturn mynew;\n`;
  code += `\t}\n\n`;

  // Create a helper to initialize a new UserInfo record.
  code += `\tfunction create_user_on_new_${contractName}(address addr) private returns (UserInfo memory) {\n`;
  // For each contract, initialize an empty memory array.
  const initLines = allContractNames.map(name => `\t\taddress[] memory ${name}_list_ = new address[](0);`);
  code += initLines.join('\n') + '\n';
  code += `\t\tUserInfoList.push(addr);\n`;
  code += `\t\treturn UserInfo({\n`;
  const userFields = allContractNames
    .map(name => `\t\t\t${name}_list: ${name}_list_,\n\t\t\t${name}_list_length: 0`)
    .join(',\n');
  // Also set owner and exists.
  code += `\t\t\texists: true,\n\t\t\towner: addr,\n${userFields}\n\t\t});\n`;
  code += `\t}\n\n`;

  // If there are reference mappings for this contract, add helper functions.
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
