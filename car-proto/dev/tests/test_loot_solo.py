"""Coins and crystals, one player: the bank caps what can drop, pickups reach the wallet, upgrades cost what the HUD says."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

t = Checks('loot solo')
with Game() as g:
    p = g.solo('buggy')
    ev(p, "d.gainWeapon('w_spread'); d.gainWeapon('w_nova'); d.abilities.jump = true; d.abilities.drill = true; d.applyAbilityVisuals(); d.PH.brk = 0;")
    wait(p, "d.lootBank.c > 0", 15)
    t.eq('phase 1 bank for one player', ev(p, "return [d.lootBank.c, d.lootBank.g]"), [14, 4])
    ev(p, "const x = d.car.pos.x, z = d.car.pos.z; for (let i = 0; i < 6; i++) { d.lootFrom('rig', x + 9, z + i); d.lootFrom('boss', x - 9, z + i); } for (let i = 0; i < 60; i++) d.lootFrom('mob', x + 6, z - 8); for (let i = 0; i < 30; i++) d.lootFrom('crate', x - 6, z - 8);")
    p.wait_for_timeout(1200)
    ground = "return [d.loot.filter(L => !L.gem).length, d.loot.filter(L => L.gem).length]"
    t.eq('drops stop at the bank: on the ground', ev(p, ground), [14, 4])
    t.eq('bank is empty', ev(p, "return [d.lootBank.c, d.lootBank.g]"), [0, 0])
    for _ in range(60):
        if not ev(p, "const L = d.loot[0]; if (!L) return false; d.car.pos.set(L.x + 0.5, 0, L.z); d.car.vel.set(0, 0, 0); return true;"):
            break
        p.wait_for_timeout(300)
    t.eq('everything collected: wallet', ev(p, "return [d.coins, d.gems]"), [14, 4])
    t.eq('HUD wallet text', ev(p, "return document.getElementById('wallet').innerText.replace(/\\s+/g, ' ').trim()"), '● 14 ◆ 4')
    ev(p, "d.coins = 12; d.gems = 4;"); p.wait_for_timeout(600)
    t.ok('a skill and a gun show "+" when affordable', ev(p, "return document.querySelectorAll('.ab.can').length > 0 && document.querySelectorAll('.wslot.can').length > 0"))
    p.query_selector('.ab.can .up').dispatch_event('mousedown'); p.wait_for_timeout(400)
    p.query_selector('.wslot.can .up').dispatch_event('mousedown'); p.wait_for_timeout(600)
    t.eq('skill level costs 10 coins, gun level 3 crystals: wallet', ev(p, "return [d.coins, d.gems]"), [2, 1])
    t.eq('one skill at level 1', ev(p, "return Object.values(d.abLv).filter(v => v === 1).length"), 1)
    ev(p, "d.coins = 9; d.gems = 2;"); p.wait_for_timeout(600)
    t.eq('no "+" when short of the price', ev(p, "return document.querySelectorAll('.ab.can, .wslot.can').length"), 0)
    t.done(g)
