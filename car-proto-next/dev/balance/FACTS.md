# car-proto.html balance facts (read-only extraction)

File: /home/claude/car-proto.html. "L123" = line number. Numbers are quoted as in code. "lv" naming: the HUD shows gun levels Lv1..3 and skills Lv1..3 (stars); in code, guns are stored as `weapons[k]` = 1 / 3 / 5 (gainWeapon adds +2 per upgrade, L4971-4975, `W_MAX=5` L4937) and the `W_STATS` arrays have 5 slots, of which ONLY slots 0, 2, 4 are ever used (index = weapons[k]-1). Skills are stored as `abLv[t]` = 0 / 1 / 2 (`AB_LV_MAX=2`, L4641); the jump goes 0..3 (`abMax('jump')=3`).

Costs (L4588-4589, L4640): skill upgrade `LOOT.abCost=[100,200,300]` coins (price = abCost[abLv]); gun upgrade `LOOT.wCost=[30,60]` crystals (price = wCost[(weapons-1)>>1]); shop `conv:[100,10]` = 100 coins -> 10 crystals. Death (`deathToll` L5148) removes one random upgrade level, or if nothing is levelled, one random skill/gun.

Facts that change the picture (read these first):
- Mortar (`w_mortar`, W_STATS.mortar L4945) is UNOBTAINABLE: pedestals only use `W_GEAR=['spread','nova','orbit']` (L4864), tokens/drops never give `w_mortar`. Dead code.
- Frog Tongue / `grab` / `throwMul()` (L4120) is UNOBTAINABLE: not in any `RIDE_KIT` (L4581). `throwMul()` is always 1. The only things that ever give a skill are `kit()` entries.
- Rigs (log machines) cannot be hurt by weapons: `RIG.tame: true` (L5835); `hitCritter` returns at once for rigs (L5804) and bullets skip them (L8055). They die only to 3 bomb hits (`m.rig.hits` L6215), bombs spawn via `updateBombs`.
- Bullets have NO pierce: every bullet is removed on the first hit (L8037-8075). All base-gun/spread/nova bullets carry `dmg` (default 1).
- No crits, no global damage multiplier, no per-ride damage multiplier on the base gun. Only ride-specific numbers are listed below.
- Ram: a car moving at `carSpeed > 9` with `y<0.8` instantly kills (killCritter) any swarm critter that is not `fly`, not `heavy`, not `spiky` (L6464). Minis/wanderers are `spiky` (set in makeMini L5827), so they are immune. This is the same for all four rides (no per-ride ram damage).

---
## 1. Base gun per ride

Firing: `FIRE_RATE = 11` shots/s (L2789). Cooldown set at L8031: `fireCooldown = 1 / (FIRE_RATE * (weapons.spread ? W_STATS.spread.rate[weapons.spread-1] : 1))`. Gun code `fire()` L2854-2878. Same cadence for all rides. `RIDES[...]` (L2449) only holds turret offsets.

| | buggy | spider | halo | unicorn |
|---|---|---|---|---|
| bullet damage | 1 (`dmg: 1` L2872) | 1 | 1 | 1 |
| shots per press, no spread gun | 1 | 1 | 1 | 1 |
| interval | 1/11 = 0.0909 s | same | same | same |
| projectile speed | 70 | 52 (`star ? 52`) | 66 (`holy ? 66`) | 70 |
| lifetime (no spread gun) | 1.1 s | 1.4 s | 1.1 s | 1.1 s |
| range = speed x life | 77 | 72.8 | 72.6 | 77 |
| lifetime with spread gun owned | x0.85 | 1.19 s | 0.935 s | 0.935 s |
| range with spread gun | 65.5 | 61.9 | 61.7 | 65.5 |
| pierce | none | none | none | none |
| splash | none | none | none | none |

(buggy and unicorn share the bullet branch: `star ? 52 : holy ? 66 : 70`, life `(star ? 1.4 : 1.1) * (lv ? 0.85 : 1)`, L2872.) Spider's bullet is a spinning caltrop mesh (`starGeo`), same dmg 1. Spread per bullet random jitter `rand(-0.02, 0.02)` rad (L2866).

Spread gun (`w_spread`) = the only "fan": `n = W_STATS.spread.n[lv-1]`, halo uses `Math.max(1, Math.round(n * 0.7))` (L2862).
| gun lvl (weapons=) | pellets buggy/spider/unicorn | pellets halo | arc (rad) | fire-rate mult | resulting shots/s | pellet-dmg/s if all hit (non-halo / halo) |
|---|---|---|---|---|---|---|
| Lv1 (1) | 3 | 2 | 0.3 | 1.0 | 11 | 33 / 22 |
| Lv2 (3) | 5 | 4 (round 3.5) | 0.5 | 1.12 | 12.32 | 61.6 / 49.3 |
| Lv3 (5) | 9 | 6 (round 6.3) | 0.72 | 1.25 | 13.75 | 123.8 / 82.5 |
Source: `spread: { n:[3,5,5,7,9], arc:[0.3,0.4,0.5,0.6,0.72], rate:[1,1.05,1.12,1.18,1.25] }` L4941. Every pellet is dmg 1. Pellets spread evenly over `arc`, so on a single target only the pellets that overlap it connect (a close target is hit by more of the fan).

