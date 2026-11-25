"""The jump: every ride has it from the start, it has three levels, and each ride lands in its own way. Plus the halo's cubes dive and go off."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

MOBS = "d.fireCooldown = 1e9; d.clearSwarm(); for (const c of d.chunks) c.v.set(0, 0, 0); window.__m = {}; const x = d.car.pos.x, z = d.car.pos.z; d.car.vel.set(0, 0, 0); d.car.speed = 0; let i = 0; for (const k of a[0]) { const an = i++ / a[0].length * 6.283, m = d.spawnCritter(k, x + Math.cos(an) * a[1], z + Math.sin(an) * a[1]); m.stun = 0; m.K = { ...m.K, speed: 0 }; let st = 0; Object.defineProperty(m, 'stun', { configurable: true, get() { return st; }, set(v) { st = v; m.top = Math.max(m.top || 0, v); } }); Object.defineProperty(m, 'dig', { configurable: true, get() { return 0; }, set(v) {} }); (window.__m[k] = window.__m[k] || []).push(m); }"      # m.top: the longest stun it was ever given, caught where it is set (polling it missed the peak on a busy machine). Chunks of a smashed pillar still in the air are stopped: they deal 99. Nobody burrows: a stomp passes over a monster underground
# The jump happens on the nearest spot with no pillar or nest within 14 m, nothing else within 6 m, far from pedestals, cubes and the lair: a stomp breaks crates, and a crate's flying chunks deal 99 to small monsters,
# which is a different mechanic from the one under test (this was the old "nobody is hurt" flake).
CLEAR = """let best = null, bestD = 1e9;
for (let x = -150; x <= 150; x += 6) for (let z = -150; z <= 150; z += 6) {
  if (Math.hypot(d.BOSS_POS.x - x, d.BOSS_POS.z - z) < 70) continue;                                                       // not near the Pyramidon
  if (d.pedestals.some(P => P.state !== 'gone' && Math.hypot(P.x - x, P.z - z) < 40)) continue;                          // no rising pedestal and its ambush
  if (d.enemies.some(e => !e.dead && Math.hypot(e.pos.x - x, e.pos.z - z) < 16)) continue;                               // no evil cube that wakes
  let near = 1e9; for (const o of d.obstacles) { if (o.disabled) continue; const r = Math.hypot(o.mesh.position.x - x, o.mesh.position.z - z) - Math.max(o.hx || 0, o.hz || 0);
    if ((o.pillar || o.rock) && r < 14) { near = -1; break; } near = Math.min(near, r); }                                // a stomp smashes pillars, and their chunks deal 99
  if (near < 6) continue;
  const dd = Math.hypot(x - d.car.pos.x, z - d.car.pos.z); if (dd < bestD) { bestD = dd; best = [x, z]; } }
if (best) d.car.pos.set(best[0], 0, best[1]); return best;"""
STATE = "const o = {}; for (const k in window.__m) o[k] = window.__m[k].map(m => ({ dead: m.dead, hp: m.hp, stun: m.stun > 0, slow: m.slow > 0 })); return o;"


def hop(p, lv, kinds, dist=4.5):
    assert ev(p, CLEAR), 'no spot clear of obstacles for the jump'
    ev(p, "d.abLv.jump = a;", lv); ev(p, MOBS, [kinds, dist]); ev(p, "d.jump();")
    wait(p, "d.car.airborne", 5); wait(p, "!d.car.airborne", 10); p.wait_for_timeout(250)
    return ev(p, STATE)


t = Checks('jump powers')
with Game() as g:
    # ---- buggy: the stomp ----
    p = g.solo('buggy'); ev(p, "d.PH.brk = 999; d.fireCooldown = 1e9;")      # the new spray gun must not shoot a crate into the coin count
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
    s = hop(p, 1, ['stilt', 'spitter', 'stilt', 'spitter', 'brute'], 5.5)      # 5.5 m: a monster that shuffles under the landing car is flattened (99)
    t.ok('buggy Lv1: shooters stunned 1.5 s', ev(p, "return window.__m.spitter.every(m => m.top > 1.3 && m.top <= 1.5)"), ev(p, "return window.__m.spitter.map(m => m.top)"))
    t.ok('buggy Lv1: the rest are not stunned, nobody is hurt', ev(p, "return window.__m.stilt.every(m => !(m.stun > 0) && m.hp === 2) && window.__m.brute[0].hp === 9"), ev(p, "return [window.__m.stilt.map(m => [m.hp, Math.round(m.stun * 100) / 100, m.dead]), window.__m.brute[0].hp]"))
    s = hop(p, 2, ['stilt', 'spitter', 'stilt', 'spitter', 'brute'], 5.5)
    t.ok('buggy Lv2: small fry at half health and stunned 2 s', ev(p, "return [...window.__m.stilt, ...window.__m.spitter].every(m => m.hp === 1 && m.top > 1.8 && m.top <= 2)"), ev(p, "return [...window.__m.stilt, ...window.__m.spitter].map(m => [m.hp, m.top])"))
    t.ok('buggy Lv2: the brute is left alone', ev(p, "return window.__m.brute[0].hp === 9 && !(window.__m.brute[0].stun > 0)"))
    s = hop(p, 3, ['stilt', 'spitter', 'gremlin', 'spitter', 'brute'], 5.5)
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
    h1 = ev(p, "return window.__m.brute.map(m => m.dead ? 0 : m.hp)"); top = ev(p, "return window.__m.brute[0].K.hp")
    # the field hurts everything within its radius every 0.4 s and pushes it back, so a brute on the edge may take one hit and leave
    t.ok('halo Lv1: the spikes hurt what stands in them', sum(h < 9 for h in h1) >= 1, h1)
    s = hop(p, 3, ['brute'] * 3, 4.0)
    t.eq('halo Lv3: eighteen spikes', ev(p, "return d.spikeFields.map(F => F.g.children.length)"), [18])
    ev(p, "for (const m of window.__m.brute) m.stun = 5;"); wait(p, "d.spikeFields.length === 0", 30)
    h3 = ev(p, "return window.__m.brute.map(m => m.dead ? 0 : m.hp)")
    # spikes land at random, so brute i of one jump has nothing to do with brute i of the other: compare the whole damage
    t.ok('halo Lv3: they stand longer and hit harder (all three hurt, more damage than Lv1)', all(h < top for h in h3) and sum(top - h for h in h3) > sum(top - h for h in h1), [h1, h3, top])
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
        wait(p, "window.__sn > 0", 10, every=0.05); p.wait_for_timeout(200)      # the ring lives a quarter of a second: polling for it can miss it, the 4 ms counter does not
        t.eq(f'unicorn Lv{lv}: stars in the ring', ev(p, "return window.__sn"), n)
        wait(p, "!d.bullets.some(b => b.m.scale.x === 0.7)", 10)
    t.eq('unicorn: the ring reaches further with each level, m', ev(p, "return d.STARB.reach"), [9, 13, 17])
    t.done(g)
