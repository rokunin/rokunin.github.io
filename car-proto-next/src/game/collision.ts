// ---------- collision helpers ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from './state.ts';

export function createCollision(GAME) {
  const RAM_SPEED = 7;   // скорость сближения, с которой ящик сносится, а не держит
  function resolveCarVsRock(o) {                      // a nest never breaks and never stops the ride: it glances off and slides around it
    const p = o.mesh.position, R = o.r * 0.95 + GAME.car.radius;
    let dx = GAME.car.pos.x - p.x, dz = GAME.car.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d >= R) return;
    if (d < 1e-3) { dx = -Math.sin(GAME.car.heading); dz = -Math.cos(GAME.car.heading); d = 1; }
    const nx = dx / d, nz = dz / d; GAME.car.pos.x += nx * (R - d); GAME.car.pos.z += nz * (R - d);
    const vn = GAME.car.vel.x * nx + GAME.car.vel.z * nz; if (vn >= 0) return;
    const dir = Math.sign(GAME.car.speed || 1), fx = Math.sin(GAME.car.heading) * dir, fz = Math.cos(GAME.car.heading) * dir;      // where the ride is actually going
    const tx = -nz, tz = nx, ft = fx * tx + fz * tz, into = Math.max(0, -(fx * nx + fz * nz));
    if (Math.abs(ft) > 0.08) o.side = Math.sign(ft); else if (!o.side) o.side = Math.random() < 0.5 ? -1 : 1;     // dead centre: pick a side and keep it
    const sx = tx * o.side, sz = tz * o.side;
    GAME.car.vel.x -= nx * vn * 1.15; GAME.car.vel.z -= nz * vn * 1.15;                     // a small bounce off the rock...
    GAME.car.vel.x += sx * -vn * 0.6; GAME.car.vel.z += sz * -vn * 0.6;                     // ...and most of the push turned into sliding along it
    let turn = Math.atan2(sx, sz) - Math.atan2(fx, fz); turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    GAME.car.heading += THREE.MathUtils.clamp(turn, -1, 1) * Math.min(1, 0.05 + into * 0.16);      // the nose swings round the rock
    GAME.car.speed *= 1 - into * 0.22;
    if (-vn > GAME.PILLAR_RAM) { GAME.cartKick(4); GAME.cartSpill(1); GAME.SFX.play('land', GAME.car.pos, { vol: 0.5, rate: 0.8 }); }
    GS.shake = Math.max(GS.shake, Math.min(0.18, -vn * 0.008));
  }
  function resolveCarVsBox(o) {
    if (o.rock) return resolveCarVsRock(o);
    const p = o.mesh.position;
    const cx = THREE.MathUtils.clamp(GAME.car.pos.x, p.x - o.hx, p.x + o.hx);
    const cz = THREE.MathUtils.clamp(GAME.car.pos.z, p.z - o.hz, p.z + o.hz);
    const dx = GAME.car.pos.x - cx, dz = GAME.car.pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= GAME.car.radius * GAME.car.radius) return;
    let nx, nz, d = Math.sqrt(d2);
    if (d > 1e-4) { nx = dx / d; nz = dz / d; }
    else { // centre inside the box — push out along the shallow axis
      const ox = o.hx - Math.abs(GAME.car.pos.x - p.x), oz = o.hz - Math.abs(GAME.car.pos.z - p.z);
      if (ox < oz) { nx = Math.sign(GAME.car.pos.x - p.x) || 1; nz = 0; } else { nx = 0; nz = Math.sign(GAME.car.pos.z - p.z) || 1; }
      d = 0;
    }
    const vn = GAME.car.vel.x * nx + GAME.car.vel.z * nz;
    if (o.pillar && -vn > GAME.PILLAR_RAM) {              // влетели в столб — он разлетается на куски
      GAME.smashPillar(o, GAME.car.vel); GAME.cartKick(4); GAME.cartSpill(1);
      GAME.car.speed *= 0.8; GAME.car.vel.multiplyScalar(0.85);
      return;
    }
    if (o.crate && -vn > RAM_SPEED) {                // влетели в ящик — сносим
      GAME.damageCrate(o, 99);
      const sp = Math.hypot(GAME.car.vel.x, GAME.car.vel.z) || 1;
      for (let i = 0; i < 8; i++) {                  // щепки летят по ходу движения
        GAME.spawnParticles(p, 0xd2873c, 1, 5);
        GAME.particles[GAME.particles.length - 1].v.addScaledVector(GAME.car.vel, 0.6 / sp * 12);
      }
      GAME.car.speed *= 0.85; GAME.car.vel.multiplyScalar(0.9);
      GS.shake = Math.max(GS.shake, 0.3);
      return;
    }
    const push = GAME.car.radius - d;
    GAME.car.pos.x += nx * push; GAME.car.pos.z += nz * push;
    if (vn < 0) {
      if (-vn > 11) { GAME.cartKick(4); GAME.cartSpill(-vn > 19 ? 2 : 1); }
      GAME.car.vel.x -= nx * vn * 1.4; GAME.car.vel.z -= nz * vn * 1.4;
      const fx = Math.sin(GAME.car.heading), fz = Math.cos(GAME.car.heading);
      const into = -(fx * nx + fz * nz);        // how head-on the hit is
      GAME.car.speed *= 1 - Math.max(0, GAME.car.speed >= 0 ? into : -into) * 0.85;
    }
  }

  return { RAM_SPEED, resolveCarVsBox };
}
