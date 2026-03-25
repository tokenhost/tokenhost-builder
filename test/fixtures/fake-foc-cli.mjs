#!/usr/bin/env node

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
