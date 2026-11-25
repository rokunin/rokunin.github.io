// Needs TypeScript 5 (TypeScript 7 has no JS API): npm i --prefix /tmp/ts5 typescript@5.9, then TS5=/tmp/ts5/node_modules/typescript node dev/tools/to_state.cjs src/legacy.js name ...
// Move top-level `let` variables of src/legacy.js into the shared state object S (ADR-0003: imports cannot be reassigned,
// so state that several modules change lives on an object). Every reference becomes S.name, found by TypeScript's rename
// (scope-aware: locals and properties with the same name stay). The declaration `let a = 1, b = 2` becomes `S.b = 2` in place.
//   node to_state.js <legacy.js> name1 name2 ...
const ts = require(process.env.TS5 || 'typescript');
const fs = require('fs');
const [file, ...names] = process.argv.slice(2);
let text = fs.readFileSync(file, 'utf8');

function service(src) {
  const files = { [file]: src };
  const host = {
    getScriptFileNames: () => [file], getScriptVersion: () => '1', getScriptSnapshot: f => files[f] !== undefined ? ts.ScriptSnapshot.fromString(files[f]) : undefined,
    getCurrentDirectory: () => '/', getCompilationSettings: () => ({ allowJs: true, checkJs: false, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }),
    getDefaultLibFileName: o => ts.getDefaultLibFilePath(o), fileExists: f => f === file || ts.sys.fileExists(f), readFile: f => files[f] ?? ts.sys.readFile(f),
  };
  return ts.createLanguageService(host, ts.createDocumentRegistry());
}

for (const name of names) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  // the IIFE body: the top-level arrow function's block
  let body = null;
  ts.forEachChild(sf, n => { if (!body && ts.isExpressionStatement(n)) { let e = n.expression; while (ts.isParenthesizedExpression(e) || ts.isCallExpression(e)) e = ts.isCallExpression(e) ? e.expression : e.expression; if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) body = e.body; } });
  if (!body) throw new Error('no IIFE body');
  let decl = null, stmt = null;
  for (const st of body.statements) if (ts.isVariableStatement(st) && (st.declarationList.flags & ts.NodeFlags.Let))
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) { decl = d; stmt = st; }
  if (!decl) throw new Error(`top-level let ${name} not found`);
  const ls = service(text);
  const locs = ls.findRenameLocations(file, decl.name.getStart(), false, false, { providePrefixAndSuffixTextForRename: true }) || [];
  const declStart = decl.name.getStart();
  const edits = [];
  for (const l of locs) {
    if (l.fileName !== file || l.textSpan.start === declStart) continue;
    edits.push({ start: l.textSpan.start, end: l.textSpan.start + l.textSpan.length, text: (l.prefixText || '') + 'GS.' + name + (l.suffixText || '') });
  }
  // the declaration: drop it from the let list and write `S.name = init;` where the statement was
  const decls = stmt.declarationList.declarations;
  const init = decl.initializer ? decl.initializer.getText(sf) : 'undefined';
  const rest = decls.filter(d => d !== decl);
  const lead = text.slice(stmt.getStart(), stmt.getStart());      // nothing; kept for clarity
  let replacement;
  const stmtEnd = stmt.getEnd();
  if (!rest.length) replacement = `GS.${name} = ${init};`;
  else {
    // keep the others in their own `let`, then the state line
    const restText = rest.map(d => d.getText(sf)).join(', ');
    replacement = `let ${restText}; GS.${name} = ${init};`;
  }
  edits.push({ start: stmt.getStart(), end: stmtEnd, text: replacement });
  // the initializer of the removed declaration may itself contain references to other names being renamed later: fine, later passes re-parse
  edits.sort((a, b) => b.start - a.start);
  // rename locations inside the statement's own text (other declarators' initialisers) would overlap the replacement: skip them,
  // but they were re-rendered from the original text, so re-run the rename for safety by asserting none exist
  const inside = edits.filter(e => e.text !== replacement && e.start >= stmt.getStart() && e.end <= stmtEnd);
  if (inside.length) throw new Error(`${name}: referenced inside its own let statement; split it by hand first`);
  for (const e of edits) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  console.log(`${name}: ${edits.length - 1} references`);
}
fs.writeFileSync(file, text);
