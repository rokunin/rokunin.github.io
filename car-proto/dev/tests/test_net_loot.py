"""Coins and crystals, two players: the bank pays a share per player, both see the same pieces, a piece has one owner."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

t = Checks('net loot')
with Game() as g:
    a, b = g.lobby('buggy', 'unicorn')
    wait(a, "d.lootBank.c > 0", 15)
    t.eq('host bank for two players', ev(a, "return [d.lootBank.c, d.lootBank.g]"), [28, 8])
    bp = ev(b, "return [d.car.pos.x, d.car.pos.z]")
    ev(a, "d.lootFrom('rig', a[0] + 12, a[1]); d.lootFrom('mini', a[0] + 12, a[1] + 3);", bp); a.wait_for_timeout(1500)
    n = ev(a, "return d.loot.length")
    t.ok('host dropped a machine\'s and a mini-boss\'s loot', n >= 7, n)
    t.eq('client sees the same number of pieces', ev(b, "return d.loot.length"), n)
    for _ in range(60):
        if not ev(b, "const L = d.loot[0]; if (!L) return false; d.car.pos.set(L.x + 0.5, 0, L.z); d.car.vel.set(0, 0, 0); return true;"):
            break
        b.wait_for_timeout(400)
    a.wait_for_timeout(1000)
    t.eq('client collected every piece: client wallet total', ev(b, "return d.coins + d.gems"), n)
    t.ok('crystals arrive as crystals', ev(b, "return d.gems >= 2"), ev(b, "return [d.coins, d.gems]"))
    t.eq('host has no pieces left', ev(a, "return d.loot.length"), 0)
    t.eq('host wallet untouched', ev(a, "return d.coins + d.gems"), 0)
    ev(b, "for (let i = 0; i < 40; i++) d.lootFrom('crate', d.car.pos.x + 8, d.car.pos.z);"); b.wait_for_timeout(1500)
    m = ev(a, "return d.loot.length")
    t.ok('crates broken by the client drop loot on the host', m > 0, m)
    t.eq('and the client sees it', ev(b, "return d.loot.length"), m)
    t.done(g)
