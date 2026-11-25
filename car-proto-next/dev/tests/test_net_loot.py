"""Coins and crystals, two players: the host scatters, both see the same pieces (a big pile included), a piece has one owner, a client's crates pay through the host."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

t = Checks('net loot')
with Game() as g:
    a, b = g.lobby('buggy', 'spider')
    ev(a, "d.PH.brk = 999; d.clearSwarm(); d.fireCooldown = 1e9;")      # the host holds the waves: no monsters drop coins of their own during the count
    ev(b, "d.fireCooldown = 1e9;"); a.wait_for_timeout(600)
    n0 = ev(a, "return d.loot.length")
    w0 = ev(b, "return [d.coins, d.gems]")
    bp = ev(b, "return [d.car.pos.x, d.car.pos.z]")
    # the host parks 60 m away on the far side, on a spot with no crate within 8 m: a car set down on a crate breaks it and its coins fly into the host's wallet
    ev(a, """let x = a[0] - 60, z = a[1];
      for (let k = 0; k <= 12; k++) { const ang = Math.PI / 2 + k * Math.PI / 12, cx = a[0] + Math.cos(ang) * 60, cz = a[1] + Math.sin(ang) * 60;
        if (!d.obstacles.some(o => Math.hypot(o.mesh.position.x - cx, o.mesh.position.z - cz) < 8 + Math.max(o.hx || 0, o.hz || 0))) { x = cx; z = cz; break; } }
      d.car.pos.set(x, 0, z); d.lootFrom('rig', a[0] + 40, a[1]); d.lootFrom('boss', a[0] + 40, a[1] + 3);""", bp); a.wait_for_timeout(1500)
    h0 = ev(a, "return d.coins + d.gems")
    n = ev(a, "return d.loot.length"); w1 = ev(b, "return [d.coins, d.gems]")      # a piece that flew right at the client may be in its wallet already
    t.eq('a machine and the Pyramidon scatter 90 coins and 35 crystals', n - n0 + sum(w1) - sum(w0), 125)
    t.ok('the client sees every piece of the big pile', abs(ev(b, "return d.loot.length") - n) <= 2, [n, ev(b, "return d.loot.length")])
    for _ in range(400):
        if not ev(b, "const L = d.loot[0]; if (!L) return false; d.car.pos.set(L.x + 0.5, 0, L.z); d.car.vel.set(0, 0, 0); return true;"):
            break
        b.wait_for_timeout(250)
    a.wait_for_timeout(1000)
    w = ev(b, "return [d.coins, d.gems]")
    t.eq('client collected every piece, crystals as crystals', [w[0] - w0[0] - n0, w[1] - w0[1]], [90, 35])
    t.eq('host has no pieces left', ev(a, "return d.loot.length"), 0)
    t.eq('host wallet untouched', [h0, ev(a, "return d.coins + d.gems")], [0, 0])
    ev(b, "for (let i = 0; i < 10; i++) d.lootFrom('crate', d.car.pos.x + 40, d.car.pos.z);"); b.wait_for_timeout(1500)
    m = ev(a, "return d.loot.length")
    c = ev(b, "return d.loot.length + d.coins") - w[0]
    t.ok('ten crates broken by the client pay 30 to 50 coins on the host', 30 <= c <= 50, c)
    t.ok('and the client sees them', abs(ev(b, "return d.loot.length") - m) <= 2, m)
    n1 = ev(a, "return d.loot.length"); ev(b, "d.lootFrom('boss', d.car.pos.x + 40, d.car.pos.z); d.lootFrom('rig', d.car.pos.x + 40, d.car.pos.z);"); b.wait_for_timeout(1200)
    t.ok('asked for a boss pile, the host drops nothing', ev(a, "return d.loot.length") <= n1, [n1, ev(a, "return d.loot.length")])
    t.done(g)
