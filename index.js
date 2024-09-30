const fs = require('fs');

function readContracts(filename) {
  const rawdata = fs.readFileSync(filename);
  const program = JSON.parse(rawdata);
  return program.contracts;
}

function processContracts(contracts) {
  const contractReferences = {};
  const fieldLookup = {};

  // First pass: Adjust field types and collect references
  for (const contractName in contracts) {
    const contract = contracts[contractName];
    const fields = contract.fields;

    for (const field in fields) {
      let type = fields[field];
      if (type === 'image') {
        fields[field] = 'string';
      }

      if (contracts[type]) {
        // Field is a reference to another contract
        fields[field] = 'address';

        // Update contractReferences
        if (!contractReferences[contractName]) {
          contractReferences[contractName] = [];
        }
        contractReferences[contractName].push(type);

        // Update fieldLookup
        if (!fieldLookup[contractName]) {
          fieldLookup[contractName] = {};
        }
        fieldLookup[contractName][type] = field;
      }
    }
  }

  // Second pass: Add 'memory' to strings in fields_types
  for (const contractName in contracts) {
    const contract = contracts[contractName];
    const fieldsTypes = {};
    contract.fields_types = fieldsTypes;

    for (const field in contract.fields) {
      const type = contract.fields[field];
      fieldsTypes[field] = type === 'string' ? 'string memory' : type;
    }
  }

  return { contracts, contractReferences, fieldLookup };
}

function generateContractCode(contractName, contract) {
  let code = `contract ${contractName}_contract {\n`;

  // Generate fields
  for (const field in contract.fields) {
    const fieldType = contract.fields[field];
    code += `\t${fieldType} ${field};\n`;
  }

  // Create constructor
  code += `\n\tconstructor(`;
  contract.initRules.passIn.forEach((element, index) => {
    const type = contract.fields_types[element];
    code += `${type} _${element}${index < contract.initRules.passIn.length - 1 ? ', ' : ''}`;
  });
  code += `) {\n`;

  // Auto definitions
  for (const autoField in contract.initRules.auto) {
    const value = contract.initRules.auto[autoField];
    code += `\t\t${autoField} = ${value};\n`;
  }

  // Assign pass-in variables
  contract.initRules.passIn.forEach((field) => {
    code += `\t\t${field} = _${field};\n`;
  });

  code += `\t}\n`;

  // Read rules
  const getAllTypes = contract.readRules.gets.map((field) => contract.fields_types[field]);
  const getAllFields = contract.readRules.gets.join(', ');

  code += `
\tfunction getAll() public view returns (address, ${getAllTypes.join(', ')}) {
\t\treturn (address(this), ${getAllFields});
\t}\n`;

  contract.readRules.gets.forEach((field) => {
    const type = contract.fields_types[field];
    code += `\tfunction get_${field}() public view returns (${type}) { return ${field}; }\n`;
  });

  code += `}\n`;
  return code;
}

function generateAppCode(contracts, contractReferences, fieldLookup) {
  let code = `contract App {\n`;

  // Generate UserInfo struct and mapping
  code += `
\tstruct UserInfo {
\t\taddress owner;
\t\tbool exists;
`;
  for (const contractName in contracts) {
    code += `\t\taddress[] ${contractName}_list;
\t\tuint256 ${contractName}_list_length;\n`;
  }
  code += `\t}
\tmapping(address => UserInfo) public user_map;
\taddress[] UserInfoList;
\tuint256 UserInfoListLength;\n`;

  // Generate code for each contract
  for (const contractName in contracts) {
    const contract = contracts[contractName];
    code += generateAppContractForContract(contractName, contract, contracts, contractReferences, fieldLookup);
  }

  code += `}\n`;
  return code;
}

function generateAppContractForContract(contractName, contract, contracts, contractReferences, fieldLookup) {
  let code = `
\taddress[] ${contractName}_list;
\tuint256 ${contractName}_list_length;

\tfunction get_${contractName}_list_length() public view returns (uint256) {
\t\treturn ${contractName}_list_length;
\t}\n`;

  // Define getter struct
  code += `\tstruct ${contractName}_getter {
\t\taddress _address;`;
  contract.readRules.gets.forEach((field) => {
    code += `\n\t\t${contract.fields[field]} ${field};`;
  });
  code += `\n\t}\n`;

  // Generate getter functions
  code += generateGetFunctions(contractName, contract);

  // Generate user-specific functions
  code += generateUserFunctions(contractName, contract);

  // Generate reference functions
  code += generateReferenceFunctions(contractName, contractReferences, contracts, fieldLookup);

  // Generate functions to create new entries
  code += generateNewEntryFunction(contractName, contract, contracts, contractReferences, fieldLookup);

  return code;
}

