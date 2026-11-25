// Vite plugin for `vite build --mode test` (vite.config.js loads it only in that mode): puts the debug registry window.__dbg
// at the `/* test-seam: debug registry */` marker in src/legacy.js. The registry reads the names in names.txt live through getters,
// so a test can read and set the game's variables from outside. Names a module exports will register themselves there later (ADR-0008).
import { readFileSync } from 'node:fs';

const MARK = '/* test-seam: debug registry */';

export function registry(namesFile) {
  const members = [], names = [];
  for (const raw of readFileSync(namesFile, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) members.push(line.slice(1).trim());
    else if (line.startsWith('rw ')) { const n = line.slice(3).trim(); names.push(n); members.push(`get ${n}(){return ${n}}, set ${n}(v){${n}=v}`); }
    else if (line.includes('=')) { const [k, ...v] = line.split('='); names.push(k.trim()); members.push(`get ${k.trim()}(){return ${v.join('=').trim()}}`); }
    else { names.push(line); members.push(`get ${line}(){return ${line}}`); }
  }
  const dup = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (dup.length) throw new Error(`names.txt lists these twice: ${dup.join(', ')}`);
  const check = `__names: ${JSON.stringify(names)}, __check(){ const bad = []; for (const n of this.__names) { try { void this[n]; } catch (e) { bad.push(n); } } return bad; }`;
  return { code: `window.__dbg = { ${members.join(', ')}, ${check} };`, count: names.length };
}

export default function testSeams(namesFile) {
  return {
    name: 'chubz-test-seams',
    transform(code, id) {
      if (!id.endsWith('/src/legacy.js')) return null;
      const n = code.split(MARK).length - 1;
      if (n !== 1) throw new Error(`the debug registry marker is in src/legacy.js ${n} times, expected once`);
      return { code: code.replace(MARK, registry(namesFile).code), map: null };
    },
  };
}
