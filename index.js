const fs = require('fs')



let rawdata = fs.readFileSync('contracts.json')
let program = JSON.parse(rawdata)
//console.log(JSON.stringify(program,null,4));

let contracts = program.contracts
let template = `
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;
`

var contract_references = {}
//convert image to string:
for (const ContractName in contracts) {
  const contract = contracts[ContractName]
  let fields = contract.fields
  for(var field in fields){
    let type = fields[field]
    if (type == 'image') {
        fields[field] = 'string'
    }
    if(Object.keys(fields).includes(type)){
      fields[field] = 'address';
      if(!contract_references[ContractName]){
        contract_references[ContractName] = []
      }
      contract_references[ContractName].push(type)
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

	//getter



  template += `
    function getall() public view returns (${get_all_types_string}){
        return (${get_all_fields_string});
    }`

  contract.readRules.gets.forEach((field) => {
    const type = contract.fields_types[field]
    template += `\tfunction get_${field}() public view returns (${type}){return ${field};}\n`
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

function get_${ContractName}_list_length() public view returns (uint256){
    return ${ContractName}_list_length;
}`
  template += `struct ${ContractName}_getter{`
        contract.readRules.gets.forEach((field) => {
        const type = fields[field]
        template += `${type} ${field};`
  })
  template += `}`


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
  function get_${ContractName}_N(uint256 index) public view returns (${get_all_types_string}){
      return ${ContractName}_contract(${ContractName}_list[index]).getall();
  }


  function get_first_${ContractName}_N(uint256 count, uint256 offset) public view returns ( ${ContractName}_getter[] memory){
  ${ContractName}_getter[] memory getters = new ${ContractName}_getter[](count);
    `
  template += `for (uint i = offset; i < count; i++) {
        ${ContractName}_contract  my${ContractName} = ${ContractName}_contract(${ContractName}_list[i+offset]);`
  contract.readRules.gets.forEach((field) => {
    template += `getters[i-offset].${field} = my${ContractName}.get_${field}();`
  })
  template += `}
    return getters;
    }

  
  function get_last_${ContractName}_N(uint256 count, uint256 offset) public view returns ( ${ContractName}_getter[] memory){
  ${ContractName}_getter[] memory getters = new ${ContractName}_getter[](count);
    `
  template += `for (uint i = 0; i < count; i++ ){ 
        ${ContractName}_contract  my${ContractName} = ${ContractName}_contract(${ContractName}_list[${ContractName}_list_length-i-offset-1]);`
  contract.readRules.gets.forEach((field) => {
    template += `getters[i].${field} = my${ContractName}.get_${field}();`
  })
  template += `}
    return getters;
    }`




    //now do user stuff

    template +=`
      function get_${ContractName}_user_length(address user) public view returns (uint256){
        return user_map[user].${ContractName}_list_length;
      }
      function get_${ContractName}_user_N(address user,uint256 index) public view returns (${get_all_types_string}){
        return ${ContractName}_contract(user_map[user].${ContractName}_list[index]).getall();
    }


     
  function get_last_${ContractName}_user_N(address user,uint256 count, uint256 offset) public view returns ( ${ContractName}_getter[]  memory){
  ${ContractName}_getter[] memory getters = new ${ContractName}_getter[](count);
    `
  template += `for (uint i = offset; i < count; i++) {`
    contract.readRules.gets.forEach((field) => {
    template += `getters[i-offset].${field} = ${ContractName}_contract(user_map[user].${ContractName}_list[i+offset]).get_${field}();`
  })
  template += `}
    return getters;
    }`
}

//need to loop over each key to get index for now we just hardcode it as Txt/Hashtag

    //do all the references 

    for (parent_contract in contract_references) {
        const reference_contract = contract_references[parent_contract];

      template += `
    struct ${parent_contract}_${reference_contract}{
      bool exists;
      address[] ${parent_contract}_list;
  }
  mapping(address => ${parent_contract}_${reference_contract}) public ${parent_contract}_${reference_contract}_map;
  address[] ${parent_contract}_${reference_contract}_list;

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
}));`

//do the index stuff
if(contract_references[ContractName]){
contract_references[ContractName].forEach((reference_contract,index) => {

  template += `


 

  if(!${parent_contract}_${reference_contract}_map[{${reference_contract}}].exists){
    ${parent_contract}_${reference_contract}_map[{${reference_contract}}]=create_index_on_new_${parent_contract}_${reference_contract}(mynew);  
  }
  ${parent_contract}_${reference_contract}_map[{${reference_contract}}].${ContractName}_list.push(mynew);

  `

})

contract_references[ContractName].forEach((reference_contract,index) => {

  template += `

function create_index_on_new_${parent_contract}_${reference_contract}(address addr) private returns (${parent_contract}_${reference_contract} memory){
  address[] memory tmp;
  ${parent_contract}_${reference_contract}_list.push(addr);
  return ${parent_contract}_${reference_contract}({exists:true, ${parent_contract}_list:tmp})
} 
`

})
}


//do the user stuff
template +=` 



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
