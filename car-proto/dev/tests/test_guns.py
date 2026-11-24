"""Fan gun numbers per ride: the halo throws 30% fewer shots per level, with full damage and a slightly shorter reach."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

SHOT = "d.weapons.spread = a; for (const b of d.bullets) d.scene.remove(b.m); d.bullets.length = 0; d.fire(); const b = d.bullets[0]; return { n: d.bullets.length, dmg: b.dmg, reach: Math.round(b.v.length() * b.life * 10) / 10 };"
t = Checks('guns')
with Game() as g:
    out = {}
    for ride in ('buggy', 'halo'):
        p = g.solo(ride, name=ride)
        ev(p, "d.PH.brk = 999"); wait(p, "d.elapsed > 1", 20)
        out[ride] = [ev(p, SHOT, lv) for lv in (1, 3, 5)]
        p.close()
    t.eq('buggy volley at Lv1, Lv2, MAX', [s['n'] for s in out['buggy']], [3, 5, 9])
    t.eq('halo volley at Lv1, Lv2, MAX', [s['n'] for s in out['halo']], [2, 4, 6])
    t.eq('halo shot damage', out['halo'][0]['dmg'], out['buggy'][0]['dmg'])
    t.ok('buggy reach about 65.5 m', abs(out['buggy'][0]['reach'] - 65.45) < 0.2, out['buggy'][0]['reach'])
    t.ok('halo reach about 61.7 m', abs(out['halo'][0]['reach'] - 61.7) < 0.2, out['halo'][0]['reach'])
    t.done(g)
