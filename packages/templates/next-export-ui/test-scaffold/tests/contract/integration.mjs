import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import Web3 from 'web3';

const require = createRequire(import.meta.url);
const solc = require('solc');

const DEFAULT_RPC_URL = 'http://127.0.0.1:8545';
const DEFAULT_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function mustReadJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function mustReadText(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`);
  return fs.readFileSync(filePath, 'utf-8');
}

function compileApp(source) {
  const input = {
    language: 'Solidity',
    sources: {
      'App.sol': { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((e) => e.severity === 'error');
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.formattedMessage || e.message).join('\n'));
  }

  const app = output?.contracts?.['App.sol']?.App;
  if (!app?.abi || !app?.evm?.bytecode?.object) {
    throw new Error('Failed to compile App.sol (missing abi/bytecode).');
  }
  return { abi: app.abi, bytecode: `0x${app.evm.bytecode.object}` };
}

function sampleValue(field, idx, forUpdate, accountAddress) {
  const suffix = `${forUpdate ? 'u' : 'c'}-${idx}`;
  switch (field.type) {
    case 'string':
    case 'image':
      return `${field.name}-${suffix}`;
    case 'uint256':
    case 'reference':
    case 'decimal':
      return String(1000 + idx);
    case 'int256':
      return String(-100 - idx);
    case 'bool':
      return idx % 2 === 0;
    case 'address':
    case 'externalReference':
      return accountAddress;
    case 'bytes32':
      return `0x${'ab'.repeat(32)}`;
    default:
      throw new Error(`Unsupported field type for generated tests: ${field.type}`);
  }
}

async function mustFail(promiseFactory, expectedHint) {
  let failed = false;
  try {
    await promiseFactory();
  } catch (e) {
    failed = true;
    if (expectedHint) {
      const msg = String(e?.message ?? e);
      assert.match(msg, expectedHint, `Expected error hint ${expectedHint}, got: ${msg}`);
    }
  }
  assert.equal(failed, true, 'Expected operation to fail but it succeeded.');
}

async function main() {
  const root = process.cwd();
  const parent = path.resolve(root, '..');
  const schemaPath = path.join(parent, 'schema.json');
  const appSolPath = path.join(parent, 'contracts', 'App.sol');

  const schema = mustReadJson(schemaPath);
  const appSol = mustReadText(appSolPath);
  const { abi, bytecode } = compileApp(appSol);

  const rpcUrl = process.env.TH_RPC_URL || DEFAULT_RPC_URL;
  const privateKey = process.env.TH_TEST_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;
  const web3 = new Web3(rpcUrl);

  const listening = await web3.eth.net.isListening().catch(() => false);
  if (!listening) {
    throw new Error(`RPC is not reachable at ${rpcUrl}. Start anvil and retry.`);
  }

  const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  web3.eth.accounts.wallet.add(account);
  web3.eth.defaultAccount = account.address;

  const anyPaidCreates = (schema.collections || []).some((c) => Boolean(c?.createRules?.payment));
  const deployArgs = anyPaidCreates ? [account.address, account.address] : [];

  const app = await new web3.eth.Contract(abi)
    .deploy({ data: bytecode, arguments: deployArgs })
    .send({ from: account.address, gas: 8_000_000 });

  for (const collection of schema.collections || []) {
    const name = String(collection.name);
    const fields = Array.isArray(collection.fields) ? collection.fields : [];
    const mutable = Array.isArray(collection?.updateRules?.mutable) ? collection.updateRules.mutable : [];
    const softDelete = Boolean(collection?.deleteRules?.softDelete);
    const hasTransfer = Boolean(collection?.transferRules);
    const hasPayment = Boolean(collection?.createRules?.payment?.amountWei);
    const optimistic = Boolean(collection?.updateRules?.optimisticConcurrency);

    const createFn = `create${name}`;
    const listFn = `listIds${name}`;
    const getFn = `get${name}(uint256)`;
    const getWithDeletedFn = `get${name}(uint256,bool)`;
    const updateFn = `update${name}`;
    const deleteFn = `delete${name}`;
    const transferFn = `transfer${name}`;

    const createArgs = fields.map((f, idx) => sampleValue(f, idx, false, account.address));

    if (hasPayment) {
      await mustFail(() =>
        app.methods[createFn](...createArgs).send({ from: account.address, gas: 3_000_000 })
      );

      await app.methods[createFn](...createArgs).send({
        from: account.address,
        gas: 3_000_000,
        value: String(collection.createRules.payment.amountWei)
      });
    } else {
      await app.methods[createFn](...createArgs).send({ from: account.address, gas: 3_000_000 });
    }

    const ids = await app.methods[listFn](0, 20, false).call();
    assert.equal(Array.isArray(ids), true, `${listFn} must return an array`);
    assert.equal(ids.length > 0, true, `${listFn} must include created record`);
    const id = Number(ids[0]);

    const current = await app.methods[getFn](id).call();
    assert.ok(current, `${getFn} should return a record`);

    if (hasTransfer) {
      const accounts = await web3.eth.getAccounts();
      const to = accounts[1] || account.address;
      await app.methods[transferFn](id, to).send({ from: account.address, gas: 3_000_000 });
      const afterTransfer = await app.methods[getFn](id).call();
      assert.equal(
        String(afterTransfer.owner || '').toLowerCase(),
        String(to).toLowerCase(),
        `${transferFn} should update owner`
      );
    }

    if (mutable.length > 0) {
      const updateArgs = [id];
      for (const mutableFieldName of mutable) {
        const field = fields.find((f) => f?.name === mutableFieldName);
        if (!field) continue;
        updateArgs.push(sampleValue(field, 777, true, account.address));
      }
      if (optimistic) updateArgs.push('0');

      await app.methods[updateFn](...updateArgs).send({ from: account.address, gas: 3_000_000 });
      const afterUpdate = await app.methods[getFn](id).call();
      const firstMutable = mutable[0];
      const firstMutableField = fields.find((f) => f.name === firstMutable);
      if (firstMutable && firstMutable in afterUpdate && firstMutableField) {
        assert.equal(
          String(afterUpdate[firstMutable]),
          String(sampleValue(firstMutableField, 777, true, account.address)),
          `${updateFn} should update mutable field ${firstMutable}`
        );
      }
    }

    if (softDelete) {
      await app.methods[deleteFn](id).send({ from: account.address, gas: 3_000_000 });
      const deletedRecord = await app.methods[getWithDeletedFn](id, true).call();
      assert.equal(Boolean(deletedRecord.isDeleted), true, `${deleteFn} should mark isDeleted`);

      const activeIds = await app.methods[listFn](0, 20, false).call();
      const hasId = (activeIds || []).map((x) => String(x)).includes(String(id));
      assert.equal(hasId, false, `${listFn} should exclude soft-deleted record by default`);
    }
  }

  console.log('PASS contract integration scaffold');
}

main().catch((e) => {
  console.error(String(e?.stack || e?.message || e));
  process.exit(1);
});
