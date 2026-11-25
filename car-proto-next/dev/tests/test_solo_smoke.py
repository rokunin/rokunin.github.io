"""Every ride starts solo, plays a few seconds and throws no errors; the first pedestal is the right gun."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from harness.game import Game, Checks, RIDES, ev, wait

t = Checks('solo smoke')
with Game() as g:
    for ride in RIDES:
        p = g.solo(ride, name=ride)
        ev(p, "d.PH.brk = 0")
        t0 = ev(p, "return d.elapsed")
        wait(p, "d.elapsed > %f" % (t0 + 4), 40)
        s = ev(p, "return { build: d.BUILD, first: d.pedestals.length ? d.pedestals[0].k : null, alive: d.car.alive, swarm: d.swarm.length, hud: !!document.getElementById('wallet') }")
        t.eq(f'{ride}: page build is the source build', s['build'], g.info['build'])
        t.eq(f'{ride}: first pedestal', s['first'], 'nova' if ride == 'halo' else 'spread')
        t.ok(f'{ride}: car alive after 4 s of game time', s['alive'])
        t.ok(f'{ride}: wallet is in the HUD', s['hud'])
        p.close()
    t.done(g)
