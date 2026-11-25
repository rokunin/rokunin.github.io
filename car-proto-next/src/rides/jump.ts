// ---------- jump ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createJump(GAME) {
  const JUMP_V = 15, CAR_G = 32;                    // ~0.95 с в воздухе, высота ~3.5 — перелетает ящики и злюк
  function jump() {
    if (GS.myTow && GAME.car.alive && GAME.car.burrow === 'up') { GAME.throwBomb(); return; }      // with the bomb aboard the jump throws it
    if (!GAME.car.alive || GAME.car.burrow !== 'up') return;
    if (!GAME.car.airborne) {
      if (!GAME.abilities.jump) return;
      GAME.car.vy = JUMP_V; GAME.car.airborne = true; GAME.car.usedDouble = false; GAME.car.airJumps = 0; GAME.SFX.play('jump', GAME.car.pos); GAME.crewSay('jump', 0.5);
      if (GS.ride === 'spider' && GAME.SPD.n.y < 0.5) { GAME.car.vel.addScaledVector(GAME.SPD.n, 10); GAME.car.vy *= 0.6; }      // kick off the wall
      GAME.spawnParticles(GAME.tmp.copy(GAME.car.pos).setY(0.2), 0x8a8a78, 8, 5);
    } else if (GAME.abilities.doubleJump && !GAME.car.usedDouble) {   // второй толчок прямо в воздухе (the angel's; an upgrade adds a third)
      GAME.car.vy = JUMP_V * 0.95; GAME.car.airJumps = (GAME.car.airJumps || 0) + 1; if (GAME.car.airJumps >= 1 + (GAME.abLv.doubleJump >= 1 ? 1 : 0)) GAME.car.usedDouble = true; GAME.SFX.play('jump2', GAME.car.pos);
      if (GAME.abLv.doubleJump >= 2) GAME.ringBlast(GAME.car.pos.x, GAME.car.pos.z, 4.5, 3, 12, 0xc9a8ff, false);
      GAME.spawnParticles(GAME.tmp.copy(GAME.car.pos).setY(GAME.car.y + 0.3), 0xc9a8ff, 12, 6);
      GS.shake = Math.max(GS.shake, 0.15);
    }
  }
  function updateJump(dt) {
    if (!GAME.car.airborne) return;
    GAME.car.vy -= CAR_G * dt;
    GAME.car.y += GAME.car.vy * dt;
    if (GAME.car.y > (GAME.car.ground || 0)) return;
    // приземление
    const impact = -GAME.car.vy;
    GAME.car.y = GAME.car.ground || 0; GAME.car.vy = 0; GAME.car.airborne = false;
    GS.shake = Math.max(GS.shake, 0.25 + impact * 0.02);
    GAME.SFX.play('land', GAME.car.pos, { vol: Math.min(1, 0.4 + impact / 25) });
    GAME.spawnParticles(GAME.tmp.copy(GAME.car.pos).setY(0.2), 0x8a8a78, 14, 7); GAME.burst(GAME.tmp.setY(0.4), 0x9a8f7c, 9, 1.5, 5, 0.3);
    const popped = GAME.car.popped; GAME.car.popped = false;
    GAME.cartKick(3.5);
    if (!popped) for (const e of GAME.enemies) {          // приземлились на злюку — придавили
      if (e.dead || e.carried) continue;
      const dx = e.pos.x - GAME.car.pos.x, dz = e.pos.z - GAME.car.pos.z, d = Math.hypot(dx, dz) || 1e-4;
      if (d < GAME.car.radius + e.r * 0.8) {
        GAME.hitEnemy(e, GAME.tmp.set(dx / d, 0, dz / d), 2, 12); GAME.SFX.play('hit_flesh', e.pos);
        e.stun = 0.8;
        GAME.spawnParticles(GAME.tmp.copy(e.pos).setY(1), 0xc8323c, 6, 7);
      }
    }
    if (!popped) for (const m of GAME.swarm) {            // flat critters get flattened
      if (m.dead || m.K.fly) continue;
      const dx = m.pos.x - GAME.car.pos.x, dz = m.pos.z - GAME.car.pos.z, d = Math.hypot(dx, dz) || 1e-4;
      if (d < GAME.car.radius + m.r + 0.8) GAME.hitCritter(m, m.K.heavy ? 3 : 99, GAME.tmp.set(dx / d, 0, dz / d), 10);
    }
    if (!popped && GAME.abLv.jump >= 1 && impact > 8) GAME.landPower(GAME.abLv.jump);      // the levelled jump: every ride lands in its own way
    for (const o of GAME.obstacles) {                     // и на ящик — в щепки
      if (!o.crate || !GAME.active(o)) continue;
      const p = o.mesh.position;
      const cx = THREE.MathUtils.clamp(GAME.car.pos.x, p.x - o.hx, p.x + o.hx);
      const cz = THREE.MathUtils.clamp(GAME.car.pos.z, p.z - o.hz, p.z + o.hz);
      if (Math.hypot(GAME.car.pos.x - cx, GAME.car.pos.z - cz) < GAME.car.radius) GAME.damageCrate(o, 99);
    }
  }


  return { JUMP_V, jump, updateJump };
}
