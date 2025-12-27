set -eux
for json in $(ls *.json); do
  solname=$(basename $json .json).sol
  node ../solidityGenerator.js $json > $solname
done
