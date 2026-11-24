"""The Pyramidon, one player: three quake rings and no lava in the lair; at half health it breaks out into the field and heals;
out there six double-size rings with a ring of lava around it, then a dash to the player; the lava burns on the ground and not in the air."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

WATCH = "clearInterval(window.__wi); window.__w = { n: 0, r: [], lava: 0, dmg: [] }; window.__wi = setInterval(() => { for (const q of d.quakes) if (!q.seen) { q.seen = 1; window.__w.n++; window.__w.r.push(q.r); window.__w.dmg.push(q.dmg); } window.__w.lava = Math.max(window.__w.lava, d.lavas.length); }, 16);"
BAR = "return [Math.round(parseFloat(document.getElementById('bossfill').style.width)), document.getElementById('bossbar').classList.contains('p2')]"
STAND = "d.car.pos.set(d.BOSS_POS.x + a[0], 0, d.BOSS_POS.z + a[1]); d.car.vel.set(0, 0, 0); d.car.speed = 0;"

t = Checks('pyramidon')
with Game() as g:
    p = g.solo('buggy')
    ev(p, "d.PH.brk = 999; d.fireCooldown = 1e9; d.clearSwarm(); d.openGate(); d.car.maxHp = d.car.hp = 1e6;"); ev(p, STAND, [-18, 0])
    wait(p, "d.boss.state === 'fight'", 20)
    t.eq('it rises in the lair when somebody drives in', ev(p, "return [d.boss.ph, d.BOSS_POS.x === d.LAIR_POS.x, d.BOSS_POS.z]"), [1, True, 0])
    ev(p, WATCH + " d.boss.quakeCd = 0; d.boss.throwCd = 1e9; d.boss.lashCd = 1e9; d.boss.fanCd = 1e9;"); p.wait_for_timeout(2600)
    t.eq('a volley in the lair: three rings of the old size, one after another, no lava', ev(p, "return [window.__w.n, [...new Set(window.__w.r)], window.__w.lava]"), [3, [13], 0])
    wait(p, "d.quakes.length === 0 && !d.boss.vol", 15)
    cd = ev(p, "return d.boss.quakeCd")
    t.ok('the next lair volley in 12.5 to 17.5 s', 12 <= cd <= 17.5, round(cd, 2))
    ev(p, "d.bossDamage(300);"); t.eq('the bar at 70%', ev(p, BAR), [70, False])
    ev(p, "d.bossDamage(5000);")
    t.eq('at half health it breaks out: it cannot be taken below half in the lair', ev(p, "return [d.boss.state, d.boss.ph, d.boss.dealt, !!d.boss.mv]"), ['flee', 2, 500, True])
    ev(p, "d.bossDamage(400);"); t.eq('on the run it cannot be hurt', ev(p, "return d.boss.dealt"), 500)
    p.wait_for_timeout(1500)
    b = ev(p, BAR); t.ok('and the bar refills in another colour', 55 < b[0] < 100 and b[1], b)
    wait(p, "d.boss.state === 'fight'", 20)
    t.eq('it stops in the field, out of the lair, with a full bar', ev(p, "return [d.BOSS_POS.x, d.BOSS_POS.z, d.BOSS_POS.x < d.ROOM_X1 - 40]") + ev(p, BAR), [ev(p, "return d.BOSS2.out[0]"), 0, True, 100, True])

    ev(p, STAND, [-12, 5]); ev(p, WATCH + " d.boss.quakeCd = 0; d.boss.throwCd = 1e9; d.boss.lashCd = 1e9; d.boss.fanCd = 1e9;")
    wait(p, "d.lavas.length === 1", 5)
    t.eq('a volley in the field raises a ring of lava around it, the size of the lair', ev(p, "const L = d.lavas[0]; return [L.r, Math.round(Math.hypot(L.x - d.BOSS_POS.x, L.z - d.BOSS_POS.z))]"), [32, 0])
    p.wait_for_timeout(700)
    hp = ev(p, "d.car.hp = 1e6; " + STAND + " return d.car.hp", [-32, 0]); p.wait_for_timeout(350)
    lost = hp - ev(p, "return d.car.hp")
    t.eq('lava burns a car standing on it: 20', lost, 20)
    ev(p, STAND, [-24, 0]); ev(p, "d.jump();"); wait(p, "d.car.y > 2.2", 5)
    hp = ev(p, "d.car.hp = 1e6; d.car.pos.x = d.BOSS_POS.x - 32; d.car.pos.z = d.BOSS_POS.z; return d.car.hp"); p.wait_for_timeout(250)
    air = ev(p, "const h = d.car.hp, y = d.car.y; d.car.pos.x = d.BOSS_POS.x - 12; return [h, y > 1.5]")
    t.ok('and does not touch a car in the air above it', air[0] == hp and air[1], [hp - air[0], air[1]])
    wait(p, "d.lavas.length === 0", 12)
    w = ev(p, "return [window.__w.n, [...new Set(window.__w.r)], [...new Set(window.__w.dmg)], window.__w.lava]")
    t.eq('six rings of double size, 12 damage each, one ring of lava', w, [6, [26], [12], 1])
    wait(p, "d.quakes.length === 0", 6)
    wait(p, "d.boss.mv || d.boss.dashed", 4, every=0.05)
    cd = ev(p, "return d.boss.quakeCd")
    t.ok('the next field volley in 6.25 to 8.75 s (the clock waits while it dashes)', 6 <= cd <= 8.75, round(cd, 2))
    at = ev(p, "return [d.boss.mv.tx, d.boss.mv.tz, d.car.pos.x, d.car.pos.z]")
    wait(p, "!d.boss.mv", 15)
    dd = ev(p, "return Math.hypot(d.BOSS_POS.x - a[0], d.BOSS_POS.z - a[1])", at[2:])
    t.ok('the volley over, it dashes to a spot beside the player', 12 <= dd <= 24 and ev(p, "return Math.hypot(d.BOSS_POS.x - a[0], d.BOSS_POS.z - a[1]) < 0.5", at[:2]), round(dd, 1))
    ev(p, "d.bossDamage(500);"); t.eq('half of the second bar', ev(p, BAR), [50, True])
    ev(p, "d.car.pos.set(d.BOSS_POS.x - 100, 0, d.BOSS_POS.z); d.boss.quakeCd = 0;"); wait(p, "d.boss.mv", 6, every=0.05); wait(p, "!d.boss.mv", 15)
    t.ok('nobody near: no volley, it goes after the player', ev(p, "return Math.hypot(d.BOSS_POS.x - d.car.pos.x, d.BOSS_POS.z - d.car.pos.z) < 26 && d.lavas.length === 0"))
    ev(p, "d.bossDamage(600);")
    t.eq('one and a half bars of damage in all, and it is dead', ev(p, "return [d.boss.state, d.lavas.length, d.quakes.length]"), ['dead', 0, 0])
    t.done(g)
