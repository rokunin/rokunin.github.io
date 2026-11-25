#!/usr/bin/env python3
"""Real fights: the actual game in a headless browser, a bot at the wheel, game time sped up (harness turbo).

    python3 real.py                       # the grid: 4 rides x tiers 0-3 x hell, minis, boss; results to real.json
    python3 real.py halo 1 minis 0        # one fight, printed

The bot drives the touch stick round a circle (the same for every ride), jumps when three or more
monsters are within 10 m (halo spends its air jumps at the top), presses the special when something
is within 16 m (the spider goes under for 1.2 s every 6 s), and the gun aims and fires by itself as
it does for a player. Its hp is refilled below 40% and the loss is counted, so it never dies.
"""
import json, os, sys, time
from multiprocessing import Pool
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from harness.game import Game, ev, wait

KIT = {'buggy': ['drill', 'decoy'], 'spider': ['burrow'], 'halo': ['doubleJump', 'cubes'], 'unicorn': ['bomb', 'trail']}
RIDES = ['buggy', 'spider', 'halo', 'unicorn']
TURBO = 4

SETUP = """
const [tier, kit] = a;
if (tier >= 1) for (const k of ['w_spread', 'w_nova', 'w_orbit']) { d.gainWeapon(k); for (let i = 1; i < tier; i++) d.gainWeapon(k, true); }
for (const t of kit) { d.abilities[t] = tier >= 1; d.abLv[t] = Math.max(0, tier - 1); }
d.abLv.jump = tier; d.applyAbilityVisuals();
d.car.maxHp = d.car.maxHp; d.car.hp = d.car.maxHp;
return [d.weapons.spread, d.weapons.nova, d.weapons.orbit, kit.map(t => d.abilities[t] ? d.abLv[t] : -1), d.abLv.jump];
"""

BOT = """
clearInterval(window.__bi);
const S = Math.SQRT2, ISO = Math.sin(Math.atan(1 / Math.SQRT2)), c0 = d.car;
const B = window.__bot = { R: 24, cx: c0.pos.x - 24, cz: c0.pos.z, taken: 0, last: c0.hp, kills: 0, ids: new Map(), aliveT: 0, T: 0, t0: d.elapsed, prev: d.elapsed,
  spT: 0, burT: 0, down: false, jumps: 0, specials: 0, refills: 0 };
B.tick = () => {
  const c = d.car, now = d.elapsed, dt = now - B.prev; if (!c || dt <= 0) return; B.prev = now; B.T = now - B.t0;
  if (c.hp < B.last) B.taken += B.last - c.hp;
  if (c.hp < c.maxHp * 0.4) { c.hp = c.maxHp; B.refills++; }
  B.last = c.hp;
  // kills: a monster that was alive and is gone (rigs and home guards aside)
  const now_ = new Set(); let alive = 0, near10 = 0, near16 = 0;
  for (const m of d.swarm) { if (m.dead || m.rig) continue; now_.add(m.id); B.ids.set(m.id, m);
    const dd = Math.hypot(m.pos.x - c.pos.x, m.pos.z - c.pos.z); if (dd < 40 && !m.home) alive++; if (dd < 10) near10++; if (dd < 16) near16++; }      // alive: the pressure round the car, within 40 m
  for (const [id, m] of B.ids) if (!now_.has(id)) { B.ids.delete(id); if (m.dead) B.kills++; }
  B.aliveT += alive * dt;
  // drive: round the circle; chasing big ones, the circle is centred on the nearest of them (a fixed centre lets one sit there out of the gun's 26 m)
  if (B.follow) { let bm = null, bd = 1e9; for (const m of d.swarm) if (!m.dead && m.mini) { const dd = Math.hypot(m.pos.x - c.pos.x, m.pos.z - c.pos.z); if (dd < bd) { bd = dd; bm = m; } } if (bm) { B.cx = bm.pos.x; B.cz = bm.pos.z; } }
  const dx = c.pos.x - B.cx, dz = c.pos.z - B.cz, r = Math.hypot(dx, dz) || 1;
  let tx = -dz / r, tz = dx / r; const k = Math.max(-1.5, Math.min(1.5, (r - B.R) / 6)); tx -= dx / r * k; tz -= dz / r * k;
  const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  let sx = (tx - tz) / S, sy = (tx + tz) / S * ISO; const sl = Math.hypot(sx, sy) || 1;
  const st = d.touch.move; st.x = sx / sl; st.y = sy / sl; st.mag = 1; st.id = 999;
  // jump into a crowd; the halo spends its air jumps at the top
  if (!c.airborne && near10 >= 3 && c.burrow === 'up') { d.jump(); B.jumps++; }
  else if (c.airborne && d.ride === 'halo' && c.vy < 0 && !c.usedDouble) d.jump();
  // the special
  if (d.ride === 'spider') {
    if (d.abilities.burrow && !B.down && now - B.burT > 6 && c.burrow === 'up' && !c.airborne) { d.special(); B.down = true; B.burT = now; B.specials++; }
    else if (B.down && now - B.burT > 1.2) { d.special(); B.down = false; }
  } else if (near16 > 0 && now - B.spT > 0.25) { B.spT = now; d.special(); }
};
window.__bi = setInterval(B.tick, 4);
return 1;
"""