Gun-owning order: first pedestal gun `firstGun()` = pedestals[0].k, or `'nova'` for halo else `'spread'` (L4293, comment: "the halo's own gun is weak: it starts with the nova"). The two other pedestals give the rest of `W_GEAR`.

How bullets hit (L8037-8075): vs critter if `hypot < m.r + 0.35` and `bp.y < critterTop(m)+0.6` (critterTop = fly + size*0.85, L6296); vs evil cube if `hypot < e.r + 0.25`; vs crate/boss obstacle box +0.15. `hitCritter(m, b.dmg||1, dir, 2.5)` L5802: `m.hp -= dmg`; extra: rigs soak 60% (`dmg *= 0.4` if push<=3 and not from the back window, L5806 - moot while tame). Knockback `push * (heavy ? 0.3 : 1)`. Bullets vs boss: `bossDamage(b.dmg||1)` L8069.

---
## 2. Pedestal weapons (nova / orbit) and the one-shot tokens

Pedestals (L4290-4410): 3 pedestals, one per `W_GEAR` (spread, nova, orbit). Walking within 25 m (`PED_RISE_R` L4297) wakes it and spawns an ambush `ambush(x,z,big)` (L4314): 13 critters (`['gremlin','gremlin','maw','stilt','maw'][j%5]`), 18 if `big` (every gun except the first), plus 1 mini-boss, all `guard`; pedestal opens when guards within 32 m are dead and >2 s passed. Pickup radius 3.4 m. W_MAX=5.

### Spread: see section 1.

### Nova (`w_nova`) - per-ride version. Table `nova: { cd:[2.4,2.1,1.8,1.55,1.3], n:[10,14,18,22,28], dmg:[1,1,1.5,1.5,2] }` (L4942); used slots 0/2/4 (cd 2.4 / 1.8 / 1.3; dmg 1 / 1.5 / 2). Fire logic L5321: fires when `novaT<=0` and `threatNear(20)` (something within 20 m), else retries every 0.15 s. After firing `novaT = nova.cd[...]` (halo: `Math.max(2, cd) + SWORD_T[...]`).

| ride | what it is | Lv1 | Lv2 | Lv3 |
|---|---|---|---|---|
| buggy `fireNova` L4981 | ring of bullets, speed 42, life 0.55 (range 23.1 m), no pierce; each bullet dmg=nova.dmg | n=10, dmg 1 (10 dmg/burst), cd 2.4 | n=18, dmg 1.5 (27), cd 1.8 | n=28, dmg 2 (56), cd 1.3 |
| spider `fireWebs` L5090 | 4 webs (`WEB_N=4`), life `WEB_T=3.2`s, NO damage, stun 0.6 s re-applied every 0.4 s to non-fliers inside; also stuns awake evil cubes. Levels only widen. `WEB_R=[2.3,2.9,3.5,4.2,5.0]` L5083 | R 2.3 cd 2.4 | R 3.5 cd 1.8 | R 5.0 cd 1.3 |
| halo `fireBeams('halo')` L5033 | ring of swords; while any of your own swords is out you are untouchable (`haloHoly`, hurtCar L3180). Sword tick every `every:0.12` s, dmg per tick `nova.dmg*0.9` per sword (swords overlapping the same target each hit it), width `w:1.1`; swords rotate `D.a += dt*0.28` | n=4 swords, len 7, T=SWORD_T 1.2 s, dmg 0.9/tick, cycle cd = max(2,2.4)+1.2 = 3.6 s | n=6, len 11, T 1.9 s, 1.35/tick, cycle 2+1.9 = 3.9 s | n=8, len 16, T 2.8 s, 1.8/tick, cycle 2+2.8 = 4.8 s |
| unicorn `fireBeams('rainbow')` L5042 | rainbow beams both ends (front and rear, offs [0] / [-0.2,0.2] / [-0.38,0,0.38]), length `2*ARENA+80` = 440, width `w:2.0`, T=1.0 s, tick every 0.2 s, dmg per tick `nova.dmg*1.4 * 0.2/0.12` = nova.dmg*2.333 per beam. Beams pass through everything (no pierce limit). | 2 beams (1 per end), 2.33/tick, ~5 ticks, cd 2.4 | 4 beams, 3.5/tick, cd 1.8 | 6 beams, 4.67/tick, cd 1.3 |
Beam hits (`beamHits` L5052): evil cubes (hitEnemy dmg), all swarm, crates, and boss (`on(BOSS_POS,4)` -> `bossDamage(dmg)`) once per beam per tick. Halo: nova pulse damage on a target within sword reach over one cycle is roughly dmg*0.9 per tick x (T/0.12) ticks per sword: Lv1 ~ 0.9x10 = 9, Lv2 1.35x15.8=21 per sword, Lv3 1.8x23.3=42 per sword (a target crossed by one sword). Swords sweep at ~0.28 rad/s so a target stays under one sword a good part of the time.

