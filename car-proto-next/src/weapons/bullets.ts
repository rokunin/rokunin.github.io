// ---------- bullets & particles ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createBullets(GAME) {
  const bullets = [];
  const bulletGeo = new THREE.CylinderGeometry(0.075, 0.075, 2.0, 6); bulletGeo.rotateX(Math.PI / 2);   // tracer along +z
  const bulletMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffc060 }), 3.6);
  const particles = [];
  const partGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);

  const partMats = new Map();
  function spawnParticles(p, color, n, power) {
    let mat = partMats.get(color); if (!mat) partMats.set(color, mat = new THREE.MeshStandardMaterial({ color }));
    if (GAME.COARSE) n = Math.ceil(n * 0.6);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(partGeo, mat);
      m.position.copy(p);
      m.scale.setScalar(GAME.rand(0.5, 1.4));
      GAME.scene.add(m);
      particles.push({ m, v: new THREE.Vector3(GAME.rand(-1, 1), GAME.rand(0.4, 1.4), GAME.rand(-1, 1)).multiplyScalar(power),
                       spin: new THREE.Vector3(GAME.rand(-8, 8), GAME.rand(-8, 8), GAME.rand(-8, 8)), life: GAME.rand(0.6, 1.2) });
    }
  }

  GS.fireCooldown = 0; GS.muzzleTimer = 0;
  return { bullets, bulletGeo, bulletMat, particles, partGeo, spawnParticles };
}
