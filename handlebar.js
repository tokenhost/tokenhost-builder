//duplicated in index.js
function make_contract_references(contracts){
  var contract_references = {}
  var reverse_contract_references = {}
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
        if(!reverse_contract_references[type]){
          reverse_contract_references[type] = []
        }
        contract_references[ContractName].push(type)
        reverse_contract_references[type].push(ContractName)
      }

    }
  }
  return [contract_references, reverse_contract_references]
}



const Handlebars = require('handlebars')
const fs = require('fs')
let contracts = JSON.parse(fs.readFileSync('contracts.json'))

const [contract_references, reverse_contract_references] = make_contract_references(contracts.contracts);
console.log(contract_references)

let index_template = fs.readFileSync(
  'tokenhost-web-template/pages/index.hbs',
  'utf-8',
)
Handlebars.registerHelper('checkImage', function (fieldObj, key) {
  return fieldObj[key] === "image"
})

Handlebars.registerHelper('eq', (a, b) =>{ 
  console.log("eq",a,b, a==b);
  return a == b;
})


Handlebars.registerHelper('unique_getters', function (contract, all_contracts, reference_contract) {
  var template = '';
  for(var field in contract.fields){
    if(field in all_contracts && field != reference_contract){
      template += `
            ${field}_value = await contract.methods.get_unique_map_${field}( ${field}).call();
            set${field}(${field}_value);

      `
    }
  }
  return template
})

Handlebars.registerHelper('add_value', function (values) {
  var ret = []
  values.forEach((value) =>{
    ret.push( value + "_value");

  })
  return ret;
})

const template = Handlebars.compile(index_template)

fs.writeFileSync('site/pages/index.js', template(contracts))




let user_page_template = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/pages/user.hbs', 'utf-8'),
)

fs.writeFileSync('site/pages/user.js', user_page_template(contracts))

let nav_template = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/components/Nav.hbs', 'utf-8'),
)

fs.writeFileSync('site/components/Nav.js', nav_template(contracts))

let page_template = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/pages/contract.hbs', 'utf-8'),
)

let AddTemplate = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/components/Add.hbs', 'utf-8'),
)

let IndexTemplate = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/components/Index.hbs', 'utf-8'),
)

let UniqueTemplate = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/pages/unique.hbs', 'utf-8'),
)

let UniqueTemplateIndex = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/components/Unique.hbs', 'utf-8'),
)

let ViewTemplate = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/components/View.hbs', 'utf-8'),
)

let PagerTemplate = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/components/Pager.hbs', 'utf-8'),
)



for (var contract in contracts.contracts) {
  const contract_data = contracts.contracts[contract]
  var reference_contract = contract_references[contract];
  if(reference_contract){
    reference_contract = reference_contract.toString();
  }

  fs.writeFileSync(`site/pages/${contract}.js`, page_template({ contract }))

  try {
    fs.mkdirSync(`site/components/${contract}`, true)
  } catch (e) {}

  fs.writeFileSync(
    `site/components/${contract}/Add.js`,
    AddTemplate({ contract,  contract_data, all_contracts:contracts.contracts }),
  )
  fs.writeFileSync(
    `site/components/${contract}/Index.js`,
    IndexTemplate({contract, contract_data, reference_contract }),
  )


  Handlebars.registerHelper('checkFieldIsImage', function ( key) {
     return contract_data.fields[key] == "image"
  })
  var this_reverse_references = reverse_contract_references[contract];
  if(!this_reverse_references){
    this_reverse_references = []
  }
  fs.writeFileSync(
    `site/components/${contract}/View.js`,
    ViewTemplate({ contract, contract_data, reference_contract, this_reverse_references }),
  )

  Handlebars.unregisterHelper('checkFieldIsImage')

  fs.writeFileSync(
    `site/components/${contract}/Pager.js`,
    PagerTemplate({ contract, contract_data }),
  )
}

//contracts that reference other contracts
for (parent_contract in contract_references) {
    const reference_contract = contract_references[parent_contract];
    const filename = `${parent_contract}${reference_contract}`
    const contract_data = contracts.contracts[parent_contract]
    fs.writeFileSync(
      `site/pages/${filename}.js`,
      UniqueTemplate({parent_contract, reference_contract }),
    )

    const componentfilename = `${parent_contract}/Index${reference_contract}`

    fs.writeFileSync(
      `site/components/${componentfilename}.js`,
      UniqueTemplateIndex({parent_contract, reference_contract }),
   )

  console.log(reference_contract, filename)

  fs.writeFileSync(
    `site/components/${parent_contract}/AddIndex.js`,
    AddTemplate({ contract:parent_contract, reference_contract:reference_contract, contract_data, all_contracts:contracts.contracts }),
  )


}