### Orbit (`w_orbit`) `orbit: { n:[2,3,3,4,5], r:[4.0,4.3,4.6,5.0,5.4], spd:[3.0,3.2,3.5,3.8,4.2], dmg:[1,1.2,1.5,1.8,2.2] }` L4943; updateSaws L5206.
| | Lv1 | Lv2 | Lv3 |
|---|---|---|---|
| saws (buggy / spider) | 2 | 3 | 5 |
| saws (halo doubles: `n * (ride==='halo' ? 2 : 1)`) | 4 | 6 | 10 |
| orbit radius | 4.0 | 4.6 | 5.4 |
| angular speed rad/s (halo x1.86) | 3.0 | 3.5 | 4.2 |
| dmg per hit | 1 | 1.5 | 2.2 |
Per-target hit cooldown `sawCd = 0.35` s (shared by all saws: extra saws do not stack on one target; they just cover more of the circle). So single-target dps cap = dmg/0.35 = 2.86 / 4.29 / 6.29. Hit radius `m.r + 0.75` (critters), `e.r + 0.65` (cubes), crates, boss within 4.6 (`bossDamage(S.dmg[L])`, boss cd 0.35). Knockback push 6. Unicorn: the saws are dodecahedra that do NO damage: `m.sawCd = 0.5; stunCritter(m, 0.5)` on touch (only swarm critters, not evil cubes) (L5226-5233).

### Mortar: unobtainable (see top). Stats if ever given: `mortar: { cd:[4.2,3.6,3.1,2.7,2.2], r:[4.2,4.7,5.2,5.8,6.6], dmg:[4,5,6.5,8,10] }`, flight 0.85 s, dmg falls to `dmg*(1-0.4*d/R)` at edge, boss `dmg*1.5`.

### One-shot tokens (`X_TOKENS` L4768, `fireToken` L4850): dropped by evil elites (`dropLoot` L4847: 65% token, 35% medkit) and by `dropWeapon` (L4959; called from crate breaks `crateDrop` L4964 after the warm-up with prob min(0.8, 0.35*(1+0.5*remotes)) and first crate guaranteed, and from mini-boss deaths when PH.i>0; inside dropWeapon: 30% token, 12% heal, 58% nothing; max 2 tokens within 45 m).
- x_spread: 36 bullets ring, x_nova: 28 bullets ring; speed 44, dmg 3 each, life 0.8 / 0.6 (L4855).
- x_saw: `ringBlast(x, z, 7, 5, 14)` (r 7, dmg 5, push 14).
- x_decoy: 3 decoys; x_cubes: `spawnCubes(4, null, 1)`; x_dome: dome r 9, T 3 + `blastAt(x,z,9,1,26,true)`.
- Medkit heals 40% maxHp.

---
## 3. Skills per ride (RIDE_KIT L4581): buggy [drill, decoy, jump], spider [burrow, jump], halo [jump, doubleJump, cubes], unicorn [bomb, trail, jump]
Skills come from wandering bosses (`wbGift`), not buyable. Level costs 100/200 (/300 for jump) coins each.

Common `blastAt(x,z,r,dmg,push,stun)` L4126: every swarm critter with `d < r + m.r` takes `dmg`; evil cubes take `max(1, dmg*0.5)`; stun sets `stun = max(stun,1)` (1 s). Does NOT hit bosses/crates.

### Buggy
- Drill (auto, passive, `updateDrill` L3688): `DRILL_DPS=7`, `DRILL_REACH=4.6*1.5=6.9` m, 180-degree arc ahead (`inDrillArc` L3658-3664). Spins only if a threat is within 16 m. Burst timing (`drillAuto` L3666): on-window `D = 1.0 + (abLv>=1 ? 0.5 : 0)` s, centred half a nova-cycle away from the nova pulse (`|novaT - C/2| < min(C*0.4, D/2)`); without a nova gun: `drillCyc % 2.4 < D`. Damage only applies when `drillRPM >= 0.55` (RPM ramps 1-e^(-5t), 0.55 after ~0.16 s). Damage per frame `DRILL_DPS*dt*RPM*(abLv>=2 ? 1.5 : 1)`. Critters take x1.5 (`dmg*1.5`, L3750): 10.5 dps (Lv1,2) -> 15.75 dps (Lv3). Evil cubes take dmg x1 (7 -> 10.5 dps), crates x1, boss x2 (14 -> 21 dps). Reach x1.35 at abLv>=2 (`drillRMul`, 9.3 m). Drilling slows the car (`car.speed *= 1 - 1.5*dt`) and keeps targets from biting (`m.cd >= 0.25`). Levels: abLv1 = longer spin (1.0 -> 1.5 s on-window), abLv2 = wider (x1.35) and 1.5x dmg.
- Decoy Chubz (RMB, `throwDecoys` L4169): `DECOY_CD = 9` s, `DECOY_T = 3.2` s fuse, count `n = 1 + abLv.decoy` (1 / 2 / 3), thrown 7-16 m, fan 0.42 rad apart. Every critter within 22 m (`decoyNear`) runs to it at 1.15 x speed ("squeak"); on expiry `blastAt(D.x, D.z, 5, 6, 18, false)`: r 5, dmg 6 (3 to evil cubes), push 18. No other per-level change besides count. (Token x_decoy gives 3.)
- Jump = Stomp, see jump table below.

