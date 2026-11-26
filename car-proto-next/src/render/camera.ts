// ---------- isometric camera ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createCamera(GAME) {
  GS.viewSize = GAME.COARSE ? 15 : 18;       // half-height of ortho frustum in world units
  const ISO_OFFSET = new THREE.Vector3(30, 30, 30); // classic 45°/35° iso
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  function resizeCam() {
    const a = innerWidth / innerHeight, v = Math.max(GS.viewSize, 11 / a);   // portrait: never show less than 22 units across
    camera.left = -v * a; camera.right = v * a;
    camera.top = v; camera.bottom = -v;
    camera.updateProjectionMatrix();
  }
  resizeCam();
  const camFocus = new THREE.Vector3();

  return { ISO_OFFSET, camera, resizeCam, camFocus };
}
