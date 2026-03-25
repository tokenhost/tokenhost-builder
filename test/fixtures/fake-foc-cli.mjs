#!/usr/bin/env node

const args = process.argv.slice(2);

if (args[0] === 'wallet' && args[1] === 'init') {
  process.stdout.write(JSON.stringify({ ok: true, initialized: true }));
  process.exit(0);
}

if (args[0] === 'upload') {
  const payload = {
    ok: true,
    result: {
      pieceCid: 'bafkqaaaafakecidfornetlifyuploadtest',
      size: 321,
      copyResults: [
        {
          url: 'https://calibration.example.invalid/piece/bafkqaaaafakecidfornetlifyuploadtest'
        }
      ]
    }
  };

  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

process.stderr.write(`Unexpected fake foc-cli args: ${args.join(' ')}\n`);
process.exit(1);
