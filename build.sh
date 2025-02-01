set -eux

cp  -r config tokenhost-web-template/

node solidityGenerator.js > tokenhost-web-template/contracts/App.sol
npx prettier --write 'tokenhost-web-template/contracts/App.sol'
(cd tokenhost-web-template/contracts; npx solcjs --optimize --overwrite --bin --abi -o . App.sol;
cp App.abi App_sol_App.json
)

#build site

rm -rf site
cp -r tokenhost-web-template site
(
cd site
yarn
yarn add sass #todo automate this

)


node handlebar.js


(
cd site/
#node contracts/deploy.js hyperspace
node contracts/deploy.js tokenhost
)

#cd site;
#yarn run dev
