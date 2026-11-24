"""Coins and crystals, two players: a share per player (the spider, with fewer skill levels to buy, gets 3/4 of the coins), both see the same pieces, a piece has one owner."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

t = Checks('net loot')
with Game() as g:
    a, b = g.lobby('buggy', 'spider')
    ev(a, "d.PH.brk = 999; d.clearSwarm();")      # the host holds the waves: no monsters drop coins of their own during the count
    wait(a, "d.lootLeft().g > 0", 15)
    TOTAL = "const L = d.lootLeft(); return [L.c + d.loot.filter(q => !q.gem).length + d.coins, L.g + d.loot.filter(q => q.gem).length + d.gems]"
    t.eq('host pots for a buggy and a spider (dropped pieces counted in)', ev(a, TOTAL), [490, 140])
    n0 = ev(a, "return d.loot.length")
    w0 = ev(b, "return [d.coins, d.gems]")
    bp = ev(b, "return [d.car.pos.x, d.car.pos.z]")
    ev(a, "d.car.pos.set(a[0] - 60, 0, a[1]); d.lootFrom('rig', a[0] + 12, a[1]); d.lootFrom('mini', a[0] + 12, a[1] + 3);", bp); a.wait_for_timeout(1500)
    n = ev(a, "return d.loot.length"); w1 = ev(b, "return [d.coins, d.gems]")      # a piece that flew right at the client may be in its wallet already
    t.eq('a machine and a mini-boss scatter 37 coins and 17 crystals', n - n0 + sum(w1) - sum(w0), 54)
    t.ok('client sees the same pieces', abs(ev(b, "return d.loot.length") - n) <= 2, n)
    for _ in range(200):
        if not ev(b, "const L = d.loot[0]; if (!L) return false; d.car.pos.set(L.x + 0.5, 0, L.z); d.car.vel.set(0, 0, 0); return true;"):
            break
        b.wait_for_timeout(250)
    a.wait_for_timeout(1000)
    w = ev(b, "return [d.coins, d.gems]")
    t.eq('client collected every piece, crystals as crystals', [w[0] - w0[0] - n0, w[1] - w0[1]], [37, 17])
    t.eq('host has no pieces left', ev(a, "return d.loot.length"), 0)
    t.eq('host wallet untouched', ev(a, "return d.coins + d.gems"), 0)
    ev(a, "d.lootBank.c = 100;")
    ev(b, "for (let i = 0; i < 10; i++) d.lootFrom('crate', d.car.pos.x + 8, d.car.pos.z);"); b.wait_for_timeout(1500)
    m = ev(a, "return d.loot.length")
    t.ok('crates broken by the client drop loot on the host', m >= 30, m)
    t.eq('and the client sees it', ev(b, "return d.loot.length"), m)
    t.done(g)
