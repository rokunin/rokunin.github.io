// Needs TypeScript 5 (see to_state.cjs). Prints, per top-level let of legacy.js, in how many sections it is used: TS5=... node dev/tools/shared_lets.cjs src/legacy.js
// Which top-level lets are used in more than one section of legacy.js (sections start at '  // ----------' lines)
const ts = require(process.env.TS5 || 'typescript'), fs = require('fs');
const file = process.argv[2], text = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
let body; ts.forEachChild(sf, n => { if (!body && ts.isExpressionStatement(n)) { let e = n.expression; while (ts.isParenthesizedExpression(e) || ts.isCallExpression(e)) e = e.expression; if (ts.isArrowFunction(e)) body = e.body; } });
const secStarts = []; text.split('\n').reduce((pos, line) => { if (line.startsWith('  // ----------')) secStarts.push([pos, line.slice(16, 60)]); return pos + line.length + 1; }, 0);
const secOf = p => { let s = 'top'; for (const [a, n] of secStarts) if (a <= p) s = n; return s; };
const files = { [file]: text };
const host = { getScriptFileNames: () => [file], getScriptVersion: () => '1', getScriptSnapshot: f => files[f] !== undefined ? ts.ScriptSnapshot.fromString(files[f]) : undefined,
  getCurrentDirectory: () => '/', getCompilationSettings: () => ({ allowJs: true, noEmit: true, target: ts.ScriptTarget.ES2022 }), getDefaultLibFileName: o => ts.getDefaultLibFilePath(o),
  fileExists: f => f === file || ts.sys.fileExists(f), readFile: f => files[f] ?? ts.sys.readFile(f) };
const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
const out = [];
for (const st of body.statements) if (ts.isVariableStatement(st) && (st.declarationList.flags & ts.NodeFlags.Let))
  for (const d of st.declarationList.declarations) {
    const locs = ls.findRenameLocations(file, d.name.getStart(), false, false) || [];
    const secs = new Set(locs.map(l => secOf(l.textSpan.start)));
    out.push([d.name.text, secs.size, locs.length, [...secs].join(' | ')]);
  }
out.sort((a, b) => b[1] - a[1]);
for (const o of out) console.log(o[1], o[2], o[0], '  ', o[1] > 1 ? o[3].slice(0, 150) : '');