### Spider
- Mole (RMB `toggleBurrow` L4034): dig in `SINK_TIME=0.35`, rise `RISE_TIME=0.4` s, toggle cooldown `burrowCd = 0.25` s, no ability cooldown beyond that. While burrowed (`car.burrow !== 'up'`) hurtCar is ignored (hurtCar L3178 returns when burrow !== 'up') and critters scatter (`!seen` -> flee). abLv1: `digTime` x1.6 (`DIG_TIME=3` s to dig out an elite cube, L7200; "harder to dig out"). abLv2: surfacing calls `surfaceBlast()` = `ringBlast(x, z, 6, 3, 18, color, true)` (r 6, dmg 3, push 18, stun 1 s) (L4050, L4130).
- Jump = Brood, see below. Spider hp 50 (L2690).

### Halo
- Wing Cubes (RMB `releaseCubes` L4210): `CUBE_CD = 15` s, `CUBE_T = 8` s lifetime, count `abLv.cubes >= 1 ? 5 : 3` (3 / 5 / 5). Each cube: hover by the car, picks nearest swarm critter within 16 m (never evil cubes), aim 0.24 s, dive speed 36, on contact `cubeBoom` (L4230): victim `hitCritter(m, big ? 3 : 99)` where big = heavy/elite/mini/rig (3 dmg to heavy/mini/wanderer, instant kill to everything else), plus every other critter within `2.6 + r` takes 1 dmg (push 5). After a hit: rise 0.32 s + wait 0.2 s then new target. A cube is removed when `eaten >= 5` or after 8 s. abLv2: swelled cubes (visual `sc` grows 0.18/eaten) and on removal `cubePop` -> `ringBlast(x, z, 3.5, 3, 12)` (r 3.5, dmg 3, push 12). Cubes ignore rigs only via `hitCritter`'s tame check.
- Two Kangaroos (doubleJump, passive, L4421): second mid-air jump `vy = JUMP_V*0.95` (14.25). abLv1: a third jump (`airJumps >= 1 + (abLv>=1 ? 1:0)`). abLv2: each air-jump fires `ringBlast(car.pos, 4.5, 3, 12)` (r 4.5, dmg 3, push 12, no stun) at the point of the jump.
- Jump = Light Spikes, see below. Halo hover: no per-ride ram. Swords = invulnerability.

### Unicorn
- Dome Bomb (RMB `bombDome` L4134): `BOMB = { r:[7,9,11], T:[2,3,4], cd:[12,11,10] }` (L4131), indexed by abLv. On cast `blastAt(x,z,r,1,26,true)`: dmg 1 (0.5->1 to cubes), push 26, stun 1 s. While the dome stands (T s), swarm critters and evil cubes cannot enter it and the car inside is untouchable (hurtCar `inDome`, L3179). No damage after the cast.
- Rainbow Trail (passive, `trailFor` L4271): trail dot every 0.09 s while speed > 3; lifetime `TRAIL_T = [3,5,5]` s (abLv 0/1/2); critters (non-fliers) within 1.5 m of a dot get `m.lost = 2` (2 s wander, stop chasing); abLv2 also `m.slow = 2` (half speed). No damage. Checked every 0.1 s.
- Horn (always on, `updateHorn` L2722): when speed >= 7 and a target is within `radius + r + 1.3` straight ahead (dot >= 0.55) and within 3.2 m vertically: `dmg = sp > 18 ? 6 : 4` to a critter or awake evil cube, per target cooldown 0.45 s, push 12 (critter) / 8 (cube). This is the unicorn's contact damage. Unicorn nova = rainbow beams, orbit = stun dodecahedra.

### Jump (all rides): `JUMP_V = 15`, `CAR_G = 32` (L4412), airtime about 0.94 s, apex ~3.5. NO cooldown exists (`updateJump` L4428 / `jump()` L4413): you can jump again the moment you land. Spider kicks off walls (`vy*0.6`, +10 along normal). Jump itself unlocked from start (`abilities.jump: true` L4579).
Base landing (every ride, even Lv0): flat critters within `car.radius(1.6) + m.r + 0.8` that are not fliers take `hitCritter(m, heavy ? 3 : 99)` (L4449); evil cubes within `radius + e.r*0.8` take 2 dmg + 0.8 s stun; crates within radius break. Levelled landing power `landPower(abLv.jump)` (L4562) triggers when `abLv.jump >= 1 && impact > 8` (impact = -vy, ~15 on a normal jump).
Jump upgrade levels (cost 100/200/300 coins):

