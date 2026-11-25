// ---------- landing powers: what a levelled jump does when the ride comes down. One per ride, three levels each ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { STOMP, BROOD, SPIKE, STARB } from '../data/index.js';

export function createLanding(GAME) {
  const isFry = m => !m.mini && !m.wb && !m.rig && !m.K.heavy && !m.elite;      // the small stuff, as opposed to brutes, mini-bosses and machines
  const landWaves = [], waveGeo = new THREE.RingGeometry(0.91, 1, 48); waveGeo.rotateX(-Math.PI / 2);
  function waveFx(x, z, r, col, T = 0.45) {                 // a ring that runs out along the ground
    const m = new THREE.Mesh(waveGeo, GAME.glow(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), 2));
    m.position.set(x, 0.14, z); m.scale.setScalar(0.5); GAME.scene.add(m); landWaves.push({ m, r, t: 0, T });
  }
  function slowCritter(m, t) { if (m.net) { GAME.netEv({ t: 'slow', i: m.id, s: t }, GAME.NET.hostPeer); return; } m.slow = Math.max(m.slow || 0, t); }
  // -- buggy: the stomp --
  function stompAt(x, z, lv) {                             // host: Lv1 stuns the shooters among the small fry, Lv2 halves all small fry and stuns them, Lv3 kills them and stuns everything bigger
    const r = STOMP.r[lv - 1], st = STOMP.stun[lv - 1], coop = 1 + 0.6 * (GAME.NET.on && GAME.NET.game ? Math.min(2, GAME.NET.remotes.size) : 0);
    for (const m of GAME.swarm) { if (m.dead || m.rig || m.dig > 0) continue; const dx = m.pos.x - x, dz = m.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d > r + m.r) continue;
      if (!isFry(m)) { if (lv >= 3) m.stun = Math.max(m.stun || 0, st); continue; }
      if (lv === 1) { if (m.K.ranged) m.stun = Math.max(m.stun || 0, st); }
      else if (lv === 2) { m.stun = Math.max(m.stun || 0, st); GAME.hitCritter(m, Math.max(1, Math.ceil(m.K.hp * coop * 0.5)), GAME.tmp.set(dx / d, 0, dz / d).clone(), 4); }
      else GAME.hitCritter(m, 999, GAME.tmp.set(dx / d, 0, dz / d).clone(), 8); }
  }
  function stomp(lv) {
    const x = GAME.car.pos.x, z = GAME.car.pos.z, r = STOMP.r[lv - 1], st = STOMP.stun[lv - 1];
    waveFx(x, z, r, 0xffe08a); if (lv >= 2) waveFx(x, z, r * 0.62, 0xfff4c8, 0.32); if (lv >= 3) waveFx(x, z, r * 1.05, 0xff9a3a, 0.6);
    GAME.burst(GAME.tmp.set(x, 0.4, z), 0xffe08a, 8 + lv * 4, r * 0.35, 9, 0.45); GS.shake = Math.max(GS.shake, 0.25 + lv * 0.1);
    for (const e of GAME.enemies) { if (e.dead || e.carried) continue; const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d > r + e.r) continue;      // the evil cubes are each player's own: they shoot, so they count as shooters
      if (!e.elite || lv >= 3) e.stun = Math.max(e.stun || 0, st);
      if (lv >= 2 && !e.elite) GAME.hitEnemy(e, GAME.tmp.set(dx / d, 0, dz / d).clone(), lv === 2 ? Math.ceil(e.maxHp * 0.5) : 99, 6); }
    if (GAME.NET.client) GAME.netEv({ t: 'stomp', x: GAME.r1(x), z: GAME.r1(z), l: lv }, GAME.NET.hostPeer); else stompAt(x, z, lv);
  }
  // -- spider: the brood. Flat little spiderlings splash out, run to the monsters around, sit on the small ones, crawl over the big ones and slow them; at Lv3 they blow up when they are done --
  const broods = [];
  const broodTex = (() => { const c = GAME.mkCanvas(64), x = c.getContext('2d'); x.translate(32, 32); x.shadowColor = '#d8ff6a'; x.shadowBlur = 2.5; x.strokeStyle = '#17101c'; x.lineWidth = 3.4; x.lineCap = 'round';
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const a = (-0.95 + i * 0.62); x.beginPath(); x.moveTo(sd * 6, a * 6); x.quadraticCurveTo(sd * 20, a * 16 - 7, sd * 27, a * 22 + 3); x.stroke(); }
    x.fillStyle = '#241a2c'; x.beginPath(); x.ellipse(0, 4, 11, 13, 0, 0, 6.283); x.fill(); x.beginPath(); x.arc(0, -10, 7.5, 0, 6.283); x.fill();
    x.fillStyle = '#ff5a6e'; for (const sd of [-1, 1]) { x.beginPath(); x.arc(sd * 3.2, -12, 1.9, 0, 6.283); x.fill(); }
    x.fillStyle = '#c8ff5a'; x.beginPath(); x.ellipse(0, 5, 4, 5.5, 0, 0, 6.283); x.fill(); return GAME.srgbTex(c); })();
  function spawnBrood(x, z, lv, own) {
    for (let i = 0; i < BROOD.n[lv - 1]; i++) { const a = Math.random() * 6.283, sp = 4 + Math.random() * 6, spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: broodTex, transparent: true, depthTest: false }));
      spr.scale.set(1.6, 1.6, 1); spr.renderOrder = 18; GAME.scene.add(spr);
      broods.push({ spr, x, z, y: 1, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 5 + Math.random() * 4, t: 0, on: 0, lv, own, tgt: null, ph: Math.random() * 6.283, tick: 0, look: 0, ox: x, oz: z }); }
  }
  function broodEnd(b, i, boom) {
    if (boom) { GAME.tmp.set(b.x, b.y + 0.4, b.z); GAME.flash(GAME.tmp, 0xc8ff5a, 2.6, 0.18, 3, false); GAME.burst(GAME.tmp, 0xc8ff5a, 5, 0.8, 4, 0.5); GAME.SFX.play('pop', GAME.tmp, { rate: 1.7, vol: 0.4 }); }
    GAME.scene.remove(b.spr); b.spr.material.dispose(); broods.splice(i, 1);
  }
  function updateBrood(dt) {
    for (let i = broods.length - 1; i >= 0; i--) { const b = broods[i]; b.t += dt; const m = b.tgt;
      if (b.vy !== 0) { b.vy -= 30 * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.z += b.vz * dt; if (b.y <= 0.12) { b.y = 0.12; b.vy = 0; } }      // the splash
      else if (m && !m.dead && b.on > 0) {                 // riding its monster
        b.on += dt; const big = !isFry(m), o = m.r * (big ? 0.85 : 0.25), w = b.ph + b.on * (big ? 3.2 : 1.2);
        b.x = m.pos.x + Math.cos(w) * o; b.z = m.pos.z + Math.sin(w) * o; b.y = GAME.critterTop(m) * (big ? 0.5 + 0.35 * Math.sin(w * 1.7) : 0.8);
        if (b.own && (b.tick -= dt) <= 0) { b.tick = 0.4; slowCritter(m, 0.7); }
        if (b.on >= BROOD.slow[b.lv - 1]) { if (b.lv >= 3 && b.own) GAME.hitCritter(m, 3, null, 2); broodEnd(b, i, b.lv >= 3); continue; }
      } else {                                              // on the ground: find a monster nobody sits on yet and run to it
        if (m && m.dead) { b.tgt = null; b.on = 0; }
        if (!b.tgt && (b.look -= dt) <= 0) { b.look = 0.3; let bd = BROOD.r[b.lv - 1];
          for (const q of GAME.swarm) { if (q.dead || q.rig || q.dig > 0) continue; const d = Math.hypot(q.pos.x - b.x, q.pos.z - b.z); if (d >= bd) continue;
            let n = 0; for (const o of broods) if (o.tgt === q) n++; if (n >= (isFry(q) ? 1 : 4)) continue; bd = d; b.tgt = q; } }
        const q = b.tgt;
        if (q) { const dx = q.pos.x - b.x, dz = q.pos.z - b.z, d = Math.hypot(dx, dz) || 1e-3; if (d < q.r + 0.4) b.on = 0.001; else { const sp = Math.min(d, 16 * dt), wig = Math.sin(b.t * 18 + b.ph) * 0.35; b.x += (dx / d - dz / d * wig) * sp; b.z += (dz / d + dx / d * wig) * sp; } }
        else { b.x += Math.cos(b.ph + b.t * 2) * 3 * dt; b.z += Math.sin(b.ph + b.t * 2) * 3 * dt; }
        b.y = 0.12;
      }
      if (b.t > 9 || (!b.tgt && b.t > 2.6)) { broodEnd(b, i, false); continue; }
      b.spr.position.set(b.x, b.y + 0.7, b.z); b.spr.material.rotation = Math.sin(b.t * 22 + b.ph) * 0.35; b.spr.material.opacity = Math.min(1, (9 - b.t) * 2);
    }
  }
  // -- halo: spikes of light where it lands; they stand a while and hurt whatever is among them --
  const spikeFields = [];
  const spikeGeo = new THREE.ConeGeometry(0.36, 1, 6); spikeGeo.translate(0, 0.5, 0);
  const spikeMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0x8fd4ff }), 1.25), spikeCore = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffe9a0 }), 1.5);      // bright, but the shape must survive the bloom
  function spawnSpikes(x, z, lv, own) {
    const g = new THREE.Group(), n = SPIKE.n[lv - 1], R = SPIKE.r[lv - 1], H = SPIKE.h[lv - 1], inner = Math.max(1, Math.round(n / 3)), ph = Math.random() * 6.283;
    for (let i = 0; i < n; i++) { const core = i < inner, a = ph + (core ? i / inner : (i - inner) / (n - inner)) * 6.283 + (core ? 0 : 0.4), rr = core ? R * 0.34 : R * (0.72 + Math.random() * 0.2);
      const c = new THREE.Mesh(spikeGeo, core ? spikeCore : spikeMat), w = (core ? 1.25 : 1) * (0.8 + lv * 0.2);
      c.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); c.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);      // they lean outward a little, like a crown
      c.userData = { h: H * (core ? 1.15 : 0.75 + Math.random() * 0.4), w, d: (core ? 0 : 0.05) + Math.random() * 0.08 }; c.scale.set(w, 0.001, w); g.add(c); }
    g.position.set(x, 0, z); GAME.scene.add(g); spikeFields.push({ g, x, z, lv, own, t: 0, tick: 0.12 });
    GAME.flash(GAME.tmp.set(x, 0.8, z), 0xbfe9ff, R * 0.7, 0.2, 2, false); waveFx(x, z, R, 0xbfe9ff, 0.3);
  }
  function updateSpikes(dt) {
    for (let i = spikeFields.length - 1; i >= 0; i--) { const F = spikeFields[i]; F.t += dt; const T = SPIKE.T[F.lv - 1], R = SPIKE.r[F.lv - 1], out = Math.max(0, Math.min(1, (T - F.t) / 0.25));
      for (const c of F.g.children) { const k = Math.max(0, Math.min(1, (F.t - c.userData.d) / 0.16)), e = k <= 0 ? 0 : 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);      // they shoot up with a little overshoot and sink back at the end
        c.scale.set(c.userData.w, Math.max(0.001, c.userData.h * e * out), c.userData.w); }
      if (F.own && F.t < T && (F.tick -= dt) <= 0) { F.tick = 0.4; const dmg = SPIKE.dmg[F.lv - 1];
        for (const m of GAME.swarm) { if (m.dead || m.dig > 0) continue; const dx = m.pos.x - F.x, dz = m.pos.z - F.z, d = Math.hypot(dx, dz) || 1e-3; if (d < R + m.r) GAME.hitCritter(m, dmg, GAME.tmp.set(dx / d, 0, dz / d).clone(), 1.5); }
        for (const e of GAME.enemies) { if (e.dead || e.carried) continue; const dx = e.pos.x - F.x, dz = e.pos.z - F.z, d = Math.hypot(dx, dz) || 1e-3; if (d < R + e.r) GAME.hitEnemy(e, GAME.tmp.set(dx / d, 0, dz / d).clone(), dmg, 1.5); } }
      if (F.t >= T) { GAME.scene.remove(F.g); spikeFields.splice(i, 1); } }
  }
  // -- unicorn: a starburst, the nova ring in small: smaller shots that do not fly as far --
  const starbMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff8ad8 }), 3.2);
  function starburst(lv) {
    const n = STARB.n[lv - 1], o = new THREE.Vector3(GAME.car.pos.x, 1.0, GAME.car.pos.z), ph = Math.random() * 6.283, sp = 38;
    for (let i = 0; i < n; i++) { const a = ph + i / n * 6.283, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), m = new THREE.Mesh(GAME.bulletGeo, starbMat);
      m.scale.set(0.7, 0.7, 0.55); m.position.copy(o).addScaledVector(dir, 1.4); m.lookAt(m.position.x + dir.x, m.position.y, m.position.z + dir.z); GAME.scene.add(m);
      GAME.bullets.push({ m, v: dir.multiplyScalar(sp), life: STARB.reach[lv - 1] / sp, dmg: STARB.dmg[lv - 1] }); }
    GAME.flash(o, 0xff8ad8, 4 + lv * 1.5, 0.25, 3); waveFx(o.x, o.z, STARB.reach[lv - 1], 0xff8ad8, STARB.reach[lv - 1] / sp); GAME.SFX.play('nova', GAME.car.pos, { rate: 1.5, vol: 0.6 });
  }
  function landPower(lv) {                                 // my ride came down from a jump with a levelled jump skill
    const x = GAME.car.pos.x, z = GAME.car.pos.z;
    if (GS.ride === 'buggy') stomp(lv); else if (GS.ride === 'spider') spawnBrood(x, z, lv, true); else if (GS.ride === 'halo') spawnSpikes(x, z, lv, true); else starburst(lv);
    GAME.netEv({ t: 'jfx', k: GS.ride, l: lv, x: GAME.r1(x), z: GAME.r1(z) });
  }
  function landFxRemote(k, lv, x, z) {                     // a friend's landing: the picture only, the damage is theirs
    if (k === 'buggy') { waveFx(x, z, STOMP.r[lv - 1], 0xffe08a); if (lv >= 2) waveFx(x, z, STOMP.r[lv - 1] * 0.62, 0xfff4c8, 0.32); }
    else if (k === 'spider') spawnBrood(x, z, lv, false); else if (k === 'halo') spawnSpikes(x, z, lv, false);
    else if (k === 'unicorn') { GAME.flash(GAME.tmp.set(x, 1, z), 0xff8ad8, 4 + lv * 1.5, 0.25, 3, false); waveFx(x, z, STARB.reach[lv - 1], 0xff8ad8, STARB.reach[lv - 1] / 38); }
  }
  function updateLandFx(dt) {
    for (let i = landWaves.length - 1; i >= 0; i--) { const w = landWaves[i]; w.t += dt; const k = Math.min(1, w.t / w.T), e = 1 - (1 - k) * (1 - k); w.m.scale.setScalar(0.5 + (w.r - 0.5) * e); w.m.material.opacity = 0.9 * (1 - k * k);
      if (k >= 1) { GAME.scene.remove(w.m); w.m.material.dispose(); landWaves.splice(i, 1); } }
    updateBrood(dt); updateSpikes(dt);
  }

  return { isFry, waveFx, stompAt, landPower, landFxRemote, updateLandFx, broods, spikeFields };
}
