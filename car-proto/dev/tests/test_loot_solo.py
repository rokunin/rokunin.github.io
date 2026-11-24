"""Coins and crystals, one player: pots cap what can drop, big kills always pay, small fry pay in full or not at all, prices match the HUD."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

GROUND = "return [d.loot.filter(L => !L.gem).length, d.loot.filter(L => L.gem).length]"
t = Checks('loot solo')
with Game() as g:
    p = g.solo('buggy')
    ev(p, "d.gainWeapon('w_spread'); d.gainWeapon('w_nova'); d.abilities.jump = true; d.abilities.drill = true; d.applyAbilityVisuals(); d.PH.brk = 999;")      # the warm-up is held: no monsters wander in and drop coins of their own
    wait(p, "d.lootLeft().c > 0", 15)
    t.eq('phase 1 share for one three-skill ride', ev(p, "const L = d.lootLeft(); return [L.c, L.g]"), [280, 70])
    t.eq('split: reserve for big kills', ev(p, "return [Math.round(d.lootBig.c), Math.round(d.lootBig.g * 10) / 10]"), [154, 38.5])
    t0 = ev(p, "return d.elapsed"); wait(p, "d.elapsed > %f" % (t0 + 6), 40)
    s = ev(p, "return { bank: d.lootBank.c, due: d.lootDue.c }")
    t.ok('the rest drips into the bank over time', s['bank'] > 1 and abs(s['bank'] + s['due'] - 126) < 0.01, round(s['bank'], 2))
    ev(p, "d.lootBank.c = 0; d.lootBank.g = 0; d.lootDue.c = 0; d.lootDue.g = 0;")
    ev(p, "d.lootFrom('rig', d.car.pos.x + 12, d.car.pos.z + 12);"); p.wait_for_timeout(400)
    t.eq('a log machine scatters 25 coins and 15 crystals with the bank empty', ev(p, GROUND), [25, 15])
    ev(p, "for (let i = 0; i < 30; i++) { d.lootFrom('crate', d.car.pos.x - 12, d.car.pos.z + 12); d.lootFrom('mob', d.car.pos.x - 12, d.car.pos.z + 12); }"); p.wait_for_timeout(400)
    t.eq('crates and mobs drop nothing from an empty bank', ev(p, GROUND), [25, 15])
    ev(p, "d.lootBank.c = 50; for (let i = 0; i < 40; i++) d.lootFrom('crate', d.car.pos.x - 12, d.car.pos.z - 12);"); p.wait_for_timeout(400)
    n = ev(p, GROUND)[0] - 25
    t.ok('crates pay 3 to 5 coins each until the bank cannot cover one', 48 <= n <= 50, n)
    ev(p, "for (let i = 0; i < 20; i++) d.lootFrom('boss', d.car.pos.x + 12, d.car.pos.z - 12);"); p.wait_for_timeout(400)
    gr = ev(p, GROUND)
    t.eq('bosses take what is left of the reserve and of the bank, and no more', gr, [25 + 50 + 129, 38])
    for _ in range(200):
        if not ev(p, "const L = d.loot[0]; if (!L) return false; d.car.pos.set(L.x + 0.5, 0, L.z); d.car.vel.set(0, 0, 0); return true;"):
            break
        p.wait_for_timeout(250)
    t.eq('everything collected: wallet', ev(p, "return [d.coins, d.gems]"), gr)
    t.eq('HUD wallet text', ev(p, "return document.getElementById('wallet').innerText.replace(/\\s+/g, ' ').trim()"), '● %d ◆ %d' % tuple(gr))
    ev(p, "d.coins = 120; d.gems = 40;"); p.wait_for_timeout(600)
    t.ok('a skill and a gun show "+" when affordable', ev(p, "return document.querySelectorAll('.ab.can').length > 0 && document.querySelectorAll('.wslot.can').length > 0"))
    t.ok('price labels are in tens', ev(p, "return [...document.querySelectorAll('.ab .cost, .wslot .cost')].map(e => e.textContent).filter(Boolean)"), ev(p, "return [...document.querySelectorAll('.ab .cost, .wslot .cost')].map(e => e.textContent).filter(Boolean).join(' ')"))
    p.query_selector('.ab.can .up').dispatch_event('mousedown'); p.wait_for_timeout(400)
    p.query_selector('.wslot.can .up').dispatch_event('mousedown'); p.wait_for_timeout(600)
    t.eq('skill level costs 100 coins, gun level 30 crystals: wallet', ev(p, "return [d.coins, d.gems]"), [20, 10])
    ev(p, "d.coins = 99; d.gems = 29;"); p.wait_for_timeout(600)
    t.eq('no "+" when short of the price', ev(p, "return document.querySelectorAll('.ab.can, .wslot.can').length"), 0)
    t.done(g)
