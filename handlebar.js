const Handlebars = require('handlebars')
const fs = require('fs')
let contracts = JSON.parse(fs.readFileSync('contracts.json'))

let index_template = fs.readFileSync(
  'tokenhost-web-template/pages/index.hbs',
  'utf-8',
)
Handlebars.registerHelper('checkImage', function (fieldObj, key) {
  return fieldObj[key] === "image"
})


Handlebars.registerHelper('unique_getters', function (contract, all_contracts) {
  var template = '';
  for(var field in contract.fields){
    if(field in all_contracts){
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

let ViewTemplate = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/components/View.hbs', 'utf-8'),
)

let PagerTemplate = Handlebars.compile(
  fs.readFileSync('tokenhost-web-template/components/Pager.hbs', 'utf-8'),
)

for (var contract in contracts.contracts) {
  const contract_data = contracts.contracts[contract]
  fs.writeFileSync(`site/pages/${contract}.js`, page_template({ contract }))

  try {
    fs.mkdirSync(`site/components/${contract}`, true)
  } catch (e) {}

  fs.writeFileSync(
    `site/components/${contract}/Add.js`,
    AddTemplate({ contract, contract_data, all_contracts:contracts.contracts }),
  )
  fs.writeFileSync(
    `site/components/${contract}/Index.js`,
    IndexTemplate({contract, contract_data }),
  )


  Handlebars.registerHelper('checkFieldIsImage', function ( key) {
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
