set -eux
for json in $(ls *.json); do
  cp $json ../contracts.json
  solname=$(basename $json .json).sol
  rm $solname
  node ../index.js > $solname
  npx prettier --write $solname

done
