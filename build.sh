set -eux

node index.js > tokenhost-web-template/contracts/App.sol
npx prettier --write 'tokenhost-web-template/contracts/App.sol'
(cd tokenhost-web-template/contracts; solcjs --optimize --bin --abi -o . App.sol; cp App_sol_App.abi App_sol_App.json)

#build site

rm -rf site
cp -r tokenhost-web-template site
(
cd site
yarn)


node handlebar.js


(
cd site/contracts/
node deploy.js
)

#cd site;
#yarn run dev
