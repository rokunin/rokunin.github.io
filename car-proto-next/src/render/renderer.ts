// ---------- renderer / scene ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createRenderer(GAME) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const COARSE = matchMedia('(pointer: coarse)').matches;      // phone / tablet
  GS.PR = Math.min(devicePixelRatio, COARSE ? 1.5 : 2);
  renderer.setPixelRatio(GS.PR);
  // Lights as the game was tuned under Three r128: intensities carry the factor π that Three applied itself before r155,
  // and point and spot lights fade as (1 - d / distance) ^ decay, not the physical 1 / d ^ decay (which would need every light retuned).
  const LIGHT = Math.PI;
  { const C = THREE.ShaderChunk, src = C.lights_pars_begin, i = src.indexOf('float getDistanceAttenuation('), j = i < 0 ? -1 : src.indexOf('\n}\n', i);
    if (j > 0) C.lights_pars_begin = src.slice(0, i) + `float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
      if ( cutoffDistance > 0.0 && decayExponent > 0.0 ) return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );
      return 1.0;` + src.slice(j);
    else GAME.logError('light falloff: the shader chunk changed, point lights fade the physical way'); }
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;      // r187 dropped PCFSoftShadowMap and uses this one in its place
  renderer.shadowMap.autoUpdate = false;                // refreshed from frame(): every frame on desktop, every 2nd-3rd on phones
  GS.shadowTick = 0; GS.bloomPass = null; GS.shadowEvery = COARSE ? 2 : 1;
  document.body.appendChild(renderer.domElement);
  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14121c);
  scene.fog = new THREE.Fog(0x241d30, 88, 190);

  return { renderer, COARSE, LIGHT, MAX_ANISO, scene };
}
