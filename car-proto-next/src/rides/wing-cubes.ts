// ---------- Wing Cubes (angel): run by the caster's machine; others just see them flutter round the angel -----
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createWingCubes(GAME) {
  const CUBE_CD = 15, CUBE_T = 8, cubes = []; let cubeCd = 0;
  const cubeGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9), wingGeo = new THREE.PlaneGeometry(0.9, 0.5); wingGeo.translate(0.45, 0, 0);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const CUBE_COLS = [0xffb3c7, 0xa8e6ff, 0xfff0a0, 0xc8b3ff, 0xb8f5c0];
  function releaseCubes() {
    if (!GAME.abilities.cubes || GS.ride !== 'halo' || !GAME.car.alive || cubeCd > 0) return;
    cubeCd = CUBE_CD; const n = GAME.abLv.cubes >= 1 ? 5 : 3;
    spawnCubes(n, null, GAME.abLv.cubes); GAME.netEv({ t: 'cubes', n, l: GAME.abLv.cubes });
    GAME.SFX.play('jump2', GAME.car.pos, { rate: 1.6 });
  }
  function spawnCubes(n, R, lv) {
    const host = R ? R.pos : GAME.car.pos;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(), body = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: CUBE_COLS[i % 5], roughness: 0.6 }));
      const wl = new THREE.Mesh(wingGeo, wingMat), wr = new THREE.Mesh(wingGeo, wingMat); wl.position.x = 0.4; wr.position.x = -0.4; wr.rotation.y = Math.PI;
      g.add(body, wl, wr); g.position.set(host.x + Math.cos(i / n * 6.283) * 1.6, 2.5, host.z + Math.sin(i / n * 6.283) * 1.6); GAME.scene.add(g);
      cubes.push({ g, body, wl, wr, R, lv, t: 0, eaten: 0, bite: 0, a: i / n * 6.283, tgt: null, sc: 1 });
    }
  }
  function cubePop(c) {
    GAME.tmp.copy(c.g.position); GAME.burst(GAME.tmp, 0xffffff, 8, 1.5, 6, 0.5); GAME.SFX.play('pop', GAME.tmp, { rate: 1.4 });
    if (!c.R && c.lv >= 2) GAME.ringBlast(c.g.position.x, c.g.position.z, 3.5, 3, 12, 0xa8e6ff, false);      // swollen cubes burst
    GAME.scene.remove(c.g); c.body.material.dispose();
  }
  function cubeBoom(c, m) {                               // a dive ends in a small blast: the victim takes the hit, whatever stands right next to it gets singed
    const x = c.g.position.x, z = c.g.position.z, col = c.body.material.color.getHex(), big = m.K.heavy || m.elite || m.mini || m.rig;
    GAME.tmp.set(x, 0.9, z); GAME.flash(GAME.tmp, col, 3.4, 0.2, 3, false); GAME.burst(GAME.tmp, 0xffffff, 6, 1.1, 5, 0.5); GAME.waveFx(x, z, 2.6, col, 0.28); GAME.SFX.play('pop', GAME.tmp, { rate: 1.15, vol: 0.55 }); GAME.SFX.play('chomp', GAME.tmp, { rate: 1.6, vol: 0.4 });
    GAME.hitCritter(m, big ? 3 : 99, GAME.tmp.set(0, 0, 0), 0);
    for (const o of GAME.swarm) { if (o === m || o.dead || o.dig > 0) continue; const dx = o.pos.x - x, dz = o.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d < 2.6 + o.r) GAME.hitCritter(o, 1, GAME.tmp.set(dx / d, 0, dz / d).clone(), 5); }
    c.eaten++; c.sc = c.lv >= 2 ? 1 + 0.18 * c.eaten : 1; c.tgt = null; c.mode = 'rise'; c.up = 0.32; c.wait = 0.2;
  }
  function updateCubes(dt) {
    cubeCd -= dt;
    for (let i = cubes.length - 1; i >= 0; i--) {
      const c = cubes[i]; c.t += dt; c.a += dt * 2.5;
      const own = !c.R, hp = own ? GAME.car.pos : c.R.pos, P = c.g.position;
      if (!own && GAME.NET.remotes.get(c.R.peer) !== c.R) c.t = CUBE_T;
      let gx = hp.x + Math.cos(c.a) * 3, gz = hp.z + Math.sin(c.a) * 3, sp = 17, pitch = 0;
      if (c.y === undefined) { c.y = 2.6; c.mode = 'hover'; c.wait = 0.15 + i * 0.12; }
      if (own) {                                         // hover by the angel, pick a victim, rear up, dive on it and go off
        const m = c.tgt;
        if (c.mode === 'hover') { c.y += (3 - c.y) * Math.min(1, dt * 6);
          if ((c.wait -= dt) <= 0) { c.wait = 0.25; let bd = 16;
            for (const q of GAME.swarm) { if (q.dead || q.dig > 0 || cubes.some(o => o !== c && o.tgt === q)) continue;      // each cube picks its own victim
              const d = Math.hypot(q.pos.x - P.x, q.pos.z - P.z) + Math.hypot(q.pos.x - hp.x, q.pos.z - hp.z) * 0.5; if (d < bd) { bd = d; c.tgt = q; } }
            if (c.tgt) { c.mode = 'aim'; c.aim = 0.24; } } }
        else if (c.mode === 'aim') { if (!m || m.dead) { c.mode = 'hover'; c.tgt = null; } else { gx = P.x; gz = P.z; c.y += 5 * dt; pitch = -0.5; c.face = Math.atan2(m.pos.x - P.x, m.pos.z - P.z);
            if ((c.aim -= dt) <= 0) { c.mode = 'dive'; c.d0 = Math.max(1, Math.hypot(m.pos.x - P.x, m.pos.z - P.z)); c.y0 = c.y; c.puff = 0; } } }
        else if (c.mode === 'dive') { if (!m || m.dead) { c.mode = 'rise'; c.up = 0.25; c.tgt = null; } else { gx = m.pos.x; gz = m.pos.z; sp = 36; pitch = 1.0;
            const d = Math.hypot(gx - P.x, gz - P.z), k = Math.min(1, d / c.d0), low = GAME.critterTop(m) * 0.6; c.y = low + (c.y0 - low) * k * k;
            if ((c.puff -= dt) <= 0) { c.puff = 0.04; GAME.puff(P, c.body.material.color.getHex(), 0.5, 0.28, 0, 0.4, 0, 0.5, 1.2); }
            if (d < m.r + 0.8) cubeBoom(c, m); } }
        else { gx = P.x; gz = P.z; c.y += 11 * dt; pitch = -0.6; if ((c.up -= dt) <= 0) c.mode = 'hover'; }      // bouncing back up out of the blast
      } else c.y = 2.2;
      const dx = gx - P.x, dz = gz - P.z, d = Math.hypot(dx, dz) || 1, mv = Math.min(d, sp * dt);
      P.x += dx / d * mv; P.z += dz / d * mv; P.y = c.y + (c.mode === 'dive' ? 0 : Math.sin(c.t * 5 + c.a) * 0.3);
      c.g.rotation.order = 'YXZ'; c.g.rotation.y = c.mode === 'aim' ? c.face : d > 0.05 ? Math.atan2(dx, dz) : c.g.rotation.y; c.g.rotation.x += (pitch - c.g.rotation.x) * Math.min(1, dt * 14);
      const f = Math.sin(c.t * (c.mode === 'dive' ? 46 : 28)) * (c.mode === 'dive' ? 0.3 : 0.8), tuck = c.mode === 'dive' ? 0.9 : 0; c.wl.rotation.z = f + tuck; c.wr.rotation.z = -f - tuck;      // wings swept back in the dive
      c.g.scale.setScalar(c.sc * (c.mode === 'rise' ? 1.2 : 1));
      if (c.t >= CUBE_T || c.eaten >= 5) { cubePop(c); cubes.splice(i, 1); }
    }
  }
  return { CUBE_CD, cubeCd, releaseCubes, spawnCubes, updateCubes, cubes };
}
