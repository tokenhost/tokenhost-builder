const fs = require('fs')
const path = require('path');

const folder = process.argv[2]



let rawdata = fs.readFileSync('contracts.json')
let program = JSON.parse(rawdata)
//console.log(JSON.stringify(program,null,4));

let contracts = program.contracts
let template = `
//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
`

var contract_references = {}
var field_lookup = {}
//convert image to string:
for (const ContractName in contracts) {
  const contract = contracts[ContractName]
  let fields = contract.fields
  for(var field in fields){
    let type = fields[field]
    if (type == 'image') {
        fields[field] = 'string'
    }
    if(Object.keys(contracts).includes(type)){
      fields[field] = 'address';
      if(!contract_references[ContractName]){
        contract_references[ContractName] = []
      }
      contract_references[ContractName].push(type)

	    //for finding the field name later
      if(!field_lookup[ContractName]){
        field_lookup[ContractName] = {}
      }
	    field_lookup[ContractName][type] = field;
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
  let contract_template = `//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

`
  const contract = contracts[ContractName]
  const fields = contract.fields

  contract_template += `contract ${ContractName}_contract{\n\n`
  for (const field in contract.fields) {
    const field_type = fields[field]
    contract_template += `\t${field_type} ${field};\n`
  }

  //now create init method
	//
	contract_template += `
	    using Strings for uint256;

	`

  //define function name
  contract_template += `\n\t constructor(`

  //add all the pass-in methods
  contract['initRules']['passIn'].forEach((element, index) => {
    const type = contract.fields_types[element]
    contract_template += `${type} _${element}`
    if (index != contract['initRules']['passIn'].length - 1) {
      contract_template += `, `
    }
  })

  contract_template += `){\n`

  //create all the auto definitions

  for (const autofield in contract.initRules.auto) {
    const value = contract.initRules.auto[autofield]
    contract_template += `\t\t${autofield} = ${value};\n`
  }

  //assign all the pass in variables using the _ hack
  contract.initRules.passIn.forEach((autofield) => {
    contract_template += `\t\t${autofield} = _${autofield};\n`
  })

  //end init

  contract_template += `\t}\n`

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

	//XXX

	contract_template += `
function getTokenData() public view returns (bytes memory){
	    return abi.encodePacked(
        '{',
	`
  contract.readRules.gets.forEach((field) => {
          const type = contract.fields_types[field]

	  contract_template += ` '"${field}": "' , `
	  if(type == "address"){
		contract_template += `string(abi.encodePacked(${field}))`
	  }
	  else if(type == "uint"){
		  contract_template += `${field}.toString()`

	  } else if(type == "image" || type == "string"){
		  contract_template += `${field}`
	  }else{
		contract_template += `string(abi.encodePacked(${field}))`

	  }

	  contract_template += `, '",',\n`
  })
	contract_template += ` '}'); } `


  contract_template += `
    function getall() public view returns (address, ${get_all_types_string}){
        return (address(this), ${get_all_fields_string});
    }`

  contract.readRules.gets.forEach((field) => {
    const type = contract.fields_types[field]
    contract_template += `\tfunction get_${field}() public view returns (${type}){return ${field};}\n`
  })
  contract_template += `\n}`
	const contract_filename = `${ContractName}.sol`
const filePath = path.join(folder,contract_filename)
fs.writeFileSync(filePath, contract_template);
	template += `import "${contract_filename}";\n`
}

console.log( contracts)
console.log( Object.keys(contracts))
console.log( Object.keys(contracts).join(","))

template += `
contract App is ERC721 {\n

constructor() ERC721("MyToken", "MTK") {}

enum Contracts {` + Object.keys(contracts).join(",") + ` }

Contracts[] public nft_contracts;
address[] public nft_addresses;


function getTokenURI(uint256 tokenId) public view returns (string memory){
    Contracts nft_contract = nft_contracts[tokenId];
    address nft_address = nft_addresses[tokenId];

    bytes memory dataURI;
`
for (const ContractName in contracts) {
	template += `
	if(nft_contract == Contracts.${ContractName}){
		dataURI = ${ContractName}_contract(nft_address).getTokenData();
	}`
}

template += `
    return string(
        abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(dataURI)
        )
    );
    }
`

for (const ContractName in contracts) {
  const contract = contracts[ContractName]
  const fields = contract.fields
  template += `
  address[] ${ContractName}_list; 
  uint256 ${ContractName}_list_length;

function get_${ContractName}_list_length() public view returns (uint256){
    return ${ContractName}_list_length;
}`
  template += `struct ${ContractName}_getter{
        address _address;
        `
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
  function get_${ContractName}_N(uint256 index) public view returns (address, ${get_all_types_string}){
      return ${ContractName}_contract(${ContractName}_list[index]).getall();
  }


  function get_first_${ContractName}_N(uint256 count, uint256 offset) public view returns ( ${ContractName}_getter[] memory){
  ${ContractName}_getter[] memory getters = new ${ContractName}_getter[](count);
    `
  template += `for (uint i = offset; i < count; i++) {
        ${ContractName}_contract  my${ContractName} = ${ContractName}_contract(${ContractName}_list[i+offset]);
        getters[i-offset]._address = address(my${ContractName});
        `
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
        ${ContractName}_contract  my${ContractName} = ${ContractName}_contract(${ContractName}_list[${ContractName}_list_length-i-offset-1]);
        getters[i]._address = address(my${ContractName});

    `
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
      function get_${ContractName}_user_N(address user,uint256 index) public view returns (address, ${get_all_types_string}){
        return ${ContractName}_contract(user_map[user].${ContractName}_list[index]).getall();
    }


     
  function get_last_${ContractName}_user_N(address user,uint256 count, uint256 offset) public view returns ( ${ContractName}_getter[]  memory){
  ${ContractName}_getter[] memory getters = new ${ContractName}_getter[](count);

    `
  template += `for (uint i = offset; i < count; i++) {
getters[i-offset]._address = user_map[user].${ContractName}_list[i+offset];
    `
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





  `

  //get lenght of list
  template +=`
    function get_length_${parent_contract}_${reference_contract}_map(address hash) public view returns (uint256){
        return ${parent_contract}_${reference_contract}_map[hash].${parent_contract}_list.length;
    }

  `

  template += `
  function get_last_${parent_contract}_${reference_contract}_map_N(address hash, uint256 count, uint256 offset) public view returns ( ${parent_contract}_getter[] memory){
  ${parent_contract}_getter[] memory getters = new ${parent_contract}_getter[](count);
    `
  template += `for (uint i = 0; i < count; i++ ){ 
        ${parent_contract}_contract  my${parent_contract} = ${parent_contract}_contract(${parent_contract}_${reference_contract}_map[hash].${parent_contract}_list[${parent_contract}_${reference_contract}_map[hash].${parent_contract}_list.length -i-offset-1]);

      getters[i]._address = address(my${parent_contract});

    `
  contracts[parent_contract].readRules.gets.forEach((field) => {
    template += `getters[i].${field} = my${parent_contract}.get_${field}();`
  })
  template += `}
    return getters;
    }`







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
  `

  //unique map
  //    

    if(contract.writeRules.index.length > 0){


        template += `
              mapping(bytes32 => address) unique_map_${ContractName};  

              function get_unique_map_${ContractName} ( `

      contract.writeRules.index.forEach((indexField,index) =>{
                if(index +=0){
                  template += ','
                }
                template += ` ${contract.fields_types[indexField]} ${indexField} `
      });
                template +=`
              ) public view returns (address) {
                bytes32 hash_${ContractName} = keccak256(abi.encodePacked( `
      contract.writeRules.index.forEach((indexField,index) =>{
                if(index +=0){
                  template += ','
                }
                template += `  ${indexField} `
      });
                  template +=`));
                return unique_map_${ContractName}[hash_${ContractName}];
              }
        `
    }
  template += `

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

	uint256 tokenId = nft_contracts.length;
	nft_contracts.push(Contracts.${ContractName});

        _safeMint(msg.sender, tokenId);



    `
    //check if unique index and then revert if already exists
    // do the index stuff
    // for now assume each index is just a string, but over time we may want a tuple or any type, if there's other types we can likely optimize better too
    //
    if(contract.writeRules.index.length > 0){
        template += `
          bytes32 hash_${ContractName} = keccak256(abi.encodePacked(`
      contract.writeRules.index.forEach((indexField,index) =>{
                if(index +=0){
                  template += ','
                }
                template += `  ${indexField} `
      });
                  template +=`));

          require(unique_map_${ContractName}[hash_${ContractName}] == address(0));
        `
    }


    template += `
        
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

nft_addresses.push(mynew);

`


    //add to the unique index
    if(contract.writeRules.index.length > 0){
        template += `
          unique_map_${ContractName}[hash_${ContractName}]  = mynew;
        `
    }

//do the has one mapping stuff
if(contract_references[ContractName]){
contract_references[ContractName].forEach((reference_contract,index) => {

	const field_name = field_lookup[ContractName][reference_contract]

  template += `


 

  if(!${parent_contract}_${reference_contract}_map[${field_name}].exists){
    ${parent_contract}_${reference_contract}_map[${field_name}]=create_index_on_new_${parent_contract}_${reference_contract}();  
  }
  ${parent_contract}_${reference_contract}_map[${field_name}].${ContractName}_list.push(mynew);

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
  `

  for (const ContractName in contracts) {
    template += `
      address[] memory ${ContractName}_list_;
    `
  }

  template += `
    UserInfoList.push(addr);
    return UserInfo({exists:true, owner:addr,  
        
      
    `
  for (const ContractName in contracts) {
    template += `${ContractName}_list : ${ContractName}_list_, 
       ${ContractName}_list_length : 0,
    `
  }

  template += `});
}




`

if(contract_references[ContractName]){

  contract_references[ContractName].forEach((reference_contract,index) => {
  
    template += `
  
  function create_index_on_new_${parent_contract}_${reference_contract}() private pure returns (${parent_contract}_${reference_contract} memory){
    address[] memory tmp;
    return ${parent_contract}_${reference_contract}({exists:true, ${parent_contract}_list:tmp});
  } 
  `
  
  })
  }

}

template += '}'


const filePath = path.join(folder,'App.sol' );
fs.writeFileSync(filePath, template);


//todo create the parent contract and the events
