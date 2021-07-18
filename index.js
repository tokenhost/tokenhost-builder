const fs = require('fs')

let rawdata = fs.readFileSync('contracts.json')
let program = JSON.parse(rawdata)
//console.log(JSON.stringify(program,null,4));

let contracts = program.contracts
let template = `
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;
`

//convert image to string:
for (const ContractName in contracts) {
  const contract = contracts[ContractName]
  let fields = contract.fields
  for(var field in fields){
    let type = fields[field]
    if (type == 'image') {
        fields[field] = 'string'
    }
  }
}
//
//add memory to strings
for (const ContractName in contracts) {
  const contract = contracts[ContractName]
  let fields_types = {}
  contract.fields_types = fields_types
  for(var field in contract.fields){
    let type = contract.fields[field]
    if (type == 'image') {
        fields_types[field] = 'string memory'
    }else if (type == 'string') {
        fields_types[field] = 'string memory'
    }else{
        fields_types[field] = type
    }
  }
}

for (const ContractName in contracts) {
  const contract = contracts[ContractName]
  const fields = contract.fields

  template += `contract ${ContractName}_contract{\n\n`
  for (const field in contract.fields) {
    const field_type = fields[field]
    template += `\t${field_type} ${field};\n`
  }

  //now create init method

  //define function name
  template += `\n\t constructor(`

  //add all the pass-in methods
  contract['initRules']['passIn'].forEach((element, index) => {
    const type = contract.fields_types[element]
    template += `${type} _${element}`
    if (index != contract['initRules']['passIn'].length - 1) {
      template += `, `
    }
  })

  template += `){\n`

  //create all the auto definitions

  for (const autofield in contract.initRules.auto) {
    const value = contract.initRules.auto[autofield]
    template += `\t\t${autofield} = ${value};\n`
  }

  //assign all the pass in variables using the _ hack
  contract.initRules.passIn.forEach((autofield) => {
    template += `\t\t${autofield} = _${autofield};\n`
  })

  //end init

  template += `\t}\n`

  //read rules
  const get_all_types = []
  const get_all_fields = []
  contract.readRules.gets.forEach((field) => {
    const type = contract.fields_types[field]
    get_all_types.push(type)
    get_all_fields.push(field)
  })
  get_all_fields_string = get_all_fields.join(', ')
  get_all_types_string = get_all_types.join(', ')

  template += `
    function getall() public returns (${get_all_types_string}){
        return (${get_all_fields_string});
    }`

  contract.readRules.gets.forEach((field) => {
    const type = contract.fields_types[field]
    template += `\tfunction get_${field}() public returns (${type}){return ${field};}\n`
  })
  template += `\n}`
}

template += `
contract App {\n`

for (const ContractName in contracts) {
  const contract = contracts[ContractName]
  const fields = contract.fields
  template += `
  address[] ${ContractName}_list; 
  uint256 ${ContractName}_list_length;

function get_${ContractName}_list_length() public returns (uint256){
    return ${ContractName}_list_length;
}`

  //get all

  const get_all_types = []
  const get_all_types_array = []
  const get_all_fields = []
  contract.readRules.gets.forEach((field) => {
    const type = fields[field]
    if(type == 'string'){
        get_all_types.push(type+' memory')
    }else{
        get_all_types.push(type)
    }
    get_all_types_array.push(type + '[] memory')
    get_all_fields.push(field)
  })
  const get_all_fields_string = get_all_fields.join(', ')
  const get_all_types_string = get_all_types.join(', ')
  const get_all_types_array_string = get_all_types_array.join(', ')

  template += `
  function get_${ContractName}_N(uint256 index) public returns (${get_all_types_string}){
      return ${ContractName}_contract(${ContractName}_list[index]).getall();
  }


  
  function get_last_${ContractName}_N(uint256 count, uint256 offset) public returns (${get_all_types_array_string}){`
  contract.readRules.gets.forEach((field) => {
    const type = fields[field]
    template += `${type}[] memory ${field} = new ${type}[](count);`
  })
  template += `for (uint i = offset; i < count; i++) {
        ${ContractName}_contract  my${ContractName} = ${ContractName}_contract(${ContractName}_list[i+offset]);`
  contract.readRules.gets.forEach((field) => {
    template += `${field}[i+offset] = my${ContractName}.get_${field}();`
  })
  template += `}
    return (${get_all_fields_string});
    }`

    //now do user stuff


    template +=`
      function get_${ContractName}_user_length(address user) public returns (uint256){
        return user_map[user].${ContractName}_list_length;
      }
      function get_${ContractName}_user_N(address user,uint256 index) public returns (${get_all_types_string}){
        return ${ContractName}_contract(user_map[user].${ContractName}_list[index]).getall();
    }


     
  function get_last_${ContractName}_user_N(address user,uint256 count, uint256 offset) public returns (${get_all_types_array_string}){`
  contract.readRules.gets.forEach((field) => {
    const type = fields[field]
    template += `${type}[] memory ${field} = new ${type}[](count);`
  })
  template += `for (uint i = offset; i < count; i++) {`
    contract.readRules.gets.forEach((field) => {
    template += `${field}[i+offset] = ${ContractName}_contract(user_map[user].${ContractName}_list[i+offset]).get_${field}();`
  })
  template += `}
    return (${get_all_fields_string});
    }
    
    `



}

//create the equivalent of the users tables
// but include references to the contracts they've created for easy access
template += `

  struct UserInfo {
    address owner;
    bool exists;
    \n`
for (const ContractName in contracts) {
  template += `\taddress[] ${ContractName}_list;
  uint256 ${ContractName}_list_length;
`
}

template += `
}
mapping(address => UserInfo) public user_map;
\taddress[] UserInfoList;
uint256 UserInfoListLength;
`

for (const ContractName in contracts) {
  const contract = contracts[ContractName]
  const fields = contract.fields

  template += `

    event New${ContractName}(address sender); 

function new_${ContractName}(`

  //add all the pass-in methods
  contract['initRules']['passIn'].forEach((element, index) => {
    const type = contract.fields_types[element]
    template += `${type} ${element}`
    if (index != contract['initRules']['passIn'].length - 1) {
      template += `, `
    }
  })

  template += `) public returns (address){\n
  
  
        
  address mynew = address(new ${ContractName}_contract({`

  //add all the pass-in methods
  contract['initRules']['passIn'].forEach((element, index) => {
    const type = fields[element]
    template += `_${element} : ${element}`
    if (index != contract['initRules']['passIn'].length - 1) {
      template += `, `
    }
  })

  template += `
}));
  if(!user_map[tx.origin].exists){
    user_map[tx.origin]=create_user_on_new_${ContractName}(mynew);
  }
  user_map[tx.origin].${ContractName}_list.push(mynew);

  user_map[tx.origin].${ContractName}_list_length+=1;


${ContractName}_list.push(mynew);
${ContractName}_list_length+=1;


  emit New${ContractName}(tx.origin);

  return mynew;
  
}


function  create_user_on_new_${ContractName}(address addr) private returns (UserInfo memory){
    address[] memory ${ContractName}_list;
    UserInfoList.push(addr);
    return UserInfo({exists:true, owner:addr,  
        
      
    `
  for (const ContractName in contracts) {
    template += `${ContractName}_list : ${ContractName}_list, 
       ${ContractName}_list_length : 0,
    `
  }

  template += `});
}




`
}

template += '}'
console.log(template)

//todo create the parent contract and the events
