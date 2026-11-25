// Needs TypeScript 5 (see to_state.cjs). Moves one section of src/legacy.js (from its '  // ---------- <title>' line to the
// next one) into a module:  TS5=... node dev/tools/extract_section.cjs src/legacy.js "evil cubes" src/enemies/cubes.ts createCubes
//
//   * every name the section uses but legacy.js declares elsewhere becomes GAME.name inside it (scope-aware rename), and
//     legacy.js exposes it on GAME through a getter (the `expose(GAME, { ... })` block), so the module reads it when it runs;
//   * the section's own top-level names that the rest of the file uses are returned by the module, and legacy.js takes them
//     back where the section stood: `const { a, b } = createX(GAME);`
//   * imports the module needs (THREE, GS, data tables, other modules) are added from legacy.js's own import lines.
// It prints the names whose use outside the section comes before the section in the file and outside any function:
// those were hoisted function declarations, now they exist only from the section's place on.
const ts = require(process.env.TS5 || 'typescript'), fs = require('fs'), path = require('path');
const [file, title, outFile, fnName] = process.argv.slice(2);
let text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
let body; ts.forEachChild(sf, n => { if (!body && ts.isExpressionStatement(n)) { let e = n.expression; while (ts.isParenthesizedExpression(e) || ts.isCallExpression(e)) e = e.expression; if (ts.isArrowFunction(e)) body = e.body; } });
const heads = []; text.split('\n').reduce((pos, line) => { if (line.startsWith('  // ----------')) heads.push([pos, line]); return pos + line.length + 1; }, 0);
const hi = heads.findIndex(([, l]) => l.includes(title)); if (hi < 0) throw new Error('no such section');
const A = heads[hi][0], B = hi + 1 < heads.length ? heads[hi + 1][0] : (() => { throw new Error('last section: cut by hand'); })();
if (text.slice(A, B).includes('/* test-seam: debug registry */')) throw new Error('the debug registry marker is in this section: move it out of the section first (it must stay in legacy.js)');
const files = { [file]: text };
const host = { getScriptFileNames: () => [file], getScriptVersion: () => '1', getScriptSnapshot: f => files[f] !== undefined ? ts.ScriptSnapshot.fromString(files[f]) : undefined,
  getCurrentDirectory: () => '/', getCompilationSettings: () => ({ allowJs: true, noEmit: true, target: ts.ScriptTarget.ES2022 }), getDefaultLibFileName: o => ts.getDefaultLibFilePath(o),
  fileExists: f => f === file || ts.sys.fileExists(f), readFile: f => files[f] ?? ts.sys.readFile(f) };
const ls = ts.createLanguageService(host, ts.createDocumentRegistry());

const tops = [];
for (const st of body.statements) {
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
    if (ts.isIdentifier(d.name)) tops.push({ name: d.name.text, pos: d.name.getStart(), fn: false });
    else if (ts.isObjectBindingPattern(d.name) || ts.isArrayBindingPattern(d.name)) for (const e of d.name.elements) if (e.name && ts.isIdentifier(e.name)) tops.push({ name: e.name.text, pos: e.name.getStart(), fn: false });
  } else if (ts.isFunctionDeclaration(st) && st.name) tops.push({ name: st.name.text, pos: st.name.getStart(), fn: true, end: st.getEnd() });
}
// imports of legacy.js: their names count as available to the module through the same import line
const imports = [];
for (const st of sf.statements) if (ts.isImportDeclaration(st) && st.importClause) {
  const spec = st.moduleSpecifier.text, names = [];
  if (st.importClause.name) names.push(st.importClause.name.text);
  const nb = st.importClause.namedBindings; if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) names.push(e.name.text);
  imports.push({ spec, names, def: st.importClause.name ? st.importClause.name.text : null, named: nb && ts.isNamedImports(nb) ? nb.elements.map(e => e.getText(sf)) : [] });
}
const inFn = p => { let n = ts.getTokenAtPosition ? ts.getTokenAtPosition(sf, p) : null; while (n) { if (ts.isFunctionLike(n)) return true; n = n.parent; } return false; };

