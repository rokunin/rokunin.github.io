#!/usr/bin/env python3
"""CHUBZ balance model: a scripted top-down fight, no rendering, no browser.

One car (buggy / spider / halo / unicorn) at one of four gear tiers fights one wave of monsters.
The game's tables come from data.json (src/data); the few numbers still in the game's code are noted in README.md;
what the model leaves out is listed there too. It answers "how fast does this ride kill this mix,
and how much does it get bitten", and which source did the killing.

    python3 sim.py                      # the full grid, results to results.json
    python3 sim.py halo 3 hell kite 1   # one run, printed
"""
import json, math, os, sys, random
import numpy as np

DT = 0.025
CAR_R = 1.6
# The game's own tables (src/data, exported by `npm run build` as data.json, ADR-0006); the rest below are model choices
# or numbers that still sit in the game's code (see README.md).
D = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data.json')))
LV = (0, 2, 4)                                              # the slots of W_STATS that gun levels 1, 2, 3 use
# kind: hp, speed, r, bite, fly, heavy, spiky, ranged
KINDS = {k: (v['hp'], v['speed'], v['r'], v['bite'], v.get('fly', 0), int(bool(v.get('heavy'))), int(bool(v.get('spiky'))), int(bool(v.get('ranged'))))
         for k, v in D['SW_KINDS'].items()}
SIZE = {k: v['size'] for k, v in D['SW_KINDS'].items()}
MINI_SIZE = 1.15 * 4.9

B = D['BULLET']                                             # the spider shoots the star, the halo the holy bullet
BASE_SPEED = {'buggy': B['speed']['base'], 'spider': B['speed']['star'], 'halo': B['speed']['holy'], 'unicorn': B['speed']['base']}
BASE_LIFE = {'buggy': B['life']['base'], 'spider': B['life']['star'], 'halo': B['life']['base'], 'unicorn': B['life']['base']}
SPREAD = {k: [D['W_STATS']['spread'][k][i] for i in LV] for k in ('n', 'arc', 'rate')}
NOVA = {k: [D['W_STATS']['nova'][k][i] for i in LV] for k in ('cd', 'n', 'dmg')}
ORBIT = {k: [D['W_STATS']['orbit'][k][i] for i in LV] for k in ('n', 'r', 'spd', 'dmg')}
SWORD = {'n': [D['HALO_SWORDS']['n'][i] for i in LV], 'len': [D['HALO_SWORDS']['len'][i] for i in LV], 'T': [D['SWORD_T'][i] for i in LV]}
WEB_R = [D['WEB_R'][i] for i in LV]
RB_PER = [D['BEAM_PER'][i] for i in LV]
STOMP, BROOD, SPIKE, STARB, BOMB, TRAIL_T = D['STOMP'], D['BROOD'], D['SPIKE'], D['STARB'], D['BOMB'], D['TRAIL_T']
DRILL_REACH = D['DRILL_REACH']

