import fs from 'fs';

export function loadThsJsonSchema(): unknown {
  const schemaUrl = new URL('../schemas/tokenhost-ths.schema.json', import.meta.url);
  const raw = fs.readFileSync(schemaUrl, 'utf-8');
  return JSON.parse(raw);
}

