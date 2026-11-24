"""Coins and crystals, one player: every source pays its own price with no bank behind it, the field has a ceiling, pieces expire, prices match the HUD."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

GROUND = "return [d.loot.filter(L => !L.gem).length + d.coins, d.loot.filter(L => L.gem).length + d.gems]"      # a piece that flew right at the car is in the wallet already


def drop(p, kind, n=1):
    ev(p, "for (const L of d.loot.slice()) d.lootRemove(L); d.coins = 0; d.gems = 0; for (let i = 0; i < a[1]; i++) d.lootFrom(a[0], d.car.pos.x + 20, d.car.pos.z + 20);", [kind, n])
    p.wait_for_timeout(300)
    return ev(p, GROUND)


t = Checks('loot solo')
with Game() as g:
    p = g.solo('buggy')
    ev(p, "d.gainWeapon('w_spread'); d.gainWeapon('w_nova'); d.abilities.drill = true; d.applyAbilityVisuals(); d.PH.brk = 999; d.fireCooldown = 1e9;")      # the warm-up is held: no monsters wander in and drop coins of their own
    t.eq('a log machine: 30 coins and 15 crystals', drop(p, 'rig'), [30, 15])
    t.eq('the Pyramidon: 60 and 20', drop(p, 'boss'), [60, 20])
    t.eq('a mini-boss: 20 and 3', drop(p, 'mini'), [20, 3])
    t.eq('a spitter or a flapper: 3 coins', drop(p, 'tough'), [3, 0])
    t.eq('an evil cube: 4, an elite one: 8', drop(p, 'enemy') + drop(p, 'elite'), [4, 0, 8, 0])
    n = drop(p, 'brute', 30)
    t.ok('a brute: 6 to 8 coins', 180 <= n[0] <= 240 and n[1] == 0, n)
    n = drop(p, 'crate', 40)
    t.ok('every crate pays 3 to 5 coins', 120 <= n[0] <= 200 and n[1] == 0, n)
    n = drop(p, 'mob', 300)
    t.ok('plain biters pay now and then (about 0.4 a head)', 75 <= n[0] <= 165 and n[1] == 0, n)
    n = drop(p, 'wb', 20)
    t.ok('a wandering boss: 10 coins, and 3 crystals every other time', n[0] == 200 and n[1] % 3 == 0 and 6 <= n[1] <= 54, n)
    drop(p, 'crate', 200)
    t.ok('the field holds no more than its ceiling, the oldest pieces go', ev(p, "return d.loot.length <= d.LOOT.max && d.loot.length > d.LOOT.max - 30"), ev(p, "return d.loot.length"))
    ev(p, "for (const L of d.loot) L.t = d.LOOT.life + 1;"); p.wait_for_timeout(300)
    t.eq('pieces nobody came for are gone after their time', ev(p, "return d.loot.length"), 0)
    drop(p, 'rig')
    for _ in range(200):
        if not ev(p, "const L = d.loot[0]; if (!L) return false; d.car.pos.set(L.x + 0.5, 0, L.z); d.car.vel.set(0, 0, 0); return true;"):
            break
        p.wait_for_timeout(250)
    t.eq('everything collected: wallet', ev(p, "return [d.coins, d.gems]"), [30, 15])
    t.eq('HUD wallet text', ev(p, "return document.getElementById('wallet').innerText.replace(/\\s+/g, ' ').trim()"), '● 30 ◆ 15')
    ev(p, "d.coins = 120; d.gems = 40;"); p.wait_for_timeout(600)
    t.ok('a skill and a gun show "+" when affordable', ev(p, "return document.querySelectorAll('.ab.can').length > 0 && document.querySelectorAll('.wslot.can').length > 0"))
    p.query_selector('.ab.can .up').dispatch_event('mousedown'); p.wait_for_timeout(400)
    p.query_selector('.wslot.can .up').dispatch_event('mousedown'); p.wait_for_timeout(600)
    t.eq('skill level costs 100 coins, gun level 30 crystals: wallet', ev(p, "return [d.coins, d.gems]"), [20, 10])
    ev(p, "d.coins = 99; d.gems = 29;"); p.wait_for_timeout(600)
    t.eq('no "+" when short of the price', ev(p, "return document.querySelectorAll('.ab.can, .wslot.can').length"), 0)
    t.done(g)