class Fight:
    def __init__(self, ride, tier, scen, policy, seed):
        self.ride, self.tier, self.scen, self.policy = ride, tier, scen, policy
        self.rng = random.Random(seed); np.random.seed(seed)
        self.wr = random.Random(seed * 7919 + 1)            # waves come from their own dice: every ride meets the same monsters from the same sides
        g = tier - 1                                        # gun level index 0..2 (tier 0: no guns)
        self.gun = g if tier >= 1 else None
        self.ab = tier - 1 if tier >= 1 else None           # skill abLv 0..2 (tier 0: no kit skills)
        self.jlv = tier                                     # jump abLv 0..3
        self.t = 0.0
        self.kills, self.dmgby = {}, {}
        self.taken = 0.0
        # car
        self.cx = self.cz = 0.0; self.h = 0.0; self.vx = self.vz = 0.0; self.speed = 0.0
        self.y = 0.0; self.vy = 0.0; self.air = False; self.airJ = 0; self.lastLand = -9
        self.invul_until = -1; self.burrow_until = -1; self.burrowNext = 3.0
        self.fireT = 0.0; self.novaT = 0.5; self.sawA = 0.0; self.drillCyc = 0.0
        self.decoyT = 1.0; self.cubeT = 1.0; self.domeT = 1.0
        self.bullets = []                                   # [x, z, vx, vz, life, dmg, src]
        self.beams = []; self.webs = []; self.cubes = []; self.decoys = []; self.fields = []; self.lings = []; self.domes = []; self.trail = []
        self.trailT = 0.0
        self.spawn()

    # ---------- monsters ----------
    def add(self, kind, x, z, mini=False, wb=False):
        hp, sp, r, bite, fly, heavy, spiky, ranged = KINDS[kind]
        if mini or wb:
            k = MINI_SIZE / SIZE[kind]; r = min(1.9, r * k); bite = round(bite * 1.3); spiky = 1
            hp = hp * 4 + 26
            if wb: hp *= 3; r = min(2.6, r * 1.3); sp *= 0.55 * 0 + 1   # a wanderer chases at full speed once you are near
        self.M.append(dict(kind=kind, x=x, z=z, hp=hp, hp0=hp, sp=sp, r=r, bite=bite, fly=fly, heavy=heavy, spiky=spiky, ranged=ranged,
                           mini=mini or wb, wb=wb, alive=True, stun=0.0, slow=0.0, lost=0.0, cd=0.0, sawcd=0.0, horncd=0.0, ling=0, lingBig=0,
                           wx=self.rng.uniform(-1, 1), wz=self.rng.uniform(-1, 1)))

    def group(self, kinds, n, ang=None, dist=None):
        ang = self.wr.uniform(0, 6.283) if ang is None else ang
        dist = self.wr.uniform(26, 36) if dist is None else dist      # just outside the view (about 60 x 36 m), as offscreenSpot does
        bx, bz = self.cx + math.cos(ang) * dist, self.cz + math.sin(ang) * dist
        for i in range(n):
            if sum(1 for m in self.M if m['alive']) >= 110: return      # SW_CAP
            self.add(kinds[i % len(kinds)] if isinstance(kinds, list) else kinds, bx + self.wr.uniform(-5, 5), bz + self.wr.uniform(-5, 5))

    WAVE = {'roll': (10, 45), 'mid': (12, 50), 'hell': (11, 75)}          # seconds between waves, most alive at once (PHASES)

    def spawn(self):
        self.M = []; self.nextWave = 0.0; self.waveN = 0; self.alive_sum = 0.0; self.alive_n = 0; self.peak = 0
        self.setCar(0)
        if self.scen == 'minis':                            # big single targets: four mini-bosses and a wandering boss, once
            r = self.wr
            for k in ['brute', 'grubber', 'jelly', 'lamprey']:
                a = r.uniform(0, 6.283); self.add(k, self.cx + math.cos(a) * 32, self.cz + math.sin(a) * 32, mini=True)
            a = r.uniform(0, 6.283); self.add('stilt', self.cx + math.cos(a) * 34, self.cz + math.sin(a) * 34, wb=True)
        elif self.scen == 'boss':
            self.boss = dict(x=0.0, z=0.0, r=4.0, dealt=0.0, sawcd=0.0)

    def wave(self):
        s, r = self.scen, self.wr; n = self.waveN; self.waveN += 1
        if s == 'roll':                                     # ROLL OUT: 12 + 8 small ones from two sides
            self.group([r.choice(['gremlin', 'gremlin', 'maw', 'stilt']) for _ in range(12)], 12)
            self.group([r.choice(['gremlin', 'flapper', 'maw', 'gloopling']) for _ in range(8)], 8)
        elif s == 'mid':                                    # scout phase: WAVE_PLANS 4..7 in turn, x1.2, and a mini-boss each wave
            plan = [[('gloop', 2), ('brute', 1), ('gremlin', 8)], [('oculon', 3), ('spitter', 2), ('stilt', 6)], [('spike', 6), ('jelly', 4)], [('grubber', 2), ('lamprey', 4), ('maw', 6)]][n % 4]
            for k, c in plan: self.group(k, round(c * 1.2))
            a = r.uniform(0, 6.283); self.add(r.choice(['brute', 'grubber', 'maw', 'jelly', 'oculon', 'lamprey', 'gloop', 'stilt', 'wingmaw', 'spike']), self.cx + math.cos(a) * 32, self.cz + math.sin(a) * 32, mini=True)
        elif s == 'hell':                                   # hell: ~62 of one kind, ~20 of a heavy/ranged kind, 4 minis a wave for three waves
            A = ['gremlin', 'stilt', 'flapper', 'spitter', 'maw', 'jelly', 'wingmaw', 'spike'][r.randrange(8)]
            B = ['brute', 'spitter', 'gremlin', 'gloop', 'grubber', 'oculon', 'lamprey'][r.randrange(7)]
            for _ in range(4): self.group(A, 16)
            for _ in range(2): self.group(B, 10)
            if n < 3:
                for _ in range(4):
                    a = r.uniform(0, 6.283); self.add(r.choice(['brute', 'grubber', 'maw', 'jelly', 'oculon', 'lamprey', 'gloop', 'stilt', 'wingmaw', 'spike']), self.cx + math.cos(a) * 32, self.cz + math.sin(a) * 32, mini=True)

    def seedA(self): return self.rng.randrange(8)
    def seedB(self): return self.rng.randrange(7)

    # ---------- bookkeeping ----------
    def hit(self, m, dmg, src):
        if not m['alive'] or dmg <= 0: return
        eff = min(dmg, m['hp']); m['hp'] -= dmg
        self.dmgby[src] = self.dmgby.get(src, 0) + eff
        if m['hp'] <= 1e-9:
            m['alive'] = False; self.kills[src] = self.kills.get(src, 0) + 1
            if m['kind'] == 'gloop' and not m['mini']:
                for _ in range(2): self.add('gloopling', m['x'] + self.rng.uniform(-1, 1), m['z'] + self.rng.uniform(-1, 1))

    def bossHit(self, dmg, src):
        self.boss['dealt'] += dmg; self.dmgby[src] = self.dmgby.get(src, 0) + dmg

    def live(self): return [m for m in self.M if m['alive']]

    def hurt(self, d):
        if self.t < self.invul_until or self.t < self.burrow_until: return
        if any(self.t < D['until'] and math.hypot(self.cx - D['x'], self.cz - D['z']) < D['r'] for D in self.domes): return
        self.taken += d

    # ---------- the car ----------
    def setCar(self, t):
        if self.policy.startswith('kite'): R, v = 24.0, 16.0          # circling at speed: outruns the pack, runs over what cuts in
        elif self.policy.startswith('hold'): R, v = 8.0, 6.0          # a slow circle below ramming speed: the guns do the work
        else: R, v = 9.0, 8.0                                # boss: round it close
        w = v / R; a = w * t
        cx, cz = math.cos(a) * R, math.sin(a) * R
        self.vx, self.vz = -math.sin(a) * v, math.cos(a) * v
        self.cx, self.cz, self.speed = cx, cz, v
        self.h = math.atan2(self.vx, self.vz)               # heading as in the game: x = sin(h), z = cos(h)

    def fwd(self): return math.sin(self.h), math.cos(self.h)

    def jump(self):
        self.air = True; self.vy = 15.0; self.airJ = 0

    def land(self):
        self.air = False; self.y = 0.0; self.lastLand = self.t
        for m in self.live():                               # every ride flattens what it lands on
            if m['fly']: continue
            if math.hypot(m['x'] - self.cx, m['z'] - self.cz) < CAR_R + m['r'] + 0.8: self.hit(m, 3 if m['heavy'] else 99, 'land')
        if self.jlv >= 1: self.landPower(self.jlv - 1)

    def isFry(self, m): return not (m['mini'] or m['heavy'])

    def landPower(self, L):
        x, z = self.cx, self.cz
        if self.ride == 'buggy':
            R = STOMP['r'][L]
            for m in self.live():
                d = math.hypot(m['x'] - x, m['z'] - z)
                if d > R: continue
                if L == 0:
                    if m['ranged'] and self.isFry(m): m['stun'] = max(m['stun'], 1.5)
                elif L == 1:
                    if self.isFry(m): m['stun'] = max(m['stun'], 2); self.hit(m, max(1, math.ceil(m['hp0'] * 0.5)), 'jump')
                else:
                    if self.isFry(m): self.hit(m, 999, 'jump')
                    else: m['stun'] = max(m['stun'], 2)
        elif self.ride == 'spider':
            n, R = BROOD['n'][L], BROOD['r'][L]
            near = sorted((math.hypot(m['x'] - x, m['z'] - z), i) for i, m in enumerate(self.M) if m['alive'] and math.hypot(m['x'] - x, m['z'] - z) < R)
            for _, i in near:
                if n <= 0: break
                m = self.M[i]
                if self.isFry(m) and m['ling'] >= 1: continue
                if not self.isFry(m) and m['ling'] >= 4: continue
                m['ling'] += 1; n -= 1
                self.lings.append(dict(m=m, until=self.t + BROOD['slow'][L], boom=L == 2))
        elif self.ride == 'halo':
            self.fields.append(dict(x=x, z=z, R=SPIKE['r'][L], until=self.t + SPIKE['T'][L], next=self.t + 0.12, dmg=SPIKE['dmg'][L]))
        else:
            n, reach, dmg = STARB['n'][L], STARB['reach'][L], STARB['dmg'][L]
            for i in range(n):
                a = i / n * 6.283
                self.bullets.append([x, z, math.sin(a) * 38, math.cos(a) * 38, reach / 38, dmg, 'jump'])

    # ---------- blasts ----------
    def blast(self, x, z, R, dmg, stun, src):
        for m in self.live():
            if math.hypot(m['x'] - x, m['z'] - z) < R + m['r']:
                self.hit(m, dmg, src)
                if stun: m['stun'] = max(m['stun'], 1)

    # ---------- one step ----------
    def step(self):
        t = self.t = self.t + DT
        self.setCar(t)
        fx, fz = self.fwd()
        L = self.live()
        # jump: when three or more are within 10 m (a player jumps into a crowd, not into nothing)
        if self.air:
            self.vy -= 32 * DT; self.y += self.vy * DT
            if self.ride == 'halo' and self.ab is not None and self.vy < 0 and self.airJ < (2 if self.ab >= 1 else 1):
                self.airJ += 1; self.vy = 15 * 0.95                       # the two kangaroos: extra jumps at the top
                if self.ab >= 2: self.blast(self.cx, self.cz, 4.5, 3, False, 'skill')
            if self.y <= 0: self.land()
        elif t - self.lastLand > 0.3 and self.scen != 'boss':
            if sum(1 for m in L if math.hypot(m['x'] - self.cx, m['z'] - self.cz) < 10) >= 3: self.jump()
        burrowed = t < self.burrow_until
        # spider: down for 1.2 s every 6 s; at the top level it surfaces with a blast
        if self.ride == 'spider' and self.ab is not None and t >= self.burrowNext and not self.air:
            self.burrow_until = t + 1.2; self.burrowNext = t + 6
        if self.ride == 'spider' and self.ab is not None and self.ab >= 2 and self.burrow_until > 0 and t >= self.burrow_until and t - DT < self.burrow_until:
            self.blast(self.cx, self.cz, 6, 3, True, 'skill')
        # guns
        if self.scen == 'boss': self.bossGuns(fx, fz); self.t = t; return
        if not burrowed: self.guns(fx, fz, L)
        self.skills(fx, fz, L)
        self.moveBullets()
        self.monsters(fx, fz)

    def nearest(self, L, rng):
        best, bd = None, rng
        for m in L:
            d = math.hypot(m['x'] - self.cx, m['z'] - self.cz)
            if d < bd: best, bd = m, d
        return best, bd

    def guns(self, fx, fz, L):
        r = self.ride
        g = self.gun
        sp = BASE_SPEED[r]; life = BASE_LIFE[r] * (B['fanLife'] if g is not None else 1)
        rate = SPREAD['rate'][g] if g is not None else 1
        self.fireT -= DT
        tgt = getattr(self, 'auto', None)
        if not (tgt and tgt['alive'] and math.hypot(tgt['x'] - self.cx, tgt['z'] - self.cz) < 30):      # pickAutoTarget: sticky, else the nearest
            tgt, bd = None, 26
            for m in L:
                d = math.hypot(m['x'] - self.cx, m['z'] - self.cz) - (4 if m['ranged'] else 0)
                if d < bd: tgt, bd = m, d
            self.auto = tgt
        if self.policy.endswith('-ng'): tgt = None               # the kit alone: the main gun stays quiet
        while tgt is not None and self.fireT <= 0:
            self.fireT += 1 / (11 * rate)
            aim = math.atan2(tgt['x'] - self.cx, tgt['z'] - self.cz)      # the turret aims at the target, no lead
            n = 1 if g is None else (max(1, round(SPREAD['n'][g] * 0.7)) if r == 'halo' else SPREAD['n'][g])
            arc = SPREAD['arc'][g] if g is not None else 0
            for i in range(n):
                a = aim + (arc * (i / (n - 1) - 0.5) if n > 1 else 0) + self.rng.uniform(-0.02, 0.02)
                self.bullets.append([self.cx, self.cz, math.sin(a) * sp, math.cos(a) * sp, life, 1, 'gun'])
        if self.fireT < 0: self.fireT = 0
        if g is None: return
        # nova
        self.novaT -= DT
        if self.novaT <= 0 and any(math.hypot(m['x'] - self.cx, m['z'] - self.cz) < 20 for m in L):
            self.nova(g, fx, fz, L)
        # orbit saws
        n = ORBIT['n'][g] * (2 if r == 'halo' else 1); R = ORBIT['r'][g]
        self.sawA += ORBIT['spd'][g] * (1.86 if r == 'halo' else 1) * DT
        for m in L:
            m['sawcd'] -= DT
            if m['sawcd'] > 0: continue
            for i in range(n):
                a = self.sawA + i / n * 6.283
                if math.hypot(m['x'] - (self.cx + math.cos(a) * R), m['z'] - (self.cz + math.sin(a) * R)) < m['r'] + 0.75:
                    if r == 'unicorn': m['sawcd'] = 0.5; m['stun'] = max(m['stun'], 0.5)
                    else: m['sawcd'] = 0.35; self.hit(m, ORBIT['dmg'][g], 'orbit')
                    break

    def nova(self, g, fx, fz, L):
        r = self.ride
        if r == 'buggy':
            n = NOVA['n'][g]
            for i in range(n):
                a = i / n * 6.283
                self.bullets.append([self.cx, self.cz, math.sin(a) * 42, math.cos(a) * 42, 0.55, NOVA['dmg'][g], 'nova'])
            self.novaT = NOVA['cd'][g]
        elif r == 'spider':
            R = WEB_R[g]; spots = []
            near = sorted((math.hypot(m['x'] - self.cx, m['z'] - self.cz), i) for i, m in enumerate(self.M) if m['alive'])
            for d, i in near:
                if d > 22 or len(spots) >= 4: break
                m = self.M[i]; qx, qz = m['x'] + m.get('vx', 0) * 0.5, m['z'] + m.get('vz', 0) * 0.5
                if not any(math.hypot(sx - qx, sz - qz) < R * 1.3 for sx, sz in spots): spots.append((qx, qz))
            for sx, sz in spots: self.webs.append(dict(x=sx, z=sz, R=R, until=self.t + 3.2, next=self.t))
            self.novaT = NOVA['cd'][g]
        elif r == 'halo':
            n, ln, T = SWORD['n'][g], SWORD['len'][g], SWORD['T'][g]
            ph = self.rng.uniform(0, 6.283)
            self.beams.append(dict(kind='halo', a=[ph + i / n * 6.283 for i in range(n)], len=ln, w=1.1, until=self.t + T, next=self.t, every=D['HALO_SWORDS']['every'], dmg=NOVA['dmg'][g] * D['HALO_SWORDS']['dmgK']))
            self.invul_until = max(self.invul_until, self.t + T)
            self.novaT = max(2, NOVA['cd'][g]) + T
        else:
            per = RB_PER[g]; offs = [0] if per == 1 else [-0.2, 0.2] if per == 2 else [-0.38, 0, 0.38]
            self.beams.append(dict(kind='rainbow', offs=[(b, o) for b in (0, math.pi) for o in offs], len=440, w=2.0, until=self.t + 1.0, next=self.t + 0.2, every=0.2, dmg=NOVA['dmg'][g] * 1.4))
            self.novaT = NOVA['cd'][g]

    def skills(self, fx, fz, L):
        r, ab, t = self.ride, self.ab, self.t
        # beams and swords
        for B in self.beams:
            if t > B['until'] or t < B['next']: continue
            B['next'] += B['every']
            if B['kind'] == 'halo':
                for i in range(len(B['a'])): B['a'][i] += 0.28 * B['every']
                lines = [(self.cx, self.cz, math.sin(a), math.cos(a)) for a in B['a']]
            else:
                lines = []
                for base, o in B['offs']:
                    a = self.h + base + o; front = base == 0
                    ox, oz = self.cx + fx * (2.3 if front else -1.7), self.cz + fz * (2.3 if front else -1.7)
                    lines.append((ox, oz, math.sin(a), math.cos(a)))
            for ox, oz, dx, dz in lines:
                for m in self.live():
                    rx, rz = m['x'] - ox, m['z'] - oz; tt = rx * dx + rz * dz
                    if -m['r'] < tt < B['len'] + m['r'] and abs(rx * dz - rz * dx) < m['r'] + B['w'] * 0.5: self.hit(m, B['dmg'], 'nova')
        self.beams = [B for B in self.beams if t <= B['until']]
        # webs: stun what stands in them
        for W in self.webs:
            if t >= W['next']:
                W['next'] += 0.4
                for m in self.live():
                    if not m['fly'] and math.hypot(m['x'] - W['x'], m['z'] - W['z']) < W['R'] + m['r']: m['stun'] = max(m['stun'], 0.6)
        self.webs = [W for W in self.webs if t < W['until']]
        # light spikes
        for F in self.fields:
            if t >= F['next'] and t < F['until']:
                F['next'] += 0.4
                for m in self.live():
                    if math.hypot(m['x'] - F['x'], m['z'] - F['z']) < F['R'] + m['r']: self.hit(m, F['dmg'], 'jump')
        self.fields = [F for F in self.fields if t < F['until']]
        # spiderlings: slow, and at the top level a 3-damage pop when they are done
        for S in self.lings:
            m = S['m']
            if m['alive']: m['slow'] = max(m['slow'], 0.2)
            if t >= S['until']:
                if S['boom'] and m['alive']: self.hit(m, 3, 'jump')
                m['ling'] = max(0, m['ling'] - 1)
        self.lings = [S for S in self.lings if t < S['until']]
        if ab is None: return
        if r == 'buggy':
            # drill: on for a window each cycle (half a nova cycle away from the burst), grinds everything in the half circle ahead
            C = NOVA['cd'][self.gun] if self.gun is not None else 2.4
            D = 1.0 + (0.5 if ab >= 1 else 0)
            on = abs(self.novaT - C / 2) < min(C * 0.4, D / 2) if self.gun is not None else (t % 2.4) < D
            if on and any(math.hypot(m['x'] - self.cx, m['z'] - self.cz) < 16 for m in L):
                reach = DRILL_REACH * (1.35 if ab >= 2 else 1); dps = 7 * 1.5 * (1.5 if ab >= 2 else 1)
                for m in self.live():
                    dx, dz = m['x'] - self.cx, m['z'] - self.cz
                    if math.hypot(dx, dz) - m['r'] < reach and dx * fx + dz * fz > -m['r'] * 0.6: self.hit(m, dps * DT, 'skill')
            # decoys
            self.decoyT -= DT
            if self.decoyT <= 0 and L:
                self.decoyT = 9; n = 1 + ab
                for i in range(n):
                    a = self.h + (i - (n - 1) / 2) * 0.42; d = self.rng.uniform(7, 16)
                    self.decoys.append(dict(x=self.cx + math.sin(a) * d, z=self.cz + math.cos(a) * d, until=t + 3.2))
            for D_ in self.decoys:
                if t >= D_['until']: self.blast(D_['x'], D_['z'], 5, 6, False, 'skill')
            self.decoys = [D_ for D_ in self.decoys if t < D_['until']]
        elif r == 'halo':
            self.cubeT -= DT
            if self.cubeT <= 0 and L:
                self.cubeT = 15
                for i in range(5 if ab >= 1 else 3): self.cubes.append(dict(state='seek', until=t + 8, eaten=0, wait=t + 0.1 * i, tgt=None, x=self.cx, z=self.cz))
            for C in self.cubes:
                if t >= C['until'] or C['eaten'] >= 5:
                    if ab >= 2: self.blast(C['x'], C['z'], 3.5, 3, False, 'skill')
                    C['state'] = 'gone'; continue
                if t < C['wait']: C['x'], C['z'] = self.cx, self.cz; continue
                if C['state'] == 'seek':
                    tg, d = self.nearest(self.live(), 16)
                    if tg is None: C['x'], C['z'] = self.cx, self.cz; continue
                    C['tgt'] = tg; C['state'] = 'dive'; C['x'], C['z'] = self.cx, self.cz; C['wait'] = t + 0.24
                elif C['state'] == 'dive':
                    m = C['tgt']
                    if not m['alive']: C['state'] = 'seek'; continue
                    dx, dz = m['x'] - C['x'], m['z'] - C['z']; d = math.hypot(dx, dz)
                    if d < 36 * DT + m['r']:
                        big = m['heavy'] or m['mini']
                        self.hit(m, 3 if big else 99, 'skill')
                        for o in self.live():
                            if o is not m and math.hypot(o['x'] - m['x'], o['z'] - m['z']) < 2.6 + o['r']: self.hit(o, 1, 'skill')
                        C['eaten'] += 1; C['state'] = 'seek'; C['wait'] = t + 0.52; C['x'], C['z'] = m['x'], m['z']
                    else: C['x'] += dx / d * 36 * DT; C['z'] += dz / d * 36 * DT
            self.cubes = [C for C in self.cubes if C['state'] != 'gone']
        elif r == 'unicorn':
            self.domeT -= DT
            if self.domeT <= 0 and any(math.hypot(m['x'] - self.cx, m['z'] - self.cz) < BOMB['r'][ab] + 3 for m in L):
                self.domeT = BOMB['cd'][ab]
                self.blast(self.cx, self.cz, BOMB['r'][ab], 1, True, 'skill')
                self.domes.append(dict(x=self.cx, z=self.cz, r=BOMB['r'][ab], until=t + BOMB['T'][ab]))
            self.domes = [D_ for D_ in self.domes if t < D_['until']]
            self.trailT -= DT
            if self.trailT <= 0 and self.speed > 3: self.trailT = 0.09; self.trail.append((self.cx, self.cz, t + TRAIL_T[ab]))
            self.trail = [p for p in self.trail if p[2] > t]
            if int(t / 0.1) != int((t - DT) / 0.1) and self.trail:
                P = np.array([(p[0], p[1]) for p in self.trail])
                for m in self.live():
                    if m['fly']: continue
                    if np.min(np.hypot(P[:, 0] - m['x'], P[:, 1] - m['z'])) < 1.5:
                        m['lost'] = 2.0
                        if ab >= 2: m['slow'] = max(m['slow'], 2.0)

    def moveBullets(self):
        if not self.bullets: return
        B = np.array([b[:6] for b in self.bullets], dtype=float)
        B[:, 0] += B[:, 2] * DT; B[:, 1] += B[:, 3] * DT; B[:, 4] -= DT
        L = self.live()
        keep = B[:, 4] > 0
        if L:
            MX = np.array([[m['x'], m['z'], m['r']] for m in L])
            D = np.hypot(B[:, 0:1] - MX[None, :, 0], B[:, 1:2] - MX[None, :, 1]) - MX[None, :, 2] - 0.35
            for bi in np.where((D < 0).any(axis=1) & keep)[0]:
                for mi in np.argsort(D[bi]):
                    if D[bi, mi] >= 0: break
                    if L[mi]['alive']: self.hit(L[mi], B[bi, 5], self.bullets[bi][6]); keep[bi] = False; break
        self.bullets = [[*B[i, :6], self.bullets[i][6]] for i in range(len(self.bullets)) if keep[i]]

    def monsters(self, fx, fz):
        L = self.live()
        if not L: return
        t = self.t
        for m in L:
            for k in ('stun', 'slow', 'lost', 'cd', 'horncd'): m[k] = max(0.0, m[k] - DT)
            dx, dz = self.cx - m['x'], self.cz - m['z']; d = math.hypot(dx, dz) or 1e-4
            nx, nz = dx / d, dz / d
            sp = m['sp'] * (0.5 if m['slow'] > 0 else 1)
            if m['kind'] == 'lamprey': sp *= 1.75 if d < 10 else 0.7
            tx, tz = self.cx, self.cz
            dec = [D_ for D_ in self.decoys if math.hypot(D_['x'] - m['x'], D_['z'] - m['z']) < 22]
            if dec: tx, tz = dec[0]['x'], dec[0]['z']; sp *= 1.15
            if t < self.burrow_until: vx, vz = -nx * sp, -nz * sp          # the car went under: they scatter
            elif m['lost'] > 0: vx, vz = m['wx'] * sp * 0.5, m['wz'] * sp * 0.5
            elif m['ranged'] and not m['mini'] and d < 11: vx, vz = -nx * sp, -nz * sp
            elif m['ranged'] and not m['mini'] and d < 15: vx, vz = -nz * sp * 0.6, nx * sp * 0.6
            else:
                ex, ez = tx - m['x'], tz - m['z']; e = math.hypot(ex, ez) or 1e-4; vx, vz = ex / e * sp, ez / e * sp
            if m['stun'] > 0: vx = vz = 0
            m['vx'], m['vz'] = vx, vz
            m['x'] += vx * DT; m['z'] += vz * DT
            for D_ in self.domes:                                          # a dome keeps them out
                ox, oz = m['x'] - D_['x'], m['z'] - D_['z']; od = math.hypot(ox, oz) or 1e-4
                if od < D_['r'] + m['r']: m['x'] = D_['x'] + ox / od * (D_['r'] + m['r']); m['z'] = D_['z'] + oz / od * (D_['r'] + m['r'])
            # ranged: an acid glob every ~3 s from 17 m
            if m['ranged'] and d < 17 and self.rng.random() < DT / 3.1 and not self.air: self.hurt(8)
            # contact
            dx, dz = m['x'] - self.cx, m['z'] - self.cz; d = math.hypot(dx, dz) or 1e-4
            if self.ride == 'unicorn' and self.speed >= 7 and m['horncd'] <= 0 and d < CAR_R + m['r'] + 1.3 and (dx * fx + dz * fz) / d >= 0.55 and self.y < 3.2:
                m['horncd'] = 0.45; self.hit(m, 6 if self.speed > 18 else 4, 'horn')
                if not m['alive']: continue
            if d < CAR_R + m['r'] and t >= self.burrow_until:
                if not m['fly'] and not m['heavy'] and not m['spiky'] and self.speed > 9 and self.y < 0.8: self.hit(m, 999, 'ram'); continue
                push = CAR_R + m['r'] - d; m['x'] += dx / d * push; m['z'] += dz / d * push
                airOK = self.y < m['fly'] + 1.5 if m['fly'] else self.y < 1.2
                if airOK and m['cd'] <= 0 and m['stun'] <= 0: m['cd'] = 0.9; self.hurt(m['bite'])
        # keep them from stacking into one point
        L = self.live()
        if len(L) > 1:
            P = np.array([[m['x'], m['z'], m['r']] for m in L])
            dx = P[:, None, 0] - P[None, :, 0]; dz = P[:, None, 1] - P[None, :, 1]; d = np.hypot(dx, dz) + np.eye(len(L)) * 1e3
            ov = (P[:, None, 2] + P[None, :, 2]) - d
            ov[ov < 0] = 0
            sx = (dx / np.maximum(d, 1e-3) * ov).sum(axis=1) * 0.5; sz = (dz / np.maximum(d, 1e-3) * ov).sum(axis=1) * 0.5
            for i, m in enumerate(L): m['x'] += sx[i]; m['z'] += sz[i]

    def bossGuns(self, fx, fz):
        """Boss: only what can hurt the Pyramidon (bullets, nova, orbit, drill, beams); everything is measured as damage per second."""
        Bs = self.boss; r = self.ride; g = self.gun; t = self.t
        d = math.hypot(Bs['x'] - self.cx, Bs['z'] - self.cz)
        sp = BASE_SPEED[r]; life = BASE_LIFE[r] * (B['fanLife'] if g is not None else 1)
        rate = SPREAD['rate'][g] if g is not None else 1
        self.fireT -= DT
        while self.fireT <= 0:
            self.fireT += 1 / (11 * rate)
            aim = math.atan2(Bs['x'] - self.cx, Bs['z'] - self.cz)
            n = 1 if g is None else (max(1, round(SPREAD['n'][g] * 0.7)) if r == 'halo' else SPREAD['n'][g])
            arc = SPREAD['arc'][g] if g is not None else 0
            for i in range(n):
                a = aim + (arc * (i / (n - 1) - 0.5) if n > 1 else 0)
                # a pellet lands if its line passes within the boss's radius
                if abs(math.sin(a - aim)) * d < Bs['r'] + 0.15 and d < sp * life: self.bossHit(1, 'gun')
        if g is None: return
        self.novaT -= DT
        if self.novaT <= 0:
            if r == 'buggy':
                n = NOVA['n'][g]; ang = 2 * math.asin(min(1, (Bs['r'] + 0.15) / d)); k = max(0, round(n * ang / 6.283)) if d < 42 * 0.55 + Bs['r'] else 0
                self.bossHit(k * NOVA['dmg'][g], 'nova'); self.novaT = NOVA['cd'][g]
            elif r == 'spider': self.novaT = NOVA['cd'][g]
            elif r == 'halo':
                ph = self.rng.uniform(0, 6.283); n, ln, T = SWORD['n'][g], SWORD['len'][g], SWORD['T'][g]
                self.beams.append(dict(kind='halo', a=[ph + i / n * 6.283 for i in range(n)], len=ln, w=1.1, until=t + T, next=t, every=D['HALO_SWORDS']['every'], dmg=NOVA['dmg'][g] * D['HALO_SWORDS']['dmgK']))
                self.novaT = max(2, NOVA['cd'][g]) + T
            else:
                per = RB_PER[g]; offs = [0] if per == 1 else [-0.2, 0.2] if per == 2 else [-0.38, 0, 0.38]
                self.beams.append(dict(kind='rainbow', offs=[(b, o) for b in (0, math.pi) for o in offs], len=440, w=2.0, until=t + 1.0, next=t + 0.2, every=0.2, dmg=NOVA['dmg'][g] * 1.4))
                self.novaT = NOVA['cd'][g]
        for B in self.beams:
            if t > B['until'] or t < B['next']: continue
            B['next'] += B['every']
            if B['kind'] == 'halo':
                for i in range(len(B['a'])): B['a'][i] += 0.28 * B['every']
                lines = [(self.cx, self.cz, math.sin(a), math.cos(a)) for a in B['a']]
            else:
                lines = []
                for base, o in B['offs']:
                    a = self.h + base + o; front = base == 0
                    lines.append((self.cx + fx * (2.3 if front else -1.7), self.cz + fz * (2.3 if front else -1.7), math.sin(a), math.cos(a)))
            for ox, oz, dx, dz in lines:
                rx, rz = Bs['x'] - ox, Bs['z'] - oz; tt = rx * dx + rz * dz
                if -4 < tt < B['len'] + 4 and abs(rx * dz - rz * dx) < 4 + B['w'] * 0.5: self.bossHit(B['dmg'], 'nova')
        self.beams = [B for B in self.beams if t <= B['until']]
        n = ORBIT['n'][g] * (2 if r == 'halo' else 1); R = ORBIT['r'][g]
        self.sawA += ORBIT['spd'][g] * (1.86 if r == 'halo' else 1) * DT; Bs['sawcd'] -= DT
        if r != 'unicorn' and Bs['sawcd'] <= 0:
            for i in range(n):
                a = self.sawA + i / n * 6.283
                if math.hypot(Bs['x'] - (self.cx + math.cos(a) * R), Bs['z'] - (self.cz + math.sin(a) * R)) < 4.6: Bs['sawcd'] = 0.35; self.bossHit(ORBIT['dmg'][g], 'orbit'); break
        if r == 'buggy' and self.ab is not None:
            C = NOVA['cd'][g]; D = 1.0 + (0.5 if self.ab >= 1 else 0)
            if abs(self.novaT - C / 2) < min(C * 0.4, D / 2):
                reach = DRILL_REACH * (1.35 if self.ab >= 2 else 1)
                dx, dz = Bs['x'] - self.cx, Bs['z'] - self.cz
                if d - Bs['r'] < reach and dx * fx + dz * fz > -Bs['r'] * 0.6: self.bossHit(7 * 2 * (1.5 if self.ab >= 2 else 1) * DT, 'skill')

    def run(self, T=None):
        T = T or (75.0 if self.scen in self.WAVE else 60.0 if self.scen == 'minis' else 30.0)
        while self.t < T:
            if self.scen in self.WAVE:
                gap, cap = self.WAVE[self.scen]; alive = sum(1 for m in self.M if m['alive'])
                if self.t >= self.nextWave and alive < cap: self.wave(); self.nextWave = self.t + gap
                self.alive_sum += alive; self.alive_n += 1; self.peak = max(self.peak, alive)
            self.step()
            if self.scen == 'minis' and not any(m['alive'] for m in self.M): break
        if self.scen == 'boss':
            return dict(dps=self.boss['dealt'] / self.t, by={k: v / self.t for k, v in self.dmgby.items()})
        hp0 = sum(m['hp0'] for m in self.M)
        left = sum(max(0, m['hp']) for m in self.M if m['alive'])
        return dict(clear=self.t if not any(m['alive'] for m in self.M) else None, t=self.t, killed=sum(self.kills.values()), n=len(self.M),
                    hpFrac=1 - left / hp0, taken=self.taken, kills=self.kills, dmg=self.dmgby, waves=self.waveN,
                    alive=self.alive_sum / max(1, self.alive_n), peak=self.peak)