| ride | power | Lv1 | Lv2 | Lv3 |
|---|---|---|---|---|
| buggy Stomp `STOMP = { r:[7,8.5,10], stun:[1.5,2,2] }` L4475 (`stompAt` L4476). "Fry" = not mini/wanderer/rig/heavy/elite (`isFry` L4469) | radius | 7: stuns only ranged fry for 1.5 s | 8.5: stuns all fry 2 s and deals `max(1, ceil(K.hp * coop * 0.5))` (half the hp, min 1) | 10: kills all fry (999); stuns everything non-fry in range (minis, wanderers, heavy; not rigs) 2 s |
| evil cubes in the stomp (`stomp` L4486) | | non-elite stunned 1.5 s | non-elite stunned 2 s + `ceil(maxHp*0.5)` = 5 dmg | non-elite 99 dmg; elites stunned 2 s only (elites never damaged by stomp) |
| spider Brood `BROOD = { n:[6,10,10], r:[9,11,11], slow:[3,4.5,4.5] }` L4494 | spiderlings | 6, search 9 m, ride 3 s | 10, search 11 m, 4.5 s | 10, 11 m, 4.5 s, each blows up when done: `hitCritter(m, 3)` |
| | effect | each sits on a target and re-applies slow (x0.5 speed) for 0.7 s every 0.4 s; max 1 spiderling per fry, up to 4 per big monster; spiderling life 9 s, 2.6 s if no target | | no direct damage before Lv3; Lv3 = 3 dmg each x 10 = up to 30 dmg spread over targets |
| halo Light Spikes `SPIKE = { n:[6,11,18], r:[3,5,7.5], h:[1.7,2.7,3.8], T:[1.3,2.6,4], dmg:[1,1,2] }` L4532 | field | 6 spikes, R 3, lasts 1.3 s | 11 spikes, R 5, 2.6 s | 18 spikes, R 7.5, 4 s |
| | damage | every 0.4 s (first tick 0.12 s) to every swarm critter (not digging) and awake cube inside `R + r`: dmg 1 -> ticks at 0.12/0.52/0.92 = 3 ticks = 3 dmg total | 7 ticks x 1 = 7 dmg | 10 ticks x 2 = 20 dmg; push 1.5 only |
| unicorn Starburst `STARB = { n:[10,16,24], reach:[9,13,17], dmg:[1,1,1.5] }` L4554 | bullet ring from the car, speed 38, life reach/38, no pierce | 10 bullets, reach 9, dmg 1 | 16, reach 13, dmg 1 | 24, reach 17, dmg 1.5 |
Spikes/Brood/Stomp never damage the boss, nor do Cubes or Horn. The landing does not affect rigs (isFry excludes, `m.rig` skipped in stompAt/brood).

---
## 4. Monsters

### Swarm table `SW_KINDS` L5340-5356 (hp, speed in m/s, size, hit radius r, bite = damage to the car, flags)
| kind | hp | speed | size | r | bite | flags |
|---|---|---|---|---|---|---|
| gremlin | 1 | 12.5 | 1.8 | 0.55 | 5 | |
| stilt | 2 | 9.5 | 3.4 | 0.55 | 7 | |
| brute | 9 | 6 | 3.9 | 1.35 | 12 | heavy |
| flapper | 1.5 | 11 | 2.3 | 0.65 | 4 | fly 2.4 |
| spitter | 2 | 7.5 | 2.1 | 0.65 | 5 | ranged |
| maw | 2 | 13.5 | 3.0 | 0.6 | 6 | |
| oculon | 3 | 7 | 3.3 | 0.7 | 5 | ranged |
| gloop | 12 | 5 | 2.7 | 1.2 | 8 | heavy, split into 2 gloopling on death (not for minis, L5798) |
| gloopling | 2 | 10 | 1.5 | 0.5 | 4 | |
| jelly | 3 | 8.5 | 4.4 | 0.6 | 9 | |
| grubber | 14 | 5.5 | 4.9 | 1.5 | 14 | heavy |
| lamprey | 4 | 9.5 | 4.2 | 0.7 | 10 | lunge: x1.75 speed when dist < 10, else x0.7 |
| spike | 3 | 15.5 | 2.3 | 0.75 | 9 | spiky: cannot be run over |
| wingmaw | 2.5 | 12 | 3.1 | 0.7 | 6 | fly 1.0 |
No "damage" stat other than `bite`. Bite fires when within `car.radius(1.6)+K.r`, cooldown `m.cd = 0.9` s (L6468), only if the car is `y < 1.2` (`T.y < K.fly+1.5` for fliers), not burrowed. Critter speed is the steady chase speed (velocity eases at `4*dt`). Spawn hp: `K.hp * (1 + 0.6 * min(2, remotes))` (L5780): solo = hp as listed. Heavy: `K.heavy` also shoves the car (`car.pos += nx*push*0.5`) and takes 0.3 x knockback. Ranged shots: spitter/oculon acid glob `hurtCar(8)` (L6531), every 2.6-3.6 s within 17 m; every kind also throws a shot (MOB_PAT L3418: pattern 0 straight = gremlin/maw/stilt/spike/gloopling; pattern 1 fan = flapper/wingmaw/jelly/lamprey; pattern 2 ring = brute/grubber/gloop/oculon; shot dmg 2, speed 14/11.5/9.5; throw interval 2.8 / 3.6 / 4.5 s + rand(0..2.5), L6495-6500).

