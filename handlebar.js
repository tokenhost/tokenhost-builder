const Handlebars = require('handlebars')
const fs = require('fs')
let contracts = JSON.parse(fs.readFileSync('contracts.json'))


function strip_special_characters(mystring){
    return mystring.replace(/[^\w\s]/gi, '').split(" ").join("_")
}


//strip special characters and replace spaces with _
for (const ContractName in contracts.contracts) {
  const clean_contract_name = strip_special_characters(ContractName);
  console.error("clean name", clean_contract_name);
  if(clean_contract_name != ContractName){
    contracts.contracts[clean_contract_name] = contracts.contracts[ContractName]
    delete contracts.contracts[ContractName]
  }
}

for (const ContractName in contracts.contracts) {
  const contract = contracts.contracts[ContractName]
  let fields = contract.fields
  for(var field in fields){
    const clean_field_name = strip_special_characters(field);
    if(clean_field_name != field){
            fields[clean_field_name] = fields[field]
            delete fields[field];
    }
  }
  contract['initRules']['passIn'] = contract['initRules']['passIn'].map(strip_special_characters)
  contract['readRules']['gets'] = contract['readRules']['gets'].map(strip_special_characters)

console.error('pass in stuff', contract);

}


let index_template = fs.readFileSync(
  'tokenhost-web-template/pages/index.hbs',
  'utf-8',
)
Handlebars.registerHelper('checkImage', function (fieldObj, key) {
  console.log("start")
  console.log(fieldObj[key] === "image")
  console.log("end")
  return fieldObj[key] === "image"
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

let ViewTemplate = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/components/View.hbs', 'utf-8'),
)

let PagerTemplate = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/components/Pager.hbs', 'utf-8'),
)

for (var contract in contracts.contracts) {
  console.log('c', contract)
  const contract_data = contracts.contracts[contract]
  console.log(contract_data)
  fs.writeFileSync(`site/pages/${contract}.js`, page_template({ contract }))

  try {
    fs.mkdirSync(`site/components/${contract}`, true)
  } catch (e) {}

  fs.writeFileSync(
    `site/components/${contract}/Add.js`,
    AddTemplate({ contract, contract_data }),
  )
  fs.writeFileSync(
    `site/components/${contract}/Index.js`,
    IndexTemplate({contract, contract_data }),
  )


  Handlebars.registerHelper('checkFieldIsImage', function ( key) {
    console.log("checkFieldIsImage",contract_data.fields[key] === "image",contract_data.fields[key],key)
     return contract_data.fields[key] == "image"
  })
  fs.writeFileSync(
    `site/components/${contract}/View.js`,
    ViewTemplate({ contract, contract_data }),
  )

  Handlebars.unregisterHelper('checkFieldIsImage')

  fs.writeFileSync(
    `site/components/${contract}/Pager.js`,
    PagerTemplate({ contract, contract_data }),
  )
}