function generateGetFunctions(contractName, contract) {
  let code = '';
  const getAllTypes = contract.readRules.gets.map((field) => contract.fields[field]);
  const getAllFields = contract.readRules.gets.join(', ');

  code += `
\tfunction get_${contractName}_N(uint256 index) public view returns (address, ${getAllTypes.join(', ')}) {
\t\treturn ${contractName}_contract(${contractName}_list[index]).getAll();
\t}

\tfunction get_first_${contractName}_N(uint256 count, uint256 offset) public view returns (${contractName}_getter[] memory) {
\t\t${contractName}_getter[] memory getters = new ${contractName}_getter[](count);
\t\tfor (uint256 i = offset; i < count; i++) {
\t\t\t${contractName}_contract myContract = ${contractName}_contract(${contractName}_list[i + offset]);
\t\t\tgetters[i - offset]._address = address(myContract);
`;
  contract.readRules.gets.forEach((field) => {
    code += `\t\t\tgetters[i - offset].${field} = myContract.get_${field}();\n`;
  });
  code += `\t\t}
\t\treturn getters;
\t}\n`;

  code += `
\tfunction get_last_${contractName}_N(uint256 count, uint256 offset) public view returns (${contractName}_getter[] memory) {
\t\t${contractName}_getter[] memory getters = new ${contractName}_getter[](count);
\t\tfor (uint256 i = 0; i < count; i++) {
\t\t\t${contractName}_contract myContract = ${contractName}_contract(${contractName}_list[${contractName}_list_length - i - offset - 1]);
\t\t\tgetters[i]._address = address(myContract);
`;
  contract.readRules.gets.forEach((field) => {
    code += `\t\t\tgetters[i].${field} = myContract.get_${field}();\n`;
  });
  code += `\t\t}
\t\treturn getters;
\t}\n`;

  return code;
}

function generateUserFunctions(contractName, contract) {
  let code = '';
  const getAllTypes = contract.readRules.gets.map((field) => contract.fields[field]);

  code += `
\tfunction get_${contractName}_user_length(address user) public view returns (uint256) {
\t\treturn user_map[user].${contractName}_list_length;
\t}

\tfunction get_${contractName}_user_N(address user, uint256 index) public view returns (address, ${getAllTypes.join(', ')}) {
\t\treturn ${contractName}_contract(user_map[user].${contractName}_list[index]).getAll();
\t}

\tfunction get_last_${contractName}_user_N(address user, uint256 count, uint256 offset) public view returns (${contractName}_getter[] memory) {
\t\t${contractName}_getter[] memory getters = new ${contractName}_getter[](count);
\t\tfor (uint256 i = offset; i < count; i++) {
\t\t\tgetters[i - offset]._address = user_map[user].${contractName}_list[i + offset];
`;
  contract.readRules.gets.forEach((field) => {
    code += `\t\t\tgetters[i - offset].${field} = ${contractName}_contract(user_map[user].${contractName}_list[i + offset]).get_${field}();\n`;
  });
  code += `\t\t}
\t\treturn getters;
\t}\n`;

  return code;
}

function generateReferenceFunctions(contractName, contractReferences, contracts, fieldLookup) {
  let code = '';

  if (contractReferences[contractName]) {
    contractReferences[contractName].forEach((refContract) => {
      const fieldName = fieldLookup[contractName][refContract];

      code += `
\tstruct ${contractName}_${refContract} {
\t\tbool exists;
\t\taddress[] ${contractName}_list;
\t}
\tmapping(address => ${contractName}_${refContract}) public ${contractName}_${refContract}_map;

\tfunction get_length_${contractName}_${refContract}_map(address key) public view returns (uint256) {
\t\treturn ${contractName}_${refContract}_map[key].${contractName}_list.length;
\t}

\tfunction get_last_${contractName}_${refContract}_map_N(address key, uint256 count, uint256 offset) public view returns (${contractName}_getter[] memory) {
\t\t${contractName}_getter[] memory getters = new ${contractName}_getter[](count);
\t\tfor (uint256 i = 0; i < count; i++) {
\t\t\t${contractName}_contract myContract = ${contractName}_contract(${contractName}_${refContract}_map[key].${contractName}_list[${contractName}_${refContract}_map[key].${contractName}_list.length - i - offset - 1]);
\t\t\tgetters[i]._address = address(myContract);
`;
      contracts[contractName].readRules.gets.forEach((field) => {
        code += `\t\t\tgetters[i].${field} = myContract.get_${field}();\n`;
      });
      code += `\t\t}
\t\treturn getters;
\t}\n`;
    });
  }

  return code;
}

