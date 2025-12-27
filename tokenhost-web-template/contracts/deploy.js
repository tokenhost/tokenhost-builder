const { execSync } = require('child_process');
const fs = require('fs');
const config = require('config');
const Handlebars = require('handlebars');

let network = process.argv.length > 2 ? process.argv[2] : "tokenhost";

// Load network configuration
const rpcUrl = config.get(`${network}.rpcUrl`);
const rpcWS = config.get(`${network}.rpcWS`);
const chainName = config.get(`${network}.chainName`);
const networkEnvKey = `${network}`.toUpperCase();
const envPrivateKey = process.env[`${networkEnvKey}_PRIVATE_KEY`] || process.env.PRIVATE_KEY;
const privateKey = envPrivateKey || (config.has(`${network}.privateKey`) ? config.get(`${network}.privateKey`) : null);

try {
    if (!privateKey) {
        throw new Error(`Missing private key for ${network}. Set ${networkEnvKey}_PRIVATE_KEY or PRIVATE_KEY.`);
    }

    console.log(`Deploying contract to ${network} (${rpcUrl})...`);

    // Execute forge create and parse output
    const output = execSync(
        `forge create --rpc-url ${rpcUrl} --private-key ${privateKey} site/contracts/App.sol:App --broadcast --json`,
        { encoding: 'utf-8' }
    );

    const deployedContract = JSON.parse(output);
    const contractAddress = deployedContract.deployedTo;

    console.log(`Contract deployed at: ${contractAddress}`);

    // Read Handlebars template
    const web3helperTemplate = Handlebars.compile(
        fs.readFileSync('./helpers/Web3Helper.hbs', 'utf-8')
    );

    // Get chain ID (optional if needed)
    const chainId = config.has(`${network}.chainId`) ? config.get(`${network}.chainId`) : null;

    // Generate Web3Helper.js
    const web3helperOutput = web3helperTemplate({
        contract_address: contractAddress,
        rpcUrl: rpcUrl,
        rpcWS: rpcWS,
        chainName: chainName,
        chainId: chainId
    });

    fs.writeFileSync(`./helpers/Web3Helper.js`, web3helperOutput);

    console.log("Web3Helper.js updated.");
    console.log("DONE");

} catch (error) {
    console.error("Deployment failed:", error.message);
}

