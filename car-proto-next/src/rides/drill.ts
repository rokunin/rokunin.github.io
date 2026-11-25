// ---------- drill logic ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { ARENA, W_STATS, DRILL_DPS, DRILL_REACH } from '../data/index.js';

export function createDrill(GAME) {
  let drillSparkT = 0; GS.drillRPM = 0;      // GS: the tests read it
  function crateSpot(o) {                                // where a broken crate comes back: derived from the crate and its respawn count, so every player gets the same spot
    o.rc = (o.rc || 0) + 1; let s = (GAME.SEED + GAME.obstacles.indexOf(o) * 9973 + o.rc * 131) >>> 0, x = 0, z = 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    for (let k = 0; k < 40; k++) {
      x = (rnd() * 2 - 1) * (ARENA - 6); z = (rnd() * 2 - 1) * (ARENA - 6);
      if (!GAME.obstacles.some(q => q !== o && q.mesh.visible && Math.abs(q.mesh.position.x - x) < q.hx + o.hx + 1 && Math.abs(q.mesh.position.z - z) < q.hz + o.hx + 1)) break;
    }
    return [x, z];
  }
  function damageCrate(o, dmg) {
    o.hp -= dmg; o.flash = 0.06;
    if (o.hp <= 0 && o.mesh.visible) {
      if (o.carried) { GAME.releaseIfHeld(o); o.carried = false; }
      o.mesh.visible = false;
      GAME.spawnParticles(o.mesh.position, 0xd2873c, 16, 9); GAME.SFX.play('crate_break', o.mesh.position);
      GAME.flash(o.mesh.position, 0xffb060, 4.5, 0.18, 1.6, false); GAME.burst(o.mesh.position, 0xa08a6a, 5, 1.6, 3.5, 0.35);
      GS.kills++; GAME.killsEl.textContent = GS.kills; GAME.crateDrop(o); if (!GAME.NET.applying) { GAME.myKill(o.mesh.position.x, o.mesh.position.z, 3); GAME.lootFrom('crate', o.mesh.position.x, o.mesh.position.z); }
      GAME.respawnQueue.push({ o, t: 4 });
      if (!o.room) GAME.netEv({ t: 'crate', i: GAME.obstacles.indexOf(o) });
    }
  }
  // попадает ли круг (x,z,r) в арку 180° перед машиной
  const DRILL_ARC_R = DRILL_REACH;
  const drillRMul = () => GAME.abLv.drill >= 2 ? 1.35 : 1;
  function inDrillArc(x, z, r) {
    const dx = x - GAME.car.pos.x, dz = z - GAME.car.pos.z;
    const along = dx * Math.sin(GAME.car.heading) + dz * Math.cos(GAME.car.heading);
    return Math.hypot(dx, dz) - r < DRILL_ARC_R * drillRMul() && along > -r * 0.6;
  }
  let drillCyc = 0;
  function drillAuto(dt) {                                 // on for a moment each cycle, half a cycle away from the nova burst
    const D = 1.0 + (GAME.abLv.drill >= 1 ? 0.5 : 0);
    if (GAME.weapons.nova) { const C = W_STATS.nova.cd[GAME.weapons.nova - 1]; return Math.abs(GS.novaT - C / 2) < Math.min(C * 0.4, D / 2) && GAME.threatNear(16); }
    drillCyc = (drillCyc + dt) % 2.4; return drillCyc < D && GAME.threatNear(16);
  }
  // подсветка арки на земле
  const arcFillMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff8c32, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 1.6);
  const arcEdgeMat = new THREE.MeshBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0, depthWrite: false });
  const drillArc = new THREE.Group();
  {
    const fill = new THREE.CircleGeometry(DRILL_ARC_R, 48, Math.PI, Math.PI); fill.rotateX(-Math.PI / 2);
    const edge = new THREE.RingGeometry(DRILL_ARC_R - 0.22, DRILL_ARC_R, 48, 1, Math.PI, Math.PI); edge.rotateX(-Math.PI / 2);
    drillArc.add(new THREE.Mesh(fill, arcFillMat), new THREE.Mesh(edge, arcEdgeMat));
    // бегущие по арке полоски
    for (let i = 0; i < 3; i++) {
      const g = new THREE.RingGeometry(0.93, 1, 48, 1, Math.PI, Math.PI); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 3));
      m.userData.phase = i / 3; drillArc.add(m);
    }
  }
  drillArc.visible = false; GAME.scene.add(drillArc);

  function updateDrill(dt) {
    const on = GAME.abilities.drill && GS.ride === 'buggy' && GAME.car.alive && GAME.car.burrow === 'up' && drillAuto(dt);
    GS.drillRPM += ((on ? 1 : 0) - GS.drillRPM) * Math.min(1, (on ? 5 : 2) * dt);
    GAME.drillSpin.rotation.z += GS.drillRPM * 45 * dt;
    GAME.SFX.loop('drill', GS.drillRPM > 0.02 ? 0.12 + 0.3 * GS.drillRPM : 0, 0.45 + 0.75 * GS.drillRPM);
    if (GS.drillRPM < 0.55) GAME.SFX.loop('grind', 0, 1);
    GAME.drill.position.x = GS.drillRPM > 0.3 ? GAME.rand(-0.03, 0.03) * GS.drillRPM : 0;   // вибрация

    // арка: видна, пока бур крутится, ярче на полных оборотах
    drillArc.visible = GS.drillRPM > 0.05 && GAME.car.alive;
    if (drillArc.visible) {
      drillArc.position.set(GAME.car.pos.x, 0.04, GAME.car.pos.z);
      drillArc.rotation.y = GAME.car.heading; drillArc.scale.setScalar(drillRMul());
      const k = Math.min(1, GS.drillRPM / 0.55);
      arcFillMat.opacity = 0.2 * k + (GS.drillRPM >= 0.55 ? 0.04 * Math.sin(GS.elapsed * 20) : 0);
      arcEdgeMat.opacity = 0.75 * k;
      for (const m of drillArc.children) if (m.userData.phase !== undefined) {
        const t = (GS.elapsed * 1.6 + m.userData.phase) % 1;               // полоска бежит от машины к краю
        const rad = 1 + t * (DRILL_ARC_R - 1.2);
        m.scale.set(rad, 1, rad);
        m.material.opacity = 0.35 * k * (1 - t);
      }
    }
    if (GS.drillRPM < 0.55) { GAME.drillMat.emissive.setHex(0); return; }

    const dmg = DRILL_DPS * dt * GS.drillRPM * (GAME.abLv.drill >= 2 ? 1.5 : 1);
    let grinding = false;
    drillSparkT -= dt;
    const spark = drillSparkT <= 0;
    if (spark) drillSparkT = 0.05;
    const tipPos = new THREE.Vector3(), away = new THREE.Vector3();

    for (const e of GAME.enemies) {
      if (e.dead || (e.carried && !(GAME.grab.held && GAME.grab.held.ref === e)) || !inDrillArc(e.pos.x, e.pos.z, e.r)) continue;
      grinding = true;
      away.set(e.pos.x - GAME.car.pos.x, 0, e.pos.z - GAME.car.pos.z).normalize();
      GAME.hitEnemy(e, away, dmg, 26 * dt);          // dmg дробный, отталкивает от машины
      e.biteCd = Math.max(e.biteCd, 0.25);      // пока в арке — не кусается
      if (spark) GAME.spawnParticles(tipPos.copy(e.pos).setY(1 + GAME.rand(0, 0.8)), Math.random() < 0.5 ? 0xc8323c : 0xffd27a, 2, 6);
    }
    for (const m of GAME.swarm) {
      if (m.dead || !inDrillArc(m.pos.x, m.pos.z, m.r)) continue;
      grinding = true;
      away.set(m.pos.x - GAME.car.pos.x, 0, m.pos.z - GAME.car.pos.z).normalize();
      m.cd = Math.max(m.cd, 0.25);
      if (spark) GAME.spawnParticles(tipPos.copy(m.pos).setY(1 + GAME.rand(0, 0.8)), m.art.color, 2, 6);
      GAME.hitCritter(m, dmg * 1.5, away, 30 * dt);
    }
    for (const o of GAME.obstacles) {
      if (!o.mesh.visible || o.wall || o.disabled || (o.carried && !(GAME.grab.held && GAME.grab.held.ref === o))) continue;
      const p = o.mesh.position, r = Math.max(o.hx, o.hz);
      if (!inDrillArc(p.x, p.z, r)) continue;
      away.set(p.x - GAME.car.pos.x, 0, p.z - GAME.car.pos.z).normalize();
      if (o.boss) { grinding = true; GAME.bossDamage(dmg * 2); }
      else if (o.crate) { grinding = true; damageCrate(o, dmg); }
      else if (Math.hypot(p.x - GAME.car.pos.x, p.z - GAME.car.pos.z) - r > 3.5) continue;   // дальние столбы не искрят
      else grinding = true;
      if (spark) GAME.spawnParticles(tipPos.copy(p).setY(0.8 + GAME.rand(0, 0.6)).addScaledVector(away, -r),
                                o.crate ? 0xd2873c : 0xffe08a, 2, 7);
    }
    GAME.drillMat.emissive.setHex(grinding ? 0xff4a00 : 0x000000);
    arcEdgeMat.color.setHex(grinding ? 0xffe9b0 : 0xffc06a).multiplyScalar(3.5);
    if (grinding) { GS.shake = Math.max(GS.shake, 0.18); GAME.car.speed *= 1 - 1.5 * dt; }
    GAME.SFX.loop('grind', grinding ? 0.4 * GS.drillRPM : 0, 0.9 + 0.2 * GS.drillRPM);
  }

  return { crateSpot, damageCrate, updateDrill };
}
