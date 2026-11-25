// `npm run build` runs this after Vite: the game's combat tables (src/data) as dev/balance/data.json for the balance model
// and the tests (ADR-0006). Committed together with the build; CI checks it matches.
import { writeFileSync } from 'node:fs';
import { DATA, DATA_HASH } from '../../src/data/index.js';

const out = new URL('../balance/data.json', import.meta.url);
const text = JSON.stringify({ hash: DATA_HASH, ...DATA }, null, 1)
  .replace(/\[\s*([^\[\]{}]*?)\s*\]/g, (m, inner) => '[' + inner.split(/,\s*/).join(', ') + ']');      // a list of plain values stays on one line
writeFileSync(out, text + '\n');
console.log(`data.json: ${Object.keys(DATA).length} tables, hash ${DATA_HASH}`);
