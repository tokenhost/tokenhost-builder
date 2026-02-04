import Web3 from 'web3'
import { fetchUserItems } from '../lib/utility'
const SignerProvider = require('ethjs-provider-signer')

const EC = require('elliptic').ec
const ec = new EC('secp256k1')

import abi from '../contracts/App_sol_App.json'

export const w3 = new Web3('http://127.0.0.1:8545')
export const w3ws = new Web3('ws://127.0.0.1:8545')

// This file is overwritten by `tokenhost-web-template/contracts/deploy.js` in the generated `site/`.
// Keep a placeholder here for template/dev ergonomics.
const contract_address = '0x0000000000000000000000000000000000000000'

// Always provide a read-capable contract; this binding is updated when a wallet connects.
export let contract = new w3.eth.Contract(abi, contract_address)
export const contractws = new w3ws.eth.Contract(abi, contract_address)

// Lazily initialized MetaMask-backed web3 (for writes).
let walletWeb3 = undefined

async function isCorrectChain(wallet = walletWeb3) {
  if (!wallet) return true
  const rpcChainId = await w3.eth.getChainId()
  const walletChainId = await wallet.eth.getChainId()
  return rpcChainId == walletChainId
}

async function addChain() {
  const chainId = w3.utils.numberToHex(await w3.eth.getChainId())
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainId }],
    })
  } catch (err) {
    // This error code indicates that the chain has not been added to MetaMask
    if (err && err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            rpcUrls: ['http://127.0.0.1:8545'],
            chainName: 'Anvil',
            chainId: chainId,
          },
        ],
      })
    }
  }
}

async function ensureWalletWeb3() {
  // Check if MetaMask is installed
  if (!window.ethereum) {
    window.alert('Please install MetaMask first.')
    return null
  }

  if (!walletWeb3) {
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' })
      walletWeb3 = new Web3(window.ethereum)
    } catch (error) {
      window.alert('You need to allow MetaMask.')
      return null
    }
  }

  const chain_correct = await isCorrectChain(walletWeb3)
  if (!chain_correct) {
    await addChain()
  }

  // Rebind the exported contract to the MetaMask provider for sends.
  contract = new walletWeb3.eth.Contract(abi, contract_address)

  return walletWeb3
}

async function metaMaskLogin() {
  const wallet = await ensureWalletWeb3()
  if (!wallet) return

  const accounts = await wallet.eth.getAccounts()
  const addr = accounts && accounts[0]
  if (!addr) {
    window.alert('Please activate MetaMask first.')
    return
  }
  return addr.toLowerCase()
}

async function getMetamaskAddress() {
  const wallet = await ensureWalletWeb3()
  if (!wallet) return

  const accounts = await wallet.eth.getAccounts()
  const addr = accounts && accounts[0]
  if (!addr) {
    window.alert('Please activate MetaMask first.')
    return
  }
  return addr.toLowerCase()
}

function setupAccounts() {
  fetchUserItems('keys').then((key) => {
    if (!key || !key.auth || !key.status) {
      return
    }
    const ethPrivKey = key.keyData.key

    const me = w3ws.eth.accounts.privateKeyToAccount(ethPrivKey)
    const address = me.address
    const privateKey = me.privateKey

    const account = w3.eth.accounts.privateKeyToAccount(privateKey)

    const localprovider = new SignerProvider('http://127.0.0.1:8545', {
      signTransaction: (rawTx, cb) => {
        w3.eth.accounts
          .signTransaction(rawTx, privateKey)
          .then((signed) => cb(null, signed.rawTransaction))
          .catch((error) => cb(error))
      },
      accounts: (cb) => cb(null, [address]),
    })
    w3.setProvider(localprovider)

    w3.eth.accounts.wallet.add(account)
    w3.eth.defaultAccount = account.address

    // Rebind the exported contract to the signer-enabled provider.
    contract = new w3.eth.Contract(abi, contract_address)
    contract.options.from = account.address

    localStorage.setItem('ACCOUNT', account.address)
  })
}

function generateKeys() {
  const privateKey = w3.utils.randomHex(32)
  const key = privateKey.toString('hex')
  const ephemPrivKey = ec.keyFromPrivate(privateKey)
  const ephemPubKey = ephemPrivKey.getPublic()
  const pub = Buffer.from(ephemPubKey.encode()).toString('hex')
  const address = w3.eth.accounts.privateKeyToAccount(privateKey).address
  return { pub, key, address }
}

export {
  generateKeys,
  contract,
  contractws,
  setupAccounts,
  getMetamaskAddress,
  isCorrectChain,
  addChain,
  metaMaskLogin,
}

