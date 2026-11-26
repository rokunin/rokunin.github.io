// ---------- ground ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { scaleUV } from '../textures/uv.ts';
import { wetGround } from '../textures/wet.ts';

export function createGround(GAME) {
  const GROUND_SIZE = GAME.GROUND_TILE * 38;               // even tile count keeps slab seams on the 4-unit grid
  const ground = new THREE.Mesh(
    scaleUV(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), 38),
    wetGround(new THREE.MeshStandardMaterial({ map: GAME.groundTex.map, roughnessMap: GAME.groundTex.rough, normalMap: GAME.groundTex.normal,
      roughness: 1, metalness: 1, envMap: GS.ENV, envMapIntensity: 1.5 }), 0.293)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  GAME.scene.add(ground);


  return {  };
}
