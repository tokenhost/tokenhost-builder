set -eux

cp  -r config tokenhost-web-template/

node index.js > tokenhost-web-template/contracts/App.sol
npx prettier --write 'tokenhost-web-template/contracts/App.sol'
(cd tokenhost-web-template/contracts; solcjs --optimize --bin --abi -o . App.sol; 
cp App_sol_App.abi App_sol_App.json
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
node contracts/deploy.js hyperspace
#node contracts/deploy.js tokenhost
)

#cd site;
#yarn run dev
