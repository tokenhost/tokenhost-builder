import Web3 from 'web3'
import { fetchUserItems } from '../lib/utility'
const SignerProvider = require('ethjs-provider-signer')

const EC = require('elliptic').ec
const ec = new EC('secp256k1')

export var w3 = new Web3('http://127.0.0.1:8545')
export var w3ws = new Web3('ws://127.0.0.1:8545')
const contract_address = '0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44'
let web3 = undefined; // Will hold the web3 instance
let contract = undefined // hold instance

import abi from '../contracts/App_sol_App.json'
const contractws = new w3ws.eth.Contract(abi, contract_address)


async function isCorrectChain(){
  const mm_chainid = await w3.eth.getChainId()
  const rpc_chainid = await web3.eth.getChainId()
  return mm_chainid == rpc_chainid;
}

async function addChain(){
  const chainId = w3.utils.numberToHex( await w3.eth.getChainId())
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainId }]
    });
  }catch(err){
    // This error code indicates that the chain has not been added to MetaMask
    if (err.code === 4902) {
      await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        rpcUrls: ['http://127.0.0.1:8545'],
        chainName: 'Anvil',
        chainId: chainId
      }]
      });
    }
  }
}




async function metaMaskLogin(){

    // Check if MetaMask is installed
    if (!(window).ethereum) {
      window.alert('Please install MetaMask first.');
      return;
    }

    if (!web3) {
      try {
        // Request account access if needed
        await (window).ethereum.enable();

        // We don't know window.web3 version, so we use our own instance of Web3
        // with the injected provider given by MetaMask
        web3 = new Web3((window).ethereum);
      } catch (error) {
        window.alert('You need to allow MetaMask.');
        return;
      }
    }

    const chain_correct = await isCorrectChain();
    console.log("chain_correct", chain_correct)
    if(!chain_correct){
      await addChain()
    }

    const coinbase = await web3.eth.getCoinbase();
    if (!coinbase) {
      window.alert('Please activate MetaMask first.');
      return;
    }
    const publicAddress = coinbase.toLowerCase();
    contract = new web3.eth.Contract(abi, contract_address) //xxx sneaky place to put this need better set up
    return publicAddress
}

async function getMetamaskAddress(){
    // Check if MetaMask is installed
    if (!(window).ethereum) {
      window.alert('Please install MetaMask first.');
      return;
    }

    if (!web3) {
      try {
        // Request account access if needed
        await (window).ethereum.enable();

        // We don't know window.web3 version, so we use our own instance of Web3
        // with the injected provider given by MetaMask
        web3 = new Web3((window).ethereum);
      } catch (error) {
        window.alert('You need to allow MetaMask.');
        return;
      }
    }

    const coinbase = await web3.eth.getCoinbase();
    if (!coinbase) {
      window.alert('Please activate MetaMask first.');
      return;
    }
    const publicAddress = coinbase.toLowerCase();
    contract = new web3.eth.Contract(abi, contract_address) //xxx sneaky place to put this need better set up
    return publicAddress

}

function setupAccounts() {
  fetchUserItems('keys').then((key) => {
    
    if (!key || !key.auth || !key.status) {
      return
    }
    const ethPrivKey = key.keyData.key

    var me = w3ws.eth.accounts.privateKeyToAccount(ethPrivKey)

    const address = me.address

    const privateKey = me.privateKey

    const account = w3.eth.accounts.privateKeyToAccount(privateKey)

    var localprovider = new SignerProvider('http://127.0.0.1:8545', {
      signTransaction: (rawTx, cb) => {
        w3.eth.accounts
          .signTransaction(rawTx, privateKey)
          .then((signed) => cb(null, signed.rawTransaction))
          .catch((error) => cb(error));
      },
      accounts: (cb) => cb(null, [address]),
    })
    w3.setProvider(localprovider)

    w3.eth.accounts.wallet.add(account)
    w3.eth.defaultAccount = account.address
    contract.options.from = account.address
    localStorage.setItem('ACCOUNT', account.address)
  })
}

function generateKeys() {
  var privateKey = w3.utils.randomHex(32)
  const key = privateKey.toString('hex')
  const ephemPrivKey = ec.keyFromPrivate(privateKey)
  const ephemPubKey = ephemPrivKey.getPublic()
  const pub = Buffer.from(ephemPubKey.encode()).toString('hex')
  const address = w3.eth.accounts.privateKeyToAccount(privateKey).address
  return { pub, key, address }
}

export { generateKeys, contract, contractws, setupAccounts, getMetamaskAddress, isCorrectChain, addChain, metaMaskLogin }
