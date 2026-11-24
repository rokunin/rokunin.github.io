"""The jump: every ride has it from the start, it has three levels, and each ride lands in its own way. Plus the halo's cubes dive and go off."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

MOBS = "d.fireCooldown = 1e9; d.clearSwarm(); window.__m = {}; const x = d.car.pos.x, z = d.car.pos.z; d.car.vel.set(0, 0, 0); d.car.speed = 0; let i = 0; for (const k of a[0]) { const an = i++ / a[0].length * 6.283, m = d.spawnCritter(k, x + Math.cos(an) * a[1], z + Math.sin(an) * a[1]); m.stun = 0; m.K = { ...m.K, speed: 0 }; (window.__m[k] = window.__m[k] || []).push(m); } clearInterval(window.__si); window.__si = setInterval(() => { for (const k in window.__m) for (const m of window.__m[k]) m.top = Math.max(m.top || 0, m.stun || 0); }, 16);"      # m.top: the longest stun it was given; reading m.stun later depends on how busy the machine is
STATE = "const o = {}; for (const k in window.__m) o[k] = window.__m[k].map(m => ({ dead: m.dead, hp: m.hp, stun: m.stun > 0, slow: m.slow > 0 })); return o;"


def hop(p, lv, kinds, dist=4.5):
    ev(p, "d.abLv.jump = a;", lv); ev(p, MOBS, [kinds, dist]); ev(p, "d.jump();")
    wait(p, "d.car.airborne", 5); wait(p, "!d.car.airborne", 10); p.wait_for_timeout(250)
    return ev(p, STATE)


t = Checks('jump powers')
with Game() as g:
    # ---- buggy: the stomp ----
    p = g.solo('buggy'); ev(p, "d.PH.brk = 999;")
    t.ok('the jump is there from the start', ev(p, "return d.abilities.jump === true"))
    ev(p, "d.gainWeapon('w_spread');"); p.wait_for_timeout(700)
    t.eq('pedestals after the first gun: three guns, no jump pedestal', ev(p, "return d.pedestals.map(P => P.k).sort()"), ['nova', 'orbit', 'spread'])
    ev(p, "d.coins = 1000; for (let i = 0; i < 5; i++) d.upgradeAb('jump');")
    t.eq('the jump takes three levels for 100 + 200 + 300 coins', ev(p, "return [d.abLv.jump, d.coins]"), [3, 400])
    ev(p, "d.abilities.drill = true; for (let i = 0; i < 5; i++) d.upgradeAb('drill');")
    t.eq('other skills still stop at two', ev(p, "return [d.abLv.drill, d.coins]"), [2, 100])
    ev(p, "d.abilities.drill = false; d.weapons.spread = 0;")
    s = hop(p, 0, ['gremlin', 'spitter'] * 2)
    t.ok('Lv0: a plain jump does nothing to those standing around', not any(m['dead'] for k in s for m in s[k]))
    s = hop(p, 1, ['stilt', 'spitter', 'stilt', 'spitter', 'brute'])
    t.ok('buggy Lv1: shooters stunned 1.5 s', ev(p, "return window.__m.spitter.every(m => m.top > 1.3 && m.top <= 1.5)"))
    t.ok('buggy Lv1: the rest are not stunned, nobody is hurt', ev(p, "return window.__m.stilt.every(m => !(m.stun > 0) && m.hp === 2) && window.__m.brute[0].hp === 9"), ev(p, "return [window.__m.stilt.map(m => [m.hp, Math.round(m.stun * 100) / 100, m.dead]), window.__m.brute[0].hp]"))
    s = hop(p, 2, ['stilt', 'spitter', 'stilt', 'spitter', 'brute'])
    t.ok('buggy Lv2: small fry at half health and stunned 2 s', ev(p, "return [...window.__m.stilt, ...window.__m.spitter].every(m => m.hp === 1 && m.top > 1.8 && m.top <= 2)"))
    t.ok('buggy Lv2: the brute is left alone', ev(p, "return window.__m.brute[0].hp === 9 && !(window.__m.brute[0].stun > 0)"))
    s = hop(p, 3, ['stilt', 'spitter', 'gremlin', 'spitter', 'brute'])
    t.ok('buggy Lv3: small fry dead', all(m['dead'] for k in ('stilt', 'spitter', 'gremlin') for m in s[k]))
    t.ok('buggy Lv3: the brute lives and is stunned 2 s', ev(p, "return !window.__m.brute[0].dead && window.__m.brute[0].top > 1.8 && window.__m.brute[0].top <= 2"))
    p.close()
    # ---- spider: the brood ----
    p = g.solo('spider'); ev(p, "d.PH.brk = 999;")
    s = hop(p, 1, ['stilt'] * 4 + ['brute'])
    t.eq('spider Lv1: six spiderlings', ev(p, "return d.broods.length"), 6)
    wait(p, "d.broods.some(b => b.on > 0)", 10)
    wait(p, "window.__m.stilt.some(m => m.slow > 0) || window.__m.brute[0].slow > 0", 10)
    t.ok('spider Lv1: they sit on monsters and slow them', True)
    hp = ev(p, "return window.__m.stilt.map(m => m.hp)")
    wait(p, "d.broods.length === 0", 30)
    t.eq('spider Lv1: no damage', ev(p, "return window.__m.stilt.map(m => m.hp)"), hp)
    s = hop(p, 3, ['stilt'] * 4 + ['brute'])
    t.eq('spider Lv3: ten spiderlings', ev(p, "return d.broods.length"), 10)
    wait(p, "d.broods.length === 0", 40)
    t.ok('spider Lv3: they blow up: the stilts are dead, the brute is hurt', ev(p, "return window.__m.stilt.every(m => m.dead) && window.__m.brute[0].hp < 9"), ev(p, "return [window.__m.stilt.map(m => m.hp), window.__m.brute[0].hp]"))
    p.close()
    # ---- halo: spikes, and the cubes ----
    p = g.solo('halo'); ev(p, "d.PH.brk = 999;")
    s = hop(p, 1, ['brute'] * 3, 4.0)
    t.eq('halo Lv1: one field of six spikes', ev(p, "return d.spikeFields.map(F => F.g.children.length)"), [6])
    wait(p, "d.spikeFields.length === 0", 20)
    h1 = ev(p, "return window.__m.brute.map(m => m.hp)")
    t.ok('halo Lv1: the spikes hurt what stands in them (six spikes land at random: two brutes of three is the least)', sum(h < 9 for h in h1) >= 2, h1)
    s = hop(p, 3, ['brute'] * 3, 4.0)
    t.eq('halo Lv3: eighteen spikes', ev(p, "return d.spikeFields.map(F => F.g.children.length)"), [18])
    ev(p, "for (const m of window.__m.brute) m.stun = 5;"); wait(p, "d.spikeFields.length === 0", 30)
    h3 = ev(p, "return window.__m.brute.map(m => m.dead ? 0 : m.hp)")
    t.ok('halo Lv3: they stand longer and hit harder', all(h3[i] < h1[i] - 3 for i in range(3)), h3)
    ev(p, "d.fireCooldown = 1e9; d.clearSwarm(); d.abilities.cubes = true; const x = d.car.pos.x, z = d.car.pos.z; window.__c = []; for (let i = 0; i < 6; i++) { const m = d.spawnCritter('stilt', x + 9 + i % 3 * 2.5, z - 3 + (i > 2 ? 6 : 0)); m.stun = 9; window.__c.push(m); } d.releaseCubes();")
    t.eq('three cubes fly out', ev(p, "return d.cubes.length"), 3)
    wait(p, "d.cubes.some(c => c.mode === 'dive')", 10)
    t.ok('a cube goes into a dive', True)
    wait(p, "window.__c.filter(m => m.dead).length >= 5", 15)
    t.ok('the dives kill the small fry', True, ev(p, "return window.__c.filter(m => m.dead).length"))
    p.close()
    # ---- unicorn: the starburst ----
    p = g.solo('unicorn'); ev(p, "d.PH.brk = 999;")
    for lv, n in ((1, 10), (2, 16), (3, 24)):
        ev(p, "d.fireCooldown = 1e9; d.clearSwarm(); for (const b of d.bullets) d.scene.remove(b.m); d.bullets.length = 0; d.abLv.jump = a; d.jump();", lv)
        ev(p, "clearInterval(window.__st); window.__sn = 0; window.__st = setInterval(() => { window.__sn = Math.max(window.__sn, d.bullets.filter(b => b.m.scale.x === 0.7).length); }, 4);")      # the most seen at once: a star that hits a crate on its first frame is gone before a single look
        wait(p, "d.car.airborne", 5); wait(p, "d.bullets.some(b => b.m.scale.x === 0.7)", 10); p.wait_for_timeout(150)
        t.eq(f'unicorn Lv{lv}: stars in the ring', ev(p, "return window.__sn"), n)
        wait(p, "!d.bullets.some(b => b.m.scale.x === 0.7)", 10)
    t.eq('unicorn: the ring reaches further with each level, m', ev(p, "return d.STARB.reach"), [9, 13, 17])
    t.done(g)
