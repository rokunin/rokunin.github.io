"""The Pyramidon, two players: the break-out, the place it stops, the lava, the quake rings and the dashes are the host's and the client sees the same; damage and the kill come from either side."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

WATCH = "clearInterval(window.__wi); window.__w = { n: 0, r: [], lava: 0, lr: 0 }; window.__wi = setInterval(() => { for (const q of d.quakes) if (!q.seen) { q.seen = 1; window.__w.n++; window.__w.r.push(q.r); } if (d.lavas.length) { window.__w.lava = Math.max(window.__w.lava, d.lavas.length); window.__w.lr = d.lavas[0].r; } }, 16);"
QUIET = "d.boss.throwCd = 1e9; d.boss.lashCd = 1e9; d.boss.fanCd = 1e9;"
POS = "return [Math.round(d.BOSS_POS.x), Math.round(d.BOSS_POS.z)]"

t = Checks('net pyramidon')
with Game() as g:
    a, b = g.lobby('buggy', 'unicorn')
    for p, z in ((a, -6), (b, 6)):
        ev(p, "d.PH.brk = 999; d.fireCooldown = 1e9; d.car.maxHp = d.car.hp = 1e6; d.openGate(); d.car.pos.set(d.LAIR_POS.x - 18, 0, a); d.car.vel.set(0, 0, 0); d.car.speed = 0;", z)
    ev(a, "d.clearSwarm();")
    wait(a, "d.boss.state === 'fight'", 25); wait(b, "d.boss.state === 'fight'", 10)
    M = ev(a, "return d.bossMax()")
    t.eq('two players: the health pool is 2500 a bar', M, 2500)
    ev(a, QUIET); top = 0
    for _ in range(6):                                          # a guest's damage travels in pieces of 500 at most
        ev(b, "d.bossDamage(450);"); b.wait_for_timeout(450); top = max(top, ev(b, "return d.boss.dealt"))
        if ev(a, "return d.boss.state") == 'flee':
            break
    t.ok('the client cannot take it below half', top <= 1250, top)
    t.eq('its damage reaches the host and the host starts the break-out', ev(a, "return [d.boss.state, d.boss.ph, d.boss.dealt]"), ['flee', 2, 1250])
    wait(b, "d.boss.state === 'flee' && d.boss.ph === 2", 5)
    t.ok('the client follows', True)
    wait(a, "d.boss.state === 'fight'", 20); wait(b, "d.boss.state === 'fight'", 5)
    t.eq('both see it stop at the same place in the field', ev(b, POS), ev(a, POS))
    t.eq('and a full second bar', ev(b, "return [Math.round(parseFloat(document.getElementById('bossfill').style.width)), document.getElementById('bossbar').classList.contains('p2')]"), [100, True])

    for p, z in ((a, -8), (b, 8)):
        ev(p, "d.car.pos.set(d.BOSS_POS.x - 14, 0, a); d.car.vel.set(0, 0, 0); d.car.speed = 0;", z)
    ev(b, WATCH); a.wait_for_timeout(400); ev(a, QUIET + " d.boss.quakeCd = 0;")
    wait(b, "d.lavas.length === 1", 6)
    wait(a, "d.lavas.length === 0 && d.quakes.length === 0 && !d.boss.vol", 15)
    t.eq('the client saw one wall of fire of 40 m and six quake rings of 26 m', ev(b, "return [window.__w.lava, window.__w.lr, window.__w.n, [...new Set(window.__w.r)]]"), [1, 40, 6, [26]])
    wait(a, "d.boss.mv", 4, every=0.05); wait(a, "!d.boss.mv", 15); b.wait_for_timeout(600)
    t.eq('after the dash both have it at the same place', ev(b, POS), ev(a, POS))
    t.ok('and that place is new', ev(a, "return Math.hypot(d.BOSS_POS.x - d.BOSS2.out[0], d.BOSS_POS.z - d.BOSS2.out[1]) > 5"))
    d0 = ev(a, "return d.boss.dealt"); ev(b, "d.bossDamage(400);"); a.wait_for_timeout(1500)
    t.ok('the client hurts it in the field: the host counts it', abs(ev(a, "return d.boss.dealt") - d0 - 400) < 1, ev(a, "return d.boss.dealt") - d0)
    ev(b, "d.bossDamage(99999);"); a.wait_for_timeout(1500)
    t.eq('killed by the client, dead for both', [ev(a, "return d.boss.state"), ev(b, "return d.boss.state")], ['dead', 'dead'])
    t.done(g)
