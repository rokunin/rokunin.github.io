#!/usr/bin/env python3
"""Tables from results.json: kills a minute, damage taken a minute, monsters alive on average, and who did the killing."""
import json, os, statistics as st
R = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results.json')))
RIDES = ['buggy', 'spider', 'halo', 'unicorn']
SRC = ['gun', 'nova', 'orbit', 'skill', 'jump', 'land', 'horn', 'ram']


def runs(ride, tier, scen, pol): return [v for k, v in R.items() if k.startswith(f'{ride}|{tier}|{scen}|{pol}|')]


def mean(xs): return st.mean(xs) if xs else float('nan')


out = []
for scen in ['roll', 'mid', 'hell']:
    for pol in ['kite', 'hold']:
        out.append(f'\n## {scen} / {pol}   (kills a minute | damage taken a minute | alive on average)')
        out.append('tier | ' + ' | '.join(f'{r:>20}' for r in RIDES))
        for t in range(4):
            row = []
            for r in RIDES:
                v = runs(r, t, scen, pol)
                k = mean([x['killed'] / x['t'] * 60 for x in v]); d = mean([x['taken'] / x['t'] * 60 for x in v]); a = mean([x['alive'] for x in v])
                row.append(f'{k:6.0f} {d:6.0f} {a:5.1f}')
            out.append(f'T{t}   | ' + ' | '.join(f'{c:>20}' for c in row))
out.append('\n## minis: seconds to kill four mini-bosses and a wandering boss (kite / hold), damage taken')
for t in range(4):
    row = []
    for r in RIDES:
        a = [x['t'] for x in runs(r, t, 'minis', 'kite')]; b = [x['t'] for x in runs(r, t, 'minis', 'hold')]
        dk = mean([x['taken'] for x in runs(r, t, 'minis', 'kite')]); dh = mean([x['taken'] for x in runs(r, t, 'minis', 'hold')])
        row.append(f'{mean(a):5.1f}/{mean(b):5.1f} ({dk:3.0f}/{dh:3.0f})')
    out.append(f'T{t}   | ' + ' | '.join(f'{c:>22}' for c in row))
out.append('\n## boss: damage a second to the Pyramidon (circling it at 9 m)')
for t in range(4):
    out.append(f'T{t}   | ' + ' | '.join(f"{mean([x['dps'] for x in runs(r, t, 'boss', 'boss')]):10.1f}" for r in RIDES))
out.append('\n## the kit alone, no main gun: hell / hold   (kills a minute | damage taken a minute | alive on average)')
for t in range(1, 4):
    row = []
    for r in RIDES:
        v = runs(r, t, 'hell', 'hold-ng')
        row.append(f"{mean([x['killed'] / x['t'] * 60 for x in v]):6.0f} {mean([x['taken'] / x['t'] * 60 for x in v]):6.0f} {mean([x['alive'] for x in v]):5.1f}")
    out.append(f'T{t}   | ' + ' | '.join(f'{c:>20}' for c in row))
out.append('\n## who kills (share of kills, hell, hold)')
for t in range(4):
    for r in RIDES:
        v = runs(r, t, 'hell', 'hold'); tot = sum(sum(x['kills'].values()) for x in v) or 1
        out.append(f'T{t} {r:8} ' + '  '.join(f"{s}:{sum(x['kills'].get(s, 0) for x in v) / tot * 100:3.0f}%" for s in SRC if any(x['kills'].get(s) for x in v)))
out.append('\n## who deals damage (share of damage, hell, hold)')
for t in range(4):
    for r in RIDES:
        v = runs(r, t, 'hell', 'hold'); tot = sum(sum(x['dmg'].values()) for x in v) or 1
        out.append(f'T{t} {r:8} ' + '  '.join(f"{s}:{sum(x['dmg'].get(s, 0) for x in v) / tot * 100:3.0f}%" for s in SRC if any(x['dmg'].get(s) for x in v)))
print('\n'.join(out))