### Evil cubes (`enemies`) L3068-3140: `RED_COUNT=20`, `ELITE_COUNT=7`. `hp = maxHp` on spawn (L3159): normal 10, elite 30 (`maxHp: elite ? 30 : 10` L3137), speed normal `rand(8.5,11.5)`, elite `rand(8,9.5)`, bite normal 16, elite 26 (`bite` L3137, bite cd 0.8 s), shots: normal 1 bullet dmg 5 speed 15; elite 3-bullet fan (offsets -0.22/0/0.22) dmg 7 speed 13 (`enemyVolley` ~L3405-3415); a ring variant also exists (~L3425, dmg 5/7). Size normal 1.9-2.4, elite 2.9-3.4; hit radius `r = s*0.62`. Respawn after death: 5 s normal, 8 s elite (`enemyQueue`, L3500). They sleep as crates until you are within `WAKE_DIST=20` or shoot them. Ramming a sleeping one at closing speed > `RAM_SPEED=7` does `hitEnemy(e, ..., 1, 14)` + 0.6 s stun, once per 0.5 s (enemyBump L3214-3226). No hp scaling by players. Loot: normal 4 coins, elite 8 coins + token/medkit.
Elite cubes are immune to stomp damage/stun (except Lv3 stun) as per the table above.

### Mini-boss (`makeMini` L5825): `m.hp = (K.hp * 4 + 26) * (1 + 0.6 * min(2, remotes))`; bite x1.3 rounded; size = `MINI_SIZE = 1.15 * max size (4.9)` = 5.635 for all kinds; `r = min(1.9, K.r * MINI_SIZE/K.size)`; always `spiky` (not run-overable); attack sequence every 2.4-4.2 s (`miniStart`), five patterns (MINI_SEQ L5911-ish: 7-shot burst speed 21 / 3 fans of 7 / 2 rings of 16 / 26-step spiral / 5 crosses), each tracer `dmg: 3`. Kinds `MINI_KINDS` = brute, grubber, maw, jelly, oculon, lamprey, gloop, stilt, wingmaw, spike.
Mini hp (solo): brute 62, grubber 82, maw 34, jelly 38, oculon 38, lamprey 42, gloop 74, stilt 34, wingmaw 36, spike 38.

### Wandering boss (`makeWanderer` L4362): built from a mini, then `m.hp *= 3`, size x1.4, `r = min(2.6, r*1.3)`. Solo hp: brute 186, grubber 246, maw 102, jelly 114, oculon 114, lamprey 126, gloop 222, stilt 102, wingmaw 108, spike 114. They roam (speed x0.55) until you are within 24 m. Loot: `wb` 10 coins + 50% chance 3 crystals; a carrier drops a skill. Count: up to `WB_CROWD = 21` alive during the boss hunt (`wbTopUp` L4342): spawned only when `crewArmed()` (all 3 guns + jump, L4325 area) and only while some player still lacks a kit skill (kit minus jump: buggy 2, spider 1, halo 2, unicorn 2 carriers). Re-topped every 3 s.

### Log machine / rig (`makeRig` L5846): it is a mini `hp * 1.6` (e.g. maw rig 54.4) with `heavy: true`, but `RIG.tame = true`, so no weapon can hurt it; breaks at 3 bomb hits (`rig.hits >= 3`), each bomb hit = `blastAt(x,z,10,6,24,true)`. Bomb spawns 30-40 m from the rig (L6170), a carried bomb must sit next to the rig for 5 s. Rig count wanted `RIG.n = { roll:2, scout:6, save:6, hell:10, boss:0 }` (L5835), spawn pacing 9-16 s (L5897). Rig hazards: log sweep tosses the car (`hurtCar(maxHp*0.08)`, `RIG.logR 1.5`, hitCd 1 s) and kills small critters (`hitCritter(o, o.mini ? 2 : 6)`, L5927). Loot on death: 30 coins + 15 crystals.

