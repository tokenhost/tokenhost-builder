
let network = "tokenhost"
if(process.argv.length > 1){
  network = process.argv[2]
}


const fs = require('fs');
const Web3 = require('web3');
const config = require('config');

const rpcUrl =  config.get(network+".rpcUrl")
const rpcWS =  config.get(network+".rpcWS")
const chainName  =  config.get(network+".chainName")

const web3 = new Web3( config.get(network+".rpcUrl"))
const Handlebars = require('handlebars')
const Tx = require('ethereumjs-tx')
const SignerProvider = require('ethjs-provider-signer')


const bytecode = fs.readFileSync('contracts/App_sol_App.bin','utf8');
var abi = JSON.parse(fs.readFileSync('contracts/App_sol_App.abi', 'utf8'));

async function main(){

  var account;
  if(config.has(network+".privateKey")){
    const privateKey =  config.get(network+".privateKey")
    account = web3.eth.accounts.privateKeyToAccount(privateKey)
  }else{
    account = web3.eth.accounts.create();
  }
  web3.eth.accounts.wallet.add(account.privateKey);
  web3.eth.defaultAccount = account.address;
    var localprovider = new SignerProvider(config.get(network+".rpcUrl"), {
      signTransaction: (rawTx, cb) => cb(null, sign(rawTx, account.privateKey)),
      accounts: (cb) => cb(null, [account.address]),
    })
    web3.setProvider(localprovider)

    web3.eth.accounts.wallet.add(account)
    web3.eth.defaultAccount = account.address

  const chainId = web3.eth.getChainId();


  const ganacheAccounts = await web3.eth.getAccounts();
  const helloWorld = new web3.eth.Contract(abi);
    helloWorld.options.from = account.address

	console.log("bytecode: ", bytecode)
  const gas = await helloWorld.deploy({ data: bytecode }).estimateGas()
  console.log(gas)
  const gasPrice = await web3.eth.getGasPrice()
  console.log(gasPrice)

  console.log(account)
  var tx = {}
  if(network != "tokenhost"){
    tx = {
      from: ganacheAccounts[0],
      gas:gas,
      maxFeePerGas:gasPrice,
      maxPriorityFeePerGas:gasPrice
    }
  }else{
    tx = {
      from: ganacheAccounts[0],
      gas:gas
    }
  }

  helloWorld.deploy({
    data: bytecode
  }).send(tx).then((deployment) => {
    console.log('Contract was deployed at the following address:');
    console.log(deployment.options.address);
    
    let web3helper_template = Handlebars.compile(
      fs.readFileSync('./helpers/Web3Helper.hbs', 'utf-8'),
    )


  fs.writeFileSync(
    `./helpers/Web3Helper.js`,
    web3helper_template({ contract_address:deployment.options.address, rpcUrl: rpcUrl, rpcWS: rpcWS, chainName: chainName, chainId: chainId}),
  )


  }).catch((err) => {
    console.error(err);
  });
}

main().then(function(){
  console.log("DONE")
})

//Contract was deployed at the following address:
//0xbd6959D258c24b0922505859E6aCAA700858f18e
