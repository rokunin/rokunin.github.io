"""Log machine and bombs, one player: the glove delivers, a thrown bomb takes a third, the glove brings the next one, three kill."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

THROW = "const m = d.swarm.find(m => m.rig && !m.dead), ang = Math.random() * 6.283; d.car.pos.set(m.pos.x + Math.cos(ang) * 8, 0, m.pos.z + Math.sin(ang) * 8); d.car.heading = Math.atan2(m.pos.x - d.car.pos.x, m.pos.z - d.car.pos.z); d.car.vel.set(0, 0, 0); d.car.speed = 0; d.car.rigCd = 1e9; d.cartReset();"
HITS = "(d.swarm.find(m => m.rig && !m.dead) || { rig: { hits: 3 } }).rig.hits || 0"


def land_a_hit(p, want):
    for _ in range(5):
        wait(p, "d.bombs.some(B => !B.fly && !B.leap && !(B.drop && B.drop.t < 2.1))", 60)
        ev(p, "const B = d.bombs.find(B => !B.fly && !B.leap && !(B.drop && B.drop.t < 2.1)); d.car.pos.set(B.x + 1.5, 0, B.z); d.car.vel.set(0, 0, 0);")
        wait(p, "d.myTow", 10)
        ev(p, THROW); p.wait_for_timeout(700); ev(p, "d.jump()")
        try:
            wait(p, HITS + " >= %d" % want, 12)
            return True
        except TimeoutError:
            pass
    return False


t = Checks('bomb and glove')
with Game() as g:
    p = g.solo('buggy')
    ev(p, "d.PH.brk = 0; let ok = false; for (let i = 0; i < 30 && !ok; i++) ok = d.spawnRig(); d.swarm.find(m => m.rig).rig.fall = 0.05;")
    t.eq('one log machine stands', ev(p, "return d.swarm.filter(m => m.rig && !m.dead).length"), 1)
    wait(p, "d.bombs.length > 0", 60)
    t.ok('the first bomb comes by glove', ev(p, "return !!d.bombs[0].drop"))
    t.ok('the glove model has three fingers and a thumb', ev(p, "return d.bombs[0].drop.hand.fingers.length === 4"))
    ev(p, "const B = d.bombs[0]; d.car.pos.set(B.x + 1.5, 0, B.z); d.car.vel.set(0, 0, 0);"); p.wait_for_timeout(500)
    t.ok('a bomb still in the glove cannot be grabbed', ev(p, "return !d.myTow && d.bombs[0].drop && d.bombs[0].drop.t < 1.5"))
    t.ok('first hit lands', land_a_hit(p, 1))
    t.eq('machine shows 1 hit of 3', ev(p, "return " + HITS), 1)
    wait(p, "d.bombs.some(B => B.drop)", 10)
    s = ev(p, "const B = d.bombs.find(B => B.drop), m = d.swarm.find(m => m.rig && !m.dead); return { n: d.bombs.length, car: Math.hypot(B.x - d.car.pos.x, B.z - d.car.pos.z), mast: Math.hypot(B.x - m.pos.x, B.z - m.pos.z), half: d.RIG.half };")
    t.eq('exactly one new bomb after the hit', s['n'], 1)
    t.ok('the new bomb lands on screen, near the thrower', s['car'] < 25, round(s['car'], 1))
    t.ok('and outside the log', s['mast'] > s['half'], round(s['mast'], 1))
    ev(p, "d.swarm.find(m => m.rig && !m.dead).rig.hits = 2;")
    t.ok('third hit lands', land_a_hit(p, 3))
    wait(p, "!d.swarm.some(m => m.rig && !m.dead)", 10)
    t.eq('the machine is gone', ev(p, "return d.swarm.filter(m => m.rig && !m.dead).length"), 0)
    t.done(g)