function generateNewEntryFunction(contractName, contract, contracts, contractReferences, fieldLookup) {
  let code = `\tevent New${contractName}(address sender);\n`;

  // Unique index handling
  if (contract.writeRules.index.length > 0) {
    code += `\tmapping(bytes32 => address) unique_map_${contractName};\n`;
    code += `\tfunction get_unique_map_${contractName}(${contract.writeRules.index.map((field) => `${contract.fields_types[field]} ${field}`).join(', ')}) public view returns (address) {\n`;
    code += `\t\tbytes32 hash = keccak256(abi.encodePacked(${contract.writeRules.index.join(', ')}));\n`;
    code += `\t\treturn unique_map_${contractName}[hash];\n\t}\n`;
  }

  // Function to create new entries
  code += `\tfunction new_${contractName}(${contract.initRules.passIn.map((field) => `${contract.fields_types[field]} ${field}`).join(', ')}) public returns (address) {\n`;

  // Unique index check
  if (contract.writeRules.index.length > 0) {
    code += `\t\tbytes32 hash = keccak256(abi.encodePacked(${contract.writeRules.index.join(', ')}));\n`;
    code += `\t\trequire(unique_map_${contractName}[hash] == address(0), "Duplicate entry");\n`;
  }

  // Create new contract instance
  code += `\t\taddress newContract = address(new ${contractName}_contract({${contract.initRules.passIn.map((field) => `_${field}: ${field}`).join(', ')}}));\n`;

  // Update unique map
  if (contract.writeRules.index.length > 0) {
    code += `\t\tunique_map_${contractName}[hash] = newContract;\n`;
  }

  // Handle contract references
  if (contractReferences[contractName]) {
    contractReferences[contractName].forEach((refContract) => {
      const fieldName = fieldLookup[contractName][refContract];
      code += `\t\tif (!${contractName}_${refContract}_map[${fieldName}].exists) {\n`;
      code += `\t\t\t${contractName}_${refContract}_map[${fieldName}] = createIndexOnNew${contractName}_${refContract}();\n`;
      code += `\t\t}\n`;
      code += `\t\t${contractName}_${refContract}_map[${fieldName}].${contractName}_list.push(newContract);\n`;
    });
  }

  // Update user mapping
  code += `\t\tif (!user_map[msg.sender].exists) {\n`;
  code += `\t\t\tuser_map[msg.sender] = createUserOnNew${contractName}(newContract);\n`;
  code += `\t\t}\n`;
  code += `\t\tuser_map[msg.sender].${contractName}_list.push(newContract);\n`;
  code += `\t\tuser_map[msg.sender].${contractName}_list_length++;\n`;

  // Update global list
  code += `\t\t${contractName}_list.push(newContract);\n`;
  code += `\t\t${contractName}_list_length++;\n`;

  code += `\t\temit New${contractName}(msg.sender);\n`;
  code += `\t\treturn newContract;\n\t}\n`;

  // Create user function
  code += `\tfunction createUserOnNew${contractName}(address addr) private returns (UserInfo memory) {\n`;
  for (const name in contracts) {
    code += `\t\taddress[] memory ${name}_list_;\n`;
  }
  code += `\t\tUserInfoList.push(addr);\n`;
  code += `\t\treturn UserInfo({\n\t\t\texists: true,\n\t\t\towner: addr,\n`;
  for (const name in contracts) {
    code += `\t\t\t${name}_list: ${name}_list_,\n`;
    code += `\t\t\t${name}_list_length: 0,\n`;
  }
  code += `\t\t});\n\t}\n`;

  // Create index functions for references
  if (contractReferences[contractName]) {
    contractReferences[contractName].forEach((refContract) => {
      code += `\tfunction createIndexOnNew${contractName}_${refContract}() private pure returns (${contractName}_${refContract} memory) {\n`;
      code += `\t\taddress[] memory temp;\n`;
      code += `\t\treturn ${contractName}_${refContract}({\n\t\t\texists: true,\n\t\t\t${contractName}_list: temp\n\t\t});\n\t}\n`;
    });
  }

  return code;
}

function main() {
  const contracts = readContracts('contracts.json');
  const { contracts: processedContracts, contractReferences, fieldLookup } = processContracts(contracts);

  let template = `// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;\n\n`;

  // Generate code for each contract
  for (const contractName in processedContracts) {
    const contract = processedContracts[contractName];
    template += generateContractCode(contractName, contract);
  }

  // Generate the App contract code
  template += generateAppCode(processedContracts, contractReferences, fieldLookup);

  console.log(template);
}

main();