RIDES = ['buggy', 'spider', 'halo', 'unicorn']


def job(a):
    ride, tier, scen, pol, seed = a
    return (ride, tier, scen, pol, seed), Fight(ride, tier, scen, pol, seed).run()


if __name__ == '__main__':
    if len(sys.argv) > 1:
        ride, tier, scen, pol, seed = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], int(sys.argv[5])
        print(json.dumps(Fight(ride, tier, scen, pol, seed).run(), indent=1, default=float)); sys.exit()
    from multiprocessing import Pool
    jobs = [(r, t, s, p, sd) for r in RIDES for t in range(4) for s in ['roll', 'mid', 'hell', 'minis'] for p in ['kite', 'hold'] for sd in range(8)]
    jobs += [(r, t, 'hell', 'hold-ng', sd) for r in RIDES for t in range(1, 4) for sd in range(8)]
    jobs += [(r, t, 'boss', 'boss', sd) for r in RIDES for t in range(4) for sd in range(2)]
    jobs.sort(key=lambda j: -('hell' in j) - 0.5 * (j[1] == 0))      # the long ones first
    out = {}
    with Pool(2) as P:
        for k, v in P.imap_unordered(job, jobs, chunksize=2):
            out['|'.join(map(str, k))] = v
    json.dump(out, open(sys.argv[0].replace('sim.py', 'results.json'), 'w'), default=float)
    print(len(out), 'runs')
