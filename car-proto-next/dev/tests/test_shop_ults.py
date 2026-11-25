"""The shop, one player: the converter, buying a charge, and what the two ultimates do to the field."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

WALLET = "return [d.coins, d.gems]"
MOBS = """const ids = []; for (const [k, fwd, side] of a) { const fx = Math.sin(d.car.heading), fz = Math.cos(d.car.heading), m = d.spawnCritter(k, d.car.pos.x + fx * fwd + fz * side, d.car.pos.z + fz * fwd - fx * side); m.K = { ...m.K, speed: 0 }; ids.push(m.id); } return ids;"""
ALIVE = "return a.map(i => d.swarm.some(m => m.id === i && !m.dead) ? 1 : 0)"

t = Checks('shop and ultimates')
with Game() as g:
    p = g.solo('buggy')
    ev(p, "d.PH.brk = 999; d.fireCooldown = 1e9; d.clearSwarm();"); p.wait_for_timeout(500)
    t.eq('the shop is on screen in play: two ultimates and the converter', ev(p, "const s = document.getElementById('shop'); return [getComputedStyle(s).display, s.querySelectorAll('.ult').length, !!document.getElementById('conv')]"), ['flex', 2, True])
    big = ev(p, "const r = document.querySelector('#shop .ult').getBoundingClientRect(), q = document.querySelector('.ab').getBoundingClientRect(); return [Math.round(r.width), Math.round(q.width), r.left > innerWidth / 2]")
    t.ok('ultimate cards are big, drawn, and sit on the right', big[0] >= 1.5 * big[1] and big[2] and ev(p, "return [...document.querySelectorAll('#shop .ult')].every(b => getComputedStyle(b).backgroundImage.startsWith('url(\"data:image/webp'))"), big)

    ev(p, "d.coins = 250; d.gems = 0;"); p.wait_for_timeout(300)
    t.ok('the converter lights up at 100 coins', ev(p, "return document.getElementById('conv').classList.contains('can')"))
    p.click('#conv'); p.wait_for_timeout(200)
    t.eq('100 coins become 10 crystals', ev(p, WALLET), [150, 10])
    p.keyboard.press('c'); p.wait_for_timeout(200)
    t.eq('and the C key does the same', ev(p, WALLET), [50, 20])
    p.click('#conv'); p.wait_for_timeout(300)
    t.eq('nothing happens when short of 100', ev(p, WALLET), [50, 20])
    t.ok('and the button is dim', ev(p, "return !document.getElementById('conv').classList.contains('can')"))

    ev(p, "d.gems = 29;"); p.wait_for_timeout(300)
    p.click('#shop .ult[data-u=sword]'); p.wait_for_timeout(200)
    t.eq('no charge for 29 crystals', ev(p, "return [d.ult.sword, d.gems]"), [0, 29])
    ev(p, "d.gems = 80;"); p.wait_for_timeout(300)
    t.eq('cards say BUY with the price', ev(p, "return [...document.querySelectorAll('#shop .ult .act')].map(e => e.textContent)"), ['BUY ◆30', 'BUY ◆50'])
    p.click('#shop .ult[data-u=sword]'); p.wait_for_timeout(300)
    t.eq('the sword costs 30 crystals a charge', ev(p, "return [d.ult.sword, d.ult.hands, d.gems]"), [1, 0, 50])
    t.eq('the card shows the charge and says USE', ev(p, "const b = document.querySelector('#shop .ult[data-u=sword]'); return [b.querySelector('.n').textContent, b.querySelector('.act').textContent, b.classList.contains('has')]"), ['×1', 'USE', True])
    p.keyboard.press('2'); p.wait_for_timeout(300)
    t.eq('key 2 buys ten hands for 50', ev(p, "return [d.ult.sword, d.ult.hands, d.gems]"), [1, 1, 0])

    # the sword: falls ahead of the car and ploughs on along its heading
    ev(p, "d.car.heading = 0.8; d.car.vel.set(0, 0, 0); d.car.speed = 0;")
    on = ev(p, MOBS, [['stilt', 9, 0], ['gremlin', 20, 1.5], ['spitter', 34, -2], ['stilt', 50, 2], ['brute', 28, 0]])
    off = ev(p, MOBS, [['stilt', 25, 16], ['gremlin', -12, 0], ['stilt', 75, 0]])
    hp0 = ev(p, "return d.swarm.find(m => m.id === a).hp", on[4])
    p.keyboard.press('1'); p.wait_for_timeout(200)
    t.eq('key 1 spends the charge and the sword is in the air', ev(p, "return [d.ult.sword, d.ultFx.length, d.ultFx[0].k]"), [0, 1, 'sword'])
    wait(p, "d.ultFx.length === 0", 30)
    t.eq('small monsters on its path are dead, the brute is alive', ev(p, ALIVE, on), [0, 0, 0, 0, 1])
    t.ok('the brute is hurt', ev(p, "return d.swarm.find(m => m.id === a).hp", on[4]) < hp0)
    t.eq('monsters beside the path, behind the car and past its reach are untouched', ev(p, ALIVE, off), [1, 1, 1])
    t.ok('the furrow is on the ground', ev(p, "return d.furrows.length") > 10, ev(p, "return d.furrows.length"))

    # ten hands: a ring of bombs around the car, one blast, nothing inside survives
    ev(p, "d.clearSwarm(); for (const L of d.loot.slice()) d.lootRemove(L); d.PH.brk = 0; let ok = false; for (let i = 0; i < 30 && !ok; i++) ok = d.spawnRig(); d.PH.brk = 999; const m = d.swarm.find(m => m.rig); m.rig.fall = 0.05; window.__rid = m.id; d.car.rigCd = 1e9;")
    p.wait_for_timeout(400)
    ev(p, "const m = d.swarm.find(m => m.id === window.__rid); d.car.pos.set(m.pos.x + 7, 0, m.pos.z); d.car.vel.set(0, 0, 0); d.car.speed = 0;")      # the machine walks: it starts close enough to still be inside the ring when the bombs go
    ins = ev(p, MOBS, [['stilt', 6, 0], ['brute', -9, 4], ['spitter', 0, 15], ['gremlin', -14, -10]]) + [ev(p, "return window.__rid")]
    out = ev(p, MOBS, [['stilt', 30, 0], ['brute', -26, 14]])
    p.keyboard.press('2'); p.wait_for_timeout(200)
    t.eq('the charge is spent, ten gloves are on their way', ev(p, "return [d.ult.hands, d.ultFx.length, d.ultFx[0].items.length]"), [0, 1, 10])
    p.wait_for_timeout(900)
    t.ok('the gloves leave bombs that wait', ev(p, "return d.ultFx[0].items.filter(i => i.bomb).length >= 3 && !d.ultFx[0].done"))
    t.eq('nobody has died of the blast yet: the big ones stand', ev(p, ALIVE, [ins[1], ins[4]]), [1, 1])
    wait(p, "d.ultFx.length === 0", 30)
    t.eq('everything inside the ring is dead, the brute and the log machine too', ev(p, ALIVE, ins), [0, 0, 0, 0, 0])
    t.eq('monsters outside the ring are alive', ev(p, ALIVE, out), [1, 1])
    p.wait_for_timeout(400)
    n = ev(p, "return [d.loot.filter(L => !L.gem).length + d.coins, d.loot.filter(L => L.gem).length + d.gems]")
    t.ok('and the dead pay: the machine alone is 30 coins and 15 crystals', n[0] >= 39 and n[1] >= 15, n)
    p.keyboard.press('2'); p.wait_for_timeout(200)
    t.eq('no charge and no crystals: the key does nothing', ev(p, "return [d.ult.hands, d.ultFx.length]"), [0, 0])
    t.done(g)