### Boss Pyramidon: `BOSS_HP = 1000` (L7281). One damage pool `boss.dealt`: lair half = 0 .. 0.5*M (500), then it flees/heals, field half 0.5*M .. 1.5*M (another 1000) -> kill at `dealt >= 1.5*M` = 1500 total damage solo (L7533-7538). `bossMax = BOSS_HP * (1 + 1.5 * remotes)` (L7540): +150% per extra player. Hurts it: bullets (dmg each), nova ring bullets, starburst bullets, spread pellets, drill (dmg x2 per frame, 14/21 dps), orbit saws (dmg per 0.35 s), beams/swords (once per beam per tick when within 4 m of BOSS_POS), mortar (unobtainable), ULT hands (20% of BOSS_HP). Does NOT hurt it: stomp, brood, spikes, cubes, horn, decoys, domes, webs, tokens other than bullet rings. Boss attacks on the car: quake rings lair 26 dmg / field 12 dmg, lava ring 20, dash ram 18, thrown crate 18 (BOSS2 L7286).

### Coop scaling summary: critter hp +60% per remote (cap 2 remotes = +120%) (L5780, L5827, stomp's `coop`); wave size +35% per friend (cap 3 friends = +105%) (L8727); boss +150% per friend uncapped; `hellTotal = 12 + 4 * min(3, friends)` minis (L8730); extra crate-drop chance +50% per remote. Phase does NOT change critter hp or speed; phase only changes wave size (`mul`), how many alive are allowed, cadence, and mini counts.

### Loot (`lootFrom` L4608): mob 30% of 1 coin (10%: 2); tough (ranged/fly) 3 coins; brute (heavy) 6-8; crate 3-5; evil cube 4; elite 8; mini 20 coins + 3 crystals; wanderer 10 coins + 50% 3 crystals; rig 30 + 15; boss 60 + 20. (Hell/other normal kills of gremlin/maw/etc. give almost nothing.)

---
## 5. Wave director

Phases `PHASES` L8716 (all `waves: 99`):
| phase | brk (s) | mul | over | cap (s) | max alive | rigs wanted | note |
|---|---|---|---|---|---|---|---|
| roll (ROLL OUT) | 8 | 1.0 | 0.6 | 10 | 45 | 2 | warm-up, gear up, hunt wandering bosses |
| scout | 18 | 1.2 | 0.6 | 12 | 50 | 6 | +1 mini per wave |
| save (SAVE & SACRIFICE) | 18 | 1.5 | 0.6 | 12 | 60 | 6 | mul x (1 + 0.3 * altarsDone), +1 mini per wave |
| hell | 18 | 2.6 | 0.7 | 11 | 75 | 10 | 12 minis total (4 per wave, 3 waves), phase ends when all 12 spawned and dead |
| boss | 0 | 1.4 | 0.6 | 14 | 45 | 0 | gate open; waves suspended while the boss fight is on before the gate opens (`calm` L6383) |
`waveMul()` L8726 = `mul * (save ? 1 + 0.3*altarsDone : 1) * (1 + 0.35 * min(3, friends))`. `SW_CAP = 110` (L5774): no new spawns in a wave when `swarm.length >= 110` (swarm includes minis, wanderers, rigs, altar guards).

Spawn gating (L6392-6398, host only): `spawnWave()` fires when not calm, `alive < P.max` ("room"; `alive` = living critters not `home`, not rig), break over, and one of: (a) no pending wave and `gap <= 0` (gap = 2 s after a wave is cleared, 3 s on phase start); (b) "press": pending and `since > 8` and `alive <= size * over`; (c) `waves.since >= P.cap` (so at most 10-14 s between waves as long as `alive < max`). A wave counts as cleared when `alive <= max(2, ceil(size*0.2))` and `since > 6`. So effective cadence = every `cap` seconds (10 / 12 / 12 / 11 / 14 s) unless the field is full, faster when you clear them (min ~6-8 s).

Wave composition (`spawnWave` L6353): each group count is `Math.round(count * waveMul())`, groups come from different screen sides, dug in (1.1 s, `DIG_T`, no bite while digging) or flying in.
- ROLL OUT: waves.n is not advanced; every wave = [pick(gremlin, gremlin, maw, stilt) x 12] + [pick(gremlin, flapper, maw, gloopling) x 8] = 20 small critters, no mini (`PH.i >= 1` needed).
- Every later wave takes `WAVE_PLANS[waves.n++]` (L6305, `waves.n` persists across phases, never reset), 7 plans, then random plans:
  1. gremlin 8
  2. maw 7, gremlin 5
  3. flapper 6, wingmaw 5
  4. gloop 2, brute 1, gremlin 8
  5. oculon 3, spitter 2, stilt 6
  6. spike 6, jelly 4
  7. grubber 2, lamprey 4, maw 6
  n >= 7: group A = one of [gremlin, stilt, flapper, spitter, maw, jelly, wingmaw, spike] (uniform) x `10 + min(14, 2n)` (= 24 from n=7); group B = one of [brute, spitter, gremlin, gloop, grubber, oculon, lamprey] x `3 + min(6, n>>1)` (6 at n=7, 7 at n=8, up to 9 from n=12).
  Counts per wave after the multiplier (solo, ordered plan 1..7): scout (x1.2): 10 / 14 / 13 / 13 / 13 / 12 / 14 total; save (x1.5, 0 altars): 12 / 19 / 17 / 17 / 17 / 15 / 18; save with 3 altars (x2.85): 23 / 34 / 31 / 32 / 32 / 28 / 34; hell (x2.6): 21 / 31 / 29 / 29 / 29 / 26 / 31; boss (x1.4): 11 / 17 / 15 / 15 / 15 / 14 / 17. Random waves (n >= 7), group A + group B: scout 29 + 7..11, save 36 + 9..14, hell 62 + 16..23, boss 34 + 8..13. Because wave index advances one per wave while phases last many waves, by the hell phase you are almost surely in the random n >= 7 regime: ~62 of one small/medium kind plus ~16-23 of one heavy/ranged kind per wave, plus 4 minis, capped by `max` 75 alive and `SW_CAP`.
