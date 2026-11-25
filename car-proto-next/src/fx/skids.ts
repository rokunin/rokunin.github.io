// ---------- skid marks + tire smoke ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { BOMB } from '../data/index.js';

export function createSkids(GAME) {
  const SKID_SLIP = 2.6, SKID_LIFE = 6, SKID_MAX = 360;
  const skidGeo = new THREE.PlaneGeometry(0.42, 0.75); skidGeo.rotateX(-Math.PI / 2);
  const skids = []; let skidHead = 0, skidT = 0;
  const smoke = []; let dustT = 0;
  const smokeGeo = new THREE.SphereGeometry(0.45, 7, 5);
  const wpos = new THREE.Vector3();
  function updateSkid(dt, lateral) {
    const slip = Math.abs(lateral);
    GAME.SFX.loop('skid', GAME.car.alive && GAME.car.depth === 0 && !GAME.car.airborne && slip > SKID_SLIP ? Math.min(0.35, (slip - SKID_SLIP) / 14) : 0, 0.9 + Math.min(0.3, slip / 40));
    skidT -= dt; dustT -= dt;
    const gspd = Math.hypot(GAME.car.vel.x, GAME.car.vel.z);
    if (GS.ride === 'buggy' && GAME.car.alive && GAME.car.depth === 0 && !GAME.car.airborne && gspd > 8 && dustT <= 0) {   // dust trail
      dustT = 0.045;
      GAME.wheels[2 + (Math.random() < 0.5 ? 0 : 1)].pivot.getWorldPosition(wpos); wpos.y = 0.3;
      GAME.puff(wpos, 0xa8977c, 0.9, 0.8, GAME.rand(-0.5, 0.5), GAME.rand(0.3, 0.9), GAME.rand(-0.5, 0.5), 0.2 * Math.min(1, gspd / 20), 2.4);
    }
    if (GAME.car.alive && GAME.car.depth === 0 && !GAME.car.airborne && slip > SKID_SLIP && skidT <= 0) {
      skidT = 0.025;
      const yaw = Math.atan2(GAME.car.vel.x, GAME.car.vel.z);
      const strength = Math.min(1, (slip - SKID_SLIP) / 8);
      for (const w of [GAME.wheels[2], GAME.wheels[3]]) {        // задние колёса
        w.pivot.getWorldPosition(wpos);
        let sk = skids[skidHead];
        if (!sk) { sk = { m: new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x1c1c1a, transparent: true, depthWrite: false })), t: 0 }; GAME.scene.add(sk.m); skids[skidHead] = sk; }
        sk.m.position.set(wpos.x, 0.02 + skidHead * 0.00001, wpos.z);
        sk.m.rotation.y = yaw; sk.t = SKID_LIFE; sk.a = 0.25 + 0.35 * strength;
        sk.m.material.opacity = sk.a; sk.m.visible = true;
        skidHead = (skidHead + 1) % SKID_MAX;
        if (Math.random() < 0.3 + strength * 0.45) {      // tyre smoke
          wpos.y = 0.35;
          GAME.puff(wpos, 0xd8d6d0, 1.3, 1.0, GAME.rand(-0.6, 0.6) - GAME.car.vel.x * 0.08, GAME.rand(0.8, 1.6), GAME.rand(-0.6, 0.6) - GAME.car.vel.z * 0.08, 0.4);
        }
      }
    }
    for (const sk of skids) {
      if (!sk || !sk.m.visible) continue;
      sk.t -= dt;
      if (sk.t <= 0) sk.m.visible = false;
      else if (sk.t < 1.5) sk.m.material.opacity = sk.a * sk.t / 1.5;
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.life -= dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.multiplyScalar(1 + 1.6 * dt);
      p.m.material.opacity = Math.max(0, p.life / 0.9 * 0.55);
      if (p.life <= 0) { GAME.scene.remove(p.m); p.m.material.dispose(); smoke.splice(i, 1); }
    }
  }

  const throwMul = () => GAME.abLv.grab >= 2 ? 3 : GAME.abLv.grab >= 1 ? 2 : 1;
  function ringBlast(x, z, r, dmg, push, col, stun) {      // a knock-back ring from the ride (upgrades); critters are the host's, so a client asks it
    GAME.burst(GAME.tmp.set(x, 0.4, z), col, 12, r * 0.7, 9, 0.5); GAME.flash(GAME.tmp, col, r, 0.25, 3, false); GS.shake = Math.max(GS.shake, 0.3);
    if (GAME.NET.client) { GAME.netEv({ t: 'blast', x: GAME.r1(x), z: GAME.r1(z), r, d: dmg, p: push, s: stun ? 1 : 0 }, GAME.NET.hostPeer); return; }
    blastAt(x, z, r, dmg, push, stun);
  }
  function blastAt(x, z, r, dmg, push, stun) {
    for (const m of GAME.swarm) { if (m.dead) continue; const dx = m.pos.x - x, dz = m.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d < r + m.r) { GAME.hitCritter(m, dmg, GAME.tmp.set(dx / d, 0, dz / d).clone(), push); if (stun) m.stun = Math.max(m.stun || 0, 1); } }
    for (const e of GAME.enemies) { if (e.dead || e.carried) continue; const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d < r + e.r) { GAME.hitEnemy(e, GAME.tmp.set(dx / d, 0, dz / d).clone(), Math.max(1, dmg * 0.5), push); if (stun) e.stun = Math.max(e.stun || 0, 1); } }
  }
  function surfaceBlast() { ringBlast(GAME.car.pos.x, GAME.car.pos.z, 6, 3, 18, 0x9a7a54, true); }
  let bombCd = 0; const domes = [];
  const domeGeo = new THREE.SphereGeometry(1, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeRingGeo = new THREE.RingGeometry(0.95, 1, 64); domeRingGeo.rotateX(-Math.PI / 2);
  function bombDome() {
    if (!GAME.abilities.bomb || GS.ride !== 'unicorn' || !GAME.car.alive || GAME.car.burrow !== 'up' || bombCd > 0) return;
    const L = GAME.abLv.bomb; bombCd = BOMB.cd[L];
    const x = GAME.r1(GAME.car.pos.x), z = GAME.r1(GAME.car.pos.z), r = BOMB.r[L], T = BOMB.T[L];
    addDome(x, z, r, T);
    if (GAME.NET.client) GAME.netEv({ t: 'dome', x, z, r, T }); else { GAME.netEv({ t: 'dome', x, z, r, T }); blastAt(x, z, r, 1, 26, true); }
  }
  function addDome(x, z, r, T) {
    const mat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff9ae0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 1.6);
    const rmat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffc4ef, transparent: true, opacity: 0, depthWrite: false }), 2.5);
    const m = new THREE.Mesh(domeGeo, mat), ring = new THREE.Mesh(domeRingGeo, rmat);
    m.position.set(x, 0, z); ring.position.set(x, 0.06, z); ring.scale.setScalar(r); GAME.scene.add(m, ring);
    domes.push({ x, z, r, T, t: 0, m, ring });
    GAME.burst(GAME.tmp.set(x, 0.5, z), 0xff9ae0, 16, r * 0.8, 12, 0.6); GAME.flash(GAME.tmp, 0xff9ae0, r * 1.2, 0.35, 4, false);
    GAME.SFX.play('explode', GAME.tmp, { vol: 0.6, rate: 1.3 }); GS.shake = Math.max(GS.shake, 0.35);
  }
  const inDome = (x, z) => domes.some(D => Math.hypot(x - D.x, z - D.z) < D.r);
  function updateDomes(dt) {
    bombCd -= dt;
    for (let i = domes.length - 1; i >= 0; i--) {
      const D = domes[i]; D.t += dt;
      const k = Math.min(1, D.t / 0.18), fade = Math.min(1, (D.T - D.t) / 0.4);
      D.m.scale.setScalar(D.r * (0.4 + 0.6 * k)); D.m.material.opacity = 0.11 * fade * k + 0.03 * Math.sin(GS.elapsed * 14) * fade; D.ring.material.opacity = 0.8 * fade;
      if (!GAME.NET.client) {                                   // nobody gets in while it stands
        for (const m of GAME.swarm) { if (m.dead) continue; const dx = m.pos.x - D.x, dz = m.pos.z - D.z, d = Math.hypot(dx, dz) || 1e-3, R = D.r + m.r;
          if (d < R) { m.pos.x = D.x + dx / d * R; m.pos.z = D.z + dz / d * R; const vn = m.vel.x * dx / d + m.vel.z * dz / d; if (vn < 0) { m.vel.x -= dx / d * vn; m.vel.z -= dz / d * vn; } } }
        for (const e of GAME.enemies) { if (e.dead || e.carried) continue; const dx = e.pos.x - D.x, dz = e.pos.z - D.z, d = Math.hypot(dx, dz) || 1e-3, R = D.r + e.r;
          if (d < R) { e.pos.x = D.x + dx / d * R; e.pos.z = D.z + dz / d * R; } }
      }
      if (D.t >= D.T) { GAME.scene.remove(D.m, D.ring); D.m.material.dispose(); D.ring.material.dispose(); domes.splice(i, 1); }
    }
  }
  const activeCdK = () => GS.ride === 'unicorn' ? Math.max(0, bombCd) / BOMB.cd[GAME.abLv.bomb] : GS.ride === 'buggy' ? Math.max(0, GAME.decoyCd) / GAME.DECOY_CD : GS.ride === 'halo' ? Math.max(0, GAME.cubeCd) / GAME.CUBE_CD : 0;
  return { updateSkid, throwMul, ringBlast, blastAt, surfaceBlast, domes, bombDome, addDome, inDome, updateDomes, activeCdK };
}
