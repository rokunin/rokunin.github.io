// Bakes a recipe (recipes.ts) once on the GPU into three textures: albedo (sRGB), roughness + extra, and a normal map
// from the height by finite differences. The textures tile; tile them through the geometry's UVs (uv.ts), not .repeat.
import { THREE } from '../three.js';
import { BAKE_VS, GLSL_LIB, GLSL_MAIN, RECIPES } from './recipes.ts';

export function createBaker({ renderer, maxAniso }) {
  const bakeScene = new THREE.Scene(), bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); bakeQuad.frustumCulled = false; bakeScene.add(bakeQuad);
  function bakeTextures(name, size, normalStrength) {
    const out = {}, t0 = performance.now();
    [['map', 0], ['rough', 1], ['normal', 2]].forEach(([key, ch]) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: BAKE_VS, fragmentShader: `#define CH ${ch}\n` + GLSL_LIB + RECIPES[name] + GLSL_MAIN,
        uniforms: { uTexel: { value: 1 / size }, uNS: { value: normalStrength } }, depthTest: false, depthWrite: false,
      });
      bakeQuad.material = mat;
      const rt = new THREE.WebGLRenderTarget(size, size, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false, stencilBuffer: false });
      rt.texture.anisotropy = maxAniso;
      if (ch === 0) rt.texture.colorSpace = THREE.SRGBColorSpace;
      renderer.setRenderTarget(rt); renderer.render(bakeScene, bakeCam); renderer.setRenderTarget(null);
      mat.dispose();
      out[key] = rt.texture;
    });
    bakeTextures.log = (bakeTextures.log || '') + `${name} ${size}px ${Math.round(performance.now() - t0)}ms; `;
    return out;
  }
  bakeTextures.log = '';      // what was baked and how long it took (the harness reads it as bakeLog)
  return bakeTextures;
}