STATS = "const B = window.__bot; return { T: B.T, kills: B.kills, taken: B.taken, alive: B.aliveT / Math.max(1e-3, B.T), jumps: B.jumps, refills: B.refills, maxHp: d.car.maxHp, dealt: d.boss.dealt }"


def fight(ride, tier, scen, seed, worker=0):
    with Game(turbo=TURBO, out=f'/tmp/chubz-real-{worker}') as g:
        p = g.solo(ride, god=False)
        ev(p, "Math.random = (() => { let s = a >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();", seed * 977 + 13)
        gear = ev(p, SETUP, [tier, KIT[ride]])
        if scen == 'hell':
            ev(p, "d.phEnter(d.PHASES.findIndex(P => P.key === 'hell'), 0); d.clearSwarm();")
            T = 60
        elif scen == 'minis':                      # four mini-bosses and a wandering boss come at the car; no waves
            ev(p, "d.PH.brk = 1e9; d.clearSwarm(); const c = d.car.pos; ['brute', 'grubber', 'jelly', 'lamprey', 'stilt'].forEach((k, i) => { const a2 = i / 5 * 6.283, m = d.spawnCritter(k, c.x + Math.cos(a2) * 30, c.z + Math.sin(a2) * 30); if (i < 4) d.makeMini(m); else d.makeWanderer(m); });")
            T = 60
        else:                                      # the Pyramidon in its lair (first half): circle it, measure damage a second
            ev(p, "d.PH.brk = 1e9; d.clearSwarm(); d.openGate(); d.car.pos.set(d.LAIR_POS.x - 18, 0, 0); d.car.vel.set(0, 0, 0);")
            wait(p, "d.boss.state === 'fight'", 60)
            ev(p, "d.boss.throwCd = 0;")
            T = 20
        ev(p, BOT)
        if scen == 'minis': ev(p, "window.__bot.follow = true; window.__bot.R = 14;")
        if scen == 'boss': ev(p, "window.__bot.cx = d.BOSS_POS.x; window.__bot.cz = d.BOSS_POS.z; window.__bot.R = 12;")
        t0 = time.time()
        while True:
            p.wait_for_timeout(300)
            s = ev(p, STATS)
            if s['T'] >= T: break
            if scen == 'minis' and s['T'] > 2 and ev(p, "return d.swarm.filter(m => !m.dead && m.mini).length") == 0: break
            if scen == 'boss' and ev(p, "return d.boss.ph") == 2: break      # half its health gone: the lair part is over
            if time.time() - t0 > 400: s['timeout'] = True; break
        s['wall'] = time.time() - t0; s['gear'] = gear; s['errs'] = g.errs[:3]
        return s


def job(a):
    i, (ride, tier, scen, seed) = a
    try: return (ride, tier, scen, seed), fight(ride, tier, scen, seed, i % 2)
    except Exception as e: return (ride, tier, scen, seed), {'error': str(e)[:300]}


if __name__ == '__main__':
    if len(sys.argv) > 1:
        print(json.dumps(fight(sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])), indent=1)); sys.exit()
    jobs = [(r, t, s, sd) for s, seeds in (('hell', 6), ('minis', 2), ('boss', 2)) for t in range(4) for r in RIDES for sd in range(seeds)]
    out = {}
    path = os.path.join(HERE, 'real.json')
    if os.path.exists(path): out = json.load(open(path))
    jobs = [j for j in jobs if '|'.join(map(str, j)) not in out]
    with Pool(2) as P:
        for k, v in P.imap_unordered(job, list(enumerate(jobs))):
            out['|'.join(map(str, k))] = v; json.dump(out, open(path, 'w'), indent=0)
            print(k, {x: (round(y, 1) if isinstance(y, float) else y) for x, y in v.items() if x not in ('errs',)}, flush=True)
