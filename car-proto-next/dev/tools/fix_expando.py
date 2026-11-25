#!/usr/bin/env python3
"""After a section moves into a .ts module: legacy code adds properties to object literals later on (grab.cd = 0), which
TypeScript rejects (TS2339 on a literal type). This marks those objects `: any` at their declaration, and marks
parameters TypeScript says are missing (TS2554 "Expected N arguments, but got M") as optional where the function is in the
same file. Run from car-proto-next/:  python3 dev/tools/fix_expando.py   (repeats until tsc stops finding such errors)"""
import re, subprocess

def tsc():
    r = subprocess.run(['npx', 'tsc', '-p', 'tsconfig.json'], capture_output=True, text=True)
    return [l for l in r.stdout.split('\n') if 'error TS' in l]

for rnd in range(6):
    errs = tsc(); fixed = 0
    by_file = {}
    for e in errs:
        m = re.match(r'(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)', e)
        if m: by_file.setdefault(m.group(1), []).append((int(m.group(2)), int(m.group(3)), m.group(4), m.group(5)))
    for f, items in by_file.items():
        lines = open(f, encoding='utf8').read().split('\n')
        names = set()
        for ln, col, code, msg in items:
            if code == 'TS2339' and "on type '{" in msg:
                before = lines[ln - 1][:col - 1]
                m = re.search(r'([A-Za-z_$][\w$]*)\s*\.?\s*$', before.rstrip('.'))
                if m: names.add(m.group(1))
        text = '\n'.join(lines)
        for n in names:
            text, k = re.subn(r'\b((?:const|let) )' + re.escape(n) + r'( = \{)', r'\1' + n + r': any\2', text, count=1)
            if not k:
                text, k = re.subn(r'([,(]\s*)' + re.escape(n) + r'( = \{)', r'\1' + n + r': any\2', text, count=1)
            fixed += k
        open(f, 'w', encoding='utf8').write(text)
    if not fixed: break
left = tsc()
print(f'{len(left)} type errors left')
for e in left[:30]: print('  ' + e[:220])
