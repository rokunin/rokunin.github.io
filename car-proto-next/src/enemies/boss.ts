// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- BOSS: Пирамидон ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { ARENA, BOSS_HP, TENT_SP, TENT_MIN, TENT_MAX, BOSS2 } from '../data/index.js';

export function createBoss(GAME) {
  const bossBarEl = document.getElementById('bossbar'), bossFillEl = document.getElementById('bossfill');
  const boss: any = { state: 'idle', hp: BOSS_HP, dealt: 0, t: 0, throwCd: 2, lashCd: 1.5, lifting: null, flash: 0, dirtT: 0, ph: 1, mv: null, vol: null };
  // Two halves of the fight. In the lair it loses half its health, then breaks out through the gate into the field, heals (the bar comes back in another colour) and fights on there:
  // it moves in dashes between volleys, and every volley of quake rings comes with a ring of lava around it that has to be jumped, from either side.
  const BOSS_SINK = 10.5;                              // how deep it hides before the fight
  const bossGroup = new THREE.Group();
  bossGroup.position.set(GAME.BOSS_POS.x, -BOSS_SINK, GAME.BOSS_POS.z); bossGroup.visible = false; GAME.scene.add(bossGroup);
  const bossMat = new THREE.MeshStandardMaterial({ color: 0x3c2656, emissive: 0x1a0830, flatShading: true, metalness: 0.55, roughness: 0.45, envMap: GS.ENV, envMapIntensity: 1.0 });
  const bossDark = new THREE.MeshStandardMaterial({ color: 0x241634, flatShading: true, metalness: 0.6, roughness: 0.45 });
  const seamMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff3d9a }), 2.4);
  const bput = (geo, mat, x, y, z, parent = bossGroup) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = mat !== seamMat; parent.add(m); return m; };
  {
    // three-tier ziggurat with light leaking out of the seams
    const tier = (rTop, rBot, h) => { const g = new THREE.CylinderGeometry(rTop, rBot, h, 4, 1); g.rotateY(Math.PI / 4); return g; };
    bput(tier(4.15, 5.0, 1.6), bossMat, 0, 0.8, 0).receiveShadow = true;
    bput(new THREE.BoxGeometry(5.4, 0.2, 5.4), seamMat, 0, 1.7, 0);
    bput(tier(3.1, 3.95, 1.5), bossMat, 0, 2.55, 0);
    bput(new THREE.BoxGeometry(3.95, 0.2, 3.95), seamMat, 0, 3.4, 0);
    bput(tier(2.1, 2.9, 1.45), bossMat, 0, 4.225, 0);
    bput(new THREE.BoxGeometry(1.5, 0.1, 1.5), bossDark, 0, 5.0, 0);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, cx = Math.cos(a), cz = Math.sin(a);
      // sockets the tentacles grow out of
      bput(new THREE.CylinderGeometry(1.0, 1.3, 0.75, 6), bossDark, cx * 5.1, 0.37, cz * 5.1);
      bput(new THREE.CylinderGeometry(0.68, 0.68, 0.08, 6), seamMat, cx * 5.1, 0.76, cz * 5.1);
      // corner ribs up the first two tiers
      const rib = bput(new THREE.BoxGeometry(0.6, 3.75, 0.6), bossDark, cx * 4.2, 1.65, cz * 4.2);
      rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-cx * 0.5, 0.87, -cz * 0.5).normalize());
      // rune slab on each face of the middle tier
      const fa = k * Math.PI / 2, slab = bput(new THREE.BoxGeometry(1.5, 0.75, 0.08), seamMat, Math.sin(fa) * 2.5, 2.55, Math.cos(fa) * 2.5);
      slab.rotation.set(0, fa, 0); slab.rotateX(-0.38);
      const mask = bput(new THREE.BoxGeometry(0.5, 0.8, 0.1), bossDark, Math.sin(fa) * 2.52, 2.55, Math.cos(fa) * 2.52);
      mask.rotation.set(0, fa, 0); mask.rotateX(-0.38);
    }
  }
  // the eye hovers between the top tier and a floating capstone
  const eye = bput(new THREE.IcosahedronGeometry(0.85, 0), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff2a50 }), 2.4), 0, 6.0, 0);
  eye.castShadow = false;
  const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.95, 0.12), new THREE.MeshBasicMaterial({ color: 0x110008 }));
  pupil.position.z = 0.78; eye.add(pupil);
  const capstone = new THREE.Group(); capstone.position.y = 7.15; bossGroup.add(capstone);
  {
    const cg = new THREE.ConeGeometry(1.8, 2.1, 4); cg.rotateY(Math.PI / 4);
    bput(cg, bossMat, 0, 1.05, 0, capstone);
    bput(new THREE.BoxGeometry(2.1, 0.1, 2.1), seamMat, 0, -0.02, 0, capstone);
  }
  const orbit = [];
  for (let i = 0; i < 20; i++) {
    const geo = i % 3 === 0 ? new THREE.OctahedronGeometry(0.34, 0) : i % 3 === 1 ? new THREE.TetrahedronGeometry(0.4, 0) : new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a3ab0, emissive: 0xa020e0, roughness: 0.4, metalness: 0.4, flatShading: true }));
    bossGroup.add(m);
    orbit.push({ m, a: GAME.rand(0, Math.PI * 2), r: GAME.rand(5.8, 7.4), y: GAME.rand(1, 8), sp: GAME.rand(0.5, 1.3) * (GS.worldRnd() < 0.5 ? -1 : 1) });
  }
  const bossCol = { mesh: new THREE.Object3D(), hx: 3.7, hz: 3.7, h: 5, solid: true, crate: false, boss: true, disabled: true };
  bossCol.mesh.position.copy(GAME.BOSS_POS); GAME.obstacles.push(bossCol);

  // щупальца из кубиков
  const tentGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const tentacles = [];
  for (let k = 0; k < 4; k++) {
    const a0 = Math.PI / 4 + k * Math.PI / 2;
    tentacles.push({ k, a0, theta: a0, reach: 0, lift: 0.3, wave: 0.4, n: TENT_MIN, segs: [], pts: [],
                     mat: new THREE.MeshStandardMaterial({ color: 0x7a34a0, emissive: 0x220033, roughness: 0.35, metalness: 0.45 }),
                     state: 'idle', t: 0, aim: a0, hitDone: false, glow: 0,
                     tip: new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), seamMat) });
    GAME.scene.add(tentacles[k].tip); tentacles[k].tip.visible = false;
  }
  const hideTent = tn => { tn.segs.forEach(m => m.visible = false); tn.tip.visible = false; };
  const tRoot = new THREE.Vector3();
  function tentRoot(tn) { return tRoot.set(GAME.BOSS_POS.x + Math.cos(tn.a0) * 5.1, 0, GAME.BOSS_POS.z + Math.sin(tn.a0) * 5.1); }
  function syncSegs(tn) {
    while (tn.segs.length < tn.n) {
      const m = new THREE.Mesh(tentGeo, tn.mat); m.castShadow = true; m.rotation.set(GAME.rand(0, 3), GAME.rand(0, 3), 0);
      GAME.scene.add(m); tn.segs.push(m); tn.pts.push(new THREE.Vector3());
      if (boss.state === 'fight') GAME.spawnParticles(tn.pts[Math.max(0, tn.segs.length - 2)] || GAME.BOSS_POS, 0xd040a0, 3, 4);
    }
  }
  tentacles.forEach(syncSegs);
  const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  function updateTentacle(tn, dt) {
    tn.t += dt;
    const r = tentRoot(tn);
    let tTheta = tn.a0 + 0.3 * Math.sin(GS.elapsed * 0.7 + tn.k * 1.7), tReach = 1, tLift = 0.45, tWave = 0.45, tGlow = 0, rate = 2.5;
    if (tn.state === 'wind') {
      const tp = tn.tp || GAME.car.pos; tn.aim = Math.atan2(tp.z - r.z, tp.x - r.x);   // tracks whoever it is swinging at
      tTheta = tn.aim; tReach = 0.5; tLift = 3.4; tWave = 0.12; tGlow = 1; rate = 7;
      if (tn.t > 0.65) { tn.state = 'strike'; tn.t = 0; tn.hitDone = false; GAME.SFX.play('whoosh', tn.pts[tn.n >> 1], { rate: 0.8 }); }
    } else if (tn.state === 'strike') {
      tTheta = tn.aim; tReach = 1.15; tLift = 0; tWave = 0; tGlow = 1; rate = 28;
      if (tn.t > 0.16) { tn.state = 'slam'; tn.t = 0; GS.shake = Math.max(GS.shake, 0.35); GAME.SFX.play('tent_slam', tn.pts[tn.n - 1]);
        for (let i = 0; i < tn.n; i += 3) { GAME.spawnParticles(tn.pts[i], 0x6a5a7a, 2, 5); GAME.burst(tn.pts[i], 0x8a7a9a, 1, 1.8, 3, 0.3); } }
    } else if (tn.state === 'slam') {
      tTheta = tn.aim; tReach = 1.15; tLift = 0; tWave = 0; tGlow = 0.6; rate = 28;
      if (tn.t > 0.4) { tn.state = 'retract'; tn.t = 0; }
    } else if (tn.state === 'retract') {
      rate = 3;
      if (tn.t > 0.7) {                                                 // отросло: +2 кубика
        tn.state = 'idle'; tn.t = 0;
        tn.n = Math.min(TENT_MAX, tn.n + 2); syncSegs(tn);
      }
    }
    const k = Math.min(1, rate * dt);
    tn.theta = angLerp(tn.theta, tTheta, k);
    tn.reach += (tReach - tn.reach) * k; tn.lift += (tLift - tn.lift) * k; tn.wave += (tWave - tn.wave) * k;
    tn.glow += (tGlow - tn.glow) * Math.min(1, 8 * dt);
    tn.mat.emissive.setRGB(0.02 + tn.glow * 1.3, tn.glow * 0.02, 0.05 * (1 - tn.glow));   // idle: faint violet; wind-up: HDR red that blooms

    for (let i = 0; i < tn.segs.length; i++) {
      const m = tn.segs[i], p = tn.pts[i];
      if (i >= tn.n) { m.visible = false; continue; }
      const f = (i + 1) / tn.n;
      const ang = tn.theta + tn.wave * Math.sin(GS.elapsed * 2.6 + i * 0.55 + tn.k) * f;
      const d = (i + 1) * TENT_SP * tn.reach;
      p.set(r.x + Math.cos(ang) * d, 0.5 + tn.lift * Math.sin(Math.PI * Math.min(1, f * 1.1)) + 0.12 * Math.sin(GS.elapsed * 4 + i), r.z + Math.sin(ang) * d);
      m.position.copy(p);
      m.scale.setScalar(1.1 - 0.55 * f);
      if (i === tn.n - 1) { tn.tip.position.copy(p); tn.tip.rotation.y += dt * 4; tn.tip.rotation.x += dt * 2.5; tn.tip.visible = true; }
      m.rotation.x += dt * (1.5 + i * 0.08); m.rotation.y += dt * (1 + i * 0.05);   // кубики крутятся как частицы
      m.visible = true;
    }
    // попадание по машине во время удара
    if ((tn.state === 'strike' || (tn.state === 'slam' && tn.t < 0.1)) && !tn.hitDone &&
        GAME.car.alive && GAME.car.depth < 0.3 && GAME.car.y < 2.2) {
      for (let i = 0; i < tn.n; i++) {
        const p = tn.pts[i];
        if (Math.hypot(p.x - GAME.car.pos.x, p.z - GAME.car.pos.z) < GAME.car.radius + 0.5) {
          tn.hitDone = true;
          GAME.hurtCar(22, GAME.tmp.set(GAME.car.pos.x - GAME.BOSS_POS.x, 0, GAME.car.pos.z - GAME.BOSS_POS.z).normalize().clone());
          GAME.spawnParticles(GAME.tmp.copy(GAME.car.pos).setY(1.2), 0xd040a0, 8, 7);
          break;
        }
      }
    }
  }

  // ящики в комнате — снаряды для босса (и для нас)
  function roomSpot(r = 1.2) {
    for (let i = 0; i < 60; i++) {
      const x = GAME.rand(GAME.ROOM_X1 + 5, GAME.ROOM_X2 - 5), z = GAME.rand(-GAME.ROOM_HZ + 5, GAME.ROOM_HZ - 5);
      if (Math.hypot(x - GAME.BOSS_POS.x, z - GAME.BOSS_POS.z) < 10) continue;
      if (x < GAME.ROOM_X1 + 8 && Math.abs(z) < GAME.GATE_HZ + 3) continue;
      if (GAME.obstacles.some(o => o.crate && o.mesh.visible && Math.abs(o.mesh.position.x - x) < o.hx + r + 1 && Math.abs(o.mesh.position.z - z) < o.hz + r + 1)) continue;
      return [x, z];
    }
    return [GAME.BOSS_POS.x - 15, GAME.rand(-20, 20)];
  }
  for (let i = 0; i < 12; i++) {
    const sz = GAME.rand(1.6, 2.2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), GAME.crateMat);
    const [x, z] = roomSpot(sz);
    m.position.set(x, sz / 2, z); m.castShadow = m.receiveShadow = true; GAME.scene.add(m);
    GAME.obstacles.push({ mesh: m, hx: sz / 2, hz: sz / 2, h: sz, solid: true, crate: true, hp: 3, flash: 0, room: true });
  }

  function bossFan(n, spread, speed, aim) {             // a fan (or a full ring) of slow glowing shots from the pyramid
    const from = new THREE.Vector3(GAME.BOSS_POS.x, 2.4, GAME.BOSS_POS.z);
    for (let i = 0; i < n; i++) {
      const a = aim + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0), m = new THREE.Mesh(GAME.eshotGeo, GAME.eshotMat[1]);
      m.position.set(from.x + Math.sin(a) * 4.5, from.y, from.z + Math.cos(a) * 4.5); m.scale.setScalar(1.15);
      const halo = new THREE.Sprite(GAME.eshotHaloMat[1]); halo.scale.setScalar(2.2); m.add(halo); GAME.scene.add(m);
      GAME.eshots.push({ m, v: new THREE.Vector3(Math.sin(a) * speed, -0.35, Math.cos(a) * speed), life: 4.2, dmg: 6, k: 1 });
    }
    GAME.SFX.play('eshot', from, { rate: 0.7, vol: 1 });
  }
  function bossFanNet(n, spread, speed, aim) { bossFan(n, spread, speed, aim); GAME.netEv({ t: 'bf', n, s: GAME.r2(spread), v: GAME.r1(speed), a: GAME.r2(aim) }); }
  // everyone the pyramid can reach: players alive and above ground inside its room
  function bossTgts(all) {
    const a = [], ok = p => boss.ph === 2 ? all || Math.hypot(p.x - GAME.BOSS_POS.x, p.z - GAME.BOSS_POS.z) < BOSS2.sight : GAME.inRoom(p.x, p.z);      // out in the field: whoever is near enough (or anybody, for choosing where to dash)
    if (GAME.car.alive && GAME.car.depth < 0.3 && ok(GAME.car.pos)) a.push({ pos: GAME.car.pos, vel: GAME.car.vel, peer: String(GAME.NET.on && GAME.NET.game ? GAME.netMe() : 'me') });
    if (GAME.NET.on && GAME.NET.game) for (const R of GAME.NET.remotes.values()) if (R.up && ok(R.pos)) a.push({ pos: R.pos, vel: R.vel, peer: String(R.peer) });
    return a;
  }
  function netPeerPos(p) {
    if (!(GAME.NET.on && GAME.NET.game) || String(p) === String(GAME.netMe())) return GAME.car.pos;
    for (const R of GAME.NET.remotes.values()) if (String(R.peer) === String(p)) return R.pos;
    return GAME.car.pos;
  }
  function bossFanTick(dt) {
    const tg = bossTgts(); if (boss.state !== 'fight' || !tg.length) return;
    let T = boss.fanT && tg.find(t => t.peer === boss.fanT.peer); if (!T) T = boss.fanT = tg[Math.floor(Math.random() * tg.length)];
    const rage = bossRage(), aim = Math.atan2(T.pos.x - GAME.BOSS_POS.x, T.pos.z - GAME.BOSS_POS.z);
    if (boss.fanLeft > 0 && (boss.fanGap -= dt) <= 0) {                  // a burst: several fans in a row, each offset half a step so the gaps move
      boss.fanLeft--; boss.fanGap = 0.42;
      if (boss.fanRing) bossFanNet(18, 6.283 * 17 / 18, 9.5, boss.fanLeft * 0.175); else bossFanNet(rage ? 9 : 7, rage ? 1.5 : 1.15, 11.5, aim + (boss.fanLeft % 2 ? 0.09 : -0.09));
    }
    if ((boss.fanCd = (boss.fanCd == null ? 3 : boss.fanCd) - dt) <= 0) {
      boss.fanRing = rage && Math.random() < 0.45; boss.fanLeft = boss.fanRing ? 3 : rage ? 4 : 3; boss.fanGap = 0; boss.fanT = tg[Math.floor(Math.random() * tg.length)];
      boss.fanCd = rage ? GAME.rand(3.2, 4.4) : GAME.rand(4.5, 6);
    }
  }
  function bossLift(o) { o.carried = true; boss.lifting = { o, t: 0, from: o.mesh.position.clone() }; GAME.SFX.play('boss_lift', GAME.BOSS_POS); }
  function bossHurl(o, from, vel, lead) {
    o.carried = true; o.mesh.position.copy(from);
    const r = Math.max(o.hx, o.hz) * 1.2;
    const marker = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.7, 28),
      GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff3d5a, transparent: true, opacity: 0.85, depthWrite: false }), 4));
    marker.geometry.rotateX(-Math.PI / 2); marker.position.set(lead.x, 0.05, lead.z); GAME.scene.add(marker);
    GAME.thrown.push({ kind: 'crate', ref: o, r, s: o.h, pos: from.clone(), vel: vel.clone(), spin: GAME.rand(6, 10), rot: 0, hostile: true, marker });
    GAME.SFX.play('whoosh', from);
    if (boss.lifting && boss.lifting.o === o) boss.lifting = null;
  }
  function bossThrowTick(dt) {
    if (GAME.NET.client) { bossLiftAnim(dt); return; }        // a guest only animates what the host's pyramid does
    bossFanTick(dt);
    boss.throwCd -= dt;
    if (!boss.lifting && boss.throwCd <= 0 && !boss.mv) {
      let best = null, bd = Infinity;
      for (const o of GAME.obstacles) {
        if (!(boss.ph === 2 ? o.crate : o.room) || !GAME.active(o)) continue;      // in the field it throws whatever crates lie around it
        const d = Math.hypot(o.mesh.position.x - GAME.BOSS_POS.x, o.mesh.position.z - GAME.BOSS_POS.z);
        if (d < bd && (boss.ph !== 2 || d < 45)) { bd = d; best = o; }
      }
      if (best) { bossLift(best); GAME.netEv({ t: 'bl', i: GAME.obstacles.indexOf(best) }); }
      boss.throwCd = GAME.rand(2.2, 3.2);
    }
    bossLiftAnim(dt);
  }
  function bossLiftAnim(dt) {
    const L = boss.lifting;
    if (!L) return;
    L.t += dt;
    const k = Math.min(1, L.t / 0.8), e = k * k * (3 - 2 * k);
    const top = GAME.tmp.set(GAME.BOSS_POS.x, 11, GAME.BOSS_POS.z);
    L.o.mesh.position.lerpVectors(L.from, top, e);
    L.o.mesh.position.y += Math.sin(k * Math.PI) * 3;
    L.o.mesh.rotation.x += dt * 6; L.o.mesh.rotation.z += dt * 4;
    if (L.t >= 0.95 && !GAME.NET.client) {                            // hurls it at someone in the room, leading them a little
      const tg = bossTgts(); if (!tg.length) { releaseLift(); return; }
      const T = tg[Math.floor(Math.random() * tg.length)], from = L.o.mesh.position.clone();
      const lead = new THREE.Vector3(T.pos.x + T.vel.x * 0.55, 0, T.pos.z + T.vel.z * 0.55);
      if (boss.ph !== 2 && !GAME.inRoom(lead.x, lead.z)) lead.set(T.pos.x, 0, T.pos.z);
      const dx = lead.x - from.x, dz = lead.z - from.z, dist = Math.hypot(dx, dz);
      const tt = THREE.MathUtils.clamp(dist / 22, 0.6, 1.5);
      const vel = new THREE.Vector3(dx / tt, 0.5 * GAME.G * tt - (from.y - L.o.h / 2) / tt, dz / tt);
      GAME.netEv({ t: 'bh', i: GAME.obstacles.indexOf(L.o), f: [GAME.r2(from.x), GAME.r2(from.y), GAME.r2(from.z)], v: [GAME.r2(vel.x), GAME.r2(vel.y), GAME.r2(vel.z)], l: [GAME.r1(lead.x), GAME.r1(lead.z)] });
      bossHurl(L.o, from, vel, lead);
    }
  }

  // In a lobby the host keeps the one true count: a guest shows its own hits at once and sends them to the host (bd), the host
  // sends everybody the count and the size of the pool (bhp); only the host starts the break-out and only the host kills it.
  function bossDamage(d) {
    if (boss.state !== 'fight') return;
    const was = boss.dealt; boss.dealt += d; boss.flash = 0.06;
    bossHealth(); if (GAME.NET.client) GAME.NET.bdAcc = (GAME.NET.bdAcc || 0) + Math.max(0, boss.dealt - was);      // what the lair's half cut off is not sent
  }
  // One counter for both halves: the lair takes it from 0 to half of bossMax() (and no further), the field from there to one and a half.
  function bossHealth() {
    const M = bossMax();
    if (boss.ph !== 2) { boss.dealt = Math.min(boss.dealt, M * 0.5); if (!GAME.NET.client && boss.state === 'fight' && boss.dealt >= M * 0.5) bossFlee(); }
    else if (boss.state === 'fight' && boss.dealt >= M * 1.5) { if (GAME.NET.client) boss.dealt = M * 1.5; else { killBoss(); GAME.netEv({ t: 'bk' }); } }      // a guest's bar may show zero: the host says when it dies
    bossBar();
  }
  const bossRage = () => boss.ph === 2 ? boss.dealt > bossMax() : boss.dealt > bossMax() * 0.25;      // the second half of each bar
  const bossMax = () => GAME.NET.client && boss.hm ? boss.hm : BOSS_HP * (1 + 1.5 * (GAME.NET.on && GAME.NET.game ? GAME.NET.remotes.size : 0));       // every extra player: +150%; a guest takes the host's number
  const bossBar = () => { const M = bossMax(); let f = boss.ph === 2 ? 1 - (boss.dealt - M * 0.5) / M : 1 - boss.dealt / M;
    if (boss.state === 'flee' && boss.mv) f = 0.5 + 0.5 * Math.min(1, boss.mv.t / boss.mv.T);      // healing on the run
    bossFillEl.style.width = Math.max(0, Math.min(1, f) * 100) + '%'; bossBarEl.classList.toggle('p2', boss.ph === 2); };
  function setDoor(closed) { if (GAME.door.targetY !== (closed ? 2.3 : -2.5)) GAME.SFX.play('door', GAME.doorMesh.position); GAME.door.targetY = closed ? 2.3 : -2.5; }
  function releaseLift() {
    if (!boss.lifting) return;
    const o = boss.lifting.o; boss.lifting = null;
    GAME.thrown.push({ kind: 'crate', ref: o, r: Math.max(o.hx, o.hz) * 1.2, s: o.h, pos: o.mesh.position.clone(), vel: new THREE.Vector3(), spin: 3, rot: 0 });
  }
  function killBoss() {
    boss.state = 'dead'; boss.t = 0; boss.mv = null; boss.vol = null; bossCol.disabled = true; clearLava(); GAME.crewSay('bossdead', 1, true);
    releaseLift();
    for (const tn of tentacles) {
      for (let i = 0; i < tn.n; i += 2) GAME.spawnParticles(tn.pts[i], 0x8a3ab0, 2, 7);
      hideTent(tn);
    }
    clearQuakes();
    GAME.spawnParticles(GAME.tmp.set(GAME.BOSS_POS.x, 3, GAME.BOSS_POS.z), 0xd040a0, 40, 14);
    GAME.flash(GAME.tmp, 0xff50c0, 46, 0.7, 6); GAME.burst(GAME.tmp, 0x5a3070, 22, 4, 9, 0.55);
    GAME.spawnParticles(GAME.tmp.set(GAME.BOSS_POS.x, 5, GAME.BOSS_POS.z), 0xff2255, 20, 12);
    GS.shake = 1.2;
    GAME.flashAlert('PYRAMIDON DEFEATED'); GAME.SFX.play('boss_die', GAME.BOSS_POS);
    if (!GAME.NET.client) { GAME.dropLoot(new THREE.Vector3(GAME.BOSS_POS.x - 7, 0, GAME.BOSS_POS.z - 3)); GAME.dropLoot(new THREE.Vector3(GAME.BOSS_POS.x - 7, 0, GAME.BOSS_POS.z + 3)); GAME.lootFrom('boss', GAME.BOSS_POS.x - 10, GAME.BOSS_POS.z); }
    GAME.angelStart();
    setDoor(false);
  }
  function bossEmerge() {
    boss.state = 'emerging'; boss.t = 0; GAME.crewSay('boss', 1, true);
    bossGroup.visible = true;
    bossBarEl.style.display = 'block'; bossBar();
    GAME.flashAlert('PYRAMIDON'); GAME.SFX.play('boss_emerge', GAME.BOSS_POS); GAME.SFX.play('boss_roar', GAME.BOSS_POS, { delay: 1.6 });
  }
  function bossFightNow(ns, bp) {                            // joined mid-fight: skip the rising
    boss.state = 'fight'; boss.t = 0; bossGroup.visible = true; bossGroup.position.y = 0; bossCol.disabled = false;
    bossBarEl.style.display = 'block'; bossBar();
    if (Array.isArray(ns)) tentacles.forEach((tn, k) => { tn.n = Math.round(GAME.num(ns[k], TENT_MIN, TENT_MAX)); syncSegs(tn); });
    if (Array.isArray(bp) && bp[0] === 2) { boss.ph = 2; boss.dealt = Math.max(boss.dealt, bossMax() * 0.5); bossSetPos(GAME.num(bp[1], -ARENA, GAME.ROOM_X2), GAME.num(bp[2], -ARENA, ARENA)); bossBar(); }
  }
  function resetBoss() {
    if (boss.state === 'dead' || boss.state === 'idle') return;
    boss.state = 'idle'; boss.t = 0; boss.throwCd = 2; boss.lashCd = 1.5; boss.quakeCd = null; boss.mv = null; boss.vol = null;
    if (!(GAME.NET.on && GAME.NET.game)) { boss.dealt = 0; boss.ph = 1; }           // solo: the fight starts over, back in the lair; in a lobby the damage already done stays
    if (boss.ph !== 2) bossSetPos(GAME.LAIR_POS.x, GAME.LAIR_POS.z);
    bossGroup.rotation.set(0, 0, 0); bossBar();
    releaseLift();
    clearQuakes(); clearLava();
    for (let i = GAME.thrown.length - 1; i >= 0; i--) if (GAME.thrown[i].hostile) GAME.finishThrown(GAME.thrown[i], i);
    bossCol.disabled = true; bossGroup.visible = false; bossGroup.position.y = -BOSS_SINK;
    for (const tn of tentacles) {
      tn.n = TENT_MIN; tn.reach = 0; tn.state = 'idle'; tn.t = 0; hideTent(tn);
    }
    bossBarEl.style.display = 'none';
    setDoor(!GS.gateOpen);
  }

  const quakes = [], QUAKE_T = 2.4;
  const quakeRingGeo = new THREE.RingGeometry(0.955, 1, 72); quakeRingGeo.rotateX(-Math.PI / 2);
  const quakeDiscGeo = new THREE.CircleGeometry(1, 56); quakeDiscGeo.rotateX(-Math.PI / 2);
  function bossQuake(x, z, r, dmg = 26) {
    const ring = new THREE.Mesh(quakeRingGeo, GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.9, depthWrite: false }), 3));
    const disc = new THREE.Mesh(quakeDiscGeo, GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.22, depthWrite: false }), 1.6));
    ring.position.set(x, 0.09, z); ring.scale.setScalar(r); disc.position.set(x, 0.08, z); disc.scale.setScalar(0.01); GAME.scene.add(ring, disc);
    quakes.push({ x, z, r, dmg, t: 0, ring, disc }); GAME.SFX.play('boss_roar', GAME.BOSS_POS, { rate: 0.6, vol: 0.7 });
    if (Math.hypot(GAME.car.pos.x - x, GAME.car.pos.z - z) < r + 4) GAME.flashAlert('GET OUT OF THE RING');
  }
  function clearQuakes() { for (const q of quakes) GAME.scene.remove(q.ring, q.disc); quakes.length = 0; }
  function updateQuakes(dt) {
    for (let i = quakes.length - 1; i >= 0; i--) {
      const q = quakes[i]; q.t += dt; const k = Math.min(1, q.t / QUAKE_T);
      q.disc.scale.setScalar(Math.max(0.01, q.r * k)); q.ring.material.opacity = 0.55 + 0.4 * Math.sin(q.t * (6 + 14 * k));      // the fill creeps out to the ring: that is the countdown
      GS.shake = Math.max(GS.shake, 0.08 + 0.12 * k);
      if (k < 1) continue;
      GAME.scene.remove(q.ring, q.disc); q.ring.material.dispose(); q.disc.material.dispose(); quakes.splice(i, 1);
      GS.shake = Math.max(GS.shake, 1); GAME.SFX.play('blast', GAME.tmp.set(q.x, 0, q.z)); GAME.SFX.play('tent_slam', GAME.tmp);
      GAME.flash(GAME.tmp.set(q.x, 1, q.z), 0xff7a2a, q.r * 2.2, 0.45, 3);
      for (let j = 0; j < 22; j++) { const a = j / 22 * 6.283, d = q.r * (0.3 + 0.7 * Math.random()); GAME.tmp.set(q.x + Math.cos(a) * d, 0.4, q.z + Math.sin(a) * d); GAME.spawnParticles(GAME.tmp, 0x6a5a4a, 3, 9); if (j % 3 === 0) GAME.burst(GAME.tmp, 0x8a7a6a, 2, 2.4, 5, 0.4); }
      if (GAME.car.alive && GAME.car.depth < 0.3 && GAME.car.y < 1.5 && Math.hypot(GAME.car.pos.x - q.x, GAME.car.pos.z - q.z) < q.r)
        GAME.hurtCar(q.dmg, new THREE.Vector3(GAME.car.pos.x - q.x, 0, GAME.car.pos.z - q.z).normalize());
    }
  }
  // -- the break-out, the dashes, the lava --
  function bossSetPos(x, z) { GAME.BOSS_POS.x = x; GAME.BOSS_POS.z = z; bossGroup.position.x = x; bossGroup.position.z = z; bossCol.mesh.position.set(x, 0, z); }
  function bossMove(x, z, v) { const d = Math.hypot(x - GAME.BOSS_POS.x, z - GAME.BOSS_POS.z); boss.mv = { sx: GAME.BOSS_POS.x, sz: GAME.BOSS_POS.z, tx: x, tz: z, t: 0, T: Math.max(0.5, d / v), hit: false, dustT: 0 };
    GAME.SFX.play('whoosh', GAME.BOSS_POS, { rate: 0.5, vol: 1 }); GAME.SFX.play('boss_roar', GAME.BOSS_POS, { rate: 1.25, vol: 0.5 }); }
  function bossFlee() {                                  // half its health gone: out of the lair, through the gate, into the field, healing as it goes
    if (boss.ph === 2 || boss.state === 'dead') return;
    boss.ph = 2; boss.dealt = Math.max(boss.dealt, bossMax() * 0.5); boss.vol = null; releaseLift(); clearQuakes();
    for (const tn of tentacles) { tn.reach = 0; tn.state = 'idle'; tn.t = 0; hideTent(tn); }
    boss.state = 'flee'; boss.t = 0; bossGroup.visible = true; bossGroup.position.y = 0; bossCol.disabled = false; bossBarEl.style.display = 'block';
    bossMove(BOSS2.out[0], BOSS2.out[1], BOSS2.fleeV); GAME.flashAlert('PYRAMIDON BREAKS OUT'); bossBar();
    if (!GAME.NET.client) GAME.netEv({ t: 'bs', s: 'f' });
  }
  function bossMoveTick(dt) {                            // everybody plays the same run: start, end and speed come from the host
    const M = boss.mv; M.t += dt; const k = Math.min(1, M.t / M.T), e = k * k * (3 - 2 * k), px = GAME.BOSS_POS.x, pz = GAME.BOSS_POS.z;
    bossSetPos(M.sx + (M.tx - M.sx) * e, M.sz + (M.tz - M.sz) * e);
    const vx = (GAME.BOSS_POS.x - px) / Math.max(dt, 1e-3), vz = (GAME.BOSS_POS.z - pz) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vz), lean = Math.min(0.17, sp * 0.006);
    bossGroup.rotation.set(sp > 0.1 ? vz / sp * lean : 0, 0, sp > 0.1 ? -vx / sp * lean : 0);      // leaning into the run
    if ((M.dustT -= dt) <= 0) { M.dustT = 0.04; GAME.burst(GAME.tmp.set(px + GAME.rand(-4, 4), 0.4, pz + GAME.rand(-4, 4)), 0x8a7a64, 5, 3, 8, 0.6); }
    const dc = Math.hypot(GAME.car.pos.x - GAME.BOSS_POS.x, GAME.car.pos.z - GAME.BOSS_POS.z) || 1e-3; if (dc < 60) GS.shake = Math.max(GS.shake, 0.25);
    if (!M.hit && sp > 6 && GAME.car.alive && GAME.car.y < 1.5 && dc < 7.2) { M.hit = true; GAME.hurtCar(BOSS2.ram, GAME.tmp.set((GAME.car.pos.x - GAME.BOSS_POS.x) / dc, 0, (GAME.car.pos.z - GAME.BOSS_POS.z) / dc).clone()); }      // run over: once a dash
    for (const o of GAME.obstacles) { if (o === bossCol || !(o.crate || o.pillar) || !GAME.active(o)) continue;                                                         // crates and pillars in its way are gone
      if (Math.abs(o.mesh.position.x - GAME.BOSS_POS.x) > o.hx + 4.2 || Math.abs(o.mesh.position.z - GAME.BOSS_POS.z) > o.hz + 4.2) continue;
      const was = GAME.NET.applying; GAME.NET.applying = true; if (o.crate) GAME.damageCrate(o, 99); else GAME.smashPillar(o, GAME.tmp.set(vx, 0, vz).clone()); GAME.NET.applying = was; }      // every side smashes its own copy: no loot, no events
    if (boss.state === 'flee') bossBar();
    if (k < 1) return;
    boss.mv = null; bossGroup.rotation.set(0, 0, 0);
    GAME.waveFx(GAME.BOSS_POS.x, GAME.BOSS_POS.z, 10, 0xff7ad8, 0.4); GAME.burst(GAME.tmp.set(GAME.BOSS_POS.x, 0.5, GAME.BOSS_POS.z), 0x8a7a64, 26, 5, 12, 0.6); GAME.SFX.play('land', GAME.tmp, { vol: 0.9, rate: 0.55 }); if (dc < 70) GS.shake = Math.max(GS.shake, 0.9);
    if (boss.state === 'flee') { boss.state = 'fight'; boss.t = 0; boss.quakeCd = 2.5; boss.throwCd = 2; boss.lashCd = 1; bossBar(); GAME.flashAlert('PYRAMIDON IS LOOSE'); }
  }
  function bossDash() {                                  // host: to a new spot beside somebody, so the next ring of lava closes around them
    const tg = bossTgts(true); if (!tg.length) return false;
    const T = tg[Math.floor(Math.random() * tg.length)], dx = GAME.BOSS_POS.x - T.pos.x, dz = GAME.BOSS_POS.z - T.pos.z, d = Math.hypot(dx, dz), keep = GAME.rand(BOSS2.near[0], BOSS2.near[1]);
    const a = d < keep + 10 ? Math.random() * 6.283 : Math.atan2(dz, dx) + GAME.rand(-0.6, 0.6), lim = ARENA - 14;      // already beside them: round to another side
    let x = THREE.MathUtils.clamp(T.pos.x + Math.cos(a) * keep, -lim, lim), z = THREE.MathUtils.clamp(T.pos.z + Math.sin(a) * keep, -lim, lim);
    if (Math.hypot(x - GAME.BOSS_POS.x, z - GAME.BOSS_POS.z) < 6) return false;
    x = GAME.r1(x); z = GAME.r1(z); bossMove(x, z, BOSS2.dashV); GAME.netEv({ t: 'bgo', x, z, v: BOSS2.dashV }); return true;      // the guests get it rounded: so does the host
  }
  function bossVolleyTick(dt) {                          // host: quake rings one after another; in the field a ring of lava stands around the pyramid while they go off
    if (boss.mv) return;
    const field = boss.ph === 2, Q = field ? BOSS2.fieldQ : BOSS2.lairQ, V = boss.vol;
    if (!V) {
      if ((boss.quakeCd = (boss.quakeCd == null ? 8 : boss.quakeCd) - dt) > 0) return;
      const tg = bossTgts();
      if (!tg.length) { boss.quakeCd = field && bossDash() ? 0.5 : 1; return; }      // nobody near: go and find them
      const sp = [];
      for (const T of tg.sort(() => Math.random() - 0.5)) if (!field || Math.hypot(T.pos.x - GAME.BOSS_POS.x, T.pos.z - GAME.BOSS_POS.z) < BOSS2.lavaR + 20) sp.push([T.pos.x, T.pos.z]);      // one under each player
      while (sp.length < Q.n) { const a = Math.random() * 6.283;                                                                                                              // the rest scattered
        if (field) { const d = GAME.rand(4, BOSS2.lavaR - 8); sp.push([GAME.BOSS_POS.x + Math.cos(a) * d, GAME.BOSS_POS.z + Math.sin(a) * d]); }
        else { const T = tg[Math.floor(Math.random() * tg.length)], d = GAME.rand(10, 22); sp.push([THREE.MathUtils.clamp(T.pos.x + Math.cos(a) * d, GAME.ROOM_X1 + 4, GAME.ROOM_X2 - 4), THREE.MathUtils.clamp(T.pos.z + Math.sin(a) * d, -GAME.ROOM_HZ + 4, GAME.ROOM_HZ - 4)]); } }
      sp.length = Q.n; boss.vol = { i: 0, t: 0, sp };
      if (field) { const q = { t: 'bv', x: GAME.r1(GAME.BOSS_POS.x), z: GAME.r1(GAME.BOSS_POS.z), r: BOSS2.lavaR, T: GAME.r1((Q.n - 1) * BOSS2.step + QUAKE_T + 0.3) }; bossLava(q.x, q.z, q.r, q.T); GAME.netEv(q); }
      return;
    }
    V.t += dt;
    while (V.i < Q.n && V.t >= V.i * BOSS2.step) { const [x, z] = V.sp[V.i++], q = { t: 'bq', x: GAME.r1(x), z: GAME.r1(z), r: Q.r, d: Q.dmg }; bossQuake(q.x, q.z, q.r, q.d); GAME.netEv(q); }
    if (V.t < (Q.n - 1) * BOSS2.step + QUAKE_T + 0.5) return;
    boss.vol = null; const G = bossRage() ? Q.rage : Q.gap; boss.quakeCd = GAME.rand(G[0], G[1]);
    if (field) bossDash();
  }
  // The fire wall (build 134, concept B1 with the ground glow of A1): a low ribbon of magenta fire in the Pyramidon's colours, torn at the top by
  // rising noise like a dissolve shader, a hot line where it meets the ground and a wide pink glow on the ground on both sides.
  const lavas = [], lavaWallGeo = new THREE.CylinderGeometry(1, 1, 1, 180, 1, true); lavaWallGeo.translate(0, 0.5, 0);
  const SHV = 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const fireWallMat = rep => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uA: { value: 0 }, uRep: { value: rep } }, vertexShader: SHV,
    fragmentShader: `uniform float uT, uA, uRep; varying vec2 vUv;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p, float P){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = mod(i.x, P), b = mod(i.x + 1.0, P);      // value noise that wraps round the circle
        return mix(mix(hs(vec2(a, i.y)), hs(vec2(b, i.y)), f.x), mix(hs(vec2(a, i.y + 1.0)), hs(vec2(b, i.y + 1.0)), f.x), f.y); }
      void main(){
        float v = vUv.y, u = vUv.x * uRep;
        float c = vn(vec2(u, uT * 0.8), uRep), tb = vn(vec2(u * 2.0, v * 3.0 - uT * 3.2), uRep * 2.0);                         // c: how tall this tongue is now; tb: turbulence rising through it
        float top = 0.3 + pow(c, 1.4) * 0.7, m = top - v + (tb - 0.5) * 0.26;                                                   // a row of tongues, each with its own height, licking up
        if (m < 0.0) discard;
        float k = clamp(v / top, 0.0, 1.0), rim = 1.0 - smoothstep(0.0, 0.07, m);                                               // k: 0 at the foot of a tongue, 1 at its tip
        vec3 deep = vec3(0.34, 0.02, 0.78), mag = vec3(0.95, 0.03, 0.55), pink = vec3(1.0, 0.42, 0.85);
        vec3 col = mix(deep, mag, smoothstep(0.0, 0.45, k)); col = mix(col, pink, smoothstep(0.55, 1.0, k));
        col += pink * rim * 0.7 + mag * (1.0 - smoothstep(0.0, 0.07, v)) * 1.1;                                                 // a hot rim on every edge, a hot line along the foot
        gl_FragColor = vec4(col * (0.8 + 0.35 * k), uA * (0.82 + 0.18 * smoothstep(0.0, 0.15, m)));
      }` });
  const fireGlowMat = r => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uA: { value: 0 }, uR: { value: r } }, vertexShader: SHV,
    fragmentShader: `uniform float uT, uA, uR; varying vec3 vP;
      void main(){
        float d = length(vP.xy) - uR, a = atan(vP.y, vP.x);
        float g = d < 0.0 ? exp(d / 5.0) * 0.8 + 0.05 : exp(-d / 3.5);                                                            // wide on the inside, the whole floor in it faintly tinted
        g *= 0.85 + 0.15 * sin(a * 23.0 + uT * 3.0) * sin(a * 7.0 - uT * 1.7);
        gl_FragColor = vec4(vec3(1.0, 0.1, 0.6) * g * 0.3 * uA, 1.0);
      }` });
  function bossLava(x, z, r, T) {                        // the fire wall: it rises, stands T seconds, sinks; on the ground you do not cross it unhurt, in the air you do
    const G = new THREE.Group(), wall = new THREE.Mesh(lavaWallGeo, fireWallMat(Math.round(2 * Math.PI * r / 2.6)));
    wall.scale.set(r, 0.01, r); wall.renderOrder = 3;
    const gl = new THREE.Mesh(new THREE.RingGeometry(0.5, r + 14, 180, 1), fireGlowMat(r)); gl.rotation.x = -Math.PI / 2; gl.position.y = 0.06; gl.renderOrder = 2;
    const line = new THREE.Mesh(new THREE.RingGeometry(r - 0.22, r + 0.22, 180), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff4ad0, transparent: true, opacity: 0, depthWrite: false }), 3)); line.rotation.x = -Math.PI / 2; line.position.y = 0.09;
    G.add(gl, line, wall); G.position.set(x, 0, z); GAME.scene.add(G); lavas.push({ x, z, r, t: 0, T, G, wall, gl, line });
    GAME.SFX.play('boss_roar', GAME.tmp.set(x, 0, z), { rate: 0.45, vol: 0.8 }); if (Math.hypot(GAME.car.pos.x - x, GAME.car.pos.z - z) < r + 25) GAME.flashAlert('FIRE WALL: JUMP IT');
  }
  function lavaOff(L) { GAME.scene.remove(L.G); for (const m of L.G.children) { m.material.dispose(); if (m.geometry !== lavaWallGeo) m.geometry.dispose(); } }
  function clearLava() { for (const L of lavas) lavaOff(L); lavas.length = 0; }
  function updateLava(dt) {
    for (let i = lavas.length - 1; i >= 0; i--) { const L = lavas[i]; L.t += dt;
      if (L.t >= L.T) { lavaOff(L); lavas.splice(i, 1); continue; }
      const up = Math.min(1, L.t / 0.45) * Math.min(1, (L.T - L.t) / 0.4), h = BOSS2.lavaH * up;
      L.wall.scale.y = Math.max(0.01, h); L.wall.material.uniforms.uT.value = L.gl.material.uniforms.uT.value = L.t; L.wall.material.uniforms.uA.value = L.gl.material.uniforms.uA.value = up; L.line.material.opacity = (0.75 + 0.25 * Math.sin(L.t * 14)) * up;
      const dx = GAME.car.pos.x - L.x, dz = GAME.car.pos.z - L.z, d = Math.hypot(dx, dz) || 1e-3, a0 = Math.atan2(dz, dx);
      for (let j = 0; j < 3; j++) if (Math.random() < dt * 30) { const a = a0 + GAME.rand(-0.8, 0.8); GAME.spawnParticles(GAME.tmp.set(L.x + Math.cos(a) * L.r, 0.5 + Math.random() * h, L.z + Math.sin(a) * L.r), Math.random() < 0.5 ? 0xff6ae0 : 0xb04aff, 2, 5); }      // embers on the stretch you can see
      if (up > 0.6 && GAME.car.alive && GAME.car.y < 1.5 && Math.abs(d - L.r) < BOSS2.lavaW + 0.5 && (GAME.car.lavaT || 0) < GS.elapsed) { GAME.car.lavaT = GS.elapsed + 0.5; const sd = d < L.r ? -1 : 1;
        GAME.hurtCar(BOSS2.lavaDmg, GAME.tmp.set(dx / d * sd, 0, dz / d * sd).clone()); }      // burnt, and thrown back to the side you came from
    }
  }
  function updateBoss(dt) {
    updateQuakes(dt); updateLava(dt);
    const runeTarget = boss.state === 'fight' ? 1.5 + 0.6 * Math.sin(GS.elapsed * 3) : boss.state === 'emerging' ? 3.2 : boss.state === 'dead' ? 0.25 : 0.8;
    GS.runeLevel += (runeTarget - GS.runeLevel) * Math.min(1, 3 * dt); GAME.runeMat.color.setScalar(GS.runeLevel);
    // дверь
    const dy = GAME.door.targetY - GAME.doorMesh.position.y;
    GAME.doorMesh.position.y += Math.sign(dy) * Math.min(Math.abs(dy), 9 * dt);
    GAME.door.disabled = GAME.doorMesh.position.y < 0.3;

    if (boss.state === 'idle') {
      tentacles.forEach(tn => hideTent(tn));
      if (!GAME.NET.client && bossTgts().some(t => t.pos.x > GAME.ROOM_X1 + 5)) { bossEmerge(); GAME.netEv({ t: 'bs', s: 'e' }); }   // someone drove in: it rises (the gate stays open)
      return;
    }
    if (GAME.NET.on && GAME.NET.game && !GAME.NET.client && boss.state === 'fight' && boss.ph !== 2) {              // nobody left in the room for a while: it sinks back and waits (once it is out in the field it stays out)
      if (bossTgts().length) boss.empty = 0; else if ((boss.empty = (boss.empty || 0) + dt) > 6) { boss.empty = 0; resetBoss(); GAME.netEv({ t: 'bs', s: 'i' }); return; }
    }
    boss.t += dt;
    if (boss.state === 'emerging') {
      const k = Math.min(1, boss.t / 2.6), e = 1 - Math.pow(1 - k, 3);
      bossGroup.position.y = -BOSS_SINK + BOSS_SINK * e;
      GS.shake = Math.max(GS.shake, 0.3 * (1 - k) + 0.1);
      boss.dirtT -= dt;
      if (boss.dirtT <= 0) {
        boss.dirtT = 0.05;
        const a = GAME.rand(0, Math.PI * 2);
        GAME.spawnParticles(GAME.tmp.set(GAME.BOSS_POS.x + Math.cos(a) * 5, 0.3, GAME.BOSS_POS.z + Math.sin(a) * 5), 0x5a4a6a, 3, 8);
      }
      if (k >= 1) { boss.state = 'fight'; boss.t = 0; bossCol.disabled = false; }
    }
    if (boss.state === 'dead') {
      bossGroup.position.y -= dt * 3;
      if (bossGroup.position.y < -BOSS_SINK) { bossGroup.visible = false; bossBarEl.style.display = 'none'; }
      return;
    }
    if (boss.mv) bossMoveTick(dt);

    // глаз и орбита
    eye.lookAt(GAME.car.pos.x, 1, GAME.car.pos.z);
    eye.position.y = 6.0 + 0.12 * Math.sin(GS.elapsed * 2.3);
    capstone.position.y = 7.15 + 0.22 * Math.sin(GS.elapsed * 1.4); capstone.rotation.y += dt * 0.5;
    for (const o of orbit) {
      o.a += o.sp * dt;
      o.m.position.set(Math.cos(o.a) * o.r, o.y + Math.sin(GS.elapsed * 2 + o.a) * 0.4, Math.sin(o.a) * o.r);
      o.m.rotation.x += dt * 2; o.m.rotation.y += dt * 3;
    }
    boss.flash -= dt;
    if (boss.flash > 0) bossMat.emissive.setRGB(0.55, 0.3, 0.55);
    else { const g = 0.02 + 0.012 * Math.sin(GS.elapsed * 3); bossMat.emissive.setRGB(g * 0.7, g * 0.15, g * 1.6); }

    if (boss.state !== 'fight') return;
    for (const tn of tentacles) updateTentacle(tn, dt);

    // хлёст щупальцем по кд — хост выбирает, кого бить
    if (!GAME.NET.client) bossVolleyTick(dt);
    if (!GAME.NET.client) bossLash(dt);
    bossThrowTick(dt);
  }
  function bossLash(dt) {                                // the host picks who gets whipped: the tentacle best placed for someone in reach
    boss.lashCd -= dt;
    if (boss.lashCd > 0) return;
    const tg = bossTgts(); boss.lashCd = 0.4;
    for (const T of tg.sort(() => Math.random() - 0.5)) {
      const toT = Math.atan2(T.pos.z - GAME.BOSS_POS.z, T.pos.x - GAME.BOSS_POS.x), dT = Math.hypot(T.pos.x - GAME.BOSS_POS.x, T.pos.z - GAME.BOSS_POS.z);
      let best = null, bd = Infinity;
      for (const tn of tentacles) { if (tn.state !== 'idle') continue; const da = Math.abs(Math.atan2(Math.sin(toT - tn.a0), Math.cos(toT - tn.a0))); if (da < bd) { bd = da; best = tn; } }
      if (best && dT < 5.1 + best.n * TENT_SP * 1.15 + 3) {
        best.state = 'wind'; best.t = 0; best.tp = T.pos; boss.lashCd = GAME.rand(1.3, 2.1) / Math.max(1, Math.sqrt(tg.length));
        GAME.SFX.play('tent_wind', tentRoot(best)); GAME.netEv({ t: 'bt', k: best.k, p: T.peer }); break;
      }
    }
  }

  return { bossBarEl, boss, tentacles, tentRoot, angLerp, roomSpot, bossFan, bossTgts, netPeerPos, bossFanTick, bossLift, bossHurl, bossDamage, bossHealth, bossMax, bossBar, setDoor, releaseLift, killBoss, bossEmerge, bossFightNow, resetBoss, quakes, bossQuake, bossSetPos, bossMove, bossFlee, bossDash, lavas, bossLava, updateBoss };
}