- Mini-bosses: scout/save/boss: `spawnMinis(1)` per wave (random MINI_KINDS); hell: `ceil(hellTotal/3) = 4` per wave until 12 spawned (`PH.hellN`), no single mini in hell otherwise.
- Altar fed: `altarGuards(A, round(10 * waveMul()))` home guards, kinds list [gremlin, maw, stilt, gremlin, oculon, maw, jelly, brute|grubber] (L6801-6889).
- Pedestal ambush: 13 (18 for non-first guns) of gremlin/gremlin/maw/stilt/maw + 1 mini (L4314).
- Wandering bosses (warm-up): up to 21 mini-based wanderers (hp x3).
- Rigs per phase `RIG.n` above.
Mix of targets: roll = all 1-hp-class fry (gremlin 1, maw 2, stilt 2, flapper 1.5, gloopling 2); scout = fry + a few heavies/ranged (gloop 12, brute 9, grubber 14, oculon 3, spitter 2) + 1 mini (hp 34-82) per wave; hell = ~2.6x pack size with large random heavy groups and 12 minis.

---
## 6. Ride movement and survivability

| | buggy | spider | halo | unicorn |
|---|---|---|---|---|
| max hp | 100 | 50 (L2690) | 100 | 100 |
| top speed | `UNI.maxSpeed*1.1` = 26.4 (L7873) | `TUNE.maxSpeed*0.85` = 22.1 on ground, x0.75 on walls (L7917), screen-relative, almost no inertia | `TUNE.maxSpeed*1.05` = 27.3 (L7882), glides | `UNI.maxSpeed` = 24 (L7871) |
| accel | 40 (inherits `UNI.accel`; reverse 36) | instant (lerp 11/s) | lerp 6.5/s | 40 |
| ram kills fry | yes if speed > 9 | yes | yes | yes |
| contact damage | none besides ram-kills; drill | none | none | horn: 4 dmg (6 above speed 18) |
`TUNE.maxSpeed = 26` is the baseline (L2763). HP regen: after 3 s without being hit, +6% maxHp per second (`car.maxHp*0.06*dt`, L7919). Car radius 1.6. `hurtCar` (L3178) has no armour/ride multiplier; halo sword time and dome time block it. Typical incoming: critter bite 4-14 (x1.3 for minis) at most once per 0.9 s per critter; evil cube bite 16/26; cube bullet 5/7; mini tracer 3; acid glob 8; mob shot 2; rig toss 8% maxHp; boss rings 12-26, lava 20, ram 18.
(`BUG = {...UNI, ...}` keeps `accel: 40`; only `maxSpeed`, `maxReverse` and `reverseAccel` change.)

---
## 7. Everything that multiplies damage
- Base gun/spread: none (always dmg 1 per pellet); spread gun adds pellets and up to +25% rate.
- Nova per-level `dmg` (1 / 1.5 / 2) times ride factor: buggy x1 per bullet, halo x0.9 per sword tick (0.12 s), unicorn x1.4 and scaled 0.2/0.12 = x2.333 per beam tick (0.2 s).
- Orbit dmg 1 / 1.5 / 2.2 (L4943 idx 0/2/4); halo has 2x saws; unicorn saws do 0 dmg.
- Drill: `x1.5` vs critters, `x1.5` at abLv>=2, `x2` vs boss; evil cubes and crates x1.
- `blastAt`: evil cubes take `max(1, dmg*0.5)`.
- Cubes: instant kill vs non-big, 3 vs big (heavy/elite/mini/wanderer/rig).
- `throwMul` (L4120): x1/x2/x3 for thrown objects, unreachable (needs Frog Tongue).
- Coop: critter hp x(1 + 0.6*min(2, remotes)); stomp lv2 uses the same `coop` factor on its half-hp hit.
- Rig soak x0.4 vs bullets from the front (moot, tame).
- No crit, no armour, no difficulty setting found.

Uncertainties: (1) ULT numbers skipped as asked. (2) Some line numbers (e.g. 3411-3430, MINI_SEQ, 6495-6531) are approximate to +/-3 lines; the named identifiers are exact. (3) Whether `abilities.jump` is truly granted at start in every flow: the initial object has `jump: true` (L4579) and a `pedHave('jump')` branch exists, but `W_GEAR` has no jump pedestal, so it is effectively always on.
