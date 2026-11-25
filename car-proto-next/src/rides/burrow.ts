// ---------- burrow ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createBurrow(GAME) {
  const SINK_TIME = 0.35, RISE_TIME = 0.4, BURY_DEPTH = 2.8;
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 1 });
  const mound = new THREE.Group();
  {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dirtMat);
    hill.scale.y = 0.35; mound.add(hill);
    for (let i = 0; i < 7; i++) {                    // комья вокруг
      const a = i / 7 * Math.PI * 2 + GAME.rand(-0.3, 0.3), rr = GAME.rand(1.9, 2.6);
      const clod = new THREE.Mesh(new THREE.BoxGeometry(GAME.rand(0.35, 0.6), GAME.rand(0.25, 0.45), GAME.rand(0.35, 0.6)), dirtMat);
      clod.position.set(Math.cos(a) * rr, 0.15, Math.sin(a) * rr); clod.rotation.y = GAME.rand(0, 3);
      mound.add(clod);
    }
    mound.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  }
  mound.visible = false; GAME.scene.add(mound);
  let dirtT = 0;

  const carSeen = () => GAME.car.alive && GAME.car.depth < 0.5;

  function special() { if (GS.ride === 'spider') toggleBurrow(); else if (GS.ride === 'unicorn') GAME.bombDome(); else if (GS.ride === 'buggy') GAME.throwDecoys(); else if (GS.ride === 'halo') GAME.releaseCubes(); }
  function toggleBurrow() {
    if (!GAME.abilities.burrow || GS.ride !== 'spider' || !GAME.car.alive || GAME.car.burrowCd > 0 || GAME.car.airborne) return;
    if (GAME.car.burrow === 'up' || GAME.car.burrow === 'rising') { GAME.car.burrow = 'down'; GAME.SFX.play('dig_down', GAME.car.pos); GAME.crewSay('burrow', 0.7); }
    else { GAME.car.burrow = 'rising'; GAME.SFX.play('dig_up', GAME.car.pos); }
    GAME.car.burrowCd = 0.25;
    GS.shake = Math.max(GS.shake, 0.3);
    GAME.spawnParticles(GAME.tmp.copy(GAME.car.pos).setY(0.5), 0x6b5a3e, 12, 8);
  }

  function updateBurrow(dt) {
    GAME.car.burrowCd -= dt;
    if (GAME.car.burrow === 'down') {
      GAME.car.depth = Math.min(1, GAME.car.depth + dt / SINK_TIME);
      if (GAME.car.depth >= 1) GAME.car.burrow = 'under';
    } else if (GAME.car.burrow === 'rising') {
      GAME.car.depth = Math.max(0, GAME.car.depth - dt / RISE_TIME);
      if (GAME.car.depth <= 0) { GAME.car.burrow = 'up'; if (GAME.abLv.burrow >= 2) GAME.surfaceBlast(); }
    }
    const moving = GAME.car.burrow === 'down' || GAME.car.burrow === 'rising';
    if (moving) {
      GAME.drillSpin.rotation.z += 40 * dt;               // бур роет
      dirtT -= dt;
      if (dirtT <= 0) { dirtT = 0.03; GAME.spawnParticles(GAME.tmp.copy(GAME.car.pos).setY(0.3), Math.random() < 0.7 ? 0x6b5a3e : 0x4a4f45, 3, 9); }
      GS.shake = Math.max(GS.shake, 0.15);
    }
    GAME.carGroup.position.y = GAME.car.y - GAME.car.depth * BURY_DEPTH;
    GAME.carGroup.visible = GAME.car.alive && GAME.car.depth < 0.97;
    mound.visible = GAME.car.alive && GAME.car.depth > 0.15;
    if (mound.visible) {
      const sc = Math.min(1, GAME.car.depth * 1.3);
      mound.position.set(GAME.car.pos.x, 0, GAME.car.pos.z);
      mound.scale.set(sc, sc * (GAME.car.burrow === 'under' ? 1 + Math.sin(GS.elapsed * 3) * 0.06 : 1), sc); // нора дышит
    }
  }

  return { BURY_DEPTH, mound, carSeen, special, toggleBurrow, updateBurrow };
}
