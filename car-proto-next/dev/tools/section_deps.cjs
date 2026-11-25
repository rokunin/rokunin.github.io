// Needs TypeScript 5 (see to_state.cjs). For one section of legacy.js (from its '  // ---------- <title>' line to the next one):
// which top-level names declared elsewhere it uses (what a module made of it must be given), and which of its own
// top-level names the rest of the file uses (what it must hand back).   TS5=... node dev/tools/section_deps.cjs src/legacy.js "evil cubes"
const ts = require(process.env.TS5 || 'typescript'), fs = require('fs');
const [file, title] = process.argv.slice(2), text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
let body; ts.forEachChild(sf, n => { if (!body && ts.isExpressionStatement(n)) { let e = n.expression; while (ts.isParenthesizedExpression(e) || ts.isCallExpression(e)) e = e.expression; if (ts.isArrowFunction(e)) body = e.body; } });
const heads = []; text.split('\n').reduce((pos, line) => { if (line.startsWith('  // ----------')) heads.push([pos, line]); return pos + line.length + 1; }, 0);
const i = heads.findIndex(([, l]) => l.includes(title)); if (i < 0) throw new Error('no such section');
const A = heads[i][0], B = i + 1 < heads.length ? heads[i + 1][0] : body.end;
const files = { [file]: text };
const host = { getScriptFileNames: () => [file], getScriptVersion: () => '1', getScriptSnapshot: f => files[f] !== undefined ? ts.ScriptSnapshot.fromString(files[f]) : undefined,
  getCurrentDirectory: () => '/', getCompilationSettings: () => ({ allowJs: true, noEmit: true, target: ts.ScriptTarget.ES2022 }), getDefaultLibFileName: o => ts.getDefaultLibFilePath(o),
  fileExists: f => f === file || ts.sys.fileExists(f), readFile: f => files[f] ?? ts.sys.readFile(f) };
const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
const tops = [];                                   // [name, declPos]
for (const st of body.statements) {
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) tops.push([d.name.text, d.name.getStart()]); else if (ts.isObjectBindingPattern(d.name)) for (const e of d.name.elements) tops.push([e.name.text, e.name.getStart()]); }
  else if (ts.isFunctionDeclaration(st) && st.name) tops.push([st.name.text, st.name.getStart()]);
}
const uses = [], gives = [];
for (const [name, pos] of tops) {
  const refs = (ls.findRenameLocations(file, pos, false, false) || []).map(l => l.textSpan.start);
  const inside = refs.filter(p => p >= A && p < B).length, outside = refs.length - inside;
  if (pos >= A && pos < B) { if (outside > 0) gives.push(`${name}(${outside})`); }
  else if (inside > 0) uses.push(`${name}(${inside})`);
}
console.log(`${heads[i][1].trim()}\n  lines: ${text.slice(A, B).split('\n').length}\n  uses (${uses.length}): ${uses.join(' ')}\n  gives (${gives.length}): ${gives.join(' ')}`);