const uses = [], gives = [], hoistRisk = [], edits = [];
// names the test registry reads (dev/harness/names.txt) must stay reachable from legacy.js: hand them back too
const testNames = new Set((fs.readFileSync(path.join(path.dirname(file), '..', 'dev', 'harness', 'names.txt'), 'utf8').match(/[A-Za-z_$][\w$]*/g) || []));
for (const t of tops) {
  const refs = (ls.findRenameLocations(file, t.pos, false, false, { providePrefixAndSuffixTextForRename: true }) || []).filter(l => l.fileName === file);
  const inSec = t.pos >= A && t.pos < B;
  const inside = refs.filter(l => l.textSpan.start >= A && l.textSpan.start < B), outside = refs.filter(l => !(l.textSpan.start >= A && l.textSpan.start < B));
  if (!inSec && inside.length) {
    uses.push(t.name);
    for (const l of inside) edits.push({ start: l.textSpan.start, end: l.textSpan.start + l.textSpan.length, text: (l.prefixText || '') + 'GAME.' + t.name + (l.suffixText || '') });
  }
  if (inSec && !outside.length && testNames.has(t.name)) {
    const isLet = /^\s*(let|var)\b/.test(text.slice(text.lastIndexOf('\n', t.pos) + 1, t.pos));
    if (isLet) throw new Error(`${t.name}: a let the tests read; move it to GS first (to_state.cjs)`);
    gives.push(t.name);
  }
  if (inSec && outside.length) {
    if (/^\s*(let|var)\b/.test(text.slice(text.lastIndexOf('\n', t.pos) + 1, t.pos))) throw new Error(`${t.name}: a let/var the rest of the file uses; move it to GS first (to_state.cjs)`);
    gives.push(t.name);
    if (t.fn) for (const l of outside) if (l.textSpan.start < A && !inFn(l.textSpan.start)) hoistRisk.push(t.name);
  }
}
// imported names used inside the section
const secText0 = text.slice(A, B), modImports = [];
for (const im of imports) {
  const used = im.names.filter(n => new RegExp('(?<![.\\w$])' + n.replace('$', '\\$') + '\\b').test(secText0));
  if (!used.length) continue;
  const rel = path.relative(path.dirname(outFile), path.join(path.dirname(file), im.spec)).replace(/\\/g, '/');
  const spec = rel.startsWith('.') ? rel : './' + rel;
  const named = im.named.filter(x => used.includes(x.split(/\s+as\s+/).pop()));
  modImports.push(`import ${im.def && used.includes(im.def) ? im.def + (named.length ? ', ' : '') : ''}${named.length ? '{ ' + named.join(', ') + ' }' : ''} from '${spec}';`);
}
edits.sort((a, b) => b.start - a.start);
for (const e of edits) text = text.slice(0, e.start) + e.text + text.slice(e.end);
const shift = edits.reduce((s, e) => s + e.text.length - (e.end - e.start), 0);
const sec = text.slice(A, B + shift);
const lines = sec.replace(/\n$/, '').split('\n');
const header = lines[0].trim();
const code = lines.slice(1).join('\n');
const mod = `// ${header.replace(/^\/\/\s*/, '')}\n// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.\n`
  + modImports.join('\n') + (modImports.length ? '\n' : '') + `\nexport function ${fnName}(GAME) {\n${code}\n  return { ${gives.join(', ')} };\n}\n`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, mod);
const call = `  // ${header.replace(/^\/\/\s*/, '')} -> ${outFile.replace(/^src\//, 'src/')}\n  const { ${gives.join(', ')} } = ${fnName}(GAME);\n\n`;
text = text.slice(0, A) + call + text.slice(B + shift);
// the import of the module, and the getters on GAME for what it uses
const modSpec = './' + path.relative(path.dirname(file), outFile).replace(/\\/g, '/');
const lastImport = [...text.matchAll(/^import .*;$/gm)].pop();
text = text.slice(0, lastImport.index + lastImport[0].length) + `\nimport { ${fnName} } from '${modSpec}';` + text.slice(lastImport.index + lastImport[0].length);
const mark = '  // GAME: what the modules taken out of this file use from it, read when they run (dev/tools/extract_section.cjs adds to it)\n';
if (!text.includes(mark)) {
  const at = text.indexOf('(() => {\n') + '(() => {\n'.length;
  text = text.slice(0, at) + mark + '  const GAME = {};\n  expose(GAME, {\n  });\n' + text.slice(at);
  text = text.replace("import { GS } from './game/state.ts';", "import { GS, expose } from './game/state.ts';");
}
const blockEnd = text.indexOf('\n  });\n', text.indexOf(mark)) + 1;
const have = new Set([...text.slice(text.indexOf(mark), blockEnd).matchAll(/^    (\w+): \(\) =>/gm)].map(m => m[1]));
const add = uses.filter(n => !have.has(n)).map(n => `    ${n}: () => ${n},\n`).join('');
text = text.slice(0, blockEnd) + add + text.slice(blockEnd);
fs.writeFileSync(file, text);
console.log(`${header}\n  -> ${outFile}: ${sec.split('\n').length} lines\n  uses ${uses.length}: ${uses.join(' ')}\n  gives ${gives.length}: ${gives.join(' ')}\n  imports: ${modImports.length}`);
if (hoistRisk.length) console.log('  HOIST RISK (used before the section, outside functions): ' + [...new Set(hoistRisk)].join(' '));
