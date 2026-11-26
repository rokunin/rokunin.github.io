// ---------- lights: low warm sun, cool sky fill, blue rim ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createLights(GAME) {
  const SUN_OFFSET = new THREE.Vector3(-36, 25, 15);
  GAME.scene.add(new THREE.HemisphereLight(0xa6b0e6, 0x33262a, 0.17 * GAME.LIGHT));
  const sun = new THREE.DirectionalLight(0xffc091, 1.35 * GAME.LIGHT);
  sun.castShadow = true;
  sun.shadow.mapSize.set(GAME.COARSE ? 1024 : 2048, GAME.COARSE ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 140 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  GAME.scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x7088ff, 0.09 * GAME.LIGHT);
  rim.position.set(30, 20, -28); GAME.scene.add(rim);

  // image-based lighting: a small sunset sky rendered once into a PMREM so paint, glass and puddles have something to reflect.
  // A material that wants more or less of it than 1 names ENV as its envMap: since r163 envMapIntensity scales only the material's own envMap
  GS.ENV = null;
  {
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 48, 24);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const sd = new THREE.Vector3(-1, 0, -0.75).normalize(), v = new THREE.Vector3(), flat = new THREE.Vector3();   // the iso camera mirrors toward (-1, +y, -1)
    const zen = [0.045, 0.055, 0.12], gnd = [0.02, 0.018, 0.026];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const toward = Math.pow(Math.max(0, flat.set(v.x, 0, v.z).normalize().dot(sd)), 1.5);
      const hor = [0.2 + 0.95 * toward, 0.12 + 0.3 * toward, 0.2 - 0.05 * toward];
      let c;
      if (v.y >= 0) { const k = Math.pow(v.y, 0.45 + 1.3 * toward); c = hor.map((h, j) => h + (zen[j] - h) * k); }
      else { const k = Math.min(1, -v.y * 4); c = hor.map((h, j) => h * 0.4 + (gnd[j] - h * 0.4) * k); }
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    envScene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const disc = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial());
    disc.material.color.setRGB(16, 8, 3); disc.position.copy(SUN_OFFSET).normalize().multiplyScalar(40); envScene.add(disc);
    const pmrem = new THREE.PMREMGenerator(GAME.renderer);
    GAME.scene.environment = GS.ENV = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();
  }

  return { SUN_OFFSET, sun };
}
