"""Ultimates, two players: the charge is the caster's, the blast is decided by the host, the other player sees the show."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

MOBS = """const ids = [], fx = Math.sin(a[0][2]), fz = Math.cos(a[0][2]); for (const [k, fwd, side] of a[1]) { const m = d.spawnCritter(k, a[0][0] + fx * fwd + fz * side, a[0][1] + fz * fwd - fx * side); m.K = { ...m.K, speed: 0 }; ids.push(m.id); } return ids;"""
ALIVE = "return a.map(i => d.swarm.some(m => m.id === i && !m.dead) ? 1 : 0)"
POSE = "d.car.vel.set(0, 0, 0); d.car.speed = 0; return [d.car.pos.x, d.car.pos.z, d.car.heading]"

t = Checks('net ultimates')
with Game() as g:
    a, b = g.lobby('buggy', 'unicorn')
    ev(a, "d.PH.brk = 999; d.clearSwarm(); d.fireCooldown = 1e9;"); ev(b, "d.fireCooldown = 1e9;"); a.wait_for_timeout(600)

    # the client's ten hands
    pose = ev(b, POSE)
    ev(a, "d.car.pos.set(a[0] + 70, 0, a[1]); d.car.vel.set(0, 0, 0);", pose)
    ins = ev(a, MOBS, [pose, [['stilt', 6, 0], ['brute', -9, 4], ['spitter', 0, 15]]])
    out = ev(a, MOBS, [pose, [['stilt', 32, 0]]])
    wait(b, "d.swarm.filter(m => !m.dead).length >= 4", 10)
    ev(b, "d.gems = 50;"); b.keyboard.press('2'); b.wait_for_timeout(200); b.keyboard.press('2'); b.wait_for_timeout(500)
    t.eq('the client bought a charge and spent it', ev(b, "return [d.ult.hands, d.gems, d.ultFx.length]"), [0, 0, 1])
    t.eq('the host sees the gloves, as somebody else\'s', ev(a, "return d.ultFx.map(F => [F.k, !!F.own])"), [['hands', False]])
    t.eq('the host\'s own charges and wallet are untouched', ev(a, "return [d.ult.hands, d.ult.sword, d.gems]"), [0, 0, 0])
    wait(b, "d.ultFx.length === 0", 30); a.wait_for_timeout(800)
    t.eq('on the host everything inside the client\'s ring is dead', ev(a, ALIVE, ins), [0, 0, 0])
    t.eq('and what stood outside is alive', ev(a, ALIVE, out), [1])
    ALIVE_N = "return d.swarm.filter(m => !m.dead).length"
    for _ in range(20):                                  # the host's snapshot reaches the client a moment later; on a busy machine over a second
        if ev(b, ALIVE_N) == ev(a, ALIVE_N): break
        b.wait_for_timeout(250)
    t.ok('the client sees the same field', ev(b, ALIVE_N) == ev(a, ALIVE_N), [ev(b, ALIVE_N), ev(a, ALIVE_N)])
    b.wait_for_timeout(1500); paid = ev(a, "return d.loot.length") + ev(b, "return d.coins + d.gems")
    t.ok('the dead paid: coins on the field or already pulled into the client\'s wallet', paid >= 9, paid)

    # the client's sword
    ev(a, "d.clearSwarm();"); a.wait_for_timeout(500)
    ev(b, "d.car.heading = 2.2;"); pose = ev(b, POSE)
    on = ev(a, MOBS, [pose, [['stilt', 9, 0], ['gremlin', 22, 1.5], ['stilt', 46, -1.5]]])
    off = ev(a, MOBS, [pose, [['stilt', 25, 16]]])
    wait(b, "d.swarm.filter(m => !m.dead).length >= 4", 10)
    ev(b, "d.ult.sword = 1; d.car.heading = 2.2;"); b.keyboard.press('1'); b.wait_for_timeout(500)
    t.eq('the host sees the client\'s sword', ev(a, "return d.ultFx.map(F => [F.k, !!F.own])"), [['sword', False]])
    wait(b, "d.ultFx.length === 0", 30); a.wait_for_timeout(800)
    t.eq('on the host the monsters on its path are dead, the one beside is alive', ev(a, ALIVE, on) + ev(a, ALIVE, off), [0, 0, 0, 1])

    # the host's ten hands, seen by the client
    ev(a, "d.clearSwarm();"); a.wait_for_timeout(500)
    pose = ev(a, POSE)
    ins = ev(a, MOBS, [pose, [['stilt', 6, 0], ['brute', -9, 4]]])
    ev(a, "d.ult.hands = 1;"); a.keyboard.press('2'); a.wait_for_timeout(500)
    t.eq('the client sees the host\'s gloves, as somebody else\'s', ev(b, "return d.ultFx.map(F => [F.k, !!F.own, F.items.length])"), [['hands', False, 10]])
    wait(a, "d.ultFx.length === 0", 30); a.wait_for_timeout(800)
    t.eq('the host\'s blast kills on the host', ev(a, ALIVE, ins), [0, 0])
    t.eq('and the show ends on the client too', ev(b, "return d.ultFx.length"), 0)
    t.done(g)
