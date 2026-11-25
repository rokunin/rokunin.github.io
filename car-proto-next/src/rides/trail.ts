// ---------- Rainbow Trail (unicorn, passive): biters that step on it lose you; the host runs it for every unicorn it knows -----
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { TRAIL_T } from '../data/index.js';

export function createTrail(GAME) {
  const trails = new Map(); let trailTick = 0;
  const trailGeo = new THREE.CircleGeometry(0.85, 12); trailGeo.rotateX(-Math.PI / 2);
  function trailFor(key, pos, moving, lv, dt) {
    let T = trails.get(key); if (!T) { T = { pts: [], acc: 0, hue: 0 }; trails.set(key, T); }
    T.acc += dt;
    if (lv > 0 && moving && T.acc > 0.09) { T.acc = 0; T.hue = (T.hue + 0.07) % 1;
      const m = new THREE.Mesh(trailGeo, GAME.glow(new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(T.hue, 0.9, 0.62, THREE.SRGBColorSpace), transparent: true, opacity: 0.55, depthWrite: false }), 1.4));
      m.position.set(pos.x, 0.05, pos.z); GAME.scene.add(m); T.pts.push({ x: pos.x, z: pos.z, t: 0, T: TRAIL_T[lv - 1], m, slow: lv >= 3 });
    }
    for (let i = T.pts.length - 1; i >= 0; i--) { const q = T.pts[i]; q.t += dt; q.m.material.opacity = 0.55 * Math.min(1, (q.T - q.t) / 0.6);
      if (q.t >= q.T) { GAME.scene.remove(q.m); q.m.material.dispose(); T.pts.splice(i, 1); } }
  }
  function updateTrails(dt) {
    trailFor('me', GAME.car.pos, GS.ride === 'unicorn' && GAME.car.alive && Math.abs(GAME.car.speed) > 3, GS.ride === 'unicorn' && GAME.abilities.trail ? GAME.abLv.trail + 1 : 0, dt);
    for (const R of GAME.NET.remotes.values()) trailFor(R.peer, R.pos, R.up && Math.hypot(R.vel.x, R.vel.z) > 3, R.ride === 'unicorn' ? R.tl || 0 : 0, dt);
    if (GAME.NET.client || (trailTick += dt) < 0.1) return; trailTick = 0;
    for (const T of trails.values()) for (const q of T.pts)
      for (const m of GAME.swarm) { if (m.dead || m.K.fly) continue; if (Math.abs(m.pos.x - q.x) < 1.5 && Math.abs(m.pos.z - q.z) < 1.5) { m.lost = 2; if (q.slow) m.slow = 2; } }
  }
  return { updateTrails, trails };
}
