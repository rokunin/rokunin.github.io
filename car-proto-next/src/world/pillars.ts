// ---------- smashable pillars: ram one and it bursts into heavy chunks that mow through the small stuff ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { ARENA } from '../data/index.js';

export function createPillars(GAME) {
  const PILLAR_RAM = 6;
  const chunks = [];
  const chunkGeos = [new THREE.TetrahedronGeometry(1, 0), new THREE.BoxGeometry(1.3, 1, 1.1), new THREE.DodecahedronGeometry(0.9, 0)];
  GS.pillarsSmashed = 0;
  function smashPillar(o, vel) {
    if (!o.mesh.visible || o.rock) return;              // nests are unbreakable
    o.mesh.visible = false; GS.pillarsSmashed++;
    if (!GAME.NET.applying) GAME.netEv({ t: 'smash', i: GAME.obstacles.indexOf(o), vx: GAME.r1(vel.x), vz: GAME.r1(vel.z) });
    if (o.rock) GAME.rockSmashed(o);
    const chunkMat = o.rock ? GAME.rockMat : GAME.pillarMat;
    const p = o.mesh.position, sp = Math.hypot(vel.x, vel.z) || 1, dx = vel.x / sp, dz = vel.z / sp;
    const n = Math.round(7 + o.h * 0.8);
    for (let i = 0; i < n; i++) {
      const r = GAME.rand(0.45, 0.95) * (i < 3 ? 1.25 : 1);
      const m = new THREE.Mesh(chunkGeos[i % 3], chunkMat); m.scale.setScalar(r); m.castShadow = true;
      m.position.set(p.x + GAME.rand(-o.hx, o.hx) * 0.7, GAME.rand(0.5, o.h * 0.9), p.z + GAME.rand(-o.hz, o.hz) * 0.7);
      m.rotation.set(GAME.rand(0, 6), GAME.rand(0, 6), GAME.rand(0, 6)); GAME.scene.add(m);
      const a = GAME.rand(-0.75, 0.75), ca = Math.cos(a), sa = Math.sin(a), v = Math.min(30, sp) * GAME.rand(0.7, 1.35) + 4;
      chunks.push({ m, r, v: new THREE.Vector3((dx * ca - dz * sa) * v, GAME.rand(2, 8), (dz * ca + dx * sa) * v), spin: new THREE.Vector3(GAME.rand(-8, 8), GAME.rand(-8, 8), GAME.rand(-8, 8)), life: 7, hit: new Set() });
    }
    GAME.tmp.set(p.x, 1.5, p.z);
    GAME.burst(GAME.tmp, 0x9a958c, 10, 2.6, 6, 0.5); GAME.spawnParticles(GAME.tmp, 0xb4b8c2, 16, 10); GAME.flash(GAME.tmp, 0xfff0d0, 5, 0.15, 1.6, false);
    GS.shake = Math.max(GS.shake, 0.55); GAME.SFX.play('hit_stone', p, { vol: 1 }); GAME.SFX.play('crate_break', p, { rate: 0.6 });
    GAME.crewSay('smash', 0.6);
  }
  const chunkDir = new THREE.Vector3();
  function updateChunks(dt) {
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i], p = c.m.position;
      c.life -= dt;
      c.v.y -= 30 * dt; p.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      const floor = c.r * 0.55;
      if (p.y < floor) {                               // bounce, then skid to a stop
        p.y = floor;
        if (c.v.y < -4) { c.v.y *= -0.35; GAME.SFX.play('hit_stone', p, { vol: 0.35 }); } else c.v.y = 0;
        const f = Math.max(0, 1 - 3.2 * dt); c.v.x *= f; c.v.z *= f; c.spin.multiplyScalar(f);
      }
      if (!GAME.inWorld(p.x, p.z)) { c.v.x *= -0.4; c.v.z *= -0.4; p.x = THREE.MathUtils.clamp(p.x, -ARENA + 1.5, Math.max(ARENA - 1.5, p.x - 1)); p.z = THREE.MathUtils.clamp(p.z, -ARENA + 1.5, ARENA - 1.5); }
      const sp = Math.hypot(c.v.x, c.v.z);
      if (sp > 4) {                                    // still dangerous
        chunkDir.set(c.v.x / sp, 0, c.v.z / sp);
        for (const m of GAME.swarm) {
          if (m.dead || c.hit.has(m) || Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > c.r + m.r + 0.2 || p.y > GAME.critterTop(m) + c.r) continue;
          c.hit.add(m);
          if (m.K.heavy) { GAME.hitCritter(m, 2, chunkDir, 40); c.v.x *= 0.5; c.v.z *= 0.5; }        // big ones just get shoved
          else GAME.hitCritter(m, 99, chunkDir, 6);
          GAME.SFX.play('hit_flesh', p, { vol: 0.7 });
        }
        for (const e of GAME.enemies) {
          if (e.dead || e.carried || c.hit.has(e) || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > c.r + e.r || p.y > e.s + c.r) continue;
          c.hit.add(e);
          GAME.hitEnemy(e, chunkDir, 1, e.elite ? 12 : 18); e.stun = Math.max(e.stun, 0.5);
          c.v.x *= 0.45; c.v.z *= 0.45; GAME.SFX.play('hit_flesh', p, { vol: 0.7 });
          GAME.spawnParticles(GAME.tmp.copy(p), 0xb4b8c2, 4, 6);
        }
        for (const o of GAME.obstacles) {                   // chunks also knock through crates and chain into other pillars
          if (!GAME.active(o) || o.wall || o.boss) continue;
          const q = o.mesh.position;
          if (Math.abs(p.x - q.x) > o.hx + c.r * 0.6 || Math.abs(p.z - q.z) > o.hz + c.r * 0.6 || p.y > o.h + c.r) continue;
          if (o.crate) GAME.damageCrate(o, 99);
          else if ((o.pillar || o.rock) && sp > 16 && c.r > 0.8) smashPillar(o, c.v);
          else { c.v.x *= -0.3; c.v.z *= -0.3; }
        }
      }
      if (c.life < 1) c.m.scale.setScalar(c.r * Math.max(0.01, c.life));
      if (c.life <= 0) { GAME.scene.remove(c.m); chunks.splice(i, 1); }
    }
  }

  return { PILLAR_RAM, chunks, smashPillar, updateChunks };
}
