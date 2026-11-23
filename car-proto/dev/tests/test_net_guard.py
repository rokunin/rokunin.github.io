"""Pedestal shield, two players: only the ambush guards hold it, and it opens for the client when the host kills them."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

t = Checks('net pedestal guard')
with Game() as g:
    a, b = g.lobby('buggy', 'unicorn')
    ev(b, "const P = d.pedestals[0]; d.car.pos.set(P.x + 5, 0, P.z); d.car.vel.set(0, 0, 0);")
    wait(b, "d.pedestals[0].state === 'sealed' && d.pedestals[0].guards > 0", 30)
    t.ok('client pedestal is sealed by its guards', True, ev(b, "return d.pedestals[0].guards"))
    t.ok('guards are tagged on the host', ev(a, "return d.swarm.filter(m => m.guard && !m.dead).length > 0"))
    t.ok('other monsters are near too and do not count', ev(b, "return d.swarm.filter(m => !m.dead).length >= d.pedestals[0].guards"))
    ev(a, "for (const m of d.swarm) if (m.guard && !m.dead) d.hitCritter(m, 99999, null, 0);")
    opened = False
    for _ in range(30):
        ev(b, "const P = d.pedestals[0]; if (P.state !== 'gone') d.car.pos.set(P.x + 5, 0, P.z); d.car.hp = 1e6;"); b.wait_for_timeout(500)
        if ev(b, "return d.pedestals[0].state") == 'open':
            opened = True; break
    t.ok('shield drops once the host has killed the guards', opened, ev(b, "return d.pedestals[0].state"))
    ev(b, "const P = d.pedestals[0]; d.car.pos.set(P.x + 1, 0, P.z);"); 
    wait(b, "d.weapons.spread > 0", 10)
    t.ok('client takes the gun', True)
    t.done(g)
