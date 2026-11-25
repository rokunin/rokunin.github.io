#!/usr/bin/env python3
"""Tables from real.json (real fights with the bot), next to the model's numbers where they measure the same thing."""
import json, os, statistics as st
H = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(H, 'real.json')))
RIDES = ['buggy', 'spider', 'halo', 'unicorn']


def runs(r, t, s): return [v for k, v in R.items() if k.startswith(f'{r}|{t}|{s}|') and 'error' not in v]


def m(xs): return st.mean(xs) if xs else float('nan')


def sd(xs): return st.stdev(xs) if len(xs) > 1 else 0


out = ['## hell, 60 s: kills a minute | monsters within 40 m on average | hp lost a minute (as a share of max hp)   [n runs]']
for t in range(4):
    row = []
    for r in RIDES:
        v = runs(r, t, 'hell')
        k = [x['kills'] / x['T'] * 60 for x in v]; a = [x['alive'] for x in v]; h = [x['taken'] / x['T'] * 60 / x['maxHp'] * 100 for x in v]
        row.append(f"{m(k):4.0f}±{sd(k):3.0f} {m(a):4.1f}±{sd(a):3.1f} {m(h):4.0f}% [{len(v)}]")
    out.append(f'T{t} | ' + ' | '.join(f'{c:>30}' for c in row))
out.append('\n## minis: seconds to kill four mini-bosses and a wandering boss (60 = not done)')
for t in range(4):
    out.append(f'T{t} | ' + ' | '.join(f"{m([x['T'] for x in runs(r, t, 'minis')]):10.1f}" for r in RIDES))
out.append('\n## Pyramidon in the lair: damage a second until it breaks out (500 hp)')
for t in range(4):
    out.append(f'T{t} | ' + ' | '.join(f"{m([x['dealt'] / x['T'] for x in runs(r, t, 'boss') if x['dealt'] > 0]):10.1f}" for r in RIDES))
errs = [k for k, v in R.items() if 'error' in v or v.get('errs')]
out.append(f'\nruns: {len(R)}, with errors: {len(errs)} {errs[:5]}')
print('\n'.join(out))
