// CHUBZ: the whole game, as it was in the single index.html up to build 136 (ADR-0003: modules come out of here one by one).
// THREE is the r128 namespace plus the post-processing addons, see three.js next to this file.
import { THREE } from './three.js';
import { GS } from './game/state.ts';
import { createSfx } from './audio/sfx.ts';
import { createMusic } from './audio/music.ts';
import { createBaker } from './textures/bake.ts';
import { scaleUV, worldUV } from './textures/uv.ts';
import { wetGround } from './textures/wet.ts';
import { CrewArt, createCrew } from './ui/crew.ts';
import { p2pRoom } from './net/p2p-room.ts';
import { ARENA, FIRE_RATE, W_STATS, W_ORDER, W_GEAR, SWORD_T, TUNE, UNI, BUG, RIDE_KIT, RIDE_ACTIVE, STOMP, BROOD, SPIKE, STARB, BOMB, TRAIL_T, SW_KINDS, MINI_KINDS, MINI_SEQ, RIG, TNT, PHASES, WAVE_PLANS, BOSS_HP, TENT_SP, TENT_MIN, TENT_MAX, BOSS2, LOOT, SHOP, ULT, WEB_N, WEB_R, WEB_T, HALO_SWORDS, BEAM_PER, BULLET, DRILL_DPS, DRILL_REACH, DATA_HASH } from './data/index.js';

(() => {
  // Test seam: the harness puts its frame clock on window.__hx before the page loads (dev/harness/hx.js). Players never have it.
  const HX = window.__hx || null;
  // Every uncaught error and rejected promise goes to the lobby's diagnostics log (tap the build number), each distinct one once.
  // Errors from before the log exists wait in earlyErrors until the end of the set-up. localStorage reads and writes stay silent: private mode refuses them.
  const earlyErrors = [], seenErrors = new Set();
  function logError(s) {
    s = String(s).slice(0, 300); if (seenErrors.has(s) || seenErrors.size > 30) return; seenErrors.add(s);
    try { netLog('error: ' + s); } catch (e) { earlyErrors.push(s); }
  }
  addEventListener('error', e => logError(`${e.message} (${String(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno})`));
  addEventListener('unhandledrejection', e => { const r = e.reason; logError('promise: ' + ((r && (r.message || r)) || 'rejected')); });

  // ---------- colour pipeline ----------
  // Colours are authored in sRGB (hex, CSS, HSL), lit in linear HDR, then tone-mapped and encoded in the final post pass.
  // Three's ColorManagement (on since r152) turns hex and CSS colours from sRGB into linear; setHSL needs THREE.SRGBColorSpace
  // passed, or it reads the numbers as linear. setRGB and vertex colours are linear, as they always were here.
  const srgbTex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const glow = (mat, k) => { mat.color.multiplyScalar(k); return mat; };   // push an unlit colour into HDR so it blooms

  // ---------- renderer / scene ----------
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
    else logError('light falloff: the shader chunk changed, point lights fade the physical way'); }
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

  // ---------- isometric camera ----------
  GS.viewSize = COARSE ? 15 : 18;       // half-height of ortho frustum in world units
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

  // ---------- lights: low warm sun, cool sky fill, blue rim ----------
  const SUN_OFFSET = new THREE.Vector3(-36, 25, 15);
  scene.add(new THREE.HemisphereLight(0xa6b0e6, 0x33262a, 0.17 * LIGHT));
  const sun = new THREE.DirectionalLight(0xffc091, 1.35 * LIGHT);
  sun.castShadow = true;
  sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 140 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x7088ff, 0.09 * LIGHT);
  rim.position.set(30, 20, -28); scene.add(rim);

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
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = GS.ENV = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();
  }

  // ---------- post-processing: HDR bloom -> filmic grade -> FXAA ----------
  GS.gradePass = null; GS.fxaaPass = null; GS.composer = null;
  if (THREE.EffectComposer && THREE.RenderPass && THREE.ShaderPass && THREE.UnrealBloomPass) {
    const hdr = !!(renderer.capabilities.isWebGL2 && renderer.extensions.get('EXT_color_buffer_float')) ||
                !!renderer.extensions.get('EXT_color_buffer_half_float');      // iOS exposes only the half-float one
    const rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType });
    GS.composer = new THREE.EffectComposer(renderer, rt);
    GS.composer.setPixelRatio(GS.PR); GS.composer.setSize(innerWidth, innerHeight);
    GS.composer.addPass(new THREE.RenderPass(scene, camera));
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.36, 0.55, hdr ? 1.15 : 0.86);
    GS.bloomPass = bloom;
    { const hp = bloom.materialHighPassFilter, at = 'vec4 texel = texture2D( tDiffuse, vUv );';      // clamp what feeds the bloom: one hot pixel must not flare the screen
      if (hp.fragmentShader.includes(at)) { hp.fragmentShader = hp.fragmentShader.replace(at, at + ' texel.rgb = min(max(texel.rgb, vec3(0.0)), vec3(40.0));'); hp.needsUpdate = true; }
      else logError('bloom clamp: the high-pass shader changed, the clamp is not in'); }
    { const ss = bloom.setSize.bind(bloom), k = COARSE ? 0.5 : 0.75; bloom.setSize = (w, h) => ss(Math.round(w * k), Math.round(h * k)); bloom.setSize(innerWidth * GS.PR, innerHeight * GS.PR); }   // blur chain on a smaller buffer
    if (hdr) [bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical]
      .forEach(t => { t.texture.type = THREE.HalfFloatType; });
    GS.composer.addPass(bloom);
    GS.gradePass = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 }, exposure: { value: 2.0 }, hurt: { value: 0 }, lowHp: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time, exposure, hurt, lowHp; varying vec2 vUv;
        vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        void main(){
          vec2 d = vUv - 0.5; float r2 = dot(d, d);
          vec2 ca = d * r2 * 0.006;                                   // slight chromatic fringe toward the corners
          vec3 c = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
          c = aces(c * exposure);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c *= mix(vec3(0.94, 0.98, 1.08), vec3(1.05, 1.0, 0.94), smoothstep(0.0, 0.55, l));   // cool shadows, warm highlights
          c = mix(vec3(l), c, 1.14);                                  // saturation
          c = pow(max(c, 0.0), vec3(1.0 / 2.2));
          c *= 1.0 - 0.5 * smoothstep(0.12, 0.62, r2);                // vignette
          float edge = smoothstep(0.06, 0.45, r2);
          c = mix(c, vec3(0.75, 0.04, 0.04), edge * clamp(hurt * 0.55 + lowHp * (0.22 + 0.12 * sin(time * 6.0)), 0.0, 0.8));
          float n = fract(sin(dot(gl_FragCoord.xy + fract(time) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
          c += (n - 0.5) * 0.022;                                     // film grain
          gl_FragColor = vec4(c, 1.0);
        }` });
    GS.composer.addPass(GS.gradePass);
    if (THREE.FXAAShader) {
      GS.fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
      GS.fxaaPass.uniforms.resolution.value.set(1 / (innerWidth * GS.PR), 1 / (innerHeight * GS.PR));
      GS.composer.addPass(GS.fxaaPass);
    }
  } else {                                                           // post scripts failed to load: plain render, still tone-mapped
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 2.2;
  }

  // ---------- FX: soft sprites, additive flashes, pooled lights (light count never changes -> no shader recompiles) ----------
  const softTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const puffs = [], flashes = [];
  const puffPool = [], flashPool = [];
  function fxSprite(pool, additive) {
    const m = pool.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.visible = true; if (!m.parent) scene.add(m); return m;
  }
  function puff(pos, color, size, life, vx, vy, vz, alpha = 0.45, grow = 1.6) {
    if (puffs.length > (COARSE ? 70 : 160)) return;
    const m = fxSprite(puffPool, false); m.material.color.set(color); m.material.opacity = alpha;
    m.position.copy(pos); m.scale.setScalar(size);
    puffs.push({ m, life, max: life, a: alpha, v: new THREE.Vector3(vx, vy, vz), grow });
  }
  function burst(pos, color, n, size, speed = 3, alpha = 0.4) {       // ring of dust/smoke
    if (COARSE) n = Math.ceil(n * 0.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8);
      puff(pos, color, size * (0.7 + Math.random() * 0.6), 0.6 + Math.random() * 0.5, Math.cos(a) * sp, 0.6 + Math.random() * 1.2, Math.sin(a) * sp, alpha, 1.8);
    }
  }
  const fxLights = (COARSE ? [0] : [0, 1]).map(() => { const L = new THREE.PointLight(0xffffff, 0, 30, 2); L.userData = { life: 0, max: 1, i: 0 }; scene.add(L); return L; });
  let fxNext = 0;
  const muzzleLight = new THREE.PointLight(0xffb060, 0, 20, 2); scene.add(muzzleLight);
  let flashLightCd = 0;
  function flash(pos, color, size, life = 0.22, power = 3, light = true) {
    if (flashes.length > 40) return;
    life *= 1.35;                                          // slower bloom-and-fade instead of a strobe pop
    const m = fxSprite(flashPool, true), c = m.material.color.set(color);
    c.multiplyScalar(0.45 + power * 0.3);
    const mx = Math.max(c.r, c.g, c.b); if (mx > 1) c.multiplyScalar(1 / mx);
    c.lerp(flashTint.set(color), 0.25);                    // keeps the hue: near-white pops were the harsh ones
    m.material.opacity = 0; m.position.copy(pos); m.scale.setScalar(size * 0.35);
    flashes.push({ m, life, max: life, size });
    if (light && flashLightCd <= 0) {
      flashLightCd = 0.25;
      const L = fxLights[fxNext]; fxNext = (fxNext + 1) % fxLights.length;
      L.color.set(color); L.position.copy(pos); L.position.y += 1.5;
      L.userData.life = L.userData.max = life * 1.8; L.userData.i = Math.min(1.3, size * 0.12) * LIGHT;
    }
  }
  const flashTint = new THREE.Color();
  function updateFx(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.life -= dt;
      p.m.position.addScaledVector(p.v, dt); p.v.multiplyScalar(Math.max(0, 1 - 1.8 * dt));
      p.m.scale.multiplyScalar(1 + p.grow * dt);
      p.m.material.opacity = Math.max(0, p.a * p.life / p.max);
      if (p.life <= 0) { p.m.visible = false; puffPool.push(p.m); puffs.splice(i, 1); }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.life -= dt;
      const k = 1 - Math.max(0, f.life / f.max);
      f.m.scale.setScalar(f.size * (0.35 + 0.65 * Math.sqrt(k)));
      f.m.material.opacity = Math.min(1, k * 7) * (1 - k * k) * 0.7;      // short ramp up: no single-frame pop
      if (f.life <= 0) { f.m.visible = false; flashPool.push(f.m); flashes.splice(i, 1); }
    }
    flashLightCd -= dt;
    for (const L of fxLights) {
      L.userData.life -= dt;
      const q = L.userData.life > 0 ? L.userData.life / L.userData.max : 0;
      L.intensity = L.userData.i * q * Math.min(1, (1 - q) * 6);
    }
    muzzleLight.intensity *= Math.max(0, 1 - 14 * dt);
  }


  // ---------- AUDIO: no sound files, every sound is synthesised at startup ----------
  // A bank of recipes renders into AudioBuffers (several random variants each), then plays through
  // buses with voice limits, distance falloff and stereo pan from the camera's point of view.
  const SFX = createSfx({ camera, listenerPos: () => car.pos });      // src/audio/sfx.ts; the car is built later, so it is read when a sound plays

  const MUSIC = createMusic({ sfx: SFX });      // src/audio/music.ts

  // ---------- procedural textures, baked on the GPU ----------
  // Each material is a GLSL recipe surf(uv) -> albedo, roughness, an extra channel and a height.
  // A full-screen pass renders it once into render targets: albedo (sRGB), packed roughness (G) + extra (B),
  // and a tangent-space normal map taken from the height by finite differences. All recipes tile seamlessly.
  const mkCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  const bakeTextures = createBaker({ renderer, maxAniso: MAX_ANISO });      // src/textures/bake.ts
  const GROUND_TILE = 16;
  const groundTex = bakeTextures('ground', COARSE ? 1024 : 2048, COARSE ? 6 : 12);
  const crateTex = bakeTextures('crate', 512, 5);
  const concreteTex = bakeTextures('concrete', 512, 4);
  const blockTex = bakeTextures('blocks', 512, 5);


  // ---------- ground ----------
  const GROUND_SIZE = GROUND_TILE * 38;               // even tile count keeps slab seams on the 4-unit grid
  const ground = new THREE.Mesh(
    scaleUV(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), 38),
    wetGround(new THREE.MeshStandardMaterial({ map: groundTex.map, roughnessMap: groundTex.rough, normalMap: groundTex.normal,
      roughness: 1, metalness: 1, envMap: GS.ENV, envMapIntensity: 1.5 }), 0.293)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);


  // ---------- obstacles ----------
  // solid: pillars (indestructible). crates: destructible targets.
  const obstacles = [];  // {mesh, hx, hz, h, solid, crate, hp, carried}
  const active = o => o.mesh.visible && !o.carried && !o.disabled;

  // ---------- стены (твёрдые) + комната босса за восточной стеной ----------
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc4c0b8, map: blockTex.map, roughnessMap: blockTex.rough, normalMap: blockTex.normal, roughness: 1 });
  const roomWallMat = new THREE.MeshStandardMaterial({ color: 0x8a6aa8, map: blockTex.map, roughnessMap: blockTex.rough, normalMap: blockTex.normal, roughness: 0.8, metalness: 0.2 });
  const ROOM_X1 = ARENA, ROOM_X2 = ARENA + 64, ROOM_HZ = 34, GATE_HZ = 8;
  const BOSS_POS = new THREE.Vector3((ROOM_X1 + ROOM_X2) / 2, 0, 0), LAIR_POS = BOSS_POS.clone();      // BOSS_POS is where the Pyramidon is NOW: it leaves the lair at half health
  const inRoom = (x, z) => x > ROOM_X1 && x < ROOM_X2 && Math.abs(z) < ROOM_HZ;
  const inWorld = (x, z) => (Math.abs(x) <= ARENA && Math.abs(z) <= ARENA) || inRoom(x, z);
  function addWall(x, z, w, d, h = 2.5, mat = wallMat) {
    const m = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, h, d), 4, { x, y: h / 2, z }), mat);
    m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
    const o = { mesh: m, hx: w / 2, hz: d / 2, h, solid: true, crate: false, wall: true };
    obstacles.push(o); return o;
  }
  addWall(0, ARENA, ARENA * 2 + 2, 2); addWall(0, -ARENA, ARENA * 2 + 2, 2); addWall(-ARENA, 0, 2, ARENA * 2 + 2);
  {
    const len = ARENA + 1 - GATE_HZ, c = GATE_HZ + len / 2;  // восточная стена с проёмом под ворота
    addWall(ARENA, c, 2, len); addWall(ARENA, -c, 2, len);
  }
  addWall(BOSS_POS.x, ROOM_HZ, ROOM_X2 - ROOM_X1 + 2, 2, 3.5, roomWallMat);
  addWall(BOSS_POS.x, -ROOM_HZ, ROOM_X2 - ROOM_X1 + 2, 2, 3.5, roomWallMat);
  addWall(ROOM_X2, 0, 2, ROOM_HZ * 2 + 2, 3.5, roomWallMat);
  const runeTex = (() => {                            // summoning circle under the boss, used as an emissive map
    const RW = ROOM_X2 - ROOM_X1, RH = ROOM_HZ * 2, c = mkCanvas(1024), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 1024);
    x.translate(512, 512); x.scale(1024 / RW, 1024 / RH);
    x.strokeStyle = '#ff4fb0'; x.shadowColor = '#ff2a9a'; x.shadowBlur = 14; x.lineCap = 'round';
    const ring = (r, w) => { x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); };
    ring(8.2, 0.28); ring(9, 0.12); ring(16, 0.22); ring(25, 0.3); ring(26, 0.1);
    x.lineWidth = 0.16;
    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, r0 = i % 3 ? 16.6 : 16, r1 = i % 3 ? 17.6 : 19;
      x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); x.stroke(); }
    for (let k = 0; k < 2; k++) {                      // two squares = eight-pointed star
      x.lineWidth = 0.18; x.beginPath();
      for (let i = 0; i <= 4; i++) { const a = k * Math.PI / 4 + i * Math.PI / 2; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 16, Math.sin(a) * 16); }
      x.stroke();
    }
    for (let i = 0; i < 8; i++) {                      // small pyramids on the outer ring
      const a = i / 8 * Math.PI * 2 + Math.PI / 8; x.save(); x.translate(Math.cos(a) * 21, Math.sin(a) * 21); x.rotate(a + Math.PI / 2);
      x.lineWidth = 0.14; x.beginPath(); x.moveTo(-1.3, 1); x.lineTo(1.3, 1); x.lineTo(0.6, -1); x.lineTo(-0.6, -1); x.closePath(); x.stroke(); x.restore();
    }
    return srgbTex(c);
  })();
  const roomFloorMat = wetGround(new THREE.MeshStandardMaterial({ color: 0xb49ad8, map: groundTex.map,
    roughnessMap: groundTex.rough, normalMap: groundTex.normal, roughness: 0.8, metalness: 1, envMap: GS.ENV, envMapIntensity: 1.5 }), 0.293);
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  GS.runeLevel = 0.7;
  {
    const floor = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(ROOM_X2 - ROOM_X1, ROOM_HZ * 2), 4, 4.25), roomFloorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(BOSS_POS.x, 0.012, 0); floor.receiveShadow = true; scene.add(floor);
    const runes = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_X2 - ROOM_X1, ROOM_HZ * 2), runeMat);
    runes.rotation.x = -Math.PI / 2; runes.position.set(BOSS_POS.x, 0.035, 0); scene.add(runes);
    const roomLight = new THREE.PointLight(0xd040a0, 0.85 * LIGHT, 70, 1.5); roomLight.position.set(BOSS_POS.x, 12, 0); scene.add(roomLight);
  }
  // buttress posts with pyramid caps along every wall (instanced)
  {
    const mk = (list, h, mat) => {
      const posts = new THREE.InstancedMesh(worldUV(new THREE.BoxGeometry(2.3, h, 1.3), 4, { x: 0, y: h / 2, z: 0 }), mat, list.length);
      const capG = new THREE.ConeGeometry(1.25, 0.9, 4); capG.rotateY(Math.PI / 4); capG.scale(1.3, 1, 0.74);
      const caps = new THREE.InstancedMesh(capG, mat, list.length), dummy = new THREE.Object3D();
      list.forEach(([x, z, rot], i) => {
        dummy.position.set(x, h / 2, z); dummy.rotation.set(0, rot, 0); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix);
        dummy.position.y = h + 0.45; dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
      });
      posts.castShadow = caps.castShadow = posts.receiveShadow = true; scene.add(posts, caps);
    };
    const arena = [], room = [];
    for (let t = -ARENA; t <= ARENA; t += 12) {
      arena.push([-ARENA, t, 0], [t, ARENA, Math.PI / 2], [t, -ARENA, Math.PI / 2]);
      if (Math.abs(t) > GATE_HZ + 6) arena.push([ARENA, t, 0]);
    }
    for (let x = ROOM_X1 + 8; x <= ROOM_X2; x += 8) room.push([x, ROOM_HZ, Math.PI / 2], [x, -ROOM_HZ, Math.PI / 2]);
    for (let z = -ROOM_HZ + 8.5; z < ROOM_HZ; z += 8.5) room.push([ROOM_X2, z, 0]);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xa8a6a2, map: blockTex.map, roughnessMap: blockTex.rough, normalMap: blockTex.normal, roughness: 1, flatShading: true });
    mk(arena, 3.4, postMat); mk(room, 4.5, new THREE.MeshStandardMaterial({ color: 0x7a5a98, map: blockTex.map, roughnessMap: blockTex.rough, normalMap: blockTex.normal, roughness: 0.7, metalness: 0.3, flatShading: true }));
  }
  // backdrop: faceted boulders outside the walls and pebbles inside (visual only)
  {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5e5862, roughness: 0.95, flatShading: true });
    const N = 170, rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, N), dummy = new THREE.Object3D();
    let i = 0, guard = 0;
    while (i < N && guard++ < 4000) {
      const x = (Math.random() * 2 - 1) * (ARENA + 46), z = (Math.random() * 2 - 1) * (ARENA + 46);
      if (Math.abs(x) < ARENA + 5 && Math.abs(z) < ARENA + 5) continue;                       // not in the arena
      if (x > ARENA - 6 && Math.abs(z) < ROOM_HZ + 7) continue;                               // not in or around the boss room
      const sc = 2 + Math.random() * 5;
      dummy.position.set(x, sc * 0.25, z); dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      dummy.scale.set(sc * (0.8 + Math.random() * 0.6), sc * (0.6 + Math.random() * 0.9), sc * (0.8 + Math.random() * 0.6));
      dummy.updateMatrix(); rocks.setMatrixAt(i++, dummy.matrix);
    }
    rocks.count = i; rocks.castShadow = rocks.receiveShadow = true; scene.add(rocks);
    const P = 600, pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8c8580, roughness: 0.95, flatShading: true }), P);
    for (let k = 0; k < P; k++) {
      const sc = 0.12 + Math.random() * 0.2;
      dummy.position.set((Math.random() * 2 - 1) * (ARENA - 3), sc * 0.25, (Math.random() * 2 - 1) * (ARENA - 3));
      dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); dummy.scale.set(sc * 1.3, sc * 0.7, sc);
      dummy.updateMatrix(); pebbles.setMatrixAt(k, dummy.matrix);
    }
    pebbles.receiveShadow = true; scene.add(pebbles);
  }
  // ворота: столбы, перемычка с надписью, луч, опускающаяся дверь
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x2a2333, roughness: 0.45, metalness: 0.6 });
  const gateGlow = glow(new THREE.MeshBasicMaterial({ color: 0xff40b0 }), 5);
  [-1, 1].forEach(sd => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(2.6, 7, 2.4), gateMat);
    post.position.set(ARENA, 3.5, sd * (GATE_HZ + 1.2)); post.castShadow = true; scene.add(post);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.7, 5.5, 0.3), gateGlow);
    strip.position.set(ARENA, 3.2, sd * (GATE_HZ + 0.05)); scene.add(strip);
  });
  {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, GATE_HZ * 2 + 4.8), gateMat);
    lintel.position.set(ARENA, 7.6, 0); lintel.castShadow = true; scene.add(lintel);
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = '#1b1422'; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#ff5ab0'; x.font = '900 86px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('BOSS', 256, 68);
    const signMat = glow(new THREE.MeshBasicMaterial({ map: srgbTex(c) }), 3.5);
    [-1, 1].forEach(sd => {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.4), signMat);
      sign.position.set(ARENA + sd * 1.32, 7.6, 0); sign.rotation.y = sd * Math.PI / 2; scene.add(sign);
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 4, 40, 16, 1, true),
      glow(new THREE.MeshBasicMaterial({ color: 0xff5ab0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 0.9));
    beam.position.set(ARENA, 20, 0); scene.add(beam);
  }
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.6, GATE_HZ * 2),
    new THREE.MeshStandardMaterial({ color: 0x3b2a4a, emissive: 0x5a1050, roughness: 0.4, metalness: 0.7 }));
  doorMesh.position.set(ARENA, -2.5, 0); doorMesh.castShadow = true; scene.add(doorMesh);
  const door = { mesh: doorMesh, hx: 0.8, hz: GATE_HZ, h: 4.6, solid: true, crate: false, wall: true, disabled: true, targetY: -2.5 };
  obstacles.push(door);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xb4b8c2, map: concreteTex.map, roughnessMap: concreteTex.rough, normalMap: concreteTex.normal, roughness: 1, flatShading: true });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, map: crateTex.map, roughnessMap: crateTex.rough, normalMap: crateTex.normal, roughness: 1 });
  const crateHitMat = new THREE.MeshStandardMaterial({ color: 0xf2d2b0, map: crateTex.map, normalMap: crateTex.normal, emissive: 0x3a200c, roughness: 0.8 });
  // World generation draws from worldRnd, never from Math.random (ADR-0009): Three.js takes Math.random for every object's id, so a shared stream
  // moved rocks and nests whenever code or the Three version changed the number of objects built. Outside generation worldRnd is Math.random.
  GS.worldRnd = Math.random;
  const rand = (a, b) => a + GS.worldRnd() * (b - a);
  // the map is generated from the UTC date, so everyone who opens the page on the same day gets the same pillars, rocks, crates and altars
  const SEED = (() => { const d = new Date(); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); })();
  const trueRandom = Math.random;
  function seedRandom(s0) { let s = s0 >>> 0; GS.worldRnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function freeSpot(r, minDist = 14) {
    for (let i = 0; i < 80; i++) {
      const x = rand(-ARENA + 6, ARENA - 6), z = rand(-ARENA + 6, ARENA - 6);
      if (Math.hypot(x - car.pos.x, z - car.pos.z) < minDist) continue;
      if (obstacles.some(o => o.mesh.visible && Math.abs(o.mesh.position.x - x) < o.hx + r + 1 && Math.abs(o.mesh.position.z - z) < o.hz + r + 1)) continue;
      return [x, z];
    }
    return [rand(-ARENA + 6, ARENA - 6), rand(-ARENA + 6, ARENA - 6)];
  }

  const rocks = [];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a705e, roughness: 0.95, flatShading: true });
  function addRock(x, z) {                             // flat-topped outcrop: refuge for the chubziks, solid for everyone else
    const r = rand(2.7, 3.6), h = rand(2.2, 2.8), sd = rand(0, 6);
    const geo = new THREE.CylinderGeometry(r * 0.8, r, h, 8, 1), q = geo.attributes.position;
    for (let i = 0; i < q.count; i++) { const a = Math.atan2(q.getZ(i), q.getX(i)), k = 1 + 0.12 * Math.sin(a * 3 + sd) + 0.06 * Math.sin(a * 5 - sd); q.setX(i, q.getX(i) * k); q.setZ(i, q.getZ(i) * k); }
    geo.computeVertexNormals();
    const g = new THREE.Group(); g.position.set(x, h / 2, z); g.add(new THREE.Mesh(geo, rockMat));
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.5, 0.9), 0), rockMat), a = rand(0, 6.283); b.position.set(Math.cos(a) * r * 1.05, -h / 2 + 0.3, Math.sin(a) * r * 1.05); b.rotation.set(rand(0, 6), rand(0, 6), 0); g.add(b); }
    g.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    scene.add(g);
    const o = { mesh: g, hx: r * 0.8, hz: r * 0.8, h, solid: true, crate: false, rock: true, r, top: r * 0.8 };
    obstacles.push(o); rocks.push(o);
  }
  function addPillar(x, z) {                           // broken monolith: plinth, tapered shaft with a sheared top, rubble
    const w = rand(2, 4), d = rand(2, 4), h = rand(3, 7);
    const g = new THREE.Group(); g.position.set(x, h / 2, z);
    const geo = new THREE.BoxGeometry(w * 0.92, h, d * 0.92), q = geo.attributes.position;
    const shear = [rand(-0.9, 0.3), rand(-0.9, 0.3), rand(-0.9, 0.3), rand(-0.9, 0.3)].map(v => v * Math.min(1, h / 5));
    for (let i = 0; i < q.count; i++) if (q.getY(i) > 0) {
      const c = (q.getX(i) > 0 ? 2 : 0) + (q.getZ(i) > 0 ? 1 : 0);
      q.setXYZ(i, q.getX(i) * 0.8, q.getY(i) + shear[c], q.getZ(i) * 0.8);
    }
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(worldUV(geo, 4, { x, y: h / 2, z }), pillarMat));
    const plinth = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, 0.55, d), 4, { x, y: 0.275, z }), pillarMat); plinth.position.y = -h / 2 + 0.275; g.add(plinth);
    const band = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w * 0.9, 0.3, d * 0.9), 4, { x, y: h * 0.62, z }), pillarMat); band.position.y = -h / 2 + h * 0.62; g.add(band);
    for (let i = 0; i < 4; i++) {                      // rubble, no collision
      const r = rand(0.22, 0.5), a = rand(0, Math.PI * 2), dist = Math.max(w, d) * 0.5 + rand(0.5, 1.3);
      const rock = new THREE.Mesh(new THREE.TetrahedronGeometry(r, 0), pillarMat);
      rock.position.set(Math.cos(a) * dist, -h / 2 + r * 0.35, Math.sin(a) * dist); rock.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      g.add(rock);
    }
    g.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    scene.add(g);
    obstacles.push({ mesh: g, hx: w / 2, hz: d / 2, h, solid: true, crate: false, pillar: true });
  }
  function addCrate() {
    const s = rand(1.6, 2.4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    const o = { mesh: m, hx: s / 2, hz: s / 2, h: s, solid: true, crate: true, hp: 3, flash: 0 };
    const [x, z] = freeSpot(s);
    m.position.set(x, s / 2, z); m.rotation.y = 0;
    m.castShadow = m.receiveShadow = true; scene.add(m);
    obstacles.push(o);
    return o;
  }

  const { crew, crewSay, crewKill } = createCrew();      // src/ui/crew.ts (CrewArt too)

  // ---------- car ----------
  const carGroup = new THREE.Group();
  const body = new THREE.Group();     // tilts for roll/pitch
  carGroup.add(body);
  scene.add(carGroup);

  const paint = new THREE.MeshStandardMaterial({ color: 0x3a3532, metalness: 0.55, roughness: 0.55, envMap: GS.ENV, envMapIntensity: 1.1, flatShading: true });   // scorched matte black
  const paint2 = new THREE.MeshStandardMaterial({ color: 0x5e2c14, metalness: 0.45, roughness: 0.78, flatShading: true });                            // rust plates
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e23, roughness: 0.7, metalness: 0.2, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: 0x3a2814, metalness: 0.9, roughness: 0.06, envMap: GS.ENV, envMapIntensity: 2.2, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: 0x7c828c, metalness: 0.9, roughness: 0.38, flatShading: true });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x131417, roughness: 0.95, flatShading: true });

  // low-poly building blocks
  function prism(pts, width) {                         // side profile [[z, y], ...] extruded across x, centred
    const sh = new THREE.Shape(); pts.forEach(([z, y], i) => i ? sh.lineTo(z, y) : sh.moveTo(z, y));
    const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); g.translate(width / 2, 0, 0);
    return g;
  }
  function taperX(geo, y0, y1, k) {                    // pinch the width toward the top
    const q = geo.attributes.position;
    for (let i = 0; i < q.count; i++) q.setX(i, q.getX(i) * (1 + (k - 1) * THREE.MathUtils.clamp((q.getY(i) - y0) / (y1 - y0), 0, 1)));
    geo.computeVertexNormals(); return geo;
  }
  const put = (geo, mat, x = 0, y = 0, z = 0, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // wasteland buggy: scorched hull, rust plates, open cockpit under a roll cage, blower through the hood, side stacks, plow
  put(taperX(prism([[-2.12, 0.62], [-2.18, 1.0], [-2.0, 1.22], [0.9, 1.22], [1.95, 1.02], [2.15, 0.88], [2.1, 0.55], [1.75, 0.45], [-1.8, 0.45]], 2.1), 0.45, 1.22, 0.9), paint);
  put(box(1.5, 0.04, 0.8), paint2, 0, 1.13, 1.46).rotation.x = 0.188;                 // welded hood plate
  put(box(0.8, 0.04, 0.5), metal, -0.4, 1.235, -1.75);                                // bare patch on the tail
  // cockpit tub + armoured windscreen
  for (const x of [-0.98, 0.98]) {
    put(box(0.1, 0.44, 1.95), paint2, x, 1.42, -0.37);
    put(box(0.05, 0.26, 0.7), metal, x * 1.05, 1.42, -0.1);
    for (const z of [-1.1, 0.4]) put(box(0.06, 0.06, 0.06), dark, x * 1.07, 1.56, z);
  }
  put(box(2.0, 0.44, 0.1), paint2, 0, 1.42, -1.32);
  put(box(1.86, 0.52, 0.06), glass, 0, 1.5, 0.8).rotation.x = -0.35;
  for (const y of [1.36, 1.5, 1.64]) put(box(1.92, 0.07, 0.1), dark, 0, y, 0.8 - (y - 1.5) * 0.36);
  // roll cage with a light bar
  for (const x of [-0.92, 0.92]) {
    for (const z of [0.6, -1.44]) put(box(0.11, 0.86, 0.11), dark, x, 1.63, z);
    put(box(0.11, 0.11, 2.15), dark, x, 2.04, -0.42);
    put(box(0.09, 0.09, 1.1), dark, x, 1.72, -0.95).rotation.x = 0.62;                // rear brace
  }
  for (const z of [0.6, -1.44]) put(box(1.95, 0.11, 0.11), dark, 0, 2.04, z);
  // crew: Roxy at the wheel, Vee on the gun (she turns with the turret)
  const skinR = new THREE.MeshStandardMaterial({ color: 0xd9966a, roughness: 0.7, flatShading: true });
  const skinV = new THREE.MeshStandardMaterial({ color: 0xf0c4a2, roughness: 0.7, flatShading: true });
  const hairR = new THREE.MeshStandardMaterial({ color: 0xe8402c, roughness: 0.6, flatShading: true });
  const hairV = new THREE.MeshStandardMaterial({ color: 0x2fd0c0, roughness: 0.6, flatShading: true });
  const topV = new THREE.MeshStandardMaterial({ color: 0x6f7a45, roughness: 0.8, flatShading: true });
  const gogMat = glow(new THREE.MeshBasicMaterial({ color: 0xffb040 }), 1.4);
  const driver = new THREE.Group(); driver.position.set(0.44, 1.22, 0.02); body.add(driver);
  put(box(0.44, 0.5, 0.26), dark, 0, 0.3, 0, driver);                                 // leather jacket
  put(box(0.3, 0.3, 0.3), skinR, 0, 0.72, 0.02, driver);
  put(box(0.38, 0.2, 0.36), hairR, 0, 0.9, -0.03, driver);
  put(box(0.4, 0.46, 0.14), hairR, 0, 0.62, -0.2, driver);                            // mane down the back
  put(box(0.32, 0.08, 0.06), gogMat, 0, 0.84, 0.18, driver);
  for (const x of [-0.2, 0.2]) put(box(0.1, 0.1, 0.46), dark, x, 0.36, 0.26, driver).rotation.x = 0.25;
  const wheelRim = put(new THREE.TorusGeometry(0.17, 0.035, 4, 8), metal, 0.44, 1.52, 0.52); wheelRim.rotation.x = -0.5;
  // gun on a post in the back of the cage
  put(new THREE.CylinderGeometry(0.09, 0.13, 0.84, 6), metal, 0, 1.62, -0.5);
  const turret = new THREE.Group();          // крутится за мышкой
  turret.position.set(0, 2.04, -0.5); body.add(turret);
  put(new THREE.CylinderGeometry(0.42, 0.52, 0.2, 8), metal, 0, 0, 0, turret);
  put(prism([[-0.48, 0.08], [-0.4, 0.44], [0.12, 0.44], [0.52, 0.26], [0.52, 0.08]], 0.58), paint, 0, 0, 0, turret);
  put(box(0.5, 0.5, 0.06), paint2, 0, 0.36, 0.5, turret).rotation.x = -0.25;          // gun shield
  put(box(0.2, 0.26, 0.42), metal, 0.4, 0.24, -0.08, turret);                       // ammo box
  const barrel = put(new THREE.CylinderGeometry(0.075, 0.1, 1.5, 6), dark, 0, 0.2, 1.2, turret); barrel.rotation.x = Math.PI / 2;
  put(box(0.22, 0.16, 0.26), dark, 0, 0.2, 1.93, turret);                           // muzzle brake
  put(box(0.42, 0.62, 0.26), topV, 0, -0.34, -0.66, turret);                          // Vee
  put(box(0.3, 0.3, 0.3), skinV, 0, 0.14, -0.64, turret);
  put(box(0.38, 0.18, 0.36), hairV, 0, 0.31, -0.66, turret);
  put(box(0.36, 0.3, 0.1), hairV, 0, 0.12, -0.83, turret);
  for (const x of [-0.2, 0.2]) {
    put(box(0.17, 0.17, 0.17), hairV, x, 0.46, -0.72, turret);                        // buns
    put(box(0.1, 0.1, 0.5), skinV, x, -0.1, -0.42, turret).rotation.x = -0.2;
  }
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
    glow(new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), 2.6));
  muzzle.position.set(0, 0.2, 2.1); muzzle.visible = false; turret.add(muzzle);
  // fenders: rear ones sit higher over the big tyres
  const archGeo = prism([[-0.8, 0.48], [-0.68, 1.0], [-0.34, 1.24], [0.34, 1.24], [0.68, 1.0], [0.8, 0.48],
                         [0.62, 0.48], [0.54, 0.9], [0.27, 1.08], [-0.27, 1.08], [-0.54, 0.9], [-0.62, 0.48]], 0.5);
  for (const x of [-1.14, 1.14]) { put(archGeo, paint2, x, 0, 1.35); put(archGeo, paint2, x * 1.04, 0.1, -1.35).scale.set(1, 1.16, 1.2); }
  // blower through the hood
  put(box(0.62, 0.36, 0.86), metal, 0, 1.34, 1.3);
  put(prism([[-0.48, 0], [-0.4, 0.26], [0.5, 0.32], [0.54, 0]], 0.72), dark, 0, 1.52, 1.3);
  put(box(0.56, 0.2, 0.04), glow(new THREE.MeshBasicMaterial({ color: 0xff5a1a }), 1.6), 0, 1.66, 1.83);
  put(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8), dark, 0, 1.3, 1.78).rotation.x = Math.PI / 2;
  // side stacks
  for (const x of [-1, 1]) for (let i = 0; i < 3; i++) {
    const p = put(new THREE.CylinderGeometry(0.075, 0.075, 0.95, 6), metal, x * 1.1, 1.62, 0.5 - i * 0.2);
    p.rotation.x = -0.42; p.rotation.z = -x * 0.14;
  }
  // lights
  const lampMat = glow(new THREE.MeshBasicMaterial({ color: 0xfff0c0 }), 2.6);
  const tailMat = glow(new THREE.MeshBasicMaterial({ color: 0xff2a1a }), 4);
  put(box(1.0, 0.2, 0.06), dark, 0, 0.76, 2.13);                                    // grille
  for (const x of [-0.6, -0.2, 0.2, 0.6]) { put(box(0.3, 0.24, 0.14), dark, x, 2.2, 0.6); put(box(0.22, 0.16, 0.04), lampMat, x, 2.2, 0.68); }
  for (const x of [-0.68, 0.68]) {
    put(box(0.38, 0.16, 0.08), lampMat, x, 0.78, 2.13);
    put(box(0.5, 0.14, 0.08), tailMat, x, 0.9, -2.17);
    put(box(0.08, 0.16, 1.5), dark, x * 1.56, 0.52, 0);                             // side skirts
  }
  put(box(2.2, 0.22, 0.24), dark, 0, 0.56, -2.2);                                   // rear bumper
  // tail load: fuel drums, a spare, a rag on a pole
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x9a2f22, metalness: 0.4, roughness: 0.7, flatShading: true });
  for (const x of [-0.42, 0.42]) { put(new THREE.CylinderGeometry(0.27, 0.27, 0.6, 8), drumMat, x, 1.52, -1.78); put(new THREE.CylinderGeometry(0.285, 0.285, 0.07, 8), dark, x, 1.56, -1.78); }
  put(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), tyreMat, 0, 0.98, -2.3).rotation.x = Math.PI / 2;
  put(new THREE.CylinderGeometry(0.02, 0.03, 1.5, 4), metal, -0.92, 2.8, -1.44);
  put(box(0.03, 0.34, 0.62), new THREE.MeshStandardMaterial({ color: 0xc2264a, roughness: 0.9, flatShading: true }), -0.92, 3.3, -1.78);
  // plow with spikes (swapped out for the drill once it is unlocked)
  const bullbar = new THREE.Group(); body.add(bullbar);
  put(box(2.3, 0.2, 0.26), dark, 0, 0.5, 2.22, bullbar);
  for (const sd of [-1, 1]) put(box(1.22, 0.62, 0.08), metal, sd * 0.57, 0.74, 2.44, bullbar).rotation.y = sd * 0.36;
  for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) put(new THREE.ConeGeometry(0.09, 0.42, 4), paint2, x, 0.8, 2.84 - Math.abs(x) * 0.38, bullbar).rotation.x = Math.PI / 2;
  // headlight beam: lives in the scene (not under the car) so hiding the car never changes the light count
  const headLight = new THREE.SpotLight(0xffe2b0, 0, 34, 0.55, 0.7, 1.2);
  scene.add(headLight, headLight.target);
  function updateHeadlight() {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    headLight.position.set(car.pos.x + fx * 2.2, 1.4 + car.y, car.pos.z + fz * 2.2);
    headLight.target.position.set(car.pos.x + fx * 16, car.y, car.pos.z + fz * 16);
    headLight.intensity = car.alive && car.depth < 0.5 ? 1.5 * LIGHT : 0;
  }
  // ---- бур ----
  const drill = new THREE.Group();               // крепление на морде
  drill.position.set(0, 0.85, 2.05);
  body.add(drill);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 0.38, 8), metal);
  collar.rotation.x = Math.PI / 2; collar.position.z = 0.1; drill.add(collar);
  [-0.85, 0.85].forEach(x => {                   // распорки к раме
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.7), metal);
    strut.position.set(x * 0.8, 0, 0); strut.rotation.y = -x * 0.5; drill.add(strut);
  });
  const drillSpin = new THREE.Group();           // крутится вокруг своей оси (z)
  drillSpin.position.z = 0.25; drill.add(drillSpin);
  const DRILL_LEN = 2.3, DRILL_R = 0.6;
  const coneGeo = new THREE.ConeGeometry(DRILL_R, DRILL_LEN, 7);
  coneGeo.translate(0, DRILL_LEN / 2, 0); coneGeo.rotateX(Math.PI / 2);
  const drillMat = new THREE.MeshStandardMaterial({ color: 0xc4c9d2, emissive: 0x000000, metalness: 1, roughness: 0.25, envMap: GS.ENV, envMapIntensity: 1.6, flatShading: true });
  drillSpin.add(new THREE.Mesh(coneGeo, drillMat));
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0xf0b428, metalness: 0.7, roughness: 0.35 });
  for (let strand = 0; strand < 2; strand++) {   // две спирали
    for (let i = 0; i < 11; i++) {
      const t = i / 11, rr = DRILL_R * (1 - t) + 0.04;
      const a = strand * Math.PI + t * Math.PI * 4;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.32), ridgeMat);
      seg.position.set(Math.cos(a) * rr, Math.sin(a) * rr, t * DRILL_LEN);
      seg.rotation.z = a;
      drillSpin.add(seg);
    }
  }
  // ---- хваталка (правый бок = локальный -X) ----
  const arm = new THREE.Group();
  // мачта на правом переднем углу — рука на ней крутится сама по себе за курсором
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.95, 6), metal);
  mast.position.set(-0.78, 1.6, 1.4); body.add(mast);
  arm.position.set(-0.78, 2.05, 1.4); arm.rotation.y = Math.PI / 2; body.add(arm);
  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.6), metal); arm.add(shoulder);
  const armGeo = new THREE.BoxGeometry(1, 0.2, 0.22); armGeo.translate(-0.5, 0, 0);
  const armSeg = new THREE.Mesh(armGeo, ridgeMat); arm.add(armSeg);
  const claw = new THREE.Group(); arm.add(claw);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.6), metal);
  palm.position.x = -0.1; claw.add(palm);
  const fingers = [];
  [-1, 1].forEach(side => {
    const piv = new THREE.Group(); piv.position.set(-0.2, 0, side * 0.24); claw.add(piv);
    const fg = new THREE.BoxGeometry(0.75, 0.16, 0.12); fg.translate(-0.37, 0, 0);
    piv.add(new THREE.Mesh(fg, dark));
    const tipM = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.3), dark);
    tipM.position.set(-0.72, 0, -side * 0.12); piv.add(tipM);
    fingers.push({ piv, side });
  });
  body.traverse(m => { if (m.isMesh) m.castShadow = true; });

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.44, 10); wheelGeo.rotateZ(Math.PI / 2);     // chunky faceted tyres
  const hubGeo = new THREE.CylinderGeometry(0.22, 0.3, 0.47, 6); hubGeo.rotateZ(Math.PI / 2);
  [[-1.15, 1.35, true], [1.15, 1.35, true], [-1.15, -1.35, false], [1.15, -1.35, false]].forEach(([x, z, front]) => {
    const big = front ? 1 : 1.28;
    const pivot = new THREE.Group(); pivot.position.set(x * (front ? 1 : 1.05), 0.5 * big, z);
    const w = new THREE.Mesh(wheelGeo, tyreMat); w.castShadow = true; w.scale.setScalar(big);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 4), metal); spike.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2; spike.position.x = (x > 0 ? 1 : -1) * 0.36; w.add(spike);
    const hub = new THREE.Mesh(hubGeo, metal); hub.rotation.z = x > 0 ? 0 : Math.PI; w.add(hub);
    w.add(new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.09, 0.4), dark));      // spoke, so the spin reads
    pivot.add(w); carGroup.add(pivot);
    wheels.push({ pivot, mesh: w, front });
  });

  // ---------- rides: the buggy plus three stranger things on the same chassis logic. Models are built the first time they are picked ----------
  const buggyParts = body.children.filter(c => c !== turret && c !== drill && c !== arm && c !== mast && c !== bullbar);
  const buggyTurret = turret.children.filter(c => c !== muzzle);
  const RIDES = { buggy: { turret: [0, 2.04, -0.5] }, spider: { turret: [0, 3.0, 0] }, halo: { turret: [0, 2.0, 0] }, unicorn: { turret: [0, 2.95, -0.75] } };
  const rideG = {};
  GS.ridePhase = 0; GS.ride = 'buggy';
  const hoverShadow = new THREE.Mesh(new THREE.CircleGeometry(1.9, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
  hoverShadow.rotation.x = -Math.PI / 2; hoverShadow.visible = false; carGroup.add(hoverShadow);
  function strut(a, b, w, mat, parent) {               // a box between two points
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, a.distanceTo(b)), mat); m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); m.castShadow = true; parent.add(m); return m;
  }
  function miniEye(r, parent, x, y, z) {               // a little staring eyeball
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.3 })));
    const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 6, 5), new THREE.MeshBasicMaterial({ color: 0x1b1421 })); p.position.set(0, 0, r * 0.62); g.add(p);
    g.lookAt(g.position.clone().multiplyScalar(2)); parent.add(g); return g;
  }
  function buildRide(k) {
    const B = new THREE.Group(), T = new THREE.Group(); body.add(B); turret.add(T);
    const R = rideG[k] = { body: B, tur: T, anim: () => {} };
    const P = (geo, mat, x, y, z, par = B) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    if (k === 'spider') {
      const shell = new THREE.MeshStandardMaterial({ color: 0x2a2630, metalness: 0.7, roughness: 0.4, flatShading: true });
      const trim = glow(new THREE.MeshBasicMaterial({ color: 0x2fb8ae }), 1.1);
      P(new THREE.BoxGeometry(2.3, 0.36, 2.3), shell, 0, 0.95, 0);                         // square slab
      for (const x of [-1, 1]) for (const z of [-1, 1]) P(new THREE.BoxGeometry(0.22, 0.1, 0.22), trim, x * 1.0, 1.16, z * 1.0);
      // eight legs on planted feet: a foot stays where it stands until the body has moved too far, then steps (two alternating groups)
      const legRoot = new THREE.Group(); legRoot.position.y = SPL.bodyH; B.add(legRoot);
      const joint = new THREE.MeshStandardMaterial({ color: 0x8f8a86, metalness: 0.8, roughness: 0.4, flatShading: true });
      const legs = [], RX = [1.75, 2.35, 2.35, 1.85], RZ = [2.0, 0.75, -0.6, -1.85], HZ = [0.9, 0.32, -0.26, -0.84];   // eight legs fanned out like the prototype's, feet well apart
      for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
        const hip = new THREE.Group(); hip.position.set(sd * 1.1, 0, HZ[i]); hip.rotation.order = 'YXZ'; hip.userData.leg = (i % 2 === 0) === (sd < 0) ? 1 : 2; legRoot.add(hip);
        P(new THREE.SphereGeometry(0.13, 6, 5), joint, 0, 0, 0, hip);
        const fem = new THREE.Group(); hip.add(fem); P(new THREE.BoxGeometry(0.17, 0.17, SPL.L1), shell, 0, 0, SPL.L1 / 2, fem);
        const knee = new THREE.Group(); knee.position.z = SPL.L1; fem.add(knee); P(new THREE.SphereGeometry(0.12, 6, 5), joint, 0, 0, 0, knee);
        P(new THREE.BoxGeometry(0.12, 0.12, SPL.L2), shell, 0, 0, SPL.L2 / 2, knee);
        P(new THREE.ConeGeometry(0.07, 0.24, 4), trim, 0, 0, SPL.L2 + 0.06, knee).rotation.x = Math.PI / 2;
        legs.push({ sd, i, hip, fem, knee, rest: new THREE.Vector3(sd * RX[i], -SPL.bodyH, RZ[i]), foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
                    step: false, t: 0, dur: 0.1, grp: (i % 2 === 0) === (sd < 0) ? 0 : 1, init: false });
      }
      const footTarget = (L, out) => {                   // where this leg wants to stand: straight down from its rest spot, else reach inward for an edge
        spUp.set(0, 1, 0).applyQuaternion(carGroup.quaternion);
        spO.copy(L.rest); spO.y += SPL.bodyH + 0.9; legRoot.localToWorld(spO);
        spO.addScaledVector(SPD.vel, 0.04);
        spDn.copy(spUp).negate();
        if (spCast(spO, spDn, SPL.bodyH + 0.9 + 1.3, out)) return;
        legRoot.getWorldPosition(spC); spIn.copy(spC).sub(spO); spIn.addScaledVector(spUp, -spIn.dot(spUp)).normalize();
        spDn.copy(spUp).negate().addScaledVector(spIn, 0.9).normalize();
        if (spCast(spO, spDn, 3.6, out)) return;
        out.copy(spO).addScaledVector(spUp, -(SPL.bodyH + 0.9));
      };
      const legIK = L => {
        spF.copy(L.foot); legRoot.worldToLocal(spF); spF.sub(L.hip.position);
        L.hip.rotation.y = Math.atan2(spF.x, spF.z);
        const h = Math.hypot(spF.x, spF.z), v = spF.y, l1 = SPL.L1, l2 = SPL.L2;
        const d = THREE.MathUtils.clamp(Math.hypot(h, v), 0.3, l1 + l2 - 0.001);
        const a = Math.atan2(v, h), alpha = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
        const inner = Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
        L.fem.rotation.x = -(a + alpha); L.knee.rotation.x = Math.PI - inner;
      };
      R.feet = legs;
      R.pose = () => { carGroup.updateMatrixWorld(true); for (const L of legs) { spA.copy(L.rest); legRoot.localToWorld(spA); L.foot.copy(spA); legIK(L); } };   // standing pose for copies
      const pyr = new THREE.Group(); pyr.position.y = 1.95; B.add(pyr);
      const pg = new THREE.CylinderGeometry(0.5, 1.15, 1.35, 4, 1).toNonIndexed(); pg.rotateY(Math.PI / 4);
      { const q = pg.attributes.position, seen = {};               // knock the corners about so it reads as hand-cut
        for (let i = 0; i < q.count; i++) { const key = q.getX(i).toFixed(2) + q.getY(i).toFixed(2) + q.getZ(i).toFixed(2); const j = seen[key] || (seen[key] = [rand(-0.14, 0.14), rand(-0.1, 0.1), rand(-0.14, 0.14)]); q.setXYZ(i, q.getX(i) + j[0], q.getY(i) + j[1], q.getZ(i) + j[2]); }
        pg.computeVertexNormals(); }
      pyr.add(new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x3a9ab0, transparent: true, opacity: 0.42, roughness: 0.6, metalness: 0, envMap: GS.ENV, envMapIntensity: 0.2, flatShading: true, depthWrite: false, side: THREE.DoubleSide })));
      pyr.add(new THREE.LineSegments(new THREE.EdgesGeometry(pg, 1), glow(new THREE.LineBasicMaterial({ color: 0x9af5ff }), 1.2)));
      const pilots = [-1, 1].map(sd => { const s = new THREE.Sprite(chubMats[0][0]); s.center.set(0.5, 0.05); s.scale.set(0.8, 0.8, 1); s.position.set(sd * 0.3, -0.62, 0); s.renderOrder = -1; pyr.add(s); return s; });
      // the eye: a flat burning oval with a slit pupil, scowling
      const eyeMat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float t; varying vec3 vP;
          void main(){ float a = acos(clamp(vP.z, -1.0, 1.0)), ang = atan(vP.y, vP.x);
            float fl = 0.5 + 0.5 * sin(ang * 9.0 + t * 5.0 + sin(a * 14.0 - t * 8.0) * 2.0);
            vec3 fire = mix(vec3(1.0, 0.75, 0.1), vec3(1.0, 0.12, 0.0), smoothstep(0.15, 1.0, a + fl * 0.25));
            vec3 col = mix(fire * (1.3 + 0.5 * fl), vec3(0.25, 0.02, 0.0), smoothstep(0.9, 1.5, a));
            float slit = smoothstep(0.1, 0.05, abs(vP.x) / max(0.15, 1.0 - vP.y * vP.y * 1.2)) * step(0.0, vP.z) * smoothstep(0.92, 0.7, abs(vP.y));
            col = mix(col, vec3(0.0), slit);
            gl_FragColor = vec4(col * 0.42, 1.0); }` });
      const eyeG = new THREE.Group(); T.add(eyeG);
      const eyeBall = P(new THREE.SphereGeometry(0.62, 20, 14), eyeMat, 0, 0, 0, eyeG); eyeBall.scale.set(1.55, 0.78, 0.7);
      const brow = P(new THREE.BoxGeometry(2.15, 0.09, 0.5), shell, 0, 0.63, 0.3, eyeG); brow.rotation.set(0.5, 0, -0.2);      // one long brow, pressed down hard
      let spdS = 0;
      R.anim = (dt, sp) => {
        spdS += ((car.airborne ? 0 : SPD.vel.length()) - spdS) * Math.min(1, 8 * dt);
        const k = Math.min(1, spdS / 12);
        legRoot.position.y = SPL.bodyH - 0.08 * k + Math.sin(GS.ridePhase * 5) * 0.04 * k;
        carGroup.updateMatrixWorld(true);
        spBoxes.length = 0;                              // climbable boxes near enough for a foot to land on
        for (const o of obstacles) if (climbable(o) && Math.abs(o.mesh.position.x - car.pos.x) < o.hx + 6 && Math.abs(o.mesh.position.z - car.pos.z) < o.hz + 6) spBoxes.push(o);
        const stepping = [false, false]; for (const L of legs) if (L.step) stepping[L.grp] = true;
        const thr = 0.45 + spdS * 0.02, dur = THREE.MathUtils.clamp(0.14 - spdS * 0.004, 0.045, 0.14), tuck = car.airborne || car.depth > 0.3;
        for (const L of legs) {
          if (tuck) {                                    // in the air: legs hang, slightly drawn in
            L.step = false; L.init = false;
            spA.copy(L.rest); spA.y = -0.45; spA.x *= 0.85; legRoot.localToWorld(spA); L.foot.lerp(spA, Math.min(1, 10 * dt));
          } else {
            footTarget(L, spT);
            if (!L.init) { L.from.copy(L.foot.lengthSq() ? L.foot : spT); L.to.copy(spT); L.step = true; L.t = 0; L.dur = 0.1; L.init = true; stepping[L.grp] = true; }
            if (L.step) {
              L.t += dt / L.dur; const t = Math.min(1, L.t), e = t * t * (3 - 2 * t);
              L.foot.lerpVectors(L.from, L.to, e).addScaledVector(SPD.n, Math.sin(Math.PI * t) * (0.32 + 0.012 * spdS));
              if (t >= 1) { L.step = false; L.foot.copy(L.to); if (spdS > 1.5) SFX.play('tick', L.foot, { vol: 0.45 + Math.random() * 0.3, rate: 0.85 + Math.random() * 0.35 }); if (spdS > 6 && Math.random() < 0.3) puff(L.foot, 0xd8d6d0, 0.5, 0.5, rand(-0.5, 0.5), rand(0.3, 0.8), rand(-0.5, 0.5), 0.3); }
            } else {
              const d = L.foot.distanceTo(spT);
              if ((d > thr && !stepping[1 - L.grp]) || d > thr * 2.4) { L.step = true; L.t = 0; L.dur = dur * (0.85 + Math.random() * 0.3); L.from.copy(L.foot); L.to.copy(spT); stepping[L.grp] = true; }
            }
          }
          legIK(L);
        }
        pyr.position.y = 1.95 + Math.sin(GS.elapsed * 2) * 0.08; pyr.rotation.y = Math.sin(GS.elapsed * 0.7) * 0.2;
        pilots.forEach((s, i) => { s.material = chubMats[car.hp < car.maxHp * 0.4 ? 1 : 0][Math.floor(GS.elapsed * 3 + i * 2) % CHUB_FR]; });
        eyeMat.uniforms.t.value = GS.elapsed; eyeG.position.y = Math.sin(GS.elapsed * 2.6) * 0.07;
      };
    } else if (k === 'halo') {
      const gold = new THREE.MeshStandardMaterial({ color: 0xe8d28a, metalness: 0.9, roughness: 0.25, envMap: GS.ENV, envMapIntensity: 1.6, flatShading: true });
      const core = new THREE.Group(); core.position.y = 2.0; B.add(core);
      const t1 = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.2, 6, 20), gold), t2 = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.17, 6, 18), gold); t1.userData.spin = 1; t2.userData.spin = 2;
      t1.castShadow = t2.castShadow = true; core.add(t1, t2);
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; miniEye(0.15, t1, Math.cos(a) * 1.95, Math.sin(a) * 1.95, 0); if (i % 2) miniEye(0.13, t1, Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0.2).rotation.set(0, 0, 0); }
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + 0.3; miniEye(0.13, t2, Math.cos(a) * 1.49, Math.sin(a) * 1.49, 0); }
      const cv = mkCanvas(256), c = cv.getContext('2d');                               // the apprentice: one body, a face for each direction
      c.lineJoin = 'round'; c.strokeStyle = '#1b1421'; c.lineWidth = 6;
      c.beginPath(); c.moveTo(84, 150); c.lineTo(172, 150); c.lineTo(206, 252); c.lineTo(50, 252); c.closePath(); c.fillStyle = '#f4f1e8'; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(128, 150); c.lineTo(128, 252); c.stroke(); c.fillStyle = '#ffd95a'; c.beginPath(); c.rect(70, 196, 116, 12); c.fill(); c.stroke();
      for (const [x, rot, who, ex] of [[84, -0.2, 'jan', 'grin'], [172, 0.2, 'jan2', 'smirk']]) {
        c.save(); c.translate(x, 96); c.rotate(rot); c.scale(0.92, 0.92); CrewArt.head(c, who, ex); c.restore();
        c.lineWidth = 5; c.strokeStyle = '#ffd95a'; c.beginPath(); c.ellipse(x + rot * 30, 22, 30, 9, rot, 0, 6.283); c.stroke(); c.strokeStyle = '#1b1421';
      }
      const jm = new THREE.SpriteMaterial({ map: srgbTex(cv), transparent: true, alphaTest: 0.3 }); jm.color.setScalar(0.55);
      const jan = new THREE.Sprite(jm); jan.scale.set(2.1, 2.1, 1); core.add(jan);
      P(new THREE.ConeGeometry(0.22, 1.5, 5), gold, 0, 0, 2.3, T).rotation.x = Math.PI / 2;      // a floating gilded spike does the shooting
      P(new THREE.TorusGeometry(0.4, 0.06, 5, 14), glow(new THREE.MeshBasicMaterial({ color: 0xffd95a }), 2.4), 0, 0, 1.75, T);
      R.anim = (dt, sp) => {
        core.position.y = 2.0 + Math.sin(GS.elapsed * 2.2) * 0.16;
        t1.rotation.y += dt * (1.2 + sp * 0.12); t1.rotation.x = Math.sin(GS.elapsed * 0.8) * 0.5;
        t2.rotation.x += dt * (1.7 + sp * 0.15); t2.rotation.z = Math.cos(GS.elapsed * 0.9) * 0.5;
      };
    } else if (k === 'unicorn') {
      const white = new THREE.MeshStandardMaterial({ color: 0xf2eef6, roughness: 0.6, flatShading: true }), gold = new THREE.MeshStandardMaterial({ color: 0xf0b428, metalness: 0.8, roughness: 0.3, flatShading: true });
      const pink = new THREE.MeshStandardMaterial({ color: 0xff8fc8, roughness: 0.7 }), blk = new THREE.MeshBasicMaterial({ color: 0x1b1421 });
      const rain = [0xff4a5a, 0xff9a3a, 0xffe14a, 0x5fd36a, 0x4f9dff, 0xb06cff].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true }));
      const tor = new THREE.Group(); B.add(tor);
      P(new THREE.BoxGeometry(1.5, 1.25, 2.7), white, 0, 1.75, -0.1, tor);
      P(new THREE.BoxGeometry(0.75, 1.0, 0.75), white, 0, 2.5, 1.25, tor).rotation.x = 0.35;                 // neck
      const head = new THREE.Group(); head.position.set(0, 3.0, 1.75); tor.add(head);
      P(new THREE.BoxGeometry(0.95, 0.95, 1.15), white, 0, 0, 0.1, head); P(new THREE.BoxGeometry(0.8, 0.55, 0.5), pink, 0, -0.2, 0.75, head);
      P(new THREE.ConeGeometry(0.16, 1.0, 5), gold, 0, 0.9, 0.35, head).rotation.x = 0.35;
      for (const sd of [-1, 1]) { P(new THREE.BoxGeometry(0.06, 0.24, 0.24), blk, sd * 0.49, 0.1, 0.25, head); P(new THREE.BoxGeometry(0.2, 0.34, 0.14), white, sd * 0.3, 0.6, -0.3, head); P(new THREE.BoxGeometry(0.1, 0.1, 0.06), blk, sd * 0.18, -0.2, 1.01, head); }
      rain.forEach((m, i) => { P(new THREE.BoxGeometry(0.3, 0.34, 0.32), m, 0, 3.1 - i * 0.2, 1.1 - i * 0.3, tor); });   // mane
      const tail = rain.map((m, i) => P(new THREE.BoxGeometry(0.26, 0.26, 0.34), m, 0, 2.15 - i * 0.18, -1.55 - i * 0.24, tor));
      const legs = [[-0.5, 0.95], [0.5, 0.95], [-0.5, -1.15], [0.5, -1.15]].map(([x, z], i) => {
        const g = new THREE.Group(); g.position.set(x, 1.2, z); g.userData.uleg = (i === 0 || i === 3) ? 1 : 2; B.add(g);
        P(new THREE.BoxGeometry(0.4, 0.95, 0.4), white, 0, -0.45, 0, g); P(new THREE.BoxGeometry(0.44, 0.26, 0.44), gold, 0, -1.07, 0, g);
        return { g, ph: (i === 0 || i === 3) ? 0 : Math.PI };
      });
      const riders = [0, 1].map(i => {                 // two gremlins in the saddle
        const s = new THREE.Sprite(SW_ART.gremlin[i].walk[0]); s.center.set(0.5, 0.08); s.scale.set(1.5, 1.5, 1); s.position.set(0, 2.3, 0.45 - i * 1.15); B.add(s); return s;
      });
      P(new THREE.BoxGeometry(0.3, 0.3, 0.5), dark, 0, 0, 0.1, T);
      P(new THREE.CylinderGeometry(0.07, 0.09, 1.3, 6), dark, 0, 0.05, 0.95, T).rotation.x = Math.PI / 2;
      R.anim = (dt, sp) => {
        const k = Math.min(1, sp / 5), a = GS.ridePhase * 2.4, beat = Math.floor(a / Math.PI);
        if (beat !== R.beat) { R.beat = beat;
          if (sp > 1.5 && car.alive && !car.airborne && car.depth === 0) {       // two hooves land almost together: ta-dam, ta-dam
            const v = Math.min(1, 0.35 + sp / 30); SFX.play('hoof', car.pos, { vol: v, rate: 0.9 + Math.random() * 0.2 }); SFX.play('hoof', car.pos, { vol: v * 0.8, rate: 1.05 + Math.random() * 0.2, delay: 0.07 });
            if (sp > 7) puff(tmp.set(car.pos.x - Math.sin(car.heading) * 1.1, 0.25, car.pos.z - Math.cos(car.heading) * 1.1), 0xa8977c, 0.8, 0.7, rand(-0.5, 0.5), rand(0.4, 1), rand(-0.5, 0.5), 0.22, 2.2);
          } }
        for (const L of legs) L.g.rotation.x = Math.sin(a + L.ph) * 0.7 * k;
        tor.position.y = Math.abs(Math.sin(a)) * 0.14 * k; head.rotation.x = Math.sin(a * 2) * 0.06 * k;
        tail.forEach((m, i) => { m.position.x = Math.sin(GS.elapsed * 5 + i * 0.7) * 0.08 * i; });
        riders.forEach((s, i) => { s.material = SW_ART.gremlin[i].walk[Math.floor(GS.elapsed * 4 + i) % SW_FRAMES]; s.position.y = 2.3 + tor.position.y + Math.abs(Math.sin(a + i)) * 0.1 * k; });
      };
    }
  }
  GS.safe = null;
  function buildSafe() {                               // the buggy's cart: a yellow steel milk-churn safe with the top sawn off, on a two-wheel trailer
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body); cartG.add(g);
    const yel = new THREE.MeshStandardMaterial({ color: 0xf2b51c, metalness: 0.55, roughness: 0.42, flatShading: true });
    const yelDk = new THREE.MeshStandardMaterial({ color: 0xb98410, metalness: 0.6, roughness: 0.5, flatShading: true });
    const inside = new THREE.MeshStandardMaterial({ color: 0x3a3430, metalness: 0.5, roughness: 0.8, side: THREE.BackSide, flatShading: true });
    const cut = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 1, roughness: 0.18, flatShading: true });
    const blk = new THREE.MeshStandardMaterial({ color: 0x1e1c22, metalness: 0.5, roughness: 0.5, flatShading: true });
    const P = (geo, mat, x, y, z, par = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    P(new THREE.BoxGeometry(1.9, 0.12, 1.9), blk, 0, 0.56, 0);                                        // trailer plate
    P(new THREE.BoxGeometry(0.14, 0.14, 1.6), metal, 0, 0.55, 1.75);                                  // drawbar
    P(new THREE.BoxGeometry(2.5, 0.12, 0.12), metal, 0, 0.5, 0, g);                                   // axle
    for (const x of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), tyreMat); w.rotation.z = Math.PI / 2; w.position.set(x * 1.28, 0.5, 0); w.castShadow = true; g.add(w);
      P(new THREE.BoxGeometry(0.34, 0.08, 1.0), blk, x * 1.28, 1.04, 0, g); }                       // mudguards
    P(new THREE.CylinderGeometry(1.0, 1.08, 0.9, 20, 1, true), yel, 0, 1.08, 0);                      // the churn, open at the top
    P(new THREE.CylinderGeometry(0.96, 1.04, 0.88, 20, 1, true), inside, 0, 1.09, 0);                 // dark inner wall
    P(new THREE.CylinderGeometry(1.06, 1.06, 0.06, 20), blk, 0, 0.65, 0);                             // floor
    for (const y of [0.78, 1.32]) { const r = P(new THREE.TorusGeometry(y < 1 ? 1.08 : 1.01, 0.06, 5, 22), yelDk, 0, y, 0); r.rotation.x = Math.PI / 2;
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = y < 1 ? 1.13 : 1.06; P(new THREE.SphereGeometry(0.045, 5, 4), metal, Math.cos(a) * rr, y, Math.sin(a) * rr); } }
    const rim = P(new THREE.TorusGeometry(0.99, 0.035, 4, 24), cut, 0, 1.53, 0); rim.rotation.x = Math.PI / 2;   // fresh saw cut, bright steel
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.3, t = P(new THREE.ConeGeometry(0.07, 0.14 + (i % 3) * 0.05, 3), cut, Math.cos(a) * 0.99, 1.58, Math.sin(a) * 0.99); t.rotation.z = (i % 2 ? 0.3 : -0.3); }   // jagged burrs
    const door = P(new THREE.BoxGeometry(0.08, 0.5, 0.62), yelDk, 1.06, 1.06, 0.05);                  // safe door on the right flank
    const dial = P(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14), blk, 1.12, 1.1, 0.12); dial.rotation.z = Math.PI / 2;
    const dr = P(new THREE.TorusGeometry(0.15, 0.025, 4, 14), cut, 1.15, 1.1, 0.12); dr.rotation.y = Math.PI / 2;
    for (let i = 0; i < 3; i++) { const sp = P(new THREE.BoxGeometry(0.06, 0.04, 0.14), cut, 1.12, 1.1, 0.12); sp.rotation.x = i * Math.PI / 3; sp.position.x = 1.17; }   // handle spokes
    for (const z of [-0.2, 0.3]) P(new THREE.BoxGeometry(0.06, 0.12, 0.1), metal, 1.1, 0.88 + (z > 0 ? 0.36 : 0), -0.24);   // hinges
    door.userData.safe = true;
    GS.safe = { g, body };
  }
  let cloud = null;
  function buildCloud() {                              // the halo's cart: a little cloud for the chubziks to ride on, no wheels, no hitch
    const g = new THREE.Group(); cartG.add(g);
    const fluff = new THREE.MeshStandardMaterial({ color: 0x9aa3c4, emissive: 0x2a3050, emissiveIntensity: 0.3, roughness: 1, flatShading: true });
    const puffs = [[0, 0.3, 0, 1.0], [-0.95, 0.3, 0.3, 0.72], [0.95, 0.32, -0.25, 0.75], [0.1, 0.3, 1.05, 0.7], [-0.15, 0.3, -1.05, 0.72], [-0.7, 0.25, -0.75, 0.55], [0.75, 0.25, 0.75, 0.55], [0, 0.15, 0, 1.35]].map(([x, y, z, r], i) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), fluff); m.position.set(x, y, z); m.scale.y = i === 7 ? 0.3 : 0.55; m.castShadow = true; g.add(m); return m; });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 5, 24), glow(new THREE.MeshBasicMaterial({ color: 0xffe07a }), 2.2)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
    cloud = { g, puffs };
  }
  const cartFor = c => (bug && c === bug.g) ? 'spider' : (cloud && c === cloud.g) ? 'halo' : (GS.safe && c === GS.safe.g) ? 'buggy' : null;      // which ride a cart model belongs to (null: the wooden cart, the unicorn's)
  let bug = null, bugPhase = 0; const bugPrev = new THREE.Vector3();
  function buildBug() {                                // the spider's cart: a smaller bug trotting behind on its own, no hitch
    const g = new THREE.Group(); cartG.add(g);
    const shell = new THREE.MeshStandardMaterial({ color: 0x2a2630, metalness: 0.7, roughness: 0.4, flatShading: true });
    const trim = glow(new THREE.MeshBasicMaterial({ color: 0x2fb8ae }), 1.1);
    const P = (geo, mat, x, y, z, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    P(new THREE.BoxGeometry(2.0, 0.28, 2.3), shell, 0, 0.6, 0);
    for (const x of [-1, 1]) { P(new THREE.BoxGeometry(0.1, 0.34, 2.3), shell, x * 0.98, 0.9, 0); for (const z of [-1, 1]) P(new THREE.BoxGeometry(0.18, 0.1, 0.18), trim, x * 0.9, 1.1, z * 1.05); }
    for (const z of [-1, 1]) P(new THREE.BoxGeometry(2.0, 0.34, 0.1), shell, 0, 0.9, z * 1.13);
    const eye = P(new THREE.SphereGeometry(0.26, 10, 8), glow(new THREE.MeshBasicMaterial({ color: 0xff7a1a }), 1.6), 0, 0.75, 1.3); eye.scale.set(1.5, 0.75, 0.7);
    P(new THREE.BoxGeometry(0.9, 0.1, 0.34), shell, 0, 0.95, 1.36).rotation.set(0.5, 0, -0.2);
    const legs = [];
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
      const lg = new THREE.Group(); lg.position.set(sd * 0.95, 0.6, (i - 1) * 0.8); g.add(lg);
      const yaw = (i - 1) * 0.6, knee = new THREE.Vector3(sd * 0.6 * Math.cos(yaw), 0.5, 0.6 * Math.sin(yaw)), foot = new THREE.Vector3(sd * 1.05 * Math.cos(yaw), -0.6, 1.05 * Math.sin(yaw));
      strut(new THREE.Vector3(), knee, 0.12, shell, lg); strut(knee, foot, 0.09, shell, lg);
      legs.push({ lg, ph: (i + (sd > 0 ? 0 : 1)) * Math.PI });
    }
    bug = { g, legs };
  }
  function setRide(k) {
    GS.ride = k; abDirty = true; const b = k === 'buggy';
    buggyParts.forEach(m => m.visible = b); buggyTurret.forEach(m => m.visible = b);
    wheels.forEach(w => w.pivot.visible = b); bullbar.scale.setScalar(b ? 1 : 0.001);
    if (!b && !rideG[k]) buildRide(k);
    for (const n in rideG) rideG[n].body.visible = rideG[n].tur.visible = n === k;
    turret.position.set(...RIDES[k].turret); muzzle.position.set(0, k === 'spider' ? 0 : 0.2, k === 'halo' ? 3.1 : k === 'spider' ? 0.7 : 2.1);
    hoverShadow.visible = k === 'halo';
    car.maxHp = k === 'spider' ? 50 : 100; car.hp = car.maxHp;      // the spider is quick and fragile
    if (k === 'spider' && !bug) buildBug();
    if (k === 'halo' && !cloud) buildCloud();
    if (k === 'buggy' && !GS.safe) buildSafe();
    for (const c of cartG.children) c.visible = cartFor(c) ? cartFor(c) === k : k === 'unicorn';
    carBub.mats = bubbleMats(k); carBub.vee.material = carBub.mats.q1; carBub.roxy.material = carBub.mats.ok;
    try { localStorage.setItem('carproto.ride', k); } catch (e) {}
  }
  // a copy of a ride's real model (and its cart) for showing the other players
  function rideClone(k) {
    const g = new THREE.Group(), bd = new THREE.Group(), tur = new THREE.Group(); g.add(bd); bd.add(tur); tur.position.set(...RIDES[k].turret);
    const take = (src, par) => { const c = src.clone(); c.visible = true; par.add(c); return c; };
    if (k === 'buggy') {
      for (const m of buggyParts) take(m, bd); for (const m of buggyTurret) take(m, tur); take(bullbar, bd).scale.setScalar(1);
      for (const w of wheels) take(w.pivot, g);
    } else {
      if (!rideG[k]) { buildRide(k); rideG[k].body.visible = rideG[k].tur.visible = GS.ride === k; }
      if (k === 'spider' && GS.ride !== 'spider' && rideG[k].pose) { const q = carGroup.quaternion.clone(); carGroup.quaternion.identity(); rideG[k].pose(); carGroup.quaternion.copy(q); }
      take(rideG[k].body, bd); take(rideG[k].tur, tur);
    }
    const cartM = new THREE.Group();
    if (k === 'spider' && !bug) { buildBug(); bug.g.visible = GS.ride === 'spider'; }
    if (k === 'halo' && !cloud) { buildCloud(); cloud.g.visible = GS.ride === 'halo'; }
    if (k === 'buggy' && !GS.safe) { buildSafe(); GS.safe.g.visible = GS.ride === 'buggy'; }
    for (const c of cartG.children) if (cartFor(c) ? cartFor(c) === k : k === 'unicorn') take(c, cartM);
    const anim = [];                                     // moving parts of the copy: spider legs, unicorn legs, halo rings
    g.traverse(o => { const u = o.userData; if (u.leg) { const fem = o.children.find(c => c.isGroup); anim.push({ t: 'leg', o, fem, grp: u.leg - 1, by: o.rotation.y, bx: fem ? fem.rotation.x : 0 }); }
      else if (u.uleg) anim.push({ t: 'uleg', o, grp: u.uleg - 1 }); else if (u.spin) anim.push({ t: 'spin', o, k: u.spin }); });
    return { g, tur, cart: cartM, anim };
  }
  // the unicorn's horn: gallop into something head-on and it gets gored and thrown
  const hornV = new THREE.Vector3();
  function updateHorn() {
    const sp = Math.hypot(car.vel.x, car.vel.z); if (!car.alive || car.depth > 0.3 || sp < 7) return;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), dmg = sp > 18 ? 6 : 4;
    const gore = (t, r, y) => {
      const dx = t.pos.x - car.pos.x, dz = t.pos.z - car.pos.z, d = Math.hypot(dx, dz) || 1e-3;
      if (d > car.radius + r + 1.3 || (dx * fx + dz * fz) / d < 0.55 || Math.abs(y - car.y) > 3.2 || (t.hornT || 0) > GS.elapsed) return false;
      t.hornT = GS.elapsed + 0.45; hornV.set(fx, 0, fz);
      tmp.set(car.pos.x + fx * 2.4, 2.6, car.pos.z + fz * 2.4); spawnParticles(tmp, 0xf0b428, 5, 7); flash(tmp, 0xffd95a, 2.2, 0.14, 2, false); SFX.play('hit_flesh', tmp, { rate: 0.8 }); GS.shake = Math.max(GS.shake, 0.2);
      return true;
    };
    for (const m of swarm) if (!m.dead && gore(m, m.r, m.K.fly || 0)) hitCritter(m, dmg, hornV, 12);
    for (const e of enemies) if (!e.dead && !e.carried && e.awake && gore(e, e.r, 0)) hitEnemy(e, hornV, dmg, 8);
  }
  function updateRide(dt) {
    const sp = Math.hypot(car.vel.x, car.vel.z); GS.ridePhase += sp * dt * 0.45;
    if (rideG[GS.ride]) rideG[GS.ride].anim(dt, sp);
    if (hoverShadow.visible) hoverShadow.position.y = 0.04 - carGroup.position.y;
    if (GS.ride === 'halo' && cloud) {                      // the cloud bobs, leans with the sway and breathes
      cloud.g.position.y = 0.12 + Math.sin(GS.elapsed * 2) * 0.08; cloud.g.rotation.z = cart.phi * 0.6;
      cloud.puffs.forEach((m, i) => { if (i < 7) m.scale.x = m.scale.z = 1 + Math.sin(GS.elapsed * 1.7 + i * 1.3) * 0.06; });
    }
    if (GS.ride === 'spider' && bug) {                      // the bug sways and tips exactly like the cart it replaces
      bugPhase += Math.hypot(cart.pos.x - bugPrev.x, cart.pos.z - bugPrev.z) * 1.6; bugPrev.copy(cart.pos);
      bug.g.rotation.z = cartBody.rotation.z; bug.g.position.y = cartBody.position.y + Math.abs(Math.sin(bugPhase)) * 0.05;
      for (const L of bug.legs) { L.lg.rotation.y = Math.sin(bugPhase + L.ph) * 0.45; L.lg.position.y = 0.6 + Math.max(0, Math.cos(bugPhase + L.ph)) * 0.16; }
    }
  }

  const car = {
    pos: new THREE.Vector3(0, 0, 0),
    vel: new THREE.Vector3(),
    heading: 0,          // radians, 0 = +Z
    speed: 0,            // engine speed along heading
    steer: 0,
    radius: 1.6,
    hp: 100, maxHp: 100, alive: true, deadTimer: 0, lastHurt: -10,
    burrow: 'up', depth: 0, burrowCd: 0,
    y: 0, vy: 0, airborne: false,
    mode: 'human',         // human — крутится на месте на A/D; cursor — сама разворачивается к курсору; car — машинная физика руля
  };

  // ---------- bullets & particles ----------
  const bullets = [];
  const bulletGeo = new THREE.CylinderGeometry(0.075, 0.075, 2.0, 6); bulletGeo.rotateX(Math.PI / 2);   // tracer along +z
  const bulletMat = glow(new THREE.MeshBasicMaterial({ color: 0xffc060 }), 3.6);
  const particles = [];
  const partGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);

  const partMats = new Map();
  function spawnParticles(p, color, n, power) {
    let mat = partMats.get(color); if (!mat) partMats.set(color, mat = new THREE.MeshStandardMaterial({ color }));
    if (COARSE) n = Math.ceil(n * 0.6);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(partGeo, mat);
      m.position.copy(p);
      m.scale.setScalar(rand(0.5, 1.4));
      scene.add(m);
      particles.push({ m, v: new THREE.Vector3(rand(-1, 1), rand(0.4, 1.4), rand(-1, 1)).multiplyScalar(power),
                       spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: rand(0.6, 1.2) });
    }
  }

  GS.fireCooldown = 0; GS.muzzleTimer = 0;
  // ---------- aiming ----------
  const mouseNdc = new THREE.Vector2(0, 0.3);
  const raycaster = new THREE.Raycaster();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9);   // y = 0.9, середина врага
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const aimPoint = new THREE.Vector3(0, 0.9, 10), groundAim = new THREE.Vector3(0, 0, 10);
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 28),
    glow(new THREE.MeshBasicMaterial({ color: 0xff8c32, transparent: true, opacity: 0.85, depthWrite: false }), 3));
  aimRing.geometry.rotateX(-Math.PI / 2);
  scene.add(aimRing);
  addEventListener('mousemove', e => {
    mouseNdc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (performance.now() - touch.last > 800) touch.aiming = false;   // a real mouse, not the echo of a tap
  });
  function updateAim(dt) {
    GS.autoTarget = null;
    if (touch.aiming) {                                  // right stick: aim point sits at stick direction from the car
      if (touch.aim.mag > 0.15) { stickWorld(touch.aim.x, touch.aim.y, touch.aimDir); touch.aimDist = 5 + 13 * touch.aim.mag; }
      groundAim.set(car.pos.x + touch.aimDir.x * touch.aimDist, 0, car.pos.z + touch.aimDir.z * touch.aimDist);
      if (touch.enabled && touch.aim.mag <= 0.15 && car.alive && car.depth < 0.3) {     // no manual aim: lock on like a shmup
        GS.autoTarget = pickAutoTarget();
        if (GS.autoTarget) { const tp = autoTargetPos(GS.autoTarget); groundAim.set(tp.x, 0, tp.z); }
      }
      if (touch.aim.mag > 0.3) {                         // light aim assist while firing: snap to a target within ~15 degrees
        let bd = 0.26, bx = 0, bz = 0, hit = false;
        const consider = (x, z) => {
          const dx = x - car.pos.x, dz = z - car.pos.z, d = Math.hypot(dx, dz);
          if (d < 2 || d > 28) return;
          const ang = Math.acos(THREE.MathUtils.clamp((dx * touch.aimDir.x + dz * touch.aimDir.z) / d, -1, 1));
          if (ang < bd) { bd = ang; bx = x; bz = z; hit = true; }
        };
        for (const e of enemies) if (!e.dead && !e.carried && e.awake) consider(e.pos.x, e.pos.z);
        for (const e of swarm) if (!e.dead) consider(e.pos.x, e.pos.z);
        if (boss.state === 'fight') consider(BOSS_POS.x, BOSS_POS.z);
        if (hit) groundAim.set(bx, 0, bz);
      }
      aimPoint.set(groundAim.x, 0.9, groundAim.z);
    } else {
      raycaster.setFromCamera(mouseNdc, camera);
      raycaster.ray.intersectPlane(aimPlane, aimPoint);
      raycaster.ray.intersectPlane(groundPlane, groundAim);
      if (!GS.mouseFire && car.alive && car.depth < 0.3) GS.autoTarget = pickAutoTarget();   // desktop: the gun locks on by itself, hold LMB to aim by hand
    }
    aimRing.position.set(groundAim.x, 0.04, groundAim.z);
    aimRing.rotation.y += dt * 1.5;
    // турель поворачивается к курсору (в локальных координатах кузова)
    const tw = new THREE.Vector3(); turret.getWorldPosition(tw);
    const tgt = GS.autoTarget ? autoTargetPos(GS.autoTarget) : aimPoint;      // the cursor still steers the grabber and throws
    const want = Math.atan2(tgt.x - tw.x, tgt.z - tw.z) - car.heading;
    let d = want - turret.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    turret.rotation.y += Math.sign(d) * Math.min(Math.abs(d), 14 * dt);
  }

  const fireV = new THREE.Vector3();
  const starGeo = (() => {                               // six spikes: a caltrop
    const pos = [], nor = [];
    for (const [rx, rz] of [[0, 0], [Math.PI, 0], [Math.PI / 2, 0], [-Math.PI / 2, 0], [0, Math.PI / 2], [0, -Math.PI / 2]]) {
      const c = new THREE.ConeGeometry(0.13, 0.5, 4); c.translate(0, 0.27, 0); c.rotateX(rx); c.rotateZ(rz);
      const g = c.toNonIndexed(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
  })();
  const starMat = glow(new THREE.MeshBasicMaterial({ color: 0xffa02a }), 3.2);
  function fire() {
    const tip = new THREE.Vector3();
    muzzle.getWorldPosition(tip);
    const yaw = car.heading + turret.rotation.y;                     // куда реально смотрит ствол
    const ap = GS.autoTarget ? fireV.copy(autoTargetPos(GS.autoTarget)).setY(0.9) : aimPoint;
    const hd = Math.hypot(ap.x - tip.x, ap.z - tip.z);
    const pitch = THREE.MathUtils.clamp(Math.atan2(ap.y - tip.y, Math.max(hd, 3)), -0.5, 0.1);
    const fwd = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const lv = weapons.spread, n = lv ? (GS.ride === 'halo' ? Math.max(1, Math.round(W_STATS.spread.n[lv - 1] * 0.7)) : W_STATS.spread.n[lv - 1]) : 1, arc = lv ? W_STATS.spread.arc[lv - 1] : 0;
    for (let i = 0; i < n; i++) {                       // fan gun: n tracers spread evenly across the arc
      const spread = (n > 1 ? (i / (n - 1) - 0.5) * arc : 0) + rand(-0.02, 0.02);
      const dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
      const star = GS.ride === 'spider';
      const m = new THREE.Mesh(star ? starGeo : bulletGeo, star ? starMat : bulletMat);
      m.position.copy(tip);
      m.lookAt(tip.x + dir.x, tip.y + dir.y, tip.z + dir.z);
      scene.add(m);
      const holy = GS.ride === 'halo';                      // the halo's fan is thinner: its strength is the swords
      bullets.push({ m, v: dir.multiplyScalar(BULLET.speed[star ? 'star' : holy ? 'holy' : 'base']), life: BULLET.life[star ? 'star' : 'base'] * (lv ? BULLET.fanLife : 1), spin: star, dmg: BULLET.dmg });      // the fan gun reaches shorter (the halo's a little shorter still); the halo's handicap is its 30% thinner fan, nothing stacked on top
    }
    GS.muzzleTimer = 0.04;
    muzzleLight.position.copy(tip); muzzleLight.intensity = Math.max(muzzleLight.intensity, 0.55 * LIGHT);
    SFX.play('shot', tip); NET.fireSeq = (NET.fireSeq + 1) % 100000;
  }

  // ---------- input ----------
  // e.code — физические клавиши, работает на любой раскладке
  const keys = {};
  GS.mouseFire = false;
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) jump(); }
    if (e.code === 'KeyR') respawn();
    if (e.code === 'KeyM') flashAlert(MUSIC.toggle() ? 'MUSIC ON' : 'MUSIC OFF');
    if (e.code === 'KeyL' && !e.repeat) diagToggle();
    if (e.code === 'KeyM' && !e.repeat) { SFX.init(); SFX.toggleMute(); syncMute(); }
    if (!e.repeat && !startEl.isConnected) { if (e.code === 'Digit1') useUlt('sword'); if (e.code === 'Digit2') useUlt('hands'); if (e.code === 'KeyC') convertCoins(); }      // the shop on the keyboard
    if (e.code === 'KeyE' && !e.repeat && GS.unloadAltar) doUnload();     // E sacrifices inside an altar's ring
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  GS.rmb = false;
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; GS.mouseFire = false; GS.rmb = false; });
  renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0) GS.mouseFire = true; if (e.button === 2) special(); });
  addEventListener('mouseup', e => { if (e.button === 0) GS.mouseFire = false; if (e.button === 2) GS.rmb = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => {
    GS.viewSize = THREE.MathUtils.clamp(GS.viewSize * (e.deltaY > 0 ? 1.1 : 0.9), 10, 55);
    resizeCam();
  }, { passive: true });
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight); resizeCam();
    if (GS.composer) GS.composer.setSize(innerWidth, innerHeight);
    if (GS.fxaaPass) GS.fxaaPass.uniforms.resolution.value.set(1 / (innerWidth * GS.PR), 1 / (innerHeight * GS.PR));
  });
  // ---------- touch input ----------
  // Left half of the screen: floating drive stick (the car turns toward the stick and accelerates).
  // Right half: floating aim stick, fires while held. Ability buttons are bound where the ability bar is built.
  const STICK_R = 56;
  const ISO_SQUASH = Math.sin(Math.atan(1 / Math.SQRT2));       // ground depth is foreshortened by 0.577 on screen
  const mkStick = el => ({ el, knob: el.firstElementChild, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0 });
  const touch = { enabled: false, aiming: false, last: -1e9, aimDir: new THREE.Vector3(0, 0, 1), aimDist: 10,
                  move: mkStick(document.getElementById('stickL')), aim: mkStick(document.getElementById('stickR')) };
  function stickWorld(sx, sy, out) {                             // screen-space stick -> direction on the ground
    const uy = -sy / ISO_SQUASH;
    return out.set((sx - uy) * Math.SQRT1_2, 0, (-sx - uy) * Math.SQRT1_2).normalize();
  }
  function stickRest(st, right) {
    const c = Math.min(innerWidth, innerHeight) < 420 ? 84 : 95;
    st.el.style.left = (right ? innerWidth - c : c) + 'px'; st.el.style.top = (innerHeight - c) + 'px';
    st.knob.style.transform = ''; st.el.classList.remove('on');
  }
  function layoutTouch() {
    if (!touch.enabled) return;
    const small = Math.min(innerWidth, innerHeight) < 420, c = small ? 84 : 95, R = small ? 120 : 138;
    const arc = { jump: 2, decoy: 40, cubes: 40, burrow: 40, bomb: 40, drill: 80, trail: 80 };    // degrees around the right thumb: jump, the active, the passive
    for (const t in arc) {
      const el = document.getElementById('ab-' + t), a = arc[t] * Math.PI / 180;
      if (!el) continue;
      el.style.right = (c + R * Math.cos(a) - 29) + 'px'; el.style.bottom = (c + R * Math.sin(a) - 29) + 'px';
    }
    const dj = document.getElementById('ab-doubleJump');
    if (dj) { dj.style.right = (c + R + 26) + 'px'; dj.style.bottom = (c + 18) + 'px'; }
    if (touch.move.id === null) stickRest(touch.move, false);
    if (touch.aim.id === null) stickRest(touch.aim, true);
  }
  function enableTouch() {
    if (touch.enabled) return;
    touch.enabled = true; touch.aiming = true;
    touch.aimDir.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    document.body.classList.add('touch');
    const st = document.querySelector('#start span'); if (st) st.textContent = 'Tap to start';
    layoutTouch();
  }
  function stickSet(st, t) {
    let dx = t.clientX - st.ox, dy = t.clientY - st.oy; const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    st.x = dx / STICK_R; st.y = dy / STICK_R; st.mag = Math.min(1, d / STICK_R);
    st.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  addEventListener('touchstart', () => { touch.last = performance.now(); touch.aiming = true; enableTouch(); }, { passive: true, capture: true });
  renderer.domElement.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const st = t.clientX < innerWidth * 0.5 ? touch.move : touch.aim;
      if (st.id !== null) continue;
      st.id = t.identifier; st.ox = t.clientX; st.oy = t.clientY; st.x = st.y = st.mag = 0;
      st.el.style.left = st.ox + 'px'; st.el.style.top = st.oy + 'px'; st.el.classList.add('on');
    }
  }, { passive: false });
  addEventListener('touchmove', e => {
    touch.last = performance.now();
    for (const t of e.changedTouches) for (const st of [touch.move, touch.aim]) if (st.id === t.identifier) stickSet(st, t);
  }, { passive: true });
  const touchEnd = e => {
    touch.last = performance.now();
    for (const t of e.changedTouches) for (const st of [touch.move, touch.aim]) if (st.id === t.identifier) {
      st.id = null; st.x = st.y = st.mag = 0; stickRest(st, st === touch.aim);
    }
  };
  addEventListener('touchend', touchEnd); addEventListener('touchcancel', touchEnd);
  addEventListener('resize', layoutTouch);

  const startEl = document.getElementById('start');
  let lastRide = 'buggy'; try { lastRide = localStorage.getItem('carproto.ride') || 'buggy'; } catch (e) {}
  if (!RIDES[lastRide]) lastRide = 'buggy';
  for (const b of document.querySelectorAll('#rides button')) { if (b.dataset.ride === lastRide) b.classList.add('last'); b.addEventListener('click', () => { lastRide = b.dataset.ride; }); }
  const lobbyStep = document.getElementById('lobbyStep'), comicStep = document.getElementById('comicStep');
  function toComic(mode) {                               // lobby choice made: 'solo', 'host' or a lobby id to join
    netStart(mode);
    lobbyStep.style.display = 'none'; comicStep.style.display = 'flex';
    document.getElementById('lobbyTag').textContent = NET.game ? `In ${NET.hostNick}'s lobby` : '';
  }
  lobbyStep.addEventListener('click', e => e.stopPropagation());
  document.getElementById('hostBtn').addEventListener('click', () => toComic('host'));
  document.getElementById('soloBtn').addEventListener('click', () => toComic('solo'));
  startEl.addEventListener('click', () => {
    if (comicStep.style.display === 'none') return;
    setRide(lastRide); if (NET.game) { NET.on = true; if (!NET.isHost) { NET.client = true; netPurge(); } }
    SFX.init(); startEl.remove(); renderer.domElement.focus();
    crew.on = true; setTimeout(() => crewSay('start', 1, true), 700);
  });
  addEventListener('pointerdown', () => SFX.init(), { capture: true });       // iOS / autoplay: audio starts on the first gesture
  const BUILD = +document.querySelector('meta[name="chubz-build"]').content, buildEl = document.getElementById('build');      // the build number lives in src/index.html
  function hardReload() {                                // refetch the page past the browser cache, then reload (what Ctrl+Shift+R does)
    const go = () => { try { location.reload(); } catch (e) {} };
    try { fetch(location.href, { cache: 'reload' }).then(go, go); setTimeout(go, 2500); } catch (e) { go(); }
  }
  buildEl.textContent = 'build ' + BUILD;
  function checkBuild() {                                // on a normal web host: is there a newer build than the one that is running?
    try { fetch(location.href.split('#')[0], { cache: 'no-store' }).then(r => r.text()).then(t => { const m = /<meta name="chubz-build" content="(\d+)"/.exec(t);
      if (m && +m[1] > BUILD) { buildEl.dataset.upd = '1'; buildEl.textContent = `build ${BUILD} → ${m[1]} is out · tap to update`; buildEl.style.pointerEvents = 'auto'; buildEl.style.cursor = 'pointer'; buildEl.style.background = '#b0401a'; buildEl.style.color = '#fff'; } }).catch(() => {}); } catch (e) {}
  }
  for (const ev of ['mousedown', 'touchstart', 'pointerdown', 'click']) buildEl.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'click') { if (buildEl.dataset.upd) hardReload(); else diagToggle(); } });
  buildEl.style.pointerEvents = 'auto'; buildEl.style.cursor = 'pointer';
  checkBuild(); setInterval(checkBuild, 90000);
  const restartBtn = document.getElementById('restart'); let restartT = 0;
  for (const ev of ['mousedown', 'touchstart', 'pointerdown']) restartBtn.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  restartBtn.addEventListener('click', e => {           // two taps: the first arms it, the second reloads the page back to the comic
    e.stopPropagation(); restartBtn.blur();
    if (restartBtn.classList.contains('ask')) { restartBtn.textContent = '…'; hardReload(); return; }
    restartBtn.classList.add('ask'); restartBtn.textContent = 'RESTART?';
    clearTimeout(restartT); restartT = setTimeout(() => { restartBtn.classList.remove('ask'); restartBtn.textContent = '⟲'; }, 2500);
  });
  const muteBtn = document.getElementById('mute');
  const volBox = document.getElementById('volBox'), volEl = document.getElementById('vol'); let volHide = 0;
  const syncMute = () => { const off = SFX.muted || SFX.volume === 0; muteBtn.textContent = off ? '🔇' : SFX.volume < 0.4 ? '🔉' : '🔊'; muteBtn.classList.toggle('off', off); volEl.value = Math.round((SFX.muted ? 0 : SFX.volume) * 100); };
  const volStay = () => { clearTimeout(volHide); volHide = setTimeout(() => volBox.classList.remove('on'), 4000); };
  const volSet = v => { SFX.init(); if (SFX.muted && v > 0) SFX.toggleMute(); SFX.setVolume(v); syncMute(); volStay(); };
  muteBtn.addEventListener('click', e => { e.stopPropagation(); SFX.init(); volBox.classList.toggle('on'); syncMute(); volStay(); });      // the button opens the slider; M still mutes outright
  volEl.addEventListener('input', () => volSet(volEl.value / 100));
  document.getElementById('volDown').addEventListener('click', () => volSet((SFX.muted ? 0 : SFX.volume) - 0.1));
  document.getElementById('volUp').addEventListener('click', () => volSet((SFX.muted ? 0 : SFX.volume) + 0.1));
  for (const ev of ['click', 'pointerdown', 'pointerup', 'touchstart', 'mousedown']) volBox.addEventListener(ev, e => e.stopPropagation());
  muteBtn.addEventListener('pointerdown', e => e.stopPropagation());
  syncMute();
  renderer.domElement.tabIndex = 0;

  function respawn() {
    { const a = Math.random() * 6.283; car.pos.set(Math.cos(a) * ARENA * 0.4, 0, Math.sin(a) * ARENA * 0.4); car.heading = Math.atan2(-car.pos.x, -car.pos.z); }      // start out on the plain, facing the centre pedestal
    car.vel.set(0, 0, 0); car.speed = 0;
    car.hp = car.maxHp; car.alive = true; carGroup.visible = true;
    car.burrow = 'up'; car.depth = 0; car.y = 0; car.vy = 0; car.airborne = false;
    if (!(NET.on && NET.game)) resetBoss(); if (NET.on && NET.game) { cartFling(cart.riders.length, 0); cartReset(); } else clearSwarm(); clearEShots(); crewSay('respawn', 1, true);
    document.getElementById('dead').style.display = 'none';
    // разогнать злюк от точки спавна
    for (const e of enemies) if (!e.dead && Math.hypot(e.pos.x, e.pos.z) < 25) placeEnemy(e);
  }

  // ---------- world setup ----------
  seedRandom(SEED);
  for (let i = 0; i < 18; i++) { const [x, z] = freeSpot(7, 24); addRock(x, z); }
  for (let i = 0; i < 64; i++) { const [x, z] = freeSpot(3); addPillar(x, z); }
  for (let i = 0; i < 80; i++) addCrate();
  GS.kills = 0;
  const killsEl = document.getElementById('kills');
  const spdEl = document.getElementById('spd');
  const respawnQueue = [];

  // ---------- evil cubes ----------
  // Спят под видом ящиков, просыпаются когда подъезжаешь (или в них стреляешь), потом скачут и кусаются.
  const enemyRed = new THREE.MeshStandardMaterial({ color: 0xd42a36, emissive: 0x3a0406, roughness: 0.4, metalness: 0.15 });
  const enemyFlash = new THREE.MeshStandardMaterial({ color: 0xf09a8c, emissive: 0x4a100c, roughness: 0.5 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.35, flatShading: true });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x2a2024, roughness: 0.45, metalness: 0.2, flatShading: true });
  const redTrim = new THREE.MeshStandardMaterial({ color: 0x6e1018, roughness: 0.5, flatShading: true });
  const eliteTrim = new THREE.MeshStandardMaterial({ color: 0x3a1250, roughness: 0.35, metalness: 0.5, flatShading: true });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xff5f86, roughness: 0.5 });
  const eyeElite = glow(new THREE.MeshBasicMaterial({ color: 0x7df4ff }), 1.8);
  const crystalMat = glow(new THREE.MeshBasicMaterial({ color: 0xff5ae0 }), 1.45);
  const eyeWhite = glow(new THREE.MeshBasicMaterial({ color: 0xfff2c8 }), 1.35);
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x2a0508 });
  const enemies = [];
  const RED_COUNT = 20, ELITE_COUNT = 7, WAKE_DIST = 20;
  GS.enemyKills = 0;
  const ekillsEl = document.getElementById('ekills');

  function makeEnemy(elite = false) {
    const s = elite ? rand(2.9, 3.4) : rand(1.9, 2.4), lowH = s * 0.45, upH = s * 0.55;
    const root = new THREE.Group(), hop = new THREE.Group();
    root.add(hop); scene.add(root);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(s, lowH, s), crateMat);
    lower.position.y = lowH / 2; hop.add(lower);
    const gullet = new THREE.Mesh(new THREE.BoxGeometry(s * 0.86, 0.04, s * 0.86), mouthMat);
    gullet.position.y = lowH + 0.01; hop.add(gullet);
    const pivot = new THREE.Group(); pivot.position.set(0, lowH, -s / 2); hop.add(pivot);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(s, upH, s), crateMat);
    upper.position.set(0, upH / 2, s / 2); pivot.add(upper);
    // split the crate texture across the two jaws so a sleeping biter looks exactly like a real crate
    const sideV = (geo, v0, v1) => { const uv = geo.attributes.uv; for (let i = 0; i < 24; i++) if (i < 8 || i >= 16) uv.setY(i, v0 + uv.getY(i) * (v1 - v0)); };
    sideV(lower.geometry, 0, 0.45); sideV(upper.geometry, 0.45, 1);
    const roofOfMouth = new THREE.Mesh(new THREE.BoxGeometry(s * 0.86, 0.04, s * 0.86), mouthMat);
    roofOfMouth.position.set(0, -0.01, s / 2); pivot.add(roofOfMouth);

    // everything below only shows once the biter wakes up; asleep it is a plain crate
    const awakeParts = [];
    const part = (geo, mat, parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); awakeParts.push(m); return m;
    };
    const fang = (r, h) => new THREE.ConeGeometry(r, h, 3);
    const trim = elite ? eliteTrim : redTrim;
    const n = elite ? 6 : 5;                                    // front row: uneven fangs, long canines at the corners
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (s * 0.84 / n), hL = s * rand(0.1, 0.17), hU = s * (i === 0 || i === n - 1 ? 0.3 : rand(0.1, 0.16));
      part(fang(s * 0.055, hL), toothMat, hop, x + s * 0.04, lowH + hL / 2, s / 2 - s * 0.07, 0, rand(0, 2));
      part(fang(s * 0.06, hU), toothMat, pivot, x, -hU / 2, s - s * 0.07, Math.PI, rand(0, 2));
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {                             // side teeth
        const z = s * (0.05 + i * 0.16), h = s * rand(0.08, 0.13);
        part(fang(s * 0.045, h), toothMat, hop, side * (s / 2 - s * 0.07), lowH + h / 2, z);
        part(fang(s * 0.045, h), toothMat, pivot, side * (s / 2 - s * 0.07), -h / 2, s / 2 + z + s * 0.08, Math.PI);
      }
      // slanted glowing eye, slit pupil, heavy brow
      part(new THREE.BoxGeometry(s * 0.27, s * 0.13, 0.08), elite ? eyeElite : eyeWhite, pivot, side * s * 0.24, upH * 0.5, s + 0.03, 0, 0, side * 0.3);
      part(new THREE.BoxGeometry(s * 0.045, s * 0.13, 0.1), pupilMat, pivot, side * s * 0.22, upH * 0.5, s + 0.05, 0, 0, side * 0.3);
      part(new THREE.BoxGeometry(s * 0.38, s * 0.09, s * 0.14), trim, pivot, side * s * 0.25, upH * 0.5 + s * 0.13, s + 0.03, 0, 0, side * 0.42);
      // horns sweep out and back
      const hh = s * (elite ? 0.72 : 0.5);
      part(new THREE.ConeGeometry(s * 0.12, hh, 5), hornMat, pivot, side * s * 0.36, upH + hh * 0.38, s * 0.58, -0.45, 0, -side * 0.55);
      for (const fz of [-1, 1]) {                               // stubby clawed feet
        part(new THREE.BoxGeometry(s * 0.2, s * 0.13, s * 0.3), trim, hop, side * (s / 2 + s * 0.06), s * 0.065, fz * s * 0.3 + s * 0.04);
        part(fang(s * 0.05, s * 0.16), toothMat, hop, side * (s / 2 + s * 0.08), s * 0.05, fz * s * 0.3 + s * 0.25, Math.PI / 2);
      }
    }
    part(new THREE.BoxGeometry(s * 0.3, s * 0.04, s * 0.62), tongueMat, hop, 0, lowH + s * 0.03, s * 0.22, 0.08);   // tongue lolls out the front
    for (let i = 0; i < 3; i++) {                               // spines down the back
      const h = s * (0.26 - i * 0.05);
      part(new THREE.ConeGeometry(s * 0.07, h, 4), hornMat, pivot, 0, upH + h / 2 - 0.02, s * (0.4 - i * 0.16), -0.25);
    }
    if (elite) for (let i = 0; i < 5; i++) {                    // arch-biters wear a crown of glowing crystals
      const a = i / 5 * Math.PI * 2 + 0.3;
      const c = part(new THREE.OctahedronGeometry(s * 0.1, 0), crystalMat, pivot, Math.cos(a) * s * 0.3, upH + s * 0.13, s * 0.52 + Math.sin(a) * s * 0.3, Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      c.scale.y = 2.6;
    }
    root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    awakeParts.forEach(p => p.visible = false);

    const e = { root, hop, pivot, lower, upper, awakeParts, s, r: s * 0.62,
                pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: rand(0, Math.PI * 2),
                hp: 4, awake: false, dead: false, flash: 0, biteCd: 0, phase: rand(0, 6), wakeT: 0, open: 0,
                speed: elite ? rand(8, 9.5) : rand(8.5, 11.5), carried: false, stun: 0, ramCd: 0,
                elite, maxHp: elite ? 30 : 10, bite: elite ? 26 : 16, shotCd: rand(1, 3), charge: 0,
                matAwake: elite ? new THREE.MeshStandardMaterial({ color: 0x8a1a66, roughness: 0.28, metalness: 0.65, envMap: GS.ENV, envMapIntensity: 1.6 }) : enemyRed,
                matDormant: elite ? new THREE.MeshStandardMaterial({ color: 0xd8d8d8, map: crateTex.map, roughnessMap: crateTex.rough, normalMap: crateTex.normal, roughness: 1 }) : crateMat };
    placeEnemy(e);
    enemies.push(e);
  }

  function setEnemyLook(e, mat) { e.lower.material = mat; e.upper.material = mat; }
  function flickerElite(e) {                       // мерцание: переливается и искрит
    const t = GS.elapsed * 6 + e.phase, spark = Math.random() < 0.07 ? 1 : 0;
    if (e.awake) {
      e.matAwake.color.setHSL((0.84 + 0.08 * Math.sin(t * 0.45)) % 1, 0.8, 0.2, THREE.SRGBColorSpace);
      e.matAwake.emissive.setHSL((0.8 + 0.12 * Math.sin(t)) % 1, 1, 0.5, THREE.SRGBColorSpace).multiplyScalar(0.015 + 0.045 * (0.5 + 0.5 * Math.sin(t * 2.3)) + spark * 0.9);
      e.hop.scale.x *= 1 + spark * 0.08;
    } else {
      e.matDormant.emissive.setHSL(0.1, 1, 0.5, THREE.SRGBColorSpace).multiplyScalar(0.02 + 0.09 * (0.5 + 0.5 * Math.sin(t)) + spark * 1.6);   // ящик, но подозрительно блестит
    }
  }

  function placeEnemy(e) {
    const [x, z] = freeSpot(e.s, 30);
    e.pos.set(x, 0, z); e.vel.set(0, 0, 0);
    e.hp = e.maxHp; e.awake = false; e.dead = false; e.open = 0; e.stun = 0;
    if (e.carried) releaseIfHeld(e);
    e.carried = false; e.root.rotation.set(0, 0, 0); e.root.position.y = 0;
    e.yaw = Math.round(rand(0, 4)) * Math.PI / 2;            // как обычный ящик
    e.root.visible = true;
    e.awakeParts.forEach(p => p.visible = false);
    setEnemyLook(e, e.matDormant);
    e.pivot.rotation.x = 0; e.hop.position.y = 0; e.hop.scale.set(1, 1, 1);
    e.root.position.copy(e.pos); e.root.rotation.y = e.yaw;
  }

  function wakeEnemy(e) {
    if (e.awake) return;
    SFX.play(e.elite ? 'growl_elite' : 'growl', e.pos);
    e.awake = true; e.wakeT = 0.45;
    e.awakeParts.forEach(p => p.visible = true);
    setEnemyLook(e, e.matAwake);
  }

  function hurtCar(dmg, dir) {
    if (!car.alive || car.burrow !== 'up') return;
    if (domes.length && inDome(car.pos.x, car.pos.z)) return;      // under a dome: untouchable
    if (haloHoly()) { if ((car.holyT || 0) < GS.elapsed) { car.holyT = GS.elapsed + 0.25; SFX.play('pickup', car.pos, { vol: 0.25, rate: 2 }); spawnParticles(tmp.set(car.pos.x, 2, car.pos.z), 0xffe9a8, 4, 6); } return; }   // swords out: untouchable
    car.hp -= dmg; car.lastHurt = GS.elapsed; GS.hurtFlash = 0.18; GS.shake = 0.6;
    if (car.hp > 0) crewSay(car.hp < car.maxHp * 0.35 ? 'lowhp' : 'hurt', 0.7);
    cartKick(5); cartFling(safeCount(cart.riders.length > 6 ? 2 : 1), 0);
    SFX.play('clang', car.pos);
    car.vel.x += dir.x * 9; car.vel.z += dir.z * 9; car.speed *= 0.4;      // sideways shove only: a shot coming down at an angle must not push the ride into the ground
    if (car.hp <= 0) {
      car.hp = 0; car.alive = false; car.deadTimer = 2.2; crewSay('dead', 1, true); deathToll();
      carGroup.visible = false;
      spawnParticles(tmp.copy(car.pos).setY(1), 0xc26a30, 22, 12);
      flash(tmp, 0xff9040, 14, 0.4, 4); burst(tmp, 0x3a3634, 10, 2.6, 5, 0.55);
      spawnParticles(tmp.copy(car.pos).setY(1), 0xff9a3c, 14, 10);
      GS.shake = 1.2; SFX.play('explode', car.pos);
      document.getElementById('dead').style.display = 'flex';
    }
  }

  function pushOutOfBox(pos, r, o) {
    const p = o.mesh.position;
    const cx = THREE.MathUtils.clamp(pos.x, p.x - o.hx, p.x + o.hx);
    const cz = THREE.MathUtils.clamp(pos.z, p.z - o.hz, p.z + o.hz);
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
    if (d >= r) return;
    if (d > 1e-4) { pos.x += dx / d * (r - d); pos.z += dz / d * (r - d); }
    else {
      const ox = o.hx - Math.abs(pos.x - p.x), oz = o.hz - Math.abs(pos.z - p.z);
      if (ox < oz) pos.x += (Math.sign(pos.x - p.x) || 1) * (ox + r);
      else pos.z += (Math.sign(pos.z - p.z) || 1) * (oz + r);
    }
  }

  const enemyQueue = [];
  GS.diggers = 0;
  function enemyBump(e) {                               // the car pushes against a cube, asleep or awake; ramming a sleeping one hurts it
    const dx = car.pos.x - e.pos.x, dz = car.pos.z - e.pos.z, dist = Math.hypot(dx, dz) || 1e-4, nx = dx / dist, nz = dz / dist, minD = car.radius + e.r;
    if (!(car.alive && car.depth < 0.3 && car.y < e.s * 0.8 && dist < minD)) return;
    const push = minD - dist, own = !NET.client, share = e.awake && own ? 0.5 : 1;
    car.pos.x += nx * push * share; car.pos.z += nz * push * share;
    if (e.awake && own) { e.pos.x -= nx * push * 0.5; e.pos.z -= nz * push * 0.5; }
    const vn = car.vel.x * -nx + car.vel.z * -nz;
    if (!e.awake && vn > RAM_SPEED && (e.ramT || 0) < GS.elapsed) {          // протаранили «ящик» — а он живой
      e.ramT = GS.elapsed + 0.5;
      hitEnemy(e, tmp.set(-nx, 0, -nz), 1, 14); SFX.play('hit_flesh', e.pos);
      e.stun = 0.6; GS.shake = Math.max(GS.shake, 0.3);
      car.speed *= 0.7;
    } else if (vn > 0) { car.vel.x += nx * vn; car.vel.z += nz * vn; car.speed *= 0.6; }
  }
  function enemyMirror(e, dt) {                         // a guest's copy of a host cube: glide to where the host says, animate the rest here
    if (e.tx == null) { e.tx = e.pos.x; e.tz = e.pos.z; e.tyaw = e.yaw; }
    const k = 1 - Math.exp(-10 * dt);
    if (Math.abs(e.tx - e.pos.x) + Math.abs(e.tz - e.pos.z) > 20) { e.pos.x = e.tx; e.pos.z = e.tz; } else { e.pos.x += (e.tx - e.pos.x) * k; e.pos.z += (e.tz - e.pos.z) * k; }
    if (e.elite) flickerElite(e);
    e.root.position.set(e.pos.x, e.hostCarry ? 1.6 : 0, e.pos.z);
    if (!e.awake) { e.hop.scale.y = 1 + Math.sin(GS.elapsed * 2.2 + e.phase) * 0.025; e.root.rotation.y = e.yaw; return; }
    e.yaw = angLerp(e.yaw, e.tyaw, Math.min(1, 10 * dt)); e.root.rotation.y = e.yaw;
    e.phase += dt * 9;
    const h = Math.abs(Math.sin(e.phase)); e.wakeT = Math.max(0, e.wakeT - dt);
    const surprise = e.wakeT > 0 ? Math.sin((1 - e.wakeT / 0.45) * Math.PI) * 2.2 : 0;
    e.hop.position.y = h * 0.55 + surprise;
    const squash = 1 - (1 - h) * 0.18; e.hop.scale.set(1 + (1 - squash) * 0.6, squash, 1 + (1 - squash) * 0.6);
    e.open += ((e.topen == null ? 0.25 : e.topen) - e.open) * Math.min(1, 14 * dt); e.pivot.rotation.x = -e.open;
    e.flash -= dt; setEnemyLook(e, e.flash > 0 ? enemyFlash : e.matAwake);
  }
  function enemyDieFx(e) {
    spawnParticles(tmp.copy(e.pos).setY(1), e.elite ? 0xd040a0 : 0xc8323c, e.elite ? 30 : 18, e.elite ? 12 : 10);
    flash(tmp, e.elite ? 0xff40c8 : 0xff4a30, e.elite ? 10 : 5.5, e.elite ? 0.32 : 0.22, 2.2); burst(tmp, e.elite ? 0x70305f : 0x5a2a2a, e.elite ? 9 : 5, 1.8, 4);
    spawnParticles(tmp.copy(e.pos).setY(1), 0xf4f1e8, 6, 8);
    SFX.play(e.elite ? 'elite_die' : 'biter_die', e.pos);
  }
  function updateEnemies(dt) {
    GS.diggers = 0;
    for (let ei = 0; ei < enemies.length; ei++) {
      const e = enemies[ei];
      if (NET.client) { if (!!e.carried !== !!e.gSent) { e.gSent = !!e.carried; e.tx = e.pos.x; e.tz = e.pos.z; netEv({ t: 'eg', i: ei, c: e.carried ? 1 : 0, x: r1(e.pos.x), z: r1(e.pos.z) }, NET.hostPeer); } }
      if (e.dead || e.carried) continue;
      enemyBump(e);                                     // my ride shoves against it, whoever runs it
      if (NET.client) { enemyMirror(e, dt); continue; }  // a guest only shows what the host's cubes do
      e.ramCd -= dt;
      if ((e.think = (e.think || 0) - dt) <= 0) { e.think = 0.3 + Math.random() * 0.2; e.tgt = netPick(e); }
      const T = e.tgt && e.tgt.up && NET.remotes.get(e.tgt.peer) === e.tgt ? e.tgt.tc : car, mine = T === car, seen = mine ? carSeen() : T.alive;
      const dx = T.pos.x - e.pos.x, dz = T.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      const nx = dx / dist, nz = dz / dist;
      const minD = car.radius + e.r;

      if (e.elite) flickerElite(e);
      if (!e.awake) {
        e.hop.scale.y = 1 + Math.sin(GS.elapsed * 2.2 + e.phase) * 0.025;   // еле заметно дышит
        if (seen && dist < WAKE_DIST) wakeEnemy(e);
        continue;
      }

      // погоня
      let tx = 0, tz = 0;
      const hunting = mine && e.elite && car.alive && !carSeen();               // архизлюка лезет к норе откапывать
      const scared = mine && car.alive && !carSeen() && !e.elite;
      let digging = false;
      const preyC = !hunting && (dist > 16 || !seen) ? groundChubNear(e.pos, 20) : null;
      if (preyC) { const px = preyC.pos.x - e.pos.x, pz = preyC.pos.z - e.pos.z, pd = Math.hypot(px, pz) || 1; tx = px / pd * e.speed; tz = pz / pd * e.speed; }
      else if (seen) { tx = nx * e.speed; tz = nz * e.speed; }
      else if (hunting) {
        if (dist > car.radius + e.r + 0.4) { tx = nx * e.speed; tz = nz * e.speed; }
        else if (e.stun <= 0) { digging = true; GS.diggers++; e.vel.multiplyScalar(0.8); }
      }
      else if (scared && dist < 42) {                                   // разбегаются от норы
        const jit = Math.sin(e.phase * 0.37 + e.s * 10) * 0.6;          // каждый в свою сторону
        const ax = -nx * Math.cos(jit) + nz * Math.sin(jit), az = -nz * Math.cos(jit) - nx * Math.sin(jit);
        tx = ax * e.speed * 1.15; tz = az * e.speed * 1.15;
      }
      if (e.stun > 0) { e.stun -= dt; tx = tz = 0; }                    // оглушён после броска
      for (const o of enemies) {                                        // не слипаться
        if (o === e || o.dead || o.carried) continue;
        const sx = e.pos.x - o.pos.x, sz = e.pos.z - o.pos.z, sd = Math.hypot(sx, sz);
        if (sd < e.r + o.r + 0.6 && sd > 1e-4) { tx += sx / sd * 6; tz += sz / sd * 6; }
      }
      const k = Math.min(1, 3.2 * dt);
      e.vel.x += (tx - e.vel.x) * k; e.vel.z += (tz - e.vel.z) * k;
      e.pos.addScaledVector(e.vel, dt);
      for (const o of obstacles) if (active(o)) pushOutOfBox(e.pos, e.r, o);
      const sh = shield();
      if (sh) {                                                         // щит на буре — сквозь него не пройти
        const sx = e.pos.x - sh.x, sz = e.pos.z - sh.z, sd = Math.hypot(sx, sz) || 1e-4, minS = e.r + sh.r;
        if (sd < minS) { e.pos.x = sh.x + sx / sd * minS; e.pos.z = sh.z + sz / sd * minS; }
      }
      const lim = ARENA - 1 - e.r;
      e.pos.x = THREE.MathUtils.clamp(e.pos.x, -lim, lim);
      e.pos.z = THREE.MathUtils.clamp(e.pos.z, -lim, lim);

      // повернуться к машине (или от неё, если удирает)
      const want = scared ? Math.atan2(e.vel.x, e.vel.z) : Math.atan2(nx, nz);
      let dy = want - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.yaw += dy * Math.min(1, 7 * dt);

      // прыжки + сплющивание
      e.phase += dt * 9;
      const h = Math.abs(Math.sin(e.phase));
      e.wakeT = Math.max(0, e.wakeT - dt);
      const surprise = e.wakeT > 0 ? Math.sin((1 - e.wakeT / 0.45) * Math.PI) * 2.2 : 0;
      e.hop.position.y = h * 0.55 + surprise;
      const squash = 1 - (1 - h) * 0.18;
      e.hop.scale.set(1 + (1 - squash) * 0.6, squash, 1 + (1 - squash) * 0.6);

      // чавканье
      const targetOpen = e.charge > 0 ? 0.95 : digging ? 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(GS.elapsed * 22 + e.phase)) : scared ? 0.6 : !seen ? 0.1 : dist < 7 ? 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(GS.elapsed * 18 + e.phase)) : 0.18;
      e.open += (targetOpen - e.open) * Math.min(1, 14 * dt);
      e.pivot.rotation.x = -e.open;

      // укус
      e.biteCd -= dt;
      const shB = shield();
      const atShield = shB && Math.hypot(e.pos.x - shB.x, e.pos.z - shB.z) < e.r + shB.r + 0.35;
      if (atShield) {                                                   // упёрлась в щит — грызёт его
        if (e.biteCd <= 0) { e.biteCd = 0.8; chewShield(e); }
      } else if (T.alive && T.burrow === 'up' && T.y < 1 && dist < minD + 0.35 && e.biteCd <= 0) {
        e.biteCd = 0.8;
        SFX.play('chomp', e.pos);
        if (mine) hurtCar(e.bite, tmp.set(nx, 0, nz).clone()); else netEv({ t: 'ehurt', i: ei, d: e.bite, x: r2(nx), z: r2(nz) }, T.R.peer);
        e.vel.set(-nx * 9, 0, -nz * 9);
        spawnParticles(tmp.copy(T.pos).setY(1.2), 0xc26a30, 4, 5);
      }

      // плевок пульками: короткий замах пастью, потом выстрел (у архизлюк — веер из трёх)
      if (e.charge > 0) {
        e.charge -= dt;
        if (e.charge <= 0) enemyShoot(e, nx, nz, T);
      } else {
        if (e.biteCd <= 0) { const c = groundChubNear(e.pos, e.r + 0.7); if (c) { e.biteCd = 0.6; eatChub(c, e); } }
        e.shotCd -= dt;
        if (e.shotCd <= 0 && e.stun <= 0 && e.wakeT <= 0) {
          const atCar = seen && dist > 3.5 && dist < 24 && !atShield;
          const perch = !atCar || Math.random() < 0.5 ? perchedNear(e.pos, 24) : null;     // sometimes they would rather snipe a chubzik off its rock
          if (atCar || perch) {
            e.shotCd = e.elite ? rand(2.2, 3) : rand(1.8, 2.8);
            e.charge = 0.32; e.shotAt = perch;
            SFX.play('growl', e.pos, { vol: 0.35, rate: e.elite ? 0.8 : 1.3 });
          } else e.shotCd = 0.5;
        }
      }

      e.flash -= dt;
      setEnemyLook(e, e.flash > 0 ? enemyFlash : e.matAwake);
      e.root.position.copy(e.pos);
      e.root.rotation.y = e.yaw;
    }

    updateEShots(dt);
    updateDig(dt);
    if (!NET.client) for (let i = enemyQueue.length - 1; i >= 0; i--) {
      enemyQueue[i].t -= dt;
      if (enemyQueue[i].t <= 0) { placeEnemy(enemyQueue[i].e); enemyQueue.splice(i, 1); }
    }
  }

  // ---- enemy shots: slow glowing globs you can dodge, block with a held shield, or hide behind cover from ----
  const eshots = [];
  const eshotGeo = new THREE.IcosahedronGeometry(0.34, 1);
  const eshotMat = [glow(new THREE.MeshBasicMaterial({ color: 0xff5a3a }), 3.2), glow(new THREE.MeshBasicMaterial({ color: 0xff4ad8 }), 3.6)];
  const eshotHalo = (() => {
    const c = mkCanvas(64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const eshotHaloMat = [0xff5a3a, 0xff4ad8].map(c => glow(new THREE.SpriteMaterial({ map: eshotHalo, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 1.6));
  function enemyShoot(e, nx, nz, T = car) {
    const tc = e.shotAt && e.shotAt.state === 'perch' ? e.shotAt : null; e.shotAt = null;
    if (e.dead || e.carried || (!T.alive && !tc)) return;
    const k = e.elite ? 1 : 0, speed = e.elite ? 13 : 15;
    if (tc) {                                          // one aimed shot at the rock
      const from = new THREE.Vector3(e.pos.x, e.hop.position.y + e.s * 0.45, e.pos.z), ax = tc.pos.x - from.x, az = tc.pos.z - from.z, ad = Math.hypot(ax, az) || 1;
      const m = new THREE.Mesh(eshotGeo, eshotMat[k]); m.position.copy(from); m.add(new THREE.Sprite(eshotHaloMat[k])); m.children[0].scale.setScalar(2.2); scene.add(m);
      eshots.push({ m, v: new THREE.Vector3(ax / ad * speed, (tc.pos.y + 0.5 - from.y) / (ad / speed), az / ad * speed), life: 2.4, dmg: 5, k, chub: tc });
      SFX.play('eshot', from, { rate: e.elite ? 0.85 : 1 });
      return;
    }
    // aim a little ahead of the car, red ones lead less so strafing works
    const lead = (e.elite ? 0.45 : 0.25) * Math.hypot(T.pos.x - e.pos.x, T.pos.z - e.pos.z) / speed;
    const ax = T.pos.x + T.vel.x * lead - e.pos.x, az = T.pos.z + T.vel.z * lead - e.pos.z, ad = Math.hypot(ax, az) || 1;
    const base = Math.atan2(ax / ad, az / ad);
    const from = new THREE.Vector3(e.pos.x + nx * e.s * 0.55, e.hop.position.y + e.s * 0.45, e.pos.z + nz * e.s * 0.55);
    netEv({ t: 'es', i: enemies.indexOf(e), a: r2(base), f: [r2(from.x), r2(from.y), r2(from.z)] });
    enemyVolley(e, from, base);
    e.vel.addScaledVector(tmp.set(-nx, 0, -nz), 3);                    // отдача
  }
  function enemyVolley(e, from, base) {
    const k = e.elite ? 1 : 0, speed = e.elite ? 13 : 15;
    for (const off of e.elite ? [-0.22, 0, 0.22] : [0]) {
      const a = base + off, m = new THREE.Mesh(eshotGeo, eshotMat[k]);
      m.position.copy(from); m.scale.setScalar(e.elite ? 1.15 : 1);
      const halo = new THREE.Sprite(eshotHaloMat[k]); halo.scale.setScalar(2.2); m.add(halo);
      scene.add(m);
      eshots.push({ m, v: new THREE.Vector3(Math.sin(a) * speed, 0, Math.cos(a) * speed), life: 2.4, dmg: e.elite ? 7 : 5, k });
    }
    flash(from, k ? 0xff4ad8 : 0xff6a3a, 2.4, 0.12, 2.5, false);
    SFX.play('eshot', from, { rate: e.elite ? 0.85 : 1 }); crewSay('eshot', 0.5);
  }
  const mobMats = {};
  // monsters' own shots, in the shooter's colour: 0 = one straight shard, 1 = a fan, 2 = a ring all round
  const MOB_PAT = { gremlin: 0, maw: 0, stilt: 0, spike: 0, gloopling: 0, flapper: 1, wingmaw: 1, jelly: 1, lamprey: 1, brute: 2, grubber: 2, gloop: 2, oculon: 2 };
  GS.mobShots = 0;                                      // small shards in the air right now: caps the whole thing
  const mobGeo = [(() => { const g = new THREE.OctahedronGeometry(0.3, 0); g.scale(0.55, 0.55, 2.1); return g; })(),      // 0: a dart
                  new THREE.TetrahedronGeometry(0.42, 0),                                                              // 1: a tumbling barb
                  new THREE.IcosahedronGeometry(0.3, 1)];                                                              // 2: an orb
  const mobCol = new THREE.Color(), mobWhite = new THREE.Color(0xffffff);
  function mobLook(color, pat) {                         // bright core in the shooter's colour plus a soft halo, like the cubes' shots
    const k = color + '_' + pat; if (mobMats[k]) return mobMats[k];
    const core = glow(new THREE.MeshBasicMaterial({ color: mobCol.set(color).lerp(mobWhite, pat === 2 ? 0.25 : 0.45).getHex() }), pat === 2 ? 2.6 : 3.2);
    const halo = glow(new THREE.SpriteMaterial({ map: eshotHalo, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 1.3);
    return mobMats[k] = { core, halo };
  }
  function mobThrow(m, nx, nz, dist, pat = 0) {
    const L = mobLook(m.art.color, pat), weak = m.K.hp <= 1.5 && !m.K.heavy;                 // the little ones lob one slow dart
    const from = new THREE.Vector3(m.pos.x, (m.K.fly || 0) + m.K.size * 0.5, m.pos.z), base = Math.atan2(nx, nz);
    const n = pat === 2 ? 9 : pat === 1 ? (m.K.size > 4 ? 5 : 3) : 1, speed = pat === 2 ? 9.5 : pat === 1 ? 11.5 : weak ? 9.5 : 14, life = pat === 2 ? 1.5 : weak ? 2.2 : 1.7;
    for (let i = 0; i < n; i++) {
      const a = pat === 2 ? base + i / n * 6.283 : pat === 1 ? base + (i / (n - 1) - 0.5) * (n > 3 ? 0.9 : 0.6) : base + rand(-0.1, 0.1);
      const mesh = new THREE.Mesh(mobGeo[pat], L.core); mesh.position.copy(from); if (pat === 0) mesh.rotation.y = a;
      const halo = new THREE.Sprite(L.halo); halo.scale.setScalar(pat === 2 ? 2.0 : pat === 1 ? 1.6 : 1.5); mesh.add(halo); scene.add(mesh);
      eshots.push({ m: mesh, v: new THREE.Vector3(Math.sin(a) * speed, (1.0 - from.y) / (pat === 2 ? life : Math.max(0.3, dist / speed)), Math.cos(a) * speed), life, dmg: 2, k: 0, col: m.art.color, small: true, dart: pat === 0 });
    }
    SFX.play('spit', from, { vol: pat ? 0.5 : 0.35, rate: pat === 2 ? 1.1 : 1.6 });
  }
  function popEShot(i, color) {
    const s = eshots[i]; scene.remove(s.m); eshots.splice(i, 1);
    spawnParticles(s.m.position, color, 4, 5);
  }
  function updateEShots(dt) {
    const sh = shield();
    GS.mobShots = 0; for (const s of eshots) if (s.small) GS.mobShots++;
    for (let i = eshots.length - 1; i >= 0; i--) {
      const s = eshots[i], p = s.m.position;
      s.life -= dt; p.addScaledVector(s.v, dt);
      if (s.small) p.y = Math.max(0.8, p.y);
      else if (!s.chub) p.y = Math.max(0.9, p.y - dt * 0.6);
      else if (s.chub.state !== 'perch') s.chub = null;
      else if (Math.hypot(p.x - s.chub.pos.x, p.z - s.chub.pos.z) < 0.9) { knockOff(s.chub, s.v.x, s.v.z); popEShot(i, s.k ? 0xff4ad8 : 0xff6a3a); continue; }
      if (s.dart) s.m.rotation.z += dt * 14; else { s.m.rotation.x += dt * 9; s.m.rotation.y += dt * 7; }
      const col = s.col || (s.k ? 0xff4ad8 : 0xff6a3a);
      if (s.life <= 0 || !inWorld(p.x, p.z)) { popEShot(i, col); continue; }
      if (sh && Math.hypot(p.x - sh.x, p.z - sh.z) < sh.r + 0.35) {     // щит ловит пульки
        const h = sh.h; h.shieldHp -= s.dmg * 0.5;
        if (h.kind === 'crate') h.ref.flash = 0.08;
        SFX.play(h.kind === 'crate' ? 'hit_wood' : 'hit_flesh', p, { vol: 0.6 });
        if (h.shieldHp <= 0) { if (h.kind === 'crate') damageCrate(h.ref, 99); else hitEnemy(h.ref, tmp.set(0, 0, 0), 999, 0); }
        popEShot(i, col); continue;
      }
      if (car.alive && car.depth < 0.3 && car.y < 1.8 && Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < car.radius * 0.85 + 0.3) {
        hurtCar(s.dmg, tmp.set(s.v.x, 0, s.v.z).normalize().multiplyScalar(0.3).clone());
        flash(p, col, 3, 0.15, 2.5, false); popEShot(i, col); continue;
      }
      let blocked = false;
      for (const o of obstacles) {
        if (!active(o) || o.carried || (s.chub && o === s.chub.rock)) continue;
        const q = o.mesh.position;
        if (Math.abs(p.x - q.x) < o.hx + 0.2 && Math.abs(p.z - q.z) < o.hz + 0.2 && p.y < (o.h || 3) + 0.2) { blocked = true; break; }
      }
      if (blocked) { SFX.play('hit_dirt', p, { vol: 0.5 }); popEShot(i, col); }
    }
  }
  function clearEShots() { for (const s of eshots) scene.remove(s.m); eshots.length = 0; }

  function hitEnemy(e, dir, dmg = 1, push = 4) {
    if (NET.client) { e.flash = 0.07; e.myHit = GS.elapsed; netEv({ t: 'eh', i: enemies.indexOf(e), d: Math.min(9999, dmg), x: dir ? r2(dir.x) : 0, z: dir ? r2(dir.z) : 0, p: push }, NET.hostPeer); return; }
    wakeEnemy(e);
    e.hp -= dmg; if (e.flash < -0.06) e.flash = 0.07;   // мигает, а не горит белым при постоянном уроне
    e.vel.addScaledVector(dir, push);
    if (e.hp <= 0 && !e.dead) {
      if (e.carried) { releaseIfHeld(e); e.carried = false; }
      e.dead = true; e.root.visible = false;
      enemyDieFx(e);
      if (!NET.applying) { GS.enemyKills++; ekillsEl.textContent = GS.enemyKills; crewKill(e.elite); myKill(e.pos.x, e.pos.z, 3); lootFrom(e.elite ? 'elite' : 'enemy', e.pos.x, e.pos.z); }
      if (e.elite) { dropLoot(e.pos); GS.shake = Math.max(GS.shake, 0.5); }
      enemyQueue.push({ e, t: e.elite ? 8 : 5 });
    }
  }
  for (let i = 0; i < RED_COUNT; i++) makeEnemy(false);
  for (let i = 0; i < ELITE_COUNT; i++) makeEnemy(true);

  // ---------- collision helpers ----------
  const RAM_SPEED = 7;   // скорость сближения, с которой ящик сносится, а не держит
  function resolveCarVsRock(o) {                      // a nest never breaks and never stops the ride: it glances off and slides around it
    const p = o.mesh.position, R = o.r * 0.95 + car.radius;
    let dx = car.pos.x - p.x, dz = car.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d >= R) return;
    if (d < 1e-3) { dx = -Math.sin(car.heading); dz = -Math.cos(car.heading); d = 1; }
    const nx = dx / d, nz = dz / d; car.pos.x += nx * (R - d); car.pos.z += nz * (R - d);
    const vn = car.vel.x * nx + car.vel.z * nz; if (vn >= 0) return;
    const dir = Math.sign(car.speed || 1), fx = Math.sin(car.heading) * dir, fz = Math.cos(car.heading) * dir;      // where the ride is actually going
    const tx = -nz, tz = nx, ft = fx * tx + fz * tz, into = Math.max(0, -(fx * nx + fz * nz));
    if (Math.abs(ft) > 0.08) o.side = Math.sign(ft); else if (!o.side) o.side = Math.random() < 0.5 ? -1 : 1;     // dead centre: pick a side and keep it
    const sx = tx * o.side, sz = tz * o.side;
    car.vel.x -= nx * vn * 1.15; car.vel.z -= nz * vn * 1.15;                     // a small bounce off the rock...
    car.vel.x += sx * -vn * 0.6; car.vel.z += sz * -vn * 0.6;                     // ...and most of the push turned into sliding along it
    let turn = Math.atan2(sx, sz) - Math.atan2(fx, fz); turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    car.heading += THREE.MathUtils.clamp(turn, -1, 1) * Math.min(1, 0.05 + into * 0.16);      // the nose swings round the rock
    car.speed *= 1 - into * 0.22;
    if (-vn > PILLAR_RAM) { cartKick(4); cartSpill(1); SFX.play('land', car.pos, { vol: 0.5, rate: 0.8 }); }
    GS.shake = Math.max(GS.shake, Math.min(0.18, -vn * 0.008));
  }
  function resolveCarVsBox(o) {
    if (o.rock) return resolveCarVsRock(o);
    const p = o.mesh.position;
    const cx = THREE.MathUtils.clamp(car.pos.x, p.x - o.hx, p.x + o.hx);
    const cz = THREE.MathUtils.clamp(car.pos.z, p.z - o.hz, p.z + o.hz);
    const dx = car.pos.x - cx, dz = car.pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= car.radius * car.radius) return;
    let nx, nz, d = Math.sqrt(d2);
    if (d > 1e-4) { nx = dx / d; nz = dz / d; }
    else { // centre inside the box — push out along the shallow axis
      const ox = o.hx - Math.abs(car.pos.x - p.x), oz = o.hz - Math.abs(car.pos.z - p.z);
      if (ox < oz) { nx = Math.sign(car.pos.x - p.x) || 1; nz = 0; } else { nx = 0; nz = Math.sign(car.pos.z - p.z) || 1; }
      d = 0;
    }
    const vn = car.vel.x * nx + car.vel.z * nz;
    if (o.pillar && -vn > PILLAR_RAM) {              // влетели в столб — он разлетается на куски
      smashPillar(o, car.vel); cartKick(4); cartSpill(1);
      car.speed *= 0.8; car.vel.multiplyScalar(0.85);
      return;
    }
    if (o.crate && -vn > RAM_SPEED) {                // влетели в ящик — сносим
      damageCrate(o, 99);
      const sp = Math.hypot(car.vel.x, car.vel.z) || 1;
      for (let i = 0; i < 8; i++) {                  // щепки летят по ходу движения
        spawnParticles(p, 0xd2873c, 1, 5);
        particles[particles.length - 1].v.addScaledVector(car.vel, 0.6 / sp * 12);
      }
      car.speed *= 0.85; car.vel.multiplyScalar(0.9);
      GS.shake = Math.max(GS.shake, 0.3);
      return;
    }
    const push = car.radius - d;
    car.pos.x += nx * push; car.pos.z += nz * push;
    if (vn < 0) {
      if (-vn > 11) { cartKick(4); cartSpill(-vn > 19 ? 2 : 1); }
      car.vel.x -= nx * vn * 1.4; car.vel.z -= nz * vn * 1.4;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const into = -(fx * nx + fz * nz);        // how head-on the hit is
      car.speed *= 1 - Math.max(0, car.speed >= 0 ? into : -into) * 0.85;
    }
  }

  // ---------- smashable pillars: ram one and it bursts into heavy chunks that mow through the small stuff ----------
  const PILLAR_RAM = 6;
  const chunks = [];
  const chunkGeos = [new THREE.TetrahedronGeometry(1, 0), new THREE.BoxGeometry(1.3, 1, 1.1), new THREE.DodecahedronGeometry(0.9, 0)];
  GS.pillarsSmashed = 0;
  function smashPillar(o, vel) {
    if (!o.mesh.visible || o.rock) return;              // nests are unbreakable
    o.mesh.visible = false; GS.pillarsSmashed++;
    if (!NET.applying) netEv({ t: 'smash', i: obstacles.indexOf(o), vx: r1(vel.x), vz: r1(vel.z) });
    if (o.rock) rockSmashed(o);
    const chunkMat = o.rock ? rockMat : pillarMat;
    const p = o.mesh.position, sp = Math.hypot(vel.x, vel.z) || 1, dx = vel.x / sp, dz = vel.z / sp;
    const n = Math.round(7 + o.h * 0.8);
    for (let i = 0; i < n; i++) {
      const r = rand(0.45, 0.95) * (i < 3 ? 1.25 : 1);
      const m = new THREE.Mesh(chunkGeos[i % 3], chunkMat); m.scale.setScalar(r); m.castShadow = true;
      m.position.set(p.x + rand(-o.hx, o.hx) * 0.7, rand(0.5, o.h * 0.9), p.z + rand(-o.hz, o.hz) * 0.7);
      m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6)); scene.add(m);
      const a = rand(-0.75, 0.75), ca = Math.cos(a), sa = Math.sin(a), v = Math.min(30, sp) * rand(0.7, 1.35) + 4;
      chunks.push({ m, r, v: new THREE.Vector3((dx * ca - dz * sa) * v, rand(2, 8), (dz * ca + dx * sa) * v), spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: 7, hit: new Set() });
    }
    tmp.set(p.x, 1.5, p.z);
    burst(tmp, 0x9a958c, 10, 2.6, 6, 0.5); spawnParticles(tmp, 0xb4b8c2, 16, 10); flash(tmp, 0xfff0d0, 5, 0.15, 1.6, false);
    GS.shake = Math.max(GS.shake, 0.55); SFX.play('hit_stone', p, { vol: 1 }); SFX.play('crate_break', p, { rate: 0.6 });
    crewSay('smash', 0.6);
  }
  const chunkDir = new THREE.Vector3();
  function updateChunks(dt) {
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i], p = c.m.position;
      c.life -= dt;
      c.v.y -= 30 * dt; p.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      const floor = c.r * 0.55;
      if (p.y < floor) {                               // bounce, then skid to a stop
        p.y = floor;
        if (c.v.y < -4) { c.v.y *= -0.35; SFX.play('hit_stone', p, { vol: 0.35 }); } else c.v.y = 0;
        const f = Math.max(0, 1 - 3.2 * dt); c.v.x *= f; c.v.z *= f; c.spin.multiplyScalar(f);
      }
      if (!inWorld(p.x, p.z)) { c.v.x *= -0.4; c.v.z *= -0.4; p.x = THREE.MathUtils.clamp(p.x, -ARENA + 1.5, Math.max(ARENA - 1.5, p.x - 1)); p.z = THREE.MathUtils.clamp(p.z, -ARENA + 1.5, ARENA - 1.5); }
      const sp = Math.hypot(c.v.x, c.v.z);
      if (sp > 4) {                                    // still dangerous
        chunkDir.set(c.v.x / sp, 0, c.v.z / sp);
        for (const m of swarm) {
          if (m.dead || c.hit.has(m) || Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > c.r + m.r + 0.2 || p.y > critterTop(m) + c.r) continue;
          c.hit.add(m);
          if (m.K.heavy) { hitCritter(m, 2, chunkDir, 40); c.v.x *= 0.5; c.v.z *= 0.5; }        // big ones just get shoved
          else hitCritter(m, 99, chunkDir, 6);
          SFX.play('hit_flesh', p, { vol: 0.7 });
        }
        for (const e of enemies) {
          if (e.dead || e.carried || c.hit.has(e) || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > c.r + e.r || p.y > e.s + c.r) continue;
          c.hit.add(e);
          hitEnemy(e, chunkDir, 1, e.elite ? 12 : 18); e.stun = Math.max(e.stun, 0.5);
          c.v.x *= 0.45; c.v.z *= 0.45; SFX.play('hit_flesh', p, { vol: 0.7 });
          spawnParticles(tmp.copy(p), 0xb4b8c2, 4, 6);
        }
        for (const o of obstacles) {                   // chunks also knock through crates and chain into other pillars
          if (!active(o) || o.wall || o.boss) continue;
          const q = o.mesh.position;
          if (Math.abs(p.x - q.x) > o.hx + c.r * 0.6 || Math.abs(p.z - q.z) > o.hz + c.r * 0.6 || p.y > o.h + c.r) continue;
          if (o.crate) damageCrate(o, 99);
          else if ((o.pillar || o.rock) && sp > 16 && c.r > 0.8) smashPillar(o, c.v);
          else { c.v.x *= -0.3; c.v.z *= -0.3; }
        }
      }
      if (c.life < 1) c.m.scale.setScalar(c.r * Math.max(0.01, c.life));
      if (c.life <= 0) { scene.remove(c.m); chunks.splice(i, 1); }
    }
  }

  // ---------- drill logic ----------
  let drillRPM = 0, drillSparkT = 0;
  function crateSpot(o) {                                // where a broken crate comes back: derived from the crate and its respawn count, so every player gets the same spot
    o.rc = (o.rc || 0) + 1; let s = (SEED + obstacles.indexOf(o) * 9973 + o.rc * 131) >>> 0, x = 0, z = 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    for (let k = 0; k < 40; k++) {
      x = (rnd() * 2 - 1) * (ARENA - 6); z = (rnd() * 2 - 1) * (ARENA - 6);
      if (!obstacles.some(q => q !== o && q.mesh.visible && Math.abs(q.mesh.position.x - x) < q.hx + o.hx + 1 && Math.abs(q.mesh.position.z - z) < q.hz + o.hx + 1)) break;
    }
    return [x, z];
  }
  function damageCrate(o, dmg) {
    o.hp -= dmg; o.flash = 0.06;
    if (o.hp <= 0 && o.mesh.visible) {
      if (o.carried) { releaseIfHeld(o); o.carried = false; }
      o.mesh.visible = false;
      spawnParticles(o.mesh.position, 0xd2873c, 16, 9); SFX.play('crate_break', o.mesh.position);
      flash(o.mesh.position, 0xffb060, 4.5, 0.18, 1.6, false); burst(o.mesh.position, 0xa08a6a, 5, 1.6, 3.5, 0.35);
      GS.kills++; killsEl.textContent = GS.kills; crateDrop(o); if (!NET.applying) { myKill(o.mesh.position.x, o.mesh.position.z, 3); lootFrom('crate', o.mesh.position.x, o.mesh.position.z); }
      respawnQueue.push({ o, t: 4 });
      if (!o.room) netEv({ t: 'crate', i: obstacles.indexOf(o) });
    }
  }
  // попадает ли круг (x,z,r) в арку 180° перед машиной
  const DRILL_ARC_R = DRILL_REACH;
  const drillRMul = () => abLv.drill >= 2 ? 1.35 : 1;
  function inDrillArc(x, z, r) {
    const dx = x - car.pos.x, dz = z - car.pos.z;
    const along = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    return Math.hypot(dx, dz) - r < DRILL_ARC_R * drillRMul() && along > -r * 0.6;
  }
  let drillCyc = 0;
  function drillAuto(dt) {                                 // on for a moment each cycle, half a cycle away from the nova burst
    const D = 1.0 + (abLv.drill >= 1 ? 0.5 : 0);
    if (weapons.nova) { const C = W_STATS.nova.cd[weapons.nova - 1]; return Math.abs(GS.novaT - C / 2) < Math.min(C * 0.4, D / 2) && threatNear(16); }
    drillCyc = (drillCyc + dt) % 2.4; return drillCyc < D && threatNear(16);
  }
  // подсветка арки на земле
  const arcFillMat = glow(new THREE.MeshBasicMaterial({ color: 0xff8c32, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 1.6);
  const arcEdgeMat = new THREE.MeshBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0, depthWrite: false });
  const drillArc = new THREE.Group();
  {
    const fill = new THREE.CircleGeometry(DRILL_ARC_R, 48, Math.PI, Math.PI); fill.rotateX(-Math.PI / 2);
    const edge = new THREE.RingGeometry(DRILL_ARC_R - 0.22, DRILL_ARC_R, 48, 1, Math.PI, Math.PI); edge.rotateX(-Math.PI / 2);
    drillArc.add(new THREE.Mesh(fill, arcFillMat), new THREE.Mesh(edge, arcEdgeMat));
    // бегущие по арке полоски
    for (let i = 0; i < 3; i++) {
      const g = new THREE.RingGeometry(0.93, 1, 48, 1, Math.PI, Math.PI); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, glow(new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), 3));
      m.userData.phase = i / 3; drillArc.add(m);
    }
  }
  drillArc.visible = false; scene.add(drillArc);

  function updateDrill(dt) {
    const on = abilities.drill && GS.ride === 'buggy' && car.alive && car.burrow === 'up' && drillAuto(dt);
    drillRPM += ((on ? 1 : 0) - drillRPM) * Math.min(1, (on ? 5 : 2) * dt);
    drillSpin.rotation.z += drillRPM * 45 * dt;
    SFX.loop('drill', drillRPM > 0.02 ? 0.12 + 0.3 * drillRPM : 0, 0.45 + 0.75 * drillRPM);
    if (drillRPM < 0.55) SFX.loop('grind', 0, 1);
    drill.position.x = drillRPM > 0.3 ? rand(-0.03, 0.03) * drillRPM : 0;   // вибрация

    // арка: видна, пока бур крутится, ярче на полных оборотах
    drillArc.visible = drillRPM > 0.05 && car.alive;
    if (drillArc.visible) {
      drillArc.position.set(car.pos.x, 0.04, car.pos.z);
      drillArc.rotation.y = car.heading; drillArc.scale.setScalar(drillRMul());
      const k = Math.min(1, drillRPM / 0.55);
      arcFillMat.opacity = 0.2 * k + (drillRPM >= 0.55 ? 0.04 * Math.sin(GS.elapsed * 20) : 0);
      arcEdgeMat.opacity = 0.75 * k;
      for (const m of drillArc.children) if (m.userData.phase !== undefined) {
        const t = (GS.elapsed * 1.6 + m.userData.phase) % 1;               // полоска бежит от машины к краю
        const rad = 1 + t * (DRILL_ARC_R - 1.2);
        m.scale.set(rad, 1, rad);
        m.material.opacity = 0.35 * k * (1 - t);
      }
    }
    if (drillRPM < 0.55) { drillMat.emissive.setHex(0); return; }

    const dmg = DRILL_DPS * dt * drillRPM * (abLv.drill >= 2 ? 1.5 : 1);
    let grinding = false;
    drillSparkT -= dt;
    const spark = drillSparkT <= 0;
    if (spark) drillSparkT = 0.05;
    const tipPos = new THREE.Vector3(), away = new THREE.Vector3();

    for (const e of enemies) {
      if (e.dead || (e.carried && !(grab.held && grab.held.ref === e)) || !inDrillArc(e.pos.x, e.pos.z, e.r)) continue;
      grinding = true;
      away.set(e.pos.x - car.pos.x, 0, e.pos.z - car.pos.z).normalize();
      hitEnemy(e, away, dmg, 26 * dt);          // dmg дробный, отталкивает от машины
      e.biteCd = Math.max(e.biteCd, 0.25);      // пока в арке — не кусается
      if (spark) spawnParticles(tipPos.copy(e.pos).setY(1 + rand(0, 0.8)), Math.random() < 0.5 ? 0xc8323c : 0xffd27a, 2, 6);
    }
    for (const m of swarm) {
      if (m.dead || !inDrillArc(m.pos.x, m.pos.z, m.r)) continue;
      grinding = true;
      away.set(m.pos.x - car.pos.x, 0, m.pos.z - car.pos.z).normalize();
      m.cd = Math.max(m.cd, 0.25);
      if (spark) spawnParticles(tipPos.copy(m.pos).setY(1 + rand(0, 0.8)), m.art.color, 2, 6);
      hitCritter(m, dmg * 1.5, away, 30 * dt);
    }
    for (const o of obstacles) {
      if (!o.mesh.visible || o.wall || o.disabled || (o.carried && !(grab.held && grab.held.ref === o))) continue;
      const p = o.mesh.position, r = Math.max(o.hx, o.hz);
      if (!inDrillArc(p.x, p.z, r)) continue;
      away.set(p.x - car.pos.x, 0, p.z - car.pos.z).normalize();
      if (o.boss) { grinding = true; bossDamage(dmg * 2); }
      else if (o.crate) { grinding = true; damageCrate(o, dmg); }
      else if (Math.hypot(p.x - car.pos.x, p.z - car.pos.z) - r > 3.5) continue;   // дальние столбы не искрят
      else grinding = true;
      if (spark) spawnParticles(tipPos.copy(p).setY(0.8 + rand(0, 0.6)).addScaledVector(away, -r),
                                o.crate ? 0xd2873c : 0xffe08a, 2, 7);
    }
    drillMat.emissive.setHex(grinding ? 0xff4a00 : 0x000000);
    arcEdgeMat.color.setHex(grinding ? 0xffe9b0 : 0xffc06a).multiplyScalar(3.5);
    if (grinding) { GS.shake = Math.max(GS.shake, 0.18); car.speed *= 1 - 1.5 * dt; }
    SFX.loop('grind', grinding ? 0.4 * drillRPM : 0, 0.9 + 0.2 * drillRPM);
  }

  // ---------- grabber logic ----------
  // Рука на мачте у правого переднего угла, сама поворачивается в курсор. Цель ищет в конусе
  // вокруг направления на курсор (берёт ближайшую к курсору), хватает и тянет на бур.
  const ARM_MIN = 0.35, ARM_MAX = 16, ARM_SPEED = 70, PULL_SPEED = 30, HOLD_Y = 1.15, G = 26;
  const ARM_CONE = THREE.MathUtils.degToRad(13 * 2.5);   // ±32.5° вокруг направления на курсор
  const CLAW_REACH = 0.85;                                   // от основания клешни до кончиков пальцев
  const grab = { state: 'idle', len: ARM_MIN, open: 0.15, yaw: Math.PI / 2, held: null, target: null };
  const thrown = [];
  const holdPos = new THREE.Vector3(), armW = new THREE.Vector3(), restDir = new THREE.Vector3();

  function toWorld(lx, lz, out) {                            // координаты машины → мир
    const c = Math.cos(car.heading), sn = Math.sin(car.heading);
    return out.set(car.pos.x + lx * c + lz * sn, 0, car.pos.z - lx * sn + lz * c);
  }
  function yawToward(x, z) {                                 // arm.rotation.y (в осях кузова), чтобы рука смотрела в точку
    const rel = Math.atan2(x - armW.x, z - armW.z) - car.heading;
    return Math.atan2(Math.cos(rel), -Math.sin(rel));
  }

  // маркер над целью
  const targetMarker = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.95, 4),
    glow(new THREE.MeshBasicMaterial({ color: 0xffb347 }), 3));
  targetMarker.rotation.x = Math.PI; scene.add(targetMarker);

  function releaseIfHeld(ref) {
    if (grab.held && grab.held.ref === ref) { grab.held = null; grab.state = 'retract'; }
    if (grab.target && grab.target.ref === ref) grab.target = null;
    for (let i = thrown.length - 1; i >= 0; i--) if (thrown[i].ref === ref) thrown.splice(i, 1);
  }

  const tgtPos = t => t.kind === 'enemy' ? t.ref.pos : t.ref.mesh.position;
  const tgtValid = t => t && (t.kind === 'enemy' ? !t.ref.dead && !t.ref.carried : active(t.ref));

  function findCandidate() {
    let best = null, bestD = Infinity;
    const consider = (t, p) => {
      const dx = p.x - armW.x, dz = p.z - armW.z, d = Math.hypot(dx, dz);
      if (d - t.r > ARM_MAX + CLAW_REACH || d < 0.5) return;
      const cosA = (dx * restDir.x + dz * restDir.z) / d;
      const ang = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
      if (ang > ARM_CONE + Math.atan(t.r * 0.7 / d)) return;  // крупных ловит чуть шире
      const dc = Math.hypot(p.x - groundAim.x, p.z - groundAim.z) - t.r;   // ближе всего к курсору
      if (dc < bestD) { bestD = dc; best = t; }
    };
    for (const e of enemies) if (!e.dead && !e.carried) consider({ kind: 'enemy', ref: e, r: e.r, s: e.s }, e.pos);
    for (const o of obstacles) if (o.crate && active(o))
      consider({ kind: 'crate', ref: o, r: Math.max(o.hx, o.hz) * 1.2, s: o.h }, o.mesh.position);
    return best;
  }

  function placeHeld(h) {
    if (h.kind === 'enemy') {
      const e = h.ref;
      e.pos.set(holdPos.x, 0, holdPos.z);
      e.root.position.set(holdPos.x, holdPos.y - e.s / 2, holdPos.z);
      e.root.rotation.set(Math.sin(GS.elapsed * 25) * 0.15, car.heading + Math.PI, Math.sin(GS.elapsed * 19) * 0.15); // мордой к буру, дёргается
      e.hop.position.y = 0; e.hop.scale.set(1, 1, 1);
      e.open = 0.35 + 0.35 * Math.sin(GS.elapsed * 22);
      e.pivot.rotation.x = -e.open;
    } else {
      h.ref.mesh.position.copy(holdPos);
      h.ref.mesh.rotation.set(0, car.heading, 0);
    }
  }

  // бросок по баллистике точно в курсор; target=null — просто уронить
  function throwHeld(target) {
    const h = grab.held; if (!h) return;
    grab.held = null;
    const vel = new THREE.Vector3();
    if (target) {
      const dx = target.x - holdPos.x, dz = target.z - holdPos.z, dist = Math.hypot(dx, dz);
      const t = THREE.MathUtils.clamp(dist / 28, 0.2, 1.4);
      vel.set(dx / t, 0.5 * G * t - (holdPos.y - h.s / 2) / t, dz / t);
    }
    thrown.push({ ...h, pos: holdPos.clone(), vel, spin: rand(6, 12) * (Math.random() < 0.5 ? -1 : 1), rot: 0 });
    if (target) SFX.play('whoosh', holdPos);
  }

  function finishThrown(th, i) {
    thrown.splice(i, 1);
    if (th.marker) scene.remove(th.marker);
    if (!inWorld(th.pos.x, th.pos.z)) {
      const lim = ARENA - 1 - th.r;
      th.pos.x = THREE.MathUtils.clamp(th.pos.x, -lim, lim);
      th.pos.z = THREE.MathUtils.clamp(th.pos.z, -lim, lim);
    }
    GS.shake = Math.max(GS.shake, 0.35);
    if (th.kind === 'crate') {
      const o = th.ref;
      o.carried = false;
      o.mesh.position.set(th.pos.x, o.h / 2, th.pos.z); o.mesh.rotation.set(0, 0, 0);
      damageCrate(o, 99);                                   // ящик разлетается об землю
    } else {
      const e = th.ref;
      e.carried = false; e.stun = 1.1; e.biteCd = 1.2; e.vel.set(0, 0, 0);
      e.pos.set(th.pos.x, 0, th.pos.z);
      e.root.rotation.set(0, e.yaw, 0); e.root.position.set(e.pos.x, 0, e.pos.z);
      spawnParticles(tmp.copy(e.pos).setY(0.3), 0x8a8a78, 6, 6); SFX.play('land', e.pos);
      hitEnemy(e, tmp.set(th.vel.x, 0, th.vel.z).normalize(), 2, 0);
    }
  }

  function updateGrab(dt) {
    arm.updateWorldMatrix(true, false);
    arm.getWorldPosition(armW); armW.y = 0;
    restDir.set(groundAim.x - armW.x, 0, groundAim.z - armW.z);  // конус смотрит в курсор
    if (restDir.lengthSq() < 1e-4) restDir.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    restDir.normalize();
    if ((!car.alive || car.burrow !== 'up') && grab.held) { throwHeld(null); grab.state = 'retract'; }
    const want = abilities.grab && car.alive && car.burrow === 'up' && GS.rmb;
    let targetOpen = 0.15, aimYaw = yawToward(groundAim.x, groundAim.z);
    const cand = abilities.grab && car.alive && car.burrow === 'up' && (grab.state === 'idle' || grab.state === 'reach') ? findCandidate() : null;

    if (grab.state === 'idle') {
      grab.len += (ARM_MIN - grab.len) * Math.min(1, 10 * dt);
      grab.cd = (grab.cd || 0) - dt;
      if (want && grab.cd <= 0) { grab.state = 'reach'; grab.target = cand; SFX.play('tongue', armW); }
    }
    else if (grab.state === 'reach') {
      if (!tgtValid(grab.target)) grab.target = cand;   // цель пропала — наводимся на следующую
      targetOpen = 0.8;
      grab.len += ARM_SPEED * dt;
      const t = grab.target;
      if (t) {
        const p = tgtPos(t);
        const d = Math.hypot(p.x - armW.x, p.z - armW.z);
        aimYaw = yawToward(p.x, p.z);
        const need = d - t.r * 0.9 - CLAW_REACH;
        if (need > ARM_MAX) grab.target = null;                // уехала из досягаемости
        else if (grab.len >= need && t.kind === 'enemy' && t.ref.elite) {
          // архизлюку не схватить: огрызается и отшвыривает машину
          const e = t.ref;
          wakeEnemy(e);
          const ax = car.pos.x - e.pos.x, az = car.pos.z - e.pos.z, ad = Math.hypot(ax, az) || 1;
          car.vel.x += ax / ad * 24; car.vel.z += az / ad * 24; car.speed *= 0.2;
          if (!car.airborne && car.burrow === 'up') { car.vy = 6; car.airborne = true; car.usedDouble = true; car.popped = true; }
          e.open = 1; e.wakeT = 0.45; e.biteCd = Math.max(e.biteCd, 0.6);
          spawnParticles(tmp.set(e.pos.x, 2, e.pos.z), 0xd040a0, 14, 9);
          spawnParticles(new THREE.Vector3().copy(armW).addScaledVector(tmp.set(-ax / ad, 0, -az / ad), grab.len).setY(2), 0xffe08a, 6, 8);
          GS.shake = Math.max(GS.shake, 0.6);
          flashAlert('ARCH-BITER WON\'T BUDGE!'); SFX.play('zap', e.pos); SFX.play('growl_elite', e.pos, { delay: 0.05 });
          grab.target = null; grab.state = 'retract'; grab.cd = 1.2;
        }
        else if (grab.len >= need) {
          grab.len = Math.max(ARM_MIN, need);
          if (t.kind === 'enemy') wakeEnemy(t.ref);
          t.ref.carried = true;
          t.shieldMax = t.shieldHp = t.kind === 'crate' ? 60 : (t.ref.elite ? 90 : 50);
          grab.held = t; grab.target = null; grab.state = 'pull'; SFX.play('slap', p);
          holdPos.set(p.x, HOLD_Y, p.z);
          GS.shake = Math.max(GS.shake, 0.2);
        }
      }
      if (grab.state === 'reach' && (!want || grab.len >= ARM_MAX)) { grab.state = 'retract'; grab.target = null; }
    }
    else if (grab.state === 'retract') {
      grab.len -= ARM_SPEED * 0.8 * dt;
      if (grab.len <= ARM_MIN) { grab.len = ARM_MIN; grab.state = 'idle'; }
    }
    else if (grab.state === 'pull' || grab.state === 'hold') {
      const h = grab.held;
      // точка на буре: объект насажен на остриё
      const dest = toWorld(0, 3.4 + h.r * 0.7, tmp).setY(HOLD_Y + car.y + Math.sin(GS.elapsed * 9) * 0.05);   // прыгает вместе с машиной
      const step = PULL_SPEED * dt, gap = holdPos.distanceTo(dest);
      if (grab.state === 'hold' || gap <= step) { holdPos.copy(dest); grab.state = 'hold'; }
      else holdPos.addScaledVector(dest.sub(holdPos).normalize(), step);
      {                                                       // объезжает кузов, а не протаскивается сквозь
        const ox = holdPos.x - car.pos.x, oz = holdPos.z - car.pos.z, od = Math.hypot(ox, oz) || 1e-4;
        const minR = car.radius + h.r * 0.9;
        if (od < minR && grab.state === 'pull') { holdPos.x = car.pos.x + ox / od * minR; holdPos.z = car.pos.z + oz / od * minR; }
      }
      const d = Math.hypot(holdPos.x - armW.x, holdPos.z - armW.z);
      aimYaw = yawToward(holdPos.x, holdPos.z);
      grab.len = Math.max(ARM_MIN, d - h.r * 0.85 - CLAW_REACH * 0.7);
      targetOpen = 0.4;
      placeHeld(h);
      // тем, что на буре, можно таранить других злюк
      const sp = Math.hypot(car.vel.x, car.vel.z);
      for (const e of enemies) {
        if (e.dead || e.carried || e === h.ref || e.ramCd > 0) continue;
        const dx = e.pos.x - holdPos.x, dz = e.pos.z - holdPos.z, dd = Math.hypot(dx, dz) || 1e-4;
        if (dd < e.r + h.r) {
          e.ramCd = 0.4;
          hitEnemy(e, tmp.set(dx / dd, 0, dz / dd), sp > 6 ? 1.5 : 0.5, 6 + sp * 0.6);
          spawnParticles(tmp.copy(e.pos).setY(1), 0xffd27a, 4, 6); SFX.play('hit_flesh', e.pos);
          GS.shake = Math.max(GS.shake, 0.25);
        }
      }
      if (!want && grab.held) { throwHeld(car.alive ? groundAim : null); grab.state = 'retract'; }
    }

    // маркер цели
    const showT = grab.state === 'reach' && grab.target ? grab.target : (grab.state === 'idle' ? cand : null);
    targetMarker.visible = !!showT;
    if (showT) {
      const p = tgtPos(showT);
      targetMarker.position.set(p.x, showT.s + 1.3 + Math.sin(GS.elapsed * 6) * 0.15, p.z);
      targetMarker.rotation.y += dt * 4;
    }

    let dy = aimYaw - grab.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    grab.yaw += dy * Math.min(1, 18 * dt);
    arm.rotation.y = grab.yaw;
    grab.open += (targetOpen - grab.open) * Math.min(1, 14 * dt);
    armSeg.scale.x = grab.len;
    claw.position.x = -grab.len;
    for (const f of fingers) f.piv.rotation.y = f.side * grab.open;

    // летящие объекты
    for (let i = thrown.length - 1; i >= 0; i--) {
      const th = thrown[i];
      th.vel.y -= G * dt;
      th.pos.addScaledVector(th.vel, dt);
      th.rot += th.spin * dt;
      if (th.kind === 'crate') {
        th.ref.mesh.position.copy(th.pos);
        th.ref.mesh.rotation.set(th.rot, 0, th.rot * 0.6);
      } else {
        const e = th.ref;
        e.pos.set(th.pos.x, 0, th.pos.z);
        e.root.position.set(th.pos.x, th.pos.y - e.s / 2, th.pos.z);
        e.root.rotation.set(th.rot, e.yaw, th.rot * 0.5);
      }
      let impact = th.pos.y <= th.s / 2 || !inWorld(th.pos.x, th.pos.z);
      if (!impact && th.hostile && car.alive && car.depth < 0.3 &&            // ящик босса прилетел в нас
          Math.hypot(th.pos.x - car.pos.x, th.pos.z - car.pos.z) < car.radius + th.r * 0.8 && th.pos.y < car.y + 2.6) {
        hurtCar(18, tmp.set(th.vel.x, 0, th.vel.z).normalize().clone());
        impact = true;
      }
      const dir = tmp.set(th.vel.x, 0, th.vel.z).normalize().clone();
      if (!impact) for (const e of enemies) {
        if (e.dead || e.carried || e === th.ref) continue;
        if (Math.hypot(th.pos.x - e.pos.x, th.pos.z - e.pos.z) < th.r + e.r && th.pos.y < e.s + 0.6) {
          hitEnemy(e, dir, 3 * throwMul(), 14); SFX.play('hit_flesh', th.pos);
          spawnParticles(th.pos, 0xffd27a, 6, 8);
          impact = true; break;
        }
      }
      if (!impact && !th.hostile) for (const m of swarm) {
        if (m.dead || Math.hypot(th.pos.x - m.pos.x, th.pos.z - m.pos.z) > th.r + m.r + 0.3 || th.pos.y > critterTop(m) + 0.6) continue;
        hitCritter(m, 4 * throwMul(), dir, 14); SFX.play('hit_flesh', th.pos); impact = true;
      }
      if (!impact) for (const o of obstacles) {
        if (!active(o) || o === th.ref || (o.boss && th.hostile)) continue;
        const p = o.mesh.position;
        if (Math.abs(th.pos.x - p.x) < o.hx + th.r * 0.7 && Math.abs(th.pos.z - p.z) < o.hz + th.r * 0.7 && th.pos.y < o.h + th.r * 0.5) {
          if (o.crate) damageCrate(o, 3 * throwMul());
          if (o.boss) { bossDamage(12 * throwMul()); spawnParticles(th.pos, 0xd040a0, 8, 8); SFX.play('tent_slam', th.pos, { rate: 1.3 }); }
          else if (!o.crate) SFX.play('hit_stone', th.pos);
          spawnParticles(th.pos, o.crate ? 0xd2873c : 0xbfc3c9, 5, 7);
          th.pos.addScaledVector(dir, -th.r);
          impact = true; break;
        }
      }
      if (impact) finishThrown(th, i);
    }
  }

  // ---------- burrow ----------
  const SINK_TIME = 0.35, RISE_TIME = 0.4, BURY_DEPTH = 2.8;
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 1 });
  const mound = new THREE.Group();
  {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dirtMat);
    hill.scale.y = 0.35; mound.add(hill);
    for (let i = 0; i < 7; i++) {                    // комья вокруг
      const a = i / 7 * Math.PI * 2 + rand(-0.3, 0.3), rr = rand(1.9, 2.6);
      const clod = new THREE.Mesh(new THREE.BoxGeometry(rand(0.35, 0.6), rand(0.25, 0.45), rand(0.35, 0.6)), dirtMat);
      clod.position.set(Math.cos(a) * rr, 0.15, Math.sin(a) * rr); clod.rotation.y = rand(0, 3);
      mound.add(clod);
    }
    mound.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  }
  mound.visible = false; scene.add(mound);
  let dirtT = 0;

  const carSeen = () => car.alive && car.depth < 0.5;

  function special() { if (GS.ride === 'spider') toggleBurrow(); else if (GS.ride === 'unicorn') bombDome(); else if (GS.ride === 'buggy') throwDecoys(); else if (GS.ride === 'halo') releaseCubes(); }
  function toggleBurrow() {
    if (!abilities.burrow || GS.ride !== 'spider' || !car.alive || car.burrowCd > 0 || car.airborne) return;
    if (car.burrow === 'up' || car.burrow === 'rising') { car.burrow = 'down'; SFX.play('dig_down', car.pos); crewSay('burrow', 0.7); }
    else { car.burrow = 'rising'; SFX.play('dig_up', car.pos); }
    car.burrowCd = 0.25;
    GS.shake = Math.max(GS.shake, 0.3);
    spawnParticles(tmp.copy(car.pos).setY(0.5), 0x6b5a3e, 12, 8);
  }

  function updateBurrow(dt) {
    car.burrowCd -= dt;
    if (car.burrow === 'down') {
      car.depth = Math.min(1, car.depth + dt / SINK_TIME);
      if (car.depth >= 1) car.burrow = 'under';
    } else if (car.burrow === 'rising') {
      car.depth = Math.max(0, car.depth - dt / RISE_TIME);
      if (car.depth <= 0) { car.burrow = 'up'; if (abLv.burrow >= 2) surfaceBlast(); }
    }
    const moving = car.burrow === 'down' || car.burrow === 'rising';
    if (moving) {
      drillSpin.rotation.z += 40 * dt;               // бур роет
      dirtT -= dt;
      if (dirtT <= 0) { dirtT = 0.03; spawnParticles(tmp.copy(car.pos).setY(0.3), Math.random() < 0.7 ? 0x6b5a3e : 0x4a4f45, 3, 9); }
      GS.shake = Math.max(GS.shake, 0.15);
    }
    carGroup.position.y = car.y - car.depth * BURY_DEPTH;
    carGroup.visible = car.alive && car.depth < 0.97;
    mound.visible = car.alive && car.depth > 0.15;
    if (mound.visible) {
      const sc = Math.min(1, car.depth * 1.3);
      mound.position.set(car.pos.x, 0, car.pos.z);
      mound.scale.set(sc, sc * (car.burrow === 'under' ? 1 + Math.sin(GS.elapsed * 3) * 0.06 : 1), sc); // нора дышит
    }
  }

  // ---------- skid marks + tire smoke ----------
  const SKID_SLIP = 2.6, SKID_LIFE = 6, SKID_MAX = 360;
  const skidGeo = new THREE.PlaneGeometry(0.42, 0.75); skidGeo.rotateX(-Math.PI / 2);
  const skids = []; let skidHead = 0, skidT = 0;
  const smoke = []; let dustT = 0;
  const smokeGeo = new THREE.SphereGeometry(0.45, 7, 5);
  const wpos = new THREE.Vector3();
  function updateSkid(dt, lateral) {
    const slip = Math.abs(lateral);
    SFX.loop('skid', car.alive && car.depth === 0 && !car.airborne && slip > SKID_SLIP ? Math.min(0.35, (slip - SKID_SLIP) / 14) : 0, 0.9 + Math.min(0.3, slip / 40));
    skidT -= dt; dustT -= dt;
    const gspd = Math.hypot(car.vel.x, car.vel.z);
    if (GS.ride === 'buggy' && car.alive && car.depth === 0 && !car.airborne && gspd > 8 && dustT <= 0) {   // dust trail
      dustT = 0.045;
      wheels[2 + (Math.random() < 0.5 ? 0 : 1)].pivot.getWorldPosition(wpos); wpos.y = 0.3;
      puff(wpos, 0xa8977c, 0.9, 0.8, rand(-0.5, 0.5), rand(0.3, 0.9), rand(-0.5, 0.5), 0.2 * Math.min(1, gspd / 20), 2.4);
    }
    if (car.alive && car.depth === 0 && !car.airborne && slip > SKID_SLIP && skidT <= 0) {
      skidT = 0.025;
      const yaw = Math.atan2(car.vel.x, car.vel.z);
      const strength = Math.min(1, (slip - SKID_SLIP) / 8);
      for (const w of [wheels[2], wheels[3]]) {        // задние колёса
        w.pivot.getWorldPosition(wpos);
        let sk = skids[skidHead];
        if (!sk) { sk = { m: new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x1c1c1a, transparent: true, depthWrite: false })), t: 0 }; scene.add(sk.m); skids[skidHead] = sk; }
        sk.m.position.set(wpos.x, 0.02 + skidHead * 0.00001, wpos.z);
        sk.m.rotation.y = yaw; sk.t = SKID_LIFE; sk.a = 0.25 + 0.35 * strength;
        sk.m.material.opacity = sk.a; sk.m.visible = true;
        skidHead = (skidHead + 1) % SKID_MAX;
        if (Math.random() < 0.3 + strength * 0.45) {      // tyre smoke
          wpos.y = 0.35;
          puff(wpos, 0xd8d6d0, 1.3, 1.0, rand(-0.6, 0.6) - car.vel.x * 0.08, rand(0.8, 1.6), rand(-0.6, 0.6) - car.vel.z * 0.08, 0.4);
        }
      }
    }
    for (const sk of skids) {
      if (!sk || !sk.m.visible) continue;
      sk.t -= dt;
      if (sk.t <= 0) sk.m.visible = false;
      else if (sk.t < 1.5) sk.m.material.opacity = sk.a * sk.t / 1.5;
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.life -= dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.multiplyScalar(1 + 1.6 * dt);
      p.m.material.opacity = Math.max(0, p.life / 0.9 * 0.55);
      if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); smoke.splice(i, 1); }
    }
  }

  const throwMul = () => abLv.grab >= 2 ? 3 : abLv.grab >= 1 ? 2 : 1;
  function ringBlast(x, z, r, dmg, push, col, stun) {      // a knock-back ring from the ride (upgrades); critters are the host's, so a client asks it
    burst(tmp.set(x, 0.4, z), col, 12, r * 0.7, 9, 0.5); flash(tmp, col, r, 0.25, 3, false); GS.shake = Math.max(GS.shake, 0.3);
    if (NET.client) { netEv({ t: 'blast', x: r1(x), z: r1(z), r, d: dmg, p: push, s: stun ? 1 : 0 }, NET.hostPeer); return; }
    blastAt(x, z, r, dmg, push, stun);
  }
  function blastAt(x, z, r, dmg, push, stun) {
    for (const m of swarm) { if (m.dead) continue; const dx = m.pos.x - x, dz = m.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d < r + m.r) { hitCritter(m, dmg, tmp.set(dx / d, 0, dz / d).clone(), push); if (stun) m.stun = Math.max(m.stun || 0, 1); } }
    for (const e of enemies) { if (e.dead || e.carried) continue; const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d < r + e.r) { hitEnemy(e, tmp.set(dx / d, 0, dz / d).clone(), Math.max(1, dmg * 0.5), push); if (stun) e.stun = Math.max(e.stun || 0, 1); } }
  }
  function surfaceBlast() { ringBlast(car.pos.x, car.pos.z, 6, 3, 18, 0x9a7a54, true); }
  let bombCd = 0; const domes = [];
  const domeGeo = new THREE.SphereGeometry(1, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeRingGeo = new THREE.RingGeometry(0.95, 1, 64); domeRingGeo.rotateX(-Math.PI / 2);
  function bombDome() {
    if (!abilities.bomb || GS.ride !== 'unicorn' || !car.alive || car.burrow !== 'up' || bombCd > 0) return;
    const L = abLv.bomb; bombCd = BOMB.cd[L];
    const x = r1(car.pos.x), z = r1(car.pos.z), r = BOMB.r[L], T = BOMB.T[L];
    addDome(x, z, r, T);
    if (NET.client) netEv({ t: 'dome', x, z, r, T }); else { netEv({ t: 'dome', x, z, r, T }); blastAt(x, z, r, 1, 26, true); }
  }
  function addDome(x, z, r, T) {
    const mat = glow(new THREE.MeshBasicMaterial({ color: 0xff9ae0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 1.6);
    const rmat = glow(new THREE.MeshBasicMaterial({ color: 0xffc4ef, transparent: true, opacity: 0, depthWrite: false }), 2.5);
    const m = new THREE.Mesh(domeGeo, mat), ring = new THREE.Mesh(domeRingGeo, rmat);
    m.position.set(x, 0, z); ring.position.set(x, 0.06, z); ring.scale.setScalar(r); scene.add(m, ring);
    domes.push({ x, z, r, T, t: 0, m, ring });
    burst(tmp.set(x, 0.5, z), 0xff9ae0, 16, r * 0.8, 12, 0.6); flash(tmp, 0xff9ae0, r * 1.2, 0.35, 4, false);
    SFX.play('explode', tmp, { vol: 0.6, rate: 1.3 }); GS.shake = Math.max(GS.shake, 0.35);
  }
  const inDome = (x, z) => domes.some(D => Math.hypot(x - D.x, z - D.z) < D.r);
  function updateDomes(dt) {
    bombCd -= dt;
    for (let i = domes.length - 1; i >= 0; i--) {
      const D = domes[i]; D.t += dt;
      const k = Math.min(1, D.t / 0.18), fade = Math.min(1, (D.T - D.t) / 0.4);
      D.m.scale.setScalar(D.r * (0.4 + 0.6 * k)); D.m.material.opacity = 0.11 * fade * k + 0.03 * Math.sin(GS.elapsed * 14) * fade; D.ring.material.opacity = 0.8 * fade;
      if (!NET.client) {                                   // nobody gets in while it stands
        for (const m of swarm) { if (m.dead) continue; const dx = m.pos.x - D.x, dz = m.pos.z - D.z, d = Math.hypot(dx, dz) || 1e-3, R = D.r + m.r;
          if (d < R) { m.pos.x = D.x + dx / d * R; m.pos.z = D.z + dz / d * R; const vn = m.vel.x * dx / d + m.vel.z * dz / d; if (vn < 0) { m.vel.x -= dx / d * vn; m.vel.z -= dz / d * vn; } } }
        for (const e of enemies) { if (e.dead || e.carried) continue; const dx = e.pos.x - D.x, dz = e.pos.z - D.z, d = Math.hypot(dx, dz) || 1e-3, R = D.r + e.r;
          if (d < R) { e.pos.x = D.x + dx / d * R; e.pos.z = D.z + dz / d * R; } }
      }
      if (D.t >= D.T) { scene.remove(D.m, D.ring); D.m.material.dispose(); D.ring.material.dispose(); domes.splice(i, 1); }
    }
  }
  const activeCdK = () => GS.ride === 'unicorn' ? Math.max(0, bombCd) / BOMB.cd[abLv.bomb] : GS.ride === 'buggy' ? Math.max(0, decoyCd) / DECOY_CD : GS.ride === 'halo' ? Math.max(0, cubeCd) / CUBE_CD : 0;
  // ----- Decoy Chubz (buggy): a squeaky fake chubzik; on the host every monster nearby goes for it, then it blows up -----
  const DECOY_CD = 9, DECOY_T = 3.2, decoys = []; let decoyCd = 0;
  function throwDecoys() {
    if (!abilities.decoy || GS.ride !== 'buggy' || !car.alive || decoyCd > 0) return;
    decoyCd = DECOY_CD;
    const n = 1 + abLv.decoy, dx = groundAim.x - car.pos.x, dz = groundAim.z - car.pos.z, dd = Math.hypot(dx, dz) || 1;
    const a0 = Math.atan2(dx / dd, dz / dd), L = THREE.MathUtils.clamp(dd, 7, 16);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i - (n - 1) / 2) * 0.42;
      const x = THREE.MathUtils.clamp(car.pos.x + Math.sin(a) * L, -ARENA + 3, ARENA - 3), z = THREE.MathUtils.clamp(car.pos.z + Math.cos(a) * L, -ARENA + 3, ARENA - 3);
      addDecoy(car.pos.x, car.pos.z, x, z); netEv({ t: 'decoy', a: r1(car.pos.x), b: r1(car.pos.z), x: r1(x), z: r1(z) });
    }
    SFX.play('chub', car.pos, { rate: 1.5 });
  }
  function addDecoy(x0, z0, x, z) {
    const sprite = new THREE.Sprite(chubMats[0][0]); sprite.center.set(0.5, 0.04); scene.add(sprite);
    const shadow = new THREE.Mesh(swShadowGeo, swShadowMat); scene.add(shadow);
    decoys.push({ x0, z0, x, z, t: -0.45, sprite, shadow, sq: 0 });
  }
  function decoyNear(m) { let b = null, bd = 22; for (const D of decoys) { if (D.t < 0) continue; const d = Math.hypot(D.x - m.pos.x, D.z - m.pos.z); if (d < bd) { bd = d; b = D; } } return b; }
  function updateDecoys(dt) {
    decoyCd -= dt;
    for (let i = decoys.length - 1; i >= 0; i--) {
      const D = decoys[i]; D.t += dt;
      if (D.t < 0) {                                       // in the air
        const u = 1 + D.t / 0.45; D.sprite.position.set(D.x0 + (D.x - D.x0) * u, 1 + Math.sin(Math.PI * u) * 4, D.z0 + (D.z - D.z0) * u);
      } else {
        const hop = Math.abs(Math.sin(D.t * 9)) * 0.5; D.sprite.position.set(D.x, hop, D.z);
        if ((D.sq -= dt) <= 0) { D.sq = 0.45; SFX.play('chub', D.sprite.position, { rate: 1.3 + Math.random() * 0.4, vol: 0.6 }); }
      }
      const sc = CHUB_SIZE * (1.1 + 0.15 * Math.sin(D.t * 18)); D.sprite.scale.set(sc, sc, 1); D.shadow.position.set(D.sprite.position.x, 0.03, D.sprite.position.z);
      if (D.t >= DECOY_T) {
        tmp.set(D.x, 0.6, D.z); burst(tmp, 0xffb040, 16, 3.5, 10, 0.6); flash(tmp, 0xffb040, 6, 0.3, 4, false); SFX.play('explode', tmp, { vol: 0.7 });
        if (!NET.client) blastAt(D.x, D.z, 5, 6, 18, false);
        scene.remove(D.sprite, D.shadow); decoys.splice(i, 1);
      }
    }
  }
  // ----- Wing Cubes (angel): run by the caster's machine; others just see them flutter round the angel -----
  const CUBE_CD = 15, CUBE_T = 8, cubes = []; let cubeCd = 0;
  const cubeGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9), wingGeo = new THREE.PlaneGeometry(0.9, 0.5); wingGeo.translate(0.45, 0, 0);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const CUBE_COLS = [0xffb3c7, 0xa8e6ff, 0xfff0a0, 0xc8b3ff, 0xb8f5c0];
  function releaseCubes() {
    if (!abilities.cubes || GS.ride !== 'halo' || !car.alive || cubeCd > 0) return;
    cubeCd = CUBE_CD; const n = abLv.cubes >= 1 ? 5 : 3;
    spawnCubes(n, null, abLv.cubes); netEv({ t: 'cubes', n, l: abLv.cubes });
    SFX.play('jump2', car.pos, { rate: 1.6 });
  }
  function spawnCubes(n, R, lv) {
    const host = R ? R.pos : car.pos;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(), body = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: CUBE_COLS[i % 5], roughness: 0.6 }));
      const wl = new THREE.Mesh(wingGeo, wingMat), wr = new THREE.Mesh(wingGeo, wingMat); wl.position.x = 0.4; wr.position.x = -0.4; wr.rotation.y = Math.PI;
      g.add(body, wl, wr); g.position.set(host.x + Math.cos(i / n * 6.283) * 1.6, 2.5, host.z + Math.sin(i / n * 6.283) * 1.6); scene.add(g);
      cubes.push({ g, body, wl, wr, R, lv, t: 0, eaten: 0, bite: 0, a: i / n * 6.283, tgt: null, sc: 1 });
    }
  }
  function cubePop(c) {
    tmp.copy(c.g.position); burst(tmp, 0xffffff, 8, 1.5, 6, 0.5); SFX.play('pop', tmp, { rate: 1.4 });
    if (!c.R && c.lv >= 2) ringBlast(c.g.position.x, c.g.position.z, 3.5, 3, 12, 0xa8e6ff, false);      // swollen cubes burst
    scene.remove(c.g); c.body.material.dispose();
  }
  function cubeBoom(c, m) {                               // a dive ends in a small blast: the victim takes the hit, whatever stands right next to it gets singed
    const x = c.g.position.x, z = c.g.position.z, col = c.body.material.color.getHex(), big = m.K.heavy || m.elite || m.mini || m.rig;
    tmp.set(x, 0.9, z); flash(tmp, col, 3.4, 0.2, 3, false); burst(tmp, 0xffffff, 6, 1.1, 5, 0.5); waveFx(x, z, 2.6, col, 0.28); SFX.play('pop', tmp, { rate: 1.15, vol: 0.55 }); SFX.play('chomp', tmp, { rate: 1.6, vol: 0.4 });
    hitCritter(m, big ? 3 : 99, tmp.set(0, 0, 0), 0);
    for (const o of swarm) { if (o === m || o.dead || o.dig > 0) continue; const dx = o.pos.x - x, dz = o.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d < 2.6 + o.r) hitCritter(o, 1, tmp.set(dx / d, 0, dz / d).clone(), 5); }
    c.eaten++; c.sc = c.lv >= 2 ? 1 + 0.18 * c.eaten : 1; c.tgt = null; c.mode = 'rise'; c.up = 0.32; c.wait = 0.2;
  }
  function updateCubes(dt) {
    cubeCd -= dt;
    for (let i = cubes.length - 1; i >= 0; i--) {
      const c = cubes[i]; c.t += dt; c.a += dt * 2.5;
      const own = !c.R, hp = own ? car.pos : c.R.pos, P = c.g.position;
      if (!own && NET.remotes.get(c.R.peer) !== c.R) c.t = CUBE_T;
      let gx = hp.x + Math.cos(c.a) * 3, gz = hp.z + Math.sin(c.a) * 3, sp = 17, pitch = 0;
      if (c.y === undefined) { c.y = 2.6; c.mode = 'hover'; c.wait = 0.15 + i * 0.12; }
      if (own) {                                         // hover by the angel, pick a victim, rear up, dive on it and go off
        const m = c.tgt;
        if (c.mode === 'hover') { c.y += (3 - c.y) * Math.min(1, dt * 6);
          if ((c.wait -= dt) <= 0) { c.wait = 0.25; let bd = 16;
            for (const q of swarm) { if (q.dead || q.dig > 0 || cubes.some(o => o !== c && o.tgt === q)) continue;      // each cube picks its own victim
              const d = Math.hypot(q.pos.x - P.x, q.pos.z - P.z) + Math.hypot(q.pos.x - hp.x, q.pos.z - hp.z) * 0.5; if (d < bd) { bd = d; c.tgt = q; } }
            if (c.tgt) { c.mode = 'aim'; c.aim = 0.24; } } }
        else if (c.mode === 'aim') { if (!m || m.dead) { c.mode = 'hover'; c.tgt = null; } else { gx = P.x; gz = P.z; c.y += 5 * dt; pitch = -0.5; c.face = Math.atan2(m.pos.x - P.x, m.pos.z - P.z);
            if ((c.aim -= dt) <= 0) { c.mode = 'dive'; c.d0 = Math.max(1, Math.hypot(m.pos.x - P.x, m.pos.z - P.z)); c.y0 = c.y; c.puff = 0; } } }
        else if (c.mode === 'dive') { if (!m || m.dead) { c.mode = 'rise'; c.up = 0.25; c.tgt = null; } else { gx = m.pos.x; gz = m.pos.z; sp = 36; pitch = 1.0;
            const d = Math.hypot(gx - P.x, gz - P.z), k = Math.min(1, d / c.d0), low = critterTop(m) * 0.6; c.y = low + (c.y0 - low) * k * k;
            if ((c.puff -= dt) <= 0) { c.puff = 0.04; puff(P, c.body.material.color.getHex(), 0.5, 0.28, 0, 0.4, 0, 0.5, 1.2); }
            if (d < m.r + 0.8) cubeBoom(c, m); } }
        else { gx = P.x; gz = P.z; c.y += 11 * dt; pitch = -0.6; if ((c.up -= dt) <= 0) c.mode = 'hover'; }      // bouncing back up out of the blast
      } else c.y = 2.2;
      const dx = gx - P.x, dz = gz - P.z, d = Math.hypot(dx, dz) || 1, mv = Math.min(d, sp * dt);
      P.x += dx / d * mv; P.z += dz / d * mv; P.y = c.y + (c.mode === 'dive' ? 0 : Math.sin(c.t * 5 + c.a) * 0.3);
      c.g.rotation.order = 'YXZ'; c.g.rotation.y = c.mode === 'aim' ? c.face : d > 0.05 ? Math.atan2(dx, dz) : c.g.rotation.y; c.g.rotation.x += (pitch - c.g.rotation.x) * Math.min(1, dt * 14);
      const f = Math.sin(c.t * (c.mode === 'dive' ? 46 : 28)) * (c.mode === 'dive' ? 0.3 : 0.8), tuck = c.mode === 'dive' ? 0.9 : 0; c.wl.rotation.z = f + tuck; c.wr.rotation.z = -f - tuck;      // wings swept back in the dive
      c.g.scale.setScalar(c.sc * (c.mode === 'rise' ? 1.2 : 1));
      if (c.t >= CUBE_T || c.eaten >= 5) { cubePop(c); cubes.splice(i, 1); }
    }
  }
  // ----- Rainbow Trail (unicorn, passive): biters that step on it lose you; the host runs it for every unicorn it knows -----
  const trails = new Map(); let trailTick = 0;
  const trailGeo = new THREE.CircleGeometry(0.85, 12); trailGeo.rotateX(-Math.PI / 2);
  function trailFor(key, pos, moving, lv, dt) {
    let T = trails.get(key); if (!T) { T = { pts: [], acc: 0, hue: 0 }; trails.set(key, T); }
    T.acc += dt;
    if (lv > 0 && moving && T.acc > 0.09) { T.acc = 0; T.hue = (T.hue + 0.07) % 1;
      const m = new THREE.Mesh(trailGeo, glow(new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(T.hue, 0.9, 0.62, THREE.SRGBColorSpace), transparent: true, opacity: 0.55, depthWrite: false }), 1.4));
      m.position.set(pos.x, 0.05, pos.z); scene.add(m); T.pts.push({ x: pos.x, z: pos.z, t: 0, T: TRAIL_T[lv - 1], m, slow: lv >= 3 });
    }
    for (let i = T.pts.length - 1; i >= 0; i--) { const q = T.pts[i]; q.t += dt; q.m.material.opacity = 0.55 * Math.min(1, (q.T - q.t) / 0.6);
      if (q.t >= q.T) { scene.remove(q.m); q.m.material.dispose(); T.pts.splice(i, 1); } }
  }
  function updateTrails(dt) {
    trailFor('me', car.pos, GS.ride === 'unicorn' && car.alive && Math.abs(car.speed) > 3, GS.ride === 'unicorn' && abilities.trail ? abLv.trail + 1 : 0, dt);
    for (const R of NET.remotes.values()) trailFor(R.peer, R.pos, R.up && Math.hypot(R.vel.x, R.vel.z) > 3, R.ride === 'unicorn' ? R.tl || 0 : 0, dt);
    if (NET.client || (trailTick += dt) < 0.1) return; trailTick = 0;
    for (const T of trails.values()) for (const q of T.pts)
      for (const m of swarm) { if (m.dead || m.K.fly) continue; if (Math.abs(m.pos.x - q.x) < 1.5 && Math.abs(m.pos.z - q.z) < 1.5) { m.lost = 2; if (q.slow) m.slow = 2; } }
  }
  // ----- the warm-up: everybody has their own weapon pedestals; one rises out of the ground when you come close and has to be fought for.
  //       When the whole crew holds all three guns, wandering bosses come out carrying the skills -----
  const pedestals = []; GS.wbSpawned = false; GS.wbKilled = 0;
  const pedBaseGeo = new THREE.CylinderGeometry(1.7, 2.3, 1.4, 8), pedMat = new THREE.MeshStandardMaterial({ color: 0x6f6458, roughness: 0.9 });
  const PED_RISE_R = 25, PED_GUARD_R = 32;
  const firstGun = () => pedestals.length ? pedestals[0].k : (GS.ride === 'halo' ? 'nova' : 'spread');      // the halo's own gun is weak: it starts with the nova
  const pedIcon = k => k === 'jump' ? 'jump' : 'w_' + k;
  const pedHave = k => k === 'jump' ? !!abilities.jump : weapons[k] > 0;
  function addPedestal(k, x, z) {
    const g = new THREE.Group(), base = new THREE.Mesh(pedBaseGeo, pedMat); base.position.y = -0.8; base.castShadow = base.receiveShadow = true;
    const ik = pedIcon(k); if (!pickupTex[ik]) pickupTex[ik] = srgbTex(ICONS[ik]);
    const icon = new THREE.Sprite(glow(new THREE.SpriteMaterial({ map: pickupTex[ik], transparent: true }), 1.2)); icon.scale.set(2.8, 2.8, 1); icon.position.y = 3.4; icon.visible = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 40), glow(new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, depthWrite: false }), 2.4)); ring.geometry.rotateX(-Math.PI / 2); ring.position.y = 0.05;
    const hatch = new THREE.Mesh(new THREE.CircleGeometry(2.5, 32), new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.75, depthWrite: false })); hatch.geometry.rotateX(-Math.PI / 2); hatch.position.y = 0.04;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glow(new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 1.6)); dome.visible = false;
    g.add(hatch, base, icon, ring, dome); g.position.set(x, 0, z); scene.add(g);
    const P = { k, x, z, g, base, icon, ring, hatch, dome, state: 'dormant', t: 0 }; pedestals.push(P); return P;
  }
  function pedReset(P) { P.state = 'dormant'; P.t = 0; P.g.visible = true; P.base.position.y = -0.8; P.icon.visible = false; P.hatch.visible = true; P.dome.visible = false; }
  function pedSpot(near) {                                 // spray gun: near the centre; the others: far out, apart from each other and from the altars
    for (let i = 0; i < 60; i++) { const a = Math.random() * 6.283, r = near ? 14 + Math.random() * 12 : ARENA * (0.5 + Math.random() * 0.25), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (obstacles.some(o => Math.hypot(o.mesh.position.x - x, o.mesh.position.z - z) < 10)) continue;
      if (!near && (pedestals.some(p => Math.hypot(p.x - x, p.z - z) < 110) || altars.some(A => Math.hypot(A.x - x, A.z - z) < 25))) continue;
      return [Math.round(x), Math.round(z)]; }
    return [Math.round(Math.random() * 160 - 80), Math.round(Math.random() * 160 - 80)];
  }
  function ambush(x, z, big) {                             // host: the guard that comes out with a pedestal
    if (swarm.length > 150) return;
    const n = big ? 18 : 13;
    for (let j = 0; j < n; j++) { const a = Math.random() * 6.283, d = 8 + Math.random() * 7; const g = spawnCritter(['gremlin', 'gremlin', 'maw', 'stilt', 'maw'][j % 5], x + Math.cos(a) * d, z + Math.sin(a) * d); g.guard = true; digOut(g); }
    const a = Math.random() * 6.283, mb = makeMini(spawnCritter(MINI_KINDS[Math.floor(Math.random() * MINI_KINDS.length)], x + Math.cos(a) * 11, z + Math.sin(a) * 11)); mb.guard = true; digOut(mb);
  }
  const guardsNear = P => { let n = 0; for (const m of swarm) if (m.guard && !m.dead && Math.hypot(m.pos.x - P.x, m.pos.z - P.z) < PED_GUARD_R) n++; return n; };      // only the pedestal's own ambush holds the shield: wave monsters and log machines passing by don't
  const crewArmed = () => W_GEAR.every(k => weapons[k]) && abilities.jump && [...NET.remotes.values()].every(R => !R.up || R.gd);
  function armedFx(R, k) {                                 // somebody else took a gun: a pillar of light and the gun's icon over their ride
    flash(tmp.set(R.pos.x, 2, R.pos.z), 0xffd23a, 10, 0.5, 4); burst(tmp.set(R.pos.x, 0.5, R.pos.z), 0xffd23a, 14, 3, 7, 0.5);
    const ik = pedIcon(k); if (!pickupTex[ik]) pickupTex[ik] = srgbTex(ICONS[ik]);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickupTex[ik], transparent: true, depthTest: false })); spr.renderOrder = 20; spr.scale.setScalar(3);
    scene.add(spr); armFx.push({ spr, R, t: 0 });
    toast(pedIcon(k), '— ' + (R.nick || R.ride || 'friend') + ' got it');
  }
  const armFx = [];
  function spawnWanderers() {                              // host: three big wandering bosses, each carries a skill for everyone
    GS.wbSpawned = true;
    wbCheckT = 0; wbTopUp(0);                              // as many as the crew still lacks skills
    GS.rigOwed = Math.max(0, 2 - swarm.filter(m => m.rig && !m.dead).length); GS.rigT = 0;
    flashAlert('BOSS HUNT! LOG MACHINES ARE BOSSES TOO'); netEv({ t: 'alert', s: 'BOSS HUNT! LOG MACHINES ARE BOSSES TOO' }); SFX.play('boss_roar', null, { vol: 0.6 });
  }
  function spawnWanderer(a, loot) {
    const r = ARENA * (0.3 + Math.random() * 0.45);
    const m = makeWanderer(makeMini(spawnCritter(MINI_KINDS[Math.floor(Math.random() * MINI_KINDS.length)], Math.cos(a) * r, Math.sin(a) * r))); m.wbLoot = !!loot; return m;
  }
  const WB_CROWD = 21;                                     // plenty of bosses roam; only some of them carry a skill
  let wbCheckT = 0;
  function wbTopUp(dt) {                                   // host: as many wandering bosses alive as the neediest player still lacks skills (a death wipe or anything else can't stall the warm-up)
    if ((wbCheckT -= dt) > 0) return; wbCheckT = 3;
    const lying = pickups.filter(p => p.own && kit().includes(p.type)).length;
    let need = Math.max(0, kit().filter(t => !abilities[t] && t !== 'jump').length - lying);      // the jump comes with the spray gun, not from a boss
    for (const R of NET.remotes.values()) if (R.up && !R.ks) need = Math.max(need, 1);
    const wb = swarm.filter(m => m.wb && !m.dead), loot = wb.filter(m => m.wbLoot).length;
    for (let i = loot; i < need; i++) spawnWanderer(Math.random() * 6.283, true);                    // never fewer skill carriers than skills missing
    if (need > 0) for (let i = wb.length + Math.max(0, need - loot); i < WB_CROWD; i++) spawnWanderer(Math.random() * 6.283, false);      // and a crowd around them
  }
  const wbGift = () => kit().find(t => !abilities[t] && t !== 'jump' && !pickups.some(p => p.own && p.type === t));      // the skill a carrier holds for me
  const wbMarks = [];
  function updateWbMarks() {                               // everybody: the boss that carries a skill wears its icon over its head, so you know which of the crowd to hunt
    const gift = wbGift() || 'upgrade';
    for (const m of swarm) if (m.wbLoot && !m.dead && !m.mark) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); spr.renderOrder = 19; scene.add(spr); m.mark = spr; wbMarks.push(m); }
    for (let i = wbMarks.length - 1; i >= 0; i--) { const m = wbMarks[i], spr = m.mark;
      if (m.dead || !swarm.includes(m)) { scene.remove(spr); spr.material.dispose(); m.mark = null; wbMarks.splice(i, 1); continue; }
      if (spr.gift !== gift) { spr.gift = gift; if (!pickupTex[gift]) pickupTex[gift] = srgbTex(ICONS[gift]); spr.material.map = pickupTex[gift]; spr.material.needsUpdate = true; }
      const s = 3.4 + Math.sin(GS.elapsed * 4 + m.id) * 0.3; spr.scale.set(s, s, 1); spr.position.set(m.pos.x, (m.K.fly || 0) + m.K.size + 2.6 + Math.sin(GS.elapsed * 2.2 + m.id) * 0.35, m.pos.z); }
  }
  function makeWanderer(m) {
    if (m.wb) return m; m.wb = true; m.K = { ...m.K, size: m.K.size * 1.4, r: Math.min(2.6, m.K.r * 1.3) }; m.r = m.K.r; m.hp *= 3; m.wp = null;
    m.shadow.scale.set(m.K.r * 2.6, 1, m.K.r * 2.2); return m;
  }
  function wbFar(m) {                                      // nobody close: the boss just roams
    let d = car.alive ? Math.hypot(car.pos.x - m.pos.x, car.pos.z - m.pos.z) : 1e9;
    for (const R of NET.remotes.values()) if (R.up) d = Math.min(d, Math.hypot(R.pos.x - m.pos.x, R.pos.z - m.pos.z));
    return d > 24;
  }
  function updatePedestals(dt) {
    if (startEl.isConnected) return;
    for (let i = armFx.length - 1; i >= 0; i--) { const F = armFx[i]; F.t += dt; F.spr.position.set(F.R.pos.x, 4.5 + F.t * 1.5, F.R.pos.z); F.spr.material.opacity = Math.min(1, 2.5 - F.t * 1.6);
      if (F.t > 1.6) { scene.remove(F.spr); F.spr.material.dispose(); armFx.splice(i, 1); } }
    if (!pedestals.length) { const [x, z] = pedSpot(true); addPedestal(firstGun(), x, z); }
    const fg = firstGun();
    if (weapons[fg] && pedestals.length < 3) for (const k of W_GEAR.filter(k => k !== fg)) { const [x, z] = pedSpot(false); addPedestal(k, x, z); }
    for (let i = 0; i < pedestals.length; i++) {
      const P = pedestals[i];
      if (P.state === 'gone') { if (!pedHave(P.k)) pedReset(P); else continue; }          // the gun was lost: its pedestal is waiting again
      if (pedHave(P.k) && P.state !== 'gone') { P.state = 'gone'; P.g.visible = false; continue; }
      const d = Math.hypot(car.pos.x - P.x, car.pos.z - P.z); P.t += dt; P.ring.rotation.y += dt;
      if (P.state === 'dormant') {
        P.ring.material.opacity = 0.45 + Math.sin(GS.elapsed * 4 + i) * 0.3;
        if (car.alive && d < PED_RISE_R) { P.state = 'rising'; P.t = 0; P.icon.visible = true; P.dome.visible = true; GS.shake = Math.max(GS.shake, 0.5);
          SFX.play('tent_slam', tmp.set(P.x, 0, P.z), { vol: 0.6 }); burst(tmp.set(P.x, 0.5, P.z), 0x8a7a64, 22, 3.5, 7, 0.6);
          const big = P.k !== fg && P.k !== 'jump'; if (NET.client) netEv({ t: 'ambush', x: P.x, z: P.z, b: big ? 1 : 0 }, NET.hostPeer); else ambush(P.x, P.z, big);
          flashAlert('GUARDED! CLEAR IT OUT'); }
        continue; }
      if (P.state === 'rising') {
        const k = Math.min(1, P.t / 1.1); P.base.position.y = -0.8 + 1.5 * (1 - (1 - k) * (1 - k)); P.hatch.visible = k < 0.6;
        P.g.position.x = P.x + Math.sin(P.t * 60) * 0.12 * (1 - k); if (Math.random() < dt * 14) burst(tmp.set(P.x + rand(-2, 2), 0.3, P.z + rand(-2, 2)), 0x8a7a64, 3, 1.6, 4, 0.5);
        P.icon.position.y = -1 + 4.4 * k; if (k >= 1) { P.state = 'sealed'; P.t = 0; P.g.position.x = P.x; }
        continue; }
      P.icon.position.y = 3.4 + Math.sin(GS.elapsed * 2.5 + i) * 0.35;
      const guards = guardsNear(P); P.guards = guards;
      if (P.state === 'sealed') { P.dome.material.opacity = 0.18 + Math.sin(GS.elapsed * 6) * 0.06; P.ring.material.opacity = 0.9;
        if (P.t > 2 && guards === 0) { P.state = 'open'; P.dome.visible = false; flash(tmp.set(P.x, 2, P.z), 0xffd23a, 8, 0.35, 3.5); SFX.play('pickup', null, { rate: 0.7 }); } }
      if (P.state === 'open' && car.alive && d < 3.4) {
        if (P.k === 'jump') { abilities.jump = true; applyAbilityVisuals(); abDirty = true; GS.abSig = ''; toast('jump'); }
        else { gainWeapon('w_' + P.k); toast('w_' + P.k, '— level it up with upgrades'); }
        SFX.play('pickup', null);
        flash(tmp.set(P.x, 2, P.z), 0xffd23a, 8, 0.35, 3.5); burst(tmp.set(P.x, 0.5, P.z), 0xffd23a, 16, 3, 8, 0.6);
        P.state = 'gone'; P.g.visible = false;
        if (NET.on && NET.game) netEv({ t: 'armed', k: P.k });
      }
    }
    if (!NET.client && !GS.wbSpawned && crewArmed()) { GS.wbSpawned = true; if (!swarm.some(m => m.wb && !m.dead)) spawnWanderers(); }
    if (!NET.client && GS.wbSpawned) wbTopUp(dt);
  }
  // ---------- jump ----------
  const JUMP_V = 15, CAR_G = 32;                    // ~0.95 с в воздухе, высота ~3.5 — перелетает ящики и злюк
  function jump() {
    if (GS.myTow && car.alive && car.burrow === 'up') { throwBomb(); return; }      // with the bomb aboard the jump throws it
    if (!car.alive || car.burrow !== 'up') return;
    if (!car.airborne) {
      if (!abilities.jump) return;
      car.vy = JUMP_V; car.airborne = true; car.usedDouble = false; car.airJumps = 0; SFX.play('jump', car.pos); crewSay('jump', 0.5);
      if (GS.ride === 'spider' && SPD.n.y < 0.5) { car.vel.addScaledVector(SPD.n, 10); car.vy *= 0.6; }      // kick off the wall
      spawnParticles(tmp.copy(car.pos).setY(0.2), 0x8a8a78, 8, 5);
    } else if (abilities.doubleJump && !car.usedDouble) {   // второй толчок прямо в воздухе (the angel's; an upgrade adds a third)
      car.vy = JUMP_V * 0.95; car.airJumps = (car.airJumps || 0) + 1; if (car.airJumps >= 1 + (abLv.doubleJump >= 1 ? 1 : 0)) car.usedDouble = true; SFX.play('jump2', car.pos);
      if (abLv.doubleJump >= 2) ringBlast(car.pos.x, car.pos.z, 4.5, 3, 12, 0xc9a8ff, false);
      spawnParticles(tmp.copy(car.pos).setY(car.y + 0.3), 0xc9a8ff, 12, 6);
      GS.shake = Math.max(GS.shake, 0.15);
    }
  }
  function updateJump(dt) {
    if (!car.airborne) return;
    car.vy -= CAR_G * dt;
    car.y += car.vy * dt;
    if (car.y > (car.ground || 0)) return;
    // приземление
    const impact = -car.vy;
    car.y = car.ground || 0; car.vy = 0; car.airborne = false;
    GS.shake = Math.max(GS.shake, 0.25 + impact * 0.02);
    SFX.play('land', car.pos, { vol: Math.min(1, 0.4 + impact / 25) });
    spawnParticles(tmp.copy(car.pos).setY(0.2), 0x8a8a78, 14, 7); burst(tmp.setY(0.4), 0x9a8f7c, 9, 1.5, 5, 0.3);
    const popped = car.popped; car.popped = false;
    cartKick(3.5);
    if (!popped) for (const e of enemies) {          // приземлились на злюку — придавили
      if (e.dead || e.carried) continue;
      const dx = e.pos.x - car.pos.x, dz = e.pos.z - car.pos.z, d = Math.hypot(dx, dz) || 1e-4;
      if (d < car.radius + e.r * 0.8) {
        hitEnemy(e, tmp.set(dx / d, 0, dz / d), 2, 12); SFX.play('hit_flesh', e.pos);
        e.stun = 0.8;
        spawnParticles(tmp.copy(e.pos).setY(1), 0xc8323c, 6, 7);
      }
    }
    if (!popped) for (const m of swarm) {            // flat critters get flattened
      if (m.dead || m.K.fly) continue;
      const dx = m.pos.x - car.pos.x, dz = m.pos.z - car.pos.z, d = Math.hypot(dx, dz) || 1e-4;
      if (d < car.radius + m.r + 0.8) hitCritter(m, m.K.heavy ? 3 : 99, tmp.set(dx / d, 0, dz / d), 10);
    }
    if (!popped && abLv.jump >= 1 && impact > 8) landPower(abLv.jump);      // the levelled jump: every ride lands in its own way
    for (const o of obstacles) {                     // и на ящик — в щепки
      if (!o.crate || !active(o)) continue;
      const p = o.mesh.position;
      const cx = THREE.MathUtils.clamp(car.pos.x, p.x - o.hx, p.x + o.hx);
      const cz = THREE.MathUtils.clamp(car.pos.z, p.z - o.hz, p.z + o.hz);
      if (Math.hypot(car.pos.x - cx, car.pos.z - cz) < car.radius) damageCrate(o, 99);
    }
  }


  // ---------- landing powers: what a levelled jump does when the ride comes down. One per ride, three levels each ----------
  const isFry = m => !m.mini && !m.wb && !m.rig && !m.K.heavy && !m.elite;      // the small stuff, as opposed to brutes, mini-bosses and machines
  const landWaves = [], waveGeo = new THREE.RingGeometry(0.91, 1, 48); waveGeo.rotateX(-Math.PI / 2);
  function waveFx(x, z, r, col, T = 0.45) {                 // a ring that runs out along the ground
    const m = new THREE.Mesh(waveGeo, glow(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), 2));
    m.position.set(x, 0.14, z); m.scale.setScalar(0.5); scene.add(m); landWaves.push({ m, r, t: 0, T });
  }
  function slowCritter(m, t) { if (m.net) { netEv({ t: 'slow', i: m.id, s: t }, NET.hostPeer); return; } m.slow = Math.max(m.slow || 0, t); }
  // -- buggy: the stomp --
  function stompAt(x, z, lv) {                             // host: Lv1 stuns the shooters among the small fry, Lv2 halves all small fry and stuns them, Lv3 kills them and stuns everything bigger
    const r = STOMP.r[lv - 1], st = STOMP.stun[lv - 1], coop = 1 + 0.6 * (NET.on && NET.game ? Math.min(2, NET.remotes.size) : 0);
    for (const m of swarm) { if (m.dead || m.rig || m.dig > 0) continue; const dx = m.pos.x - x, dz = m.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d > r + m.r) continue;
      if (!isFry(m)) { if (lv >= 3) m.stun = Math.max(m.stun || 0, st); continue; }
      if (lv === 1) { if (m.K.ranged) m.stun = Math.max(m.stun || 0, st); }
      else if (lv === 2) { m.stun = Math.max(m.stun || 0, st); hitCritter(m, Math.max(1, Math.ceil(m.K.hp * coop * 0.5)), tmp.set(dx / d, 0, dz / d).clone(), 4); }
      else hitCritter(m, 999, tmp.set(dx / d, 0, dz / d).clone(), 8); }
  }
  function stomp(lv) {
    const x = car.pos.x, z = car.pos.z, r = STOMP.r[lv - 1], st = STOMP.stun[lv - 1];
    waveFx(x, z, r, 0xffe08a); if (lv >= 2) waveFx(x, z, r * 0.62, 0xfff4c8, 0.32); if (lv >= 3) waveFx(x, z, r * 1.05, 0xff9a3a, 0.6);
    burst(tmp.set(x, 0.4, z), 0xffe08a, 8 + lv * 4, r * 0.35, 9, 0.45); GS.shake = Math.max(GS.shake, 0.25 + lv * 0.1);
    for (const e of enemies) { if (e.dead || e.carried) continue; const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d > r + e.r) continue;      // the evil cubes are each player's own: they shoot, so they count as shooters
      if (!e.elite || lv >= 3) e.stun = Math.max(e.stun || 0, st);
      if (lv >= 2 && !e.elite) hitEnemy(e, tmp.set(dx / d, 0, dz / d).clone(), lv === 2 ? Math.ceil(e.maxHp * 0.5) : 99, 6); }
    if (NET.client) netEv({ t: 'stomp', x: r1(x), z: r1(z), l: lv }, NET.hostPeer); else stompAt(x, z, lv);
  }
  // -- spider: the brood. Flat little spiderlings splash out, run to the monsters around, sit on the small ones, crawl over the big ones and slow them; at Lv3 they blow up when they are done --
  const broods = [];
  const broodTex = (() => { const c = mkCanvas(64), x = c.getContext('2d'); x.translate(32, 32); x.shadowColor = '#d8ff6a'; x.shadowBlur = 2.5; x.strokeStyle = '#17101c'; x.lineWidth = 3.4; x.lineCap = 'round';
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const a = (-0.95 + i * 0.62); x.beginPath(); x.moveTo(sd * 6, a * 6); x.quadraticCurveTo(sd * 20, a * 16 - 7, sd * 27, a * 22 + 3); x.stroke(); }
    x.fillStyle = '#241a2c'; x.beginPath(); x.ellipse(0, 4, 11, 13, 0, 0, 6.283); x.fill(); x.beginPath(); x.arc(0, -10, 7.5, 0, 6.283); x.fill();
    x.fillStyle = '#ff5a6e'; for (const sd of [-1, 1]) { x.beginPath(); x.arc(sd * 3.2, -12, 1.9, 0, 6.283); x.fill(); }
    x.fillStyle = '#c8ff5a'; x.beginPath(); x.ellipse(0, 5, 4, 5.5, 0, 0, 6.283); x.fill(); return srgbTex(c); })();
  function spawnBrood(x, z, lv, own) {
    for (let i = 0; i < BROOD.n[lv - 1]; i++) { const a = Math.random() * 6.283, sp = 4 + Math.random() * 6, spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: broodTex, transparent: true, depthTest: false }));
      spr.scale.set(1.6, 1.6, 1); spr.renderOrder = 18; scene.add(spr);
      broods.push({ spr, x, z, y: 1, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 5 + Math.random() * 4, t: 0, on: 0, lv, own, tgt: null, ph: Math.random() * 6.283, tick: 0, look: 0, ox: x, oz: z }); }
  }
  function broodEnd(b, i, boom) {
    if (boom) { tmp.set(b.x, b.y + 0.4, b.z); flash(tmp, 0xc8ff5a, 2.6, 0.18, 3, false); burst(tmp, 0xc8ff5a, 5, 0.8, 4, 0.5); SFX.play('pop', tmp, { rate: 1.7, vol: 0.4 }); }
    scene.remove(b.spr); b.spr.material.dispose(); broods.splice(i, 1);
  }
  function updateBrood(dt) {
    for (let i = broods.length - 1; i >= 0; i--) { const b = broods[i]; b.t += dt; const m = b.tgt;
      if (b.vy !== 0) { b.vy -= 30 * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.z += b.vz * dt; if (b.y <= 0.12) { b.y = 0.12; b.vy = 0; } }      // the splash
      else if (m && !m.dead && b.on > 0) {                 // riding its monster
        b.on += dt; const big = !isFry(m), o = m.r * (big ? 0.85 : 0.25), w = b.ph + b.on * (big ? 3.2 : 1.2);
        b.x = m.pos.x + Math.cos(w) * o; b.z = m.pos.z + Math.sin(w) * o; b.y = critterTop(m) * (big ? 0.5 + 0.35 * Math.sin(w * 1.7) : 0.8);
        if (b.own && (b.tick -= dt) <= 0) { b.tick = 0.4; slowCritter(m, 0.7); }
        if (b.on >= BROOD.slow[b.lv - 1]) { if (b.lv >= 3 && b.own) hitCritter(m, 3, null, 2); broodEnd(b, i, b.lv >= 3); continue; }
      } else {                                              // on the ground: find a monster nobody sits on yet and run to it
        if (m && m.dead) { b.tgt = null; b.on = 0; }
        if (!b.tgt && (b.look -= dt) <= 0) { b.look = 0.3; let bd = BROOD.r[b.lv - 1];
          for (const q of swarm) { if (q.dead || q.rig || q.dig > 0) continue; const d = Math.hypot(q.pos.x - b.x, q.pos.z - b.z); if (d >= bd) continue;
            let n = 0; for (const o of broods) if (o.tgt === q) n++; if (n >= (isFry(q) ? 1 : 4)) continue; bd = d; b.tgt = q; } }
        const q = b.tgt;
        if (q) { const dx = q.pos.x - b.x, dz = q.pos.z - b.z, d = Math.hypot(dx, dz) || 1e-3; if (d < q.r + 0.4) b.on = 0.001; else { const sp = Math.min(d, 16 * dt), wig = Math.sin(b.t * 18 + b.ph) * 0.35; b.x += (dx / d - dz / d * wig) * sp; b.z += (dz / d + dx / d * wig) * sp; } }
        else { b.x += Math.cos(b.ph + b.t * 2) * 3 * dt; b.z += Math.sin(b.ph + b.t * 2) * 3 * dt; }
        b.y = 0.12;
      }
      if (b.t > 9 || (!b.tgt && b.t > 2.6)) { broodEnd(b, i, false); continue; }
      b.spr.position.set(b.x, b.y + 0.7, b.z); b.spr.material.rotation = Math.sin(b.t * 22 + b.ph) * 0.35; b.spr.material.opacity = Math.min(1, (9 - b.t) * 2);
    }
  }
  // -- halo: spikes of light where it lands; they stand a while and hurt whatever is among them --
  const spikeFields = [];
  const spikeGeo = new THREE.ConeGeometry(0.36, 1, 6); spikeGeo.translate(0, 0.5, 0);
  const spikeMat = glow(new THREE.MeshBasicMaterial({ color: 0x8fd4ff }), 1.25), spikeCore = glow(new THREE.MeshBasicMaterial({ color: 0xffe9a0 }), 1.5);      // bright, but the shape must survive the bloom
  function spawnSpikes(x, z, lv, own) {
    const g = new THREE.Group(), n = SPIKE.n[lv - 1], R = SPIKE.r[lv - 1], H = SPIKE.h[lv - 1], inner = Math.max(1, Math.round(n / 3)), ph = Math.random() * 6.283;
    for (let i = 0; i < n; i++) { const core = i < inner, a = ph + (core ? i / inner : (i - inner) / (n - inner)) * 6.283 + (core ? 0 : 0.4), rr = core ? R * 0.34 : R * (0.72 + Math.random() * 0.2);
      const c = new THREE.Mesh(spikeGeo, core ? spikeCore : spikeMat), w = (core ? 1.25 : 1) * (0.8 + lv * 0.2);
      c.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); c.rotation.set(Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28);      // they lean outward a little, like a crown
      c.userData = { h: H * (core ? 1.15 : 0.75 + Math.random() * 0.4), w, d: (core ? 0 : 0.05) + Math.random() * 0.08 }; c.scale.set(w, 0.001, w); g.add(c); }
    g.position.set(x, 0, z); scene.add(g); spikeFields.push({ g, x, z, lv, own, t: 0, tick: 0.12 });
    flash(tmp.set(x, 0.8, z), 0xbfe9ff, R * 0.7, 0.2, 2, false); waveFx(x, z, R, 0xbfe9ff, 0.3);
  }
  function updateSpikes(dt) {
    for (let i = spikeFields.length - 1; i >= 0; i--) { const F = spikeFields[i]; F.t += dt; const T = SPIKE.T[F.lv - 1], R = SPIKE.r[F.lv - 1], out = Math.max(0, Math.min(1, (T - F.t) / 0.25));
      for (const c of F.g.children) { const k = Math.max(0, Math.min(1, (F.t - c.userData.d) / 0.16)), e = k <= 0 ? 0 : 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);      // they shoot up with a little overshoot and sink back at the end
        c.scale.set(c.userData.w, Math.max(0.001, c.userData.h * e * out), c.userData.w); }
      if (F.own && F.t < T && (F.tick -= dt) <= 0) { F.tick = 0.4; const dmg = SPIKE.dmg[F.lv - 1];
        for (const m of swarm) { if (m.dead || m.dig > 0) continue; const dx = m.pos.x - F.x, dz = m.pos.z - F.z, d = Math.hypot(dx, dz) || 1e-3; if (d < R + m.r) hitCritter(m, dmg, tmp.set(dx / d, 0, dz / d).clone(), 1.5); }
        for (const e of enemies) { if (e.dead || e.carried) continue; const dx = e.pos.x - F.x, dz = e.pos.z - F.z, d = Math.hypot(dx, dz) || 1e-3; if (d < R + e.r) hitEnemy(e, tmp.set(dx / d, 0, dz / d).clone(), dmg, 1.5); } }
      if (F.t >= T) { scene.remove(F.g); spikeFields.splice(i, 1); } }
  }
  // -- unicorn: a starburst, the nova ring in small: smaller shots that do not fly as far --
  const starbMat = glow(new THREE.MeshBasicMaterial({ color: 0xff8ad8 }), 3.2);
  function starburst(lv) {
    const n = STARB.n[lv - 1], o = new THREE.Vector3(car.pos.x, 1.0, car.pos.z), ph = Math.random() * 6.283, sp = 38;
    for (let i = 0; i < n; i++) { const a = ph + i / n * 6.283, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), m = new THREE.Mesh(bulletGeo, starbMat);
      m.scale.set(0.7, 0.7, 0.55); m.position.copy(o).addScaledVector(dir, 1.4); m.lookAt(m.position.x + dir.x, m.position.y, m.position.z + dir.z); scene.add(m);
      bullets.push({ m, v: dir.multiplyScalar(sp), life: STARB.reach[lv - 1] / sp, dmg: STARB.dmg[lv - 1] }); }
    flash(o, 0xff8ad8, 4 + lv * 1.5, 0.25, 3); waveFx(o.x, o.z, STARB.reach[lv - 1], 0xff8ad8, STARB.reach[lv - 1] / sp); SFX.play('nova', car.pos, { rate: 1.5, vol: 0.6 });
  }
  function landPower(lv) {                                 // my ride came down from a jump with a levelled jump skill
    const x = car.pos.x, z = car.pos.z;
    if (GS.ride === 'buggy') stomp(lv); else if (GS.ride === 'spider') spawnBrood(x, z, lv, true); else if (GS.ride === 'halo') spawnSpikes(x, z, lv, true); else starburst(lv);
    netEv({ t: 'jfx', k: GS.ride, l: lv, x: r1(x), z: r1(z) });
  }
  function landFxRemote(k, lv, x, z) {                     // a friend's landing: the picture only, the damage is theirs
    if (k === 'buggy') { waveFx(x, z, STOMP.r[lv - 1], 0xffe08a); if (lv >= 2) waveFx(x, z, STOMP.r[lv - 1] * 0.62, 0xfff4c8, 0.32); }
    else if (k === 'spider') spawnBrood(x, z, lv, false); else if (k === 'halo') spawnSpikes(x, z, lv, false);
    else if (k === 'unicorn') { flash(tmp.set(x, 1, z), 0xff8ad8, 4 + lv * 1.5, 0.25, 3, false); waveFx(x, z, STARB.reach[lv - 1], 0xff8ad8, STARB.reach[lv - 1] / 38); }
  }
  function updateLandFx(dt) {
    for (let i = landWaves.length - 1; i >= 0; i--) { const w = landWaves[i]; w.t += dt; const k = Math.min(1, w.t / w.T), e = 1 - (1 - k) * (1 - k); w.m.scale.setScalar(0.5 + (w.r - 0.5) * e); w.m.material.opacity = 0.9 * (1 - k * k);
      if (k >= 1) { scene.remove(w.m); w.m.material.dispose(); landWaves.splice(i, 1); } }
    updateBrood(dt); updateSpikes(dt);
  }

  // ---------- abilities & loot ----------
  const abilities = { drill: false, burrow: false, grab: false, jump: true, doubleJump: false, bomb: false, decoy: false, cubes: false, trail: false };
  // every ride has its own kit; the specials sit on Shift, the drill runs by itself
  const kit = () => RIDE_KIT[GS.ride] || RIDE_KIT.buggy;
  const kitDone = () => kit().every(t => abilities[t]);
  const abLv = { drill: 0, burrow: 0, grab: 0, jump: 0, doubleJump: 0, bomb: 0, decoy: 0, cubes: 0, trail: 0 };      // upgrades spent on each, 0..AB_LV_MAX
  // Loot: coins level the ride's skills, crystals level the guns and buy the level's ultimates. Coins pour out of everything that breaks or dies, with no ceiling.
  // Crystals are rare: bosses and log machines drop them, and the shop turns coins into them at a steep rate (SHOP.conv).
  let lootSfxT = 0; GS.lootId = 0; GS.coins = 0; GS.gems = 0; const loot = [], ult = { sword: 0, hands: 0 };
  const coinGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.16, 18); coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc62e, metalness: 0.85, roughness: 0.28, emissive: 0x7a4a00 });
  const gemGeo = new THREE.OctahedronGeometry(0.62); gemGeo.scale(1, 1.5, 1);
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x5cecff, metalness: 0.2, roughness: 0.15, emissive: 0x1a8fb5, flatShading: true });
  function addLoot(id, gem, x, z, vx, vy, vz) {
    const m = new THREE.Mesh(gem ? gemGeo : coinGeo, gem ? gemMat : coinMat); m.castShadow = true; m.position.set(x, 0.8, z); scene.add(m);
    loot.push({ id, gem, x, y: 0.8, z, vx, vy, vz, m, t: 0, spin: Math.random() * 6 });
  }
  function dropCoins(at, nc, ng) {                           // host: scatter nc coins and ng crystals
    if (NET.client || (inRoom(at.x, at.z) && !GS.gateOpen)) return;
    const a = [], wide = Math.min(4, (nc + ng) * 0.12);
    for (let i = 0; i < nc + ng; i++) { const an = Math.random() * 6.283, sp = 2.5 + Math.random() * (3.5 + wide), id = ++GS.lootId, q = [id, i < nc ? 0 : 1, r1(at.x), r1(at.z), r1(Math.cos(an) * sp), r1(7 + Math.random() * 4), r1(Math.sin(an) * sp)];
      addLoot(id, q[1], q[2], q[3], q[4], q[5], q[6]); a.push(q); }
    if (a.length) { netEv({ t: 'loot', a }); SFX.play('loot', at, { vol: 0.5, rate: 1.4 }); }
    while (loot.length > LOOT.max) { const L = loot[0]; netEv({ t: 'lootx', i: L.id }); lootRemove(L); }      // the oldest pieces go when the field is full of them
  }
  function lootRemove(L) { const i = loot.indexOf(L); if (i >= 0) { scene.remove(L.m); loot.splice(i, 1); } }
  function lootFrom(kind, x, z) {                            // what each source is worth; a client's own crate or evil cube asks the host
    if (NET.client) { netEv({ t: 'lootreq', k: kind, x: r1(x), z: r1(z) }, NET.hostPeer); return; }
    const at = tmp.set(x, 0, z).clone(), r = Math.random();
    if (kind === 'mob') { if (r < 0.3) dropCoins(at, r < 0.1 ? 2 : 1, 0); }                  // plain biters: a coin now and then
    else if (kind === 'tough') dropCoins(at, 3, 0);                                         // spitters, flappers
    else if (kind === 'brute') dropCoins(at, 6 + Math.floor(r * 3), 0);
    else if (kind === 'crate') dropCoins(at, 3 + Math.floor(r * 3), 0);
    else if (kind === 'enemy') dropCoins(at, 4, 0);
    else if (kind === 'elite') dropCoins(at, 8, 0);
    else if (kind === 'mini') dropCoins(at, 20, 3);
    else if (kind === 'wb') dropCoins(at, 10, r < 0.5 ? 3 : 0);
    else if (kind === 'rig') dropCoins(at, 30, 15);
    else if (kind === 'boss') dropCoins(at, 60, 20);
  }
  function updateLoot(dt) {
    if (startEl.isConnected) return;
    for (let i = loot.length - 1; i >= 0; i--) { const L = loot[i]; L.t += dt;
      if (L.t > LOOT.life) { lootRemove(L); continue; } if (L.t > LOOT.life - 5) L.m.visible = Math.sin(L.t * 22) > -0.3;      // nobody came for it: it blinks and goes
      if (L.y > 0.8 || L.vy > 0) { L.vy -= 26 * dt; L.x += L.vx * dt; L.z += L.vz * dt; L.y += L.vy * dt;
        if (L.y <= 0.8) { L.y = 0.8; if (L.vy < -4) { L.vy = -L.vy * 0.4; L.vx *= 0.6; L.vz *= 0.6; } else { L.vy = 0; L.vx = L.vz = 0; } }
        const q = tmp.set(L.x, 0, L.z); for (const o of obstacles) if (active(o)) pushOutOfBox(q, 0.9, o);                      // never lands inside a rock: every piece can be reached
        if (inRoom(q.x, q.z)) { L.x = q.x; L.z = q.z; } else { L.x = THREE.MathUtils.clamp(q.x, -ARENA + 2, ARENA - 2); L.z = THREE.MathUtils.clamp(q.z, -ARENA + 2, ARENA - 2); } }
      const d = Math.hypot(car.pos.x - L.x, car.pos.z - L.z);
      if (car.alive && L.t > 0.45 && d < LOOT.pull && d > 0.01) { const k = Math.min(1, (LOOT.pullV[0] + (LOOT.pullV[1] - LOOT.pullV[0]) * (1 - d / LOOT.pull)) * dt / d); L.x += (car.pos.x - L.x) * k; L.z += (car.pos.z - L.z) * k; }      // a strong magnet: no circling over the pile
      L.m.position.set(L.x, L.y + (L.vy === 0 ? Math.sin(GS.elapsed * 3 + L.id) * 0.15 : 0), L.z); L.m.rotation.y = L.spin + GS.elapsed * (L.gem ? 2.2 : 4.5);
      if (car.alive && L.t > 0.45 && d < 1.9) {
        spawnParticles(tmp.set(L.x, 1, L.z), L.gem ? 0x8ff4ff : 0xffd65a, 5, 5); scene.remove(L.m); loot.splice(i, 1);
        if (NET.client) netEv({ t: 'lootget', i: L.id }, NET.hostPeer); else { lootGain(L.gem); netEv({ t: 'lootx', i: L.id }); } }      // the host decides who got it: one piece, one owner
    }
  }
  function lootGain(gem) { if (gem) GS.gems++; else GS.coins++; GS.abSig = '';
    if (GS.elapsed - lootSfxT > 0.045) { lootSfxT = GS.elapsed; SFX.play('pickup', null, { vol: 0.3, rate: gem ? 1.9 : 1.55 + Math.random() * 0.2 }); } }      // a handful at once must not be a wall of sound
  const abPrice = t => LOOT.abCost[abLv[t]], wPrice = k => LOOT.wCost[(weapons[k] - 1) >> 1];
  const AB_LV_MAX = 2, UP_MAX = 6, abMax = t => t === 'jump' ? 3 : AB_LV_MAX;      // the jump has three levels: it is the one skill every ride has, and each ride's does its own thing                         // ~6 upgrades a run against 12 possible levels (3 skills + 3 guns, 2 each): you pick a build
  let upPts = 0, upGot = 0;
  const UP_TEXT = { drill: ['spins longer', 'wider and meaner'], burrow: ['harder to dig out', 'surfacing knocks everyone back'], grab: ['throws hit twice as hard', 'throws x3, loot flies to you'],
                    doubleJump: ['a third jump', 'air jumps blast below'], bomb: ['bigger dome, 3 s', 'huge dome, 4 s'],
                    decoy: ['two decoys at once', 'three decoys at once'], cubes: ['five cubes', 'cubes swell up and burst'], trail: ['the trail lasts longer', 'the trail slows them too'] };
  const JUMP_UP = { buggy: ['landing wave stuns the shooters', 'the wave halves the small fry, stuns 2 s', 'the wave kills the small fry, stuns bosses'],
                    spider: ['landing scatters spiderlings that slow', 'more spiderlings, longer slow', 'the spiderlings blow up'],
                    halo: ['light spikes where you land', 'more spikes, they last longer', 'a field of tall spikes'],
                    unicorn: ['a small star ring on landing', 'more stars, further', 'a full starburst'] };
  const upText = t => t === 'jump' ? JUMP_UP[GS.ride] : UP_TEXT[t];
  const AB_INFO = {
    drill:      { title: 'Drill',            key: 'auto',  hint: 'spins up by itself between nova pulses, grinds a 180° arc ahead', bg: '#ff8c32' },
    burrow:     { title: 'Mole',             key: 'RMB',   hint: 'RMB — dig in / pop out, biters scatter', bg: '#8a6a44' },
    bomb:       { title: 'Dome Bomb',        key: 'RMB',   hint: 'RMB — blasts the biters away, nobody gets into the dome', bg: '#c45cb4' },
    decoy:      { title: 'Decoy Chubz',      key: 'RMB',   hint: 'RMB — toss a squeaky fake chubzik: monsters chase it, then boom', bg: '#e0902c' },
    cubes:      { title: 'Wing Cubes',       key: 'RMB',   hint: 'RMB — little winged cubes fly out and dive-bomb the small fry', bg: '#5fb0e8' },
    trail:      { title: 'Rainbow Trail',    key: 'passive', hint: 'biters that step on your trail lose you for a moment', bg: '#e865a8' },
    upgrade:    { title: 'Upgrade',          key: '',      hint: 'click the + over a skill to level it up', bg: '#e8b417' },
    grab:       { title: 'Frog Tongue',      key: 'RMB',   hint: 'RMB at cursor — pulls onto the drill, release to throw', bg: '#2b6f8a' },
    jump:       { title: 'Kangaroo',         key: 'Space', hint: 'Space — jump, landing crushes', bg: '#2fa3b5' },
    doubleJump: { title: 'Two Kangaroos',    key: '2×Spc', hint: 'Space again mid-air — second jump', bg: '#8e5bd6' },
    heal:       { title: 'Medkit',           key: '',      hint: '+40 HP', bg: '#e5484d' },
    w_spread:   { title: 'Fan Gun',          key: '',      hint: 'the main gun fires a fan of tracers', bg: '#e0a020' },
    w_nova:     { title: 'Nova Ring',        key: '',      hint: 'a ring of bullets bursts out on a cooldown', bg: '#1fb5a8' },
    w_orbit:    { title: 'Saw Orbit',        key: '',      hint: 'spinning saws circle the car', bg: '#d8443a' },
    w_mortar:   { title: 'Mortar',           key: '',      hint: 'a heavy shell on the biggest crowd', bg: '#7b55d6' },
  };
  const AB_ORDER = ['drill', 'burrow', 'grab', 'jump', 'doubleJump'];

  // иконки рисуются кодом на canvas: одна и та же картинка идёт в HUD и в спрайт лута
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function kangaroo(ctx, x, y, sc, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.fillStyle = col; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(-8, 18); ctx.quadraticCurveTo(-36, 28, -54, 46); ctx.lineTo(-48, 50); ctx.quadraticCurveTo(-28, 40, 0, 32); ctx.closePath(); ctx.fill(); // хвост
    ctx.beginPath(); ctx.ellipse(0, 10, 18, 27, -0.5, 0, Math.PI * 2); ctx.fill();            // тело
    ctx.beginPath(); ctx.moveTo(-4, 30); ctx.lineTo(36, 42); ctx.lineTo(36, 49); ctx.lineTo(-6, 46); ctx.closePath(); ctx.fill(); // лапа
    ctx.beginPath(); ctx.ellipse(14, -16, 8, 13, 0.6, 0, Math.PI * 2); ctx.fill();            // шея
    ctx.beginPath(); ctx.ellipse(23, -27, 11, 8, 0.2, 0, Math.PI * 2); ctx.fill();            // голова
    ctx.beginPath(); ctx.ellipse(33, -24, 8, 5, 0.3, 0, Math.PI * 2); ctx.fill();             // морда
    ctx.beginPath(); ctx.moveTo(15, -32); ctx.lineTo(18, -50); ctx.lineTo(24, -33); ctx.closePath(); ctx.fill(); // уши
    ctx.beginPath(); ctx.moveTo(21, -33); ctx.lineTo(27, -48); ctx.lineTo(29, -31); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(12, -4); ctx.lineTo(26, 6); ctx.stroke(); // лапка
    ctx.restore();
  }
  function makeIcon(type) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    rr(ctx, 4, 4, 120, 120, 22); ctx.fillStyle = AB_INFO[type].bg; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
    if (type === 'drill') {
      ctx.save(); ctx.translate(64, 66); ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#3a3d44'; rr(ctx, -17, 14, 34, 26, 5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-20, 16); ctx.lineTo(20, 16); ctx.lineTo(0, -48); ctx.closePath();
      ctx.fillStyle = '#e8ecf1'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.strokeStyle = '#f0c03a'; ctx.lineWidth = 7;
      for (let y = -46; y < 20; y += 13) { ctx.beginPath(); ctx.moveTo(-24, y + 8); ctx.lineTo(24, y - 6); ctx.stroke(); }
      ctx.restore(); ctx.restore();
    } else if (type === 'burrow') {
      ctx.fillStyle = '#4a3420'; ctx.beginPath(); ctx.ellipse(64, 112, 50, 14, 0, Math.PI, 0); ctx.fill();   // кучка земли
      ctx.fillStyle = '#5b3d24'; ctx.beginPath(); ctx.arc(64, 74, 36, 0, Math.PI * 2); ctx.fill();          // крот
      ctx.fillStyle = '#7a5434'; ctx.beginPath(); ctx.ellipse(64, 86, 22, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f29bb0'; ctx.beginPath(); ctx.ellipse(64, 84, 10, 7, 0, 0, Math.PI * 2); ctx.fill();   // нос
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(50, 64, 4, 0, Math.PI * 2); ctx.arc(78, 64, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2d6c4';
      [[30, 100], [98, 100]].forEach(([x, y]) => { ctx.beginPath(); ctx.ellipse(x, y, 13, 9, 0, 0, Math.PI * 2); ctx.fill(); });
      ctx.strokeStyle = '#5b3d24'; ctx.lineWidth = 2;
      [[30, 100], [98, 100]].forEach(([x, y]) => { for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 5, y - 4); ctx.lineTo(x + k * 6, y + 7); ctx.stroke(); } });
    } else if (type === 'grab') {
      ctx.strokeStyle = '#f06292'; ctx.lineWidth = 9; ctx.lineCap = 'round';                               // язык
      ctx.beginPath(); ctx.moveTo(62, 80); ctx.quadraticCurveTo(96, 92, 104, 58); ctx.stroke();
      ctx.fillStyle = '#f06292'; ctx.beginPath(); ctx.arc(104, 54, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4fbf5a'; ctx.beginPath(); ctx.ellipse(46, 78, 34, 26, 0, 0, Math.PI * 2); ctx.fill(); // лягушка
      ctx.beginPath(); ctx.arc(30, 52, 13, 0, Math.PI * 2); ctx.arc(60, 52, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(30, 50, 8, 0, Math.PI * 2); ctx.arc(60, 50, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(32, 50, 4, 0, Math.PI * 2); ctx.arc(62, 50, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(22, 84); ctx.quadraticCurveTo(46, 94, 66, 82); ctx.stroke();
    } else if (type === 'jump') {
      kangaroo(ctx, 62, 62, 1.0, '#fff');
    } else if (type === 'doubleJump') {
      kangaroo(ctx, 42, 78, 0.6, '#fff');
      kangaroo(ctx, 88, 52, 0.6, '#fff');
    } else if (type === 'bomb') {                         // a dome over a burst
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(64, 92, 42, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(14, 92); ctx.lineTo(114, 92); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath();
      for (let i = 0; i < 14; i++) { const r = i % 2 ? 8 : 19, b = i / 14 * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](64 + Math.cos(b) * r, 70 + Math.sin(b) * r); } ctx.closePath(); ctx.fill();
    } else if (type === 'decoy') {                        // a round chubzik with sound waves
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(52, 74, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0902c'; ctx.beginPath(); ctx.arc(43, 70, 4.5, 0, 7); ctx.arc(61, 70, 4.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (const r of [16, 30]) { ctx.beginPath(); ctx.arc(84, 52, r, -0.9, 0.2); ctx.stroke(); }
    } else if (type === 'cubes') {                        // a cube with wings
      ctx.fillStyle = '#fff'; ctx.fillRect(46, 50, 36, 36);
      ctx.beginPath(); ctx.moveTo(46, 60); ctx.quadraticCurveTo(16, 34, 12, 66); ctx.quadraticCurveTo(28, 64, 46, 74); ctx.fill();
      ctx.beginPath(); ctx.moveTo(82, 60); ctx.quadraticCurveTo(112, 34, 116, 66); ctx.quadraticCurveTo(100, 64, 82, 74); ctx.fill();
      ctx.fillStyle = '#5fb0e8'; ctx.fillRect(52, 74, 24, 5);
    } else if (type === 'trail') {                        // rainbow arcs
      ctx.lineWidth = 9; ctx.lineCap = 'round';
      ['#fff', '#ffe08a', '#a8f0ff'].forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(64, 96, 44 - i * 12, Math.PI, 0); ctx.stroke(); });
    } else if (type === 'upgrade') {                      // two chevrons up
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const y of [58, 92]) { ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(64, y - 30); ctx.lineTo(96, y); ctx.stroke(); }
    } else if (type === 'heal') {
      ctx.fillStyle = '#fff'; rr(ctx, 52, 26, 24, 76, 6); ctx.fill(); rr(ctx, 26, 52, 76, 24, 6); ctx.fill();
    } else if (type === 'w_spread') {                    // fan of tracers from a muzzle
      ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) { const a = -Math.PI / 2 + i * 0.32; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 26, 104 + Math.sin(a) * 26); ctx.lineTo(64 + Math.cos(a) * 74, 104 + Math.sin(a) * 74); ctx.stroke(); }
      ctx.fillStyle = '#fff'; rr(ctx, 50, 96, 28, 18, 5); ctx.fill();
    } else if (type === 'w_nova') {                      // ring of bullets around a core
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(64, 64, 13, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.arc(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, 6.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(64, 64, 27, 0, Math.PI * 2); ctx.stroke();
    } else if (type === 'w_orbit') {                     // orbit path with saw blades
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 4; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.arc(64, 64, 38, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; rr(ctx, 54, 54, 20, 20, 4); ctx.fill();
      for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 - 0.5, cx = 64 + Math.cos(a) * 38, cy = 64 + Math.sin(a) * 38;
        ctx.beginPath(); for (let i = 0; i < 16; i++) { const r = i % 2 ? 9 : 15, b = i / 16 * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(b) * r, cy + Math.sin(b) * r); } ctx.closePath(); ctx.fill(); }
    } else if (type === 'w_mortar') {                    // arcing shell and a blast
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.setLineDash([9, 8]); ctx.beginPath(); ctx.moveTo(22, 104); ctx.quadraticCurveTo(52, 6, 88, 74); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const r = i % 2 ? 11 : 26, b = i / 16 * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](92 + Math.cos(b) * r, 88 + Math.sin(b) * r); } ctx.closePath(); ctx.fill();
    }
    return c;
  }
  const ICONS = {}, ICON_URLS = {};
  for (const t of Object.keys(AB_INFO)) { ICONS[t] = makeIcon(t); ICON_URLS[t] = ICONS[t].toDataURL(); }
  const X_TOKENS = { x_spread: ['w_spread', 'Bullet Storm'], x_nova: ['w_nova', 'Nova Burst'], x_saw: ['w_orbit', 'Saw Blast'], x_decoy: ['decoy', 'Decoy Party'], x_cubes: ['cubes', 'Cube Swarm'], x_dome: ['bomb', 'Dome Drop'] };
  for (const [x, [src, title]] of Object.entries(X_TOKENS)) { AB_INFO[x] = { title, key: '', hint: 'went off right here, once', bg: AB_INFO[src].bg }; ICONS[x] = ICONS[src]; ICON_URLS[x] = ICON_URLS[src]; }

  // HUD: the ride's own skills, each with a + over it while there are upgrades to spend
  const abBar = document.getElementById('abilities');
  var abDirty = true;                                      // setRide() asks for a rebuild (it runs before this line on start-up, hence var)
  function bindAb(t, down, up, drag) {                     // touch: the icons double as buttons
    const el = document.getElementById('ab-' + t); if (!el) return; let id = null, ox = 0, oy = 0;
    el.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      if (id !== null || !abilities[t]) return;
      const tc = e.changedTouches[0]; id = tc.identifier; ox = tc.clientX; oy = tc.clientY;
      el.classList.add('down'); down();
    }, { passive: false });
    el.addEventListener('touchmove', e => {
      e.preventDefault();
      if (drag) for (const tc of e.changedTouches) if (tc.identifier === id) drag(tc.clientX - ox, tc.clientY - oy);
    }, { passive: false });
    const end = e => { for (const tc of e.changedTouches) if (tc.identifier === id) { id = null; el.classList.remove('down'); if (up) up(); } };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  }
  GS.abSig = '';
  function buildAbBar() {
    abDirty = false; GS.abSig = ''; abBar.innerHTML = '';
    for (const t of kit()) {
      const d = document.createElement('div'); d.className = 'ab locked'; d.id = 'ab-' + t;
      d.innerHTML = `<b class="up">+</b><img src="${ICON_URLS[t]}" draggable="false"><span>${AB_INFO[t].key}</span><i class="lv"></i><i class="cdv"></i><i class="cost"></i>`;
      abBar.appendChild(d);
      const upB = d.querySelector('.up'), spend = e => { e.preventDefault(); e.stopPropagation(); upgradeAb(t); };
      upB.addEventListener('mousedown', spend); upB.addEventListener('touchstart', spend, { passive: false });
    }
    const tag = document.createElement('div'); tag.id = 'wallet'; abBar.appendChild(tag);
    bindAb('jump', () => jump());
    bindAb('burrow', () => toggleBurrow());
    bindAb('bomb', () => bombDome());
    bindAb('decoy', () => throwDecoys(), null, (dx, dy) => { if (Math.hypot(dx, dy) > 14) { stickWorld(dx, dy, touch.aimDir); touch.aimDist = 6 + 12 * Math.min(1, Math.hypot(dx, dy) / 70); } });
    bindAb('cubes', () => releaseCubes());
    layoutTouch(); updateAbHud();
  }
  function upgradeAb(t) {
    if (!abilities[t] || abLv[t] >= abMax(t) || GS.coins < abPrice(t)) return;
    GS.coins -= abPrice(t); abLv[t]++;
    toast(t, 'Lv ' + (abLv[t] + 1), upText(t)[abLv[t] - 1]); SFX.play('pickup', null, { rate: 1.3 });
    const el = document.getElementById('ab-' + t); if (el) { el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); }
    updateAbHud();
  }
  function updateAbHud() {
    if (abDirty) { buildAbBar(); return; }
    const act = RIDE_ACTIVE[GS.ride], bk = act && abilities[act] ? activeCdK() : 0;
    const sig = kit().map(t => (abilities[t] ? 1 : 0) + '' + abLv[t]).join() + '|' + GS.coins + '|' + GS.gems + '|' + bk.toFixed(2);
    if (sig === GS.abSig) return; GS.abSig = sig;
    if (GS.wUpSeen !== GS.gems) { GS.wUpSeen = GS.gems; updateWeaponHUD(); }      // guns are levelled with crystals
    for (const t of kit()) {
      const el = document.getElementById('ab-' + t); if (!el) continue;
      if (abilities[t] && el.classList.contains('locked')) { el.classList.remove('locked'); el.classList.add('fresh'); }
      const open = abilities[t] && abLv[t] < abMax(t); el.classList.toggle('can', open && GS.coins >= abPrice(t));
      const ce = el.querySelector('.cost'); ce.textContent = open ? abPrice(t) + '●' : ''; ce.classList.toggle('ok', open && GS.coins >= abPrice(t));
      el.querySelector('.lv').textContent = abLv[t] ? '★'.repeat(abLv[t]) : '';
      if (t === act) el.style.setProperty('--cd', bk.toFixed(2));
    }
    const tag = document.getElementById('wallet');
    if (tag) tag.innerHTML = '<b class="c">● ' + GS.coins + '</b><b class="g">◆ ' + GS.gems + '</b>';
  }
  const toastEl = document.getElementById('toast'); let toastTimer = 0;
  function toast(type, extra, hint) {
    const i = AB_INFO[type];
    toastEl.innerHTML = `<img src="${ICON_URLS[type]}"><div>${i.title}${extra ? ' ' + extra : ''}${i.key ? ' — ' + i.key : ''}<small>${hint || i.hint}</small></div>`;
    toastEl.style.opacity = 1; toastTimer = 3;
  }
  function applyAbilityVisuals() {
    drill.visible = abilities.drill; bullbar.visible = !abilities.drill;
    arm.visible = mast.visible = abilities.grab;
    GS.abSig = '';
  }
  applyAbilityVisuals();
  /* test-seam: debug registry */

  // лут
  const pickups = [];
  const pickupTex = {};
  function dropLoot(at) {                                  // elites and the boss: a one-shot token or a medkit
    const xs = Object.keys(X_TOKENS); spawnPickup(Math.random() < 0.65 ? xs[Math.floor(Math.random() * xs.length)] : 'heal', at);
  }
  function fireToken(type) {                               // a token goes off where you stand
    const o = new THREE.Vector3(car.pos.x, 1.0 + car.y, car.pos.z);
    if (type === 'x_spread' || type === 'x_nova') {
      const n = type === 'x_nova' ? 28 : 36, ph = Math.random() * 6.283;
      for (let i = 0; i < n; i++) { const a = ph + i / n * 6.283, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), m = new THREE.Mesh(bulletGeo, type === 'x_nova' ? novaMat : bulletMat);
        m.position.copy(o).addScaledVector(dir, 1.6); m.lookAt(m.position.x + dir.x, m.position.y, m.position.z + dir.z); scene.add(m); bullets.push({ m, v: dir.multiplyScalar(44), life: type === 'x_nova' ? 0.6 : 0.8, dmg: 3 }); }
      flash(o, type === 'x_nova' ? 0x5ff5e6 : 0xffd27a, 8, 0.3, 3); SFX.play('nova', car.pos);
    } else if (type === 'x_saw') ringBlast(car.pos.x, car.pos.z, 7, 5, 14, 0xd8d8e0, false);
    else if (type === 'x_decoy') { for (let i = 0; i < 3; i++) { const a = car.heading + i * 2.094, x = THREE.MathUtils.clamp(car.pos.x + Math.sin(a) * 9, -ARENA + 3, ARENA - 3), z = THREE.MathUtils.clamp(car.pos.z + Math.cos(a) * 9, -ARENA + 3, ARENA - 3);
        addDecoy(car.pos.x, car.pos.z, x, z); netEv({ t: 'decoy', a: r1(car.pos.x), b: r1(car.pos.z), x: r1(x), z: r1(z) }); } }
    else if (type === 'x_cubes') { spawnCubes(4, null, 1); netEv({ t: 'cubes', n: 4, l: 1 }); }
    else if (type === 'x_dome') { const x = r1(car.pos.x), z = r1(car.pos.z); addDome(x, z, 9, 3); netEv({ t: 'dome', x, z, r: 9, T: 3 }); if (!NET.client) blastAt(x, z, 9, 1, 26, true); }
  }
  let kitProg = 0, kitNeed = 3;
  function gearNext() {                                    // what I am still missing: my ride's skills, then the three guns, then upgrades
    const t = kit().find(t => !abilities[t]); if (t) return t;
    const w = W_GEAR.find(k => !weapons[k]); if (w) return 'w_' + w;
    return null;
  }
  const gearDone = () => !gearNext();
  function myKill() {}                                     // ordinary kills drop nothing personal any more
  function bossDrop(x, z) {                                // a wandering boss died: everybody gets their next skill right there (lying where it fell)
    const t = kit().find(t => !abilities[t] && t !== 'jump' && !pickups.some(p => p.own && p.type === t)); if (!t) return;
    spawnPickup(t, tmp.set(THREE.MathUtils.clamp(x, -ARENA + 4, ARENA - 4), 0, THREE.MathUtils.clamp(z, -ARENA + 4, ARENA - 4)), undefined, true); pickups[pickups.length - 1].own = true;
  }
  let pkN = 0;
  function spawnPickup(type, at, id, remote) {
    if (!pickupTex[type]) pickupTex[type] = srgbTex(ICONS[type]);
    const sprite = new THREE.Sprite(glow(new THREE.SpriteMaterial({ map: pickupTex[type], depthTest: true }), 1.1));
    sprite.scale.set(2.4, 2.4, 1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 32),
      glow(new THREE.MeshBasicMaterial({ color: new THREE.Color(AB_INFO[type].bg), transparent: true, opacity: 0.8, depthWrite: false }), 2.4));
    ring.geometry.rotateX(-Math.PI / 2);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 6, 12, 1, true),
      glow(new THREE.MeshBasicMaterial({ color: new THREE.Color(AB_INFO[type].bg), transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 1.6));
    const x = inRoom(at.x, at.z) ? at.x : THREE.MathUtils.clamp(at.x, -ARENA + 3, ARENA - 3), z = inRoom(at.x, at.z) ? at.z : THREE.MathUtils.clamp(at.z, -ARENA + 3, ARENA - 3);
    ring.position.set(x, 0.05, z); beam.position.set(x, 3, z); sprite.position.set(x, 2.4, z);
    scene.add(sprite, ring, beam);
    const pid = id || String(NET.on && NET.game ? netMe() : 'me') + ':' + (++pkN);
    pickups.push({ type, sprite, ring, beam, x, z, t: 0, id: pid });
    SFX.play('loot', at);
    if (!remote) netEv({ t: 'pk', id: pid, ty: type, x: r1(x), z: r1(z) });             // everyone in the lobby sees the drop; first to touch it gets it
  }
  function pickupGone(id) { const i = pickups.findIndex(p => p.id === id); if (i < 0) return; const p = pickups[i]; scene.remove(p.sprite, p.ring, p.beam); pickups.splice(i, 1); spawnParticles(tmp.set(p.x, 1.5, p.z), 0xffffff, 6, 5); }
  const LOOT_PULL = 6.5;                                   // radius the loot starts drifting in from; Frog Tongue adds 30%
  function updatePickups(dt) {
    toastTimer -= dt;
    if (toastTimer <= 0 && toastEl.style.opacity !== '0') toastEl.style.opacity = 0;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.t += dt;
      p.sprite.position.y = 2.4 + Math.sin(p.t * 3) * 0.3 + Math.max(0, 1 - p.t * 2) * 2;   // выпрыгивает и покачивается
      p.ring.rotation.y += dt * 2;
      p.ring.scale.setScalar(1 + Math.sin(p.t * 4) * 0.08);
      if (p.t > 75 && (p.type.startsWith('w_') || p.type.startsWith('x_') || p.type === 'heal' || p.type === 'upgrade')) { scene.remove(p.sprite, p.ring, p.beam); pickups.splice(i, 1); continue; }      // nobody wanted it
      const full = (p.type.startsWith('w_') && weapons[p.type.slice(2)] > 0) || (p.type === 'upgrade' && upGot >= UP_MAX);           // already have that gun (level it with upgrades) / enough upgrades: leave it for the others
      const can = !full && car.alive && car.depth < 0.3 && p.t > 0.4;
      let dB = Math.hypot(car.pos.x - p.x, car.pos.z - p.z), dK = cart.shown ? Math.hypot(cart.pos.x - p.x, cart.pos.z - p.z) : 1e9;
      if (can) {                                           // loot drifts toward a passing ride (or its cart) so near misses still count
        const pullR = LOOT_PULL * (abilities.grab ? (abLv.grab >= 2 ? 2 : 1.3) : 1), d = Math.min(dB, dK);
        if (d < pullR && d > 0.05) {
          const tx = dB <= dK ? car.pos.x : cart.pos.x, tz = dB <= dK ? car.pos.z : cart.pos.z, step = Math.min(d, (4 + 10 * (1 - d / pullR)) * dt);
          p.x += (tx - p.x) / d * step; p.z += (tz - p.z) / d * step;
          p.sprite.position.x = p.x; p.sprite.position.z = p.z; p.ring.position.x = p.x; p.ring.position.z = p.z; p.beam.position.x = p.x; p.beam.position.z = p.z;
          dB = Math.hypot(car.pos.x - p.x, car.pos.z - p.z); if (cart.shown) dK = Math.hypot(cart.pos.x - p.x, cart.pos.z - p.z);
        }
      }
      if (can && (dB < 2.6 || dK < 2.2)) {
        let extra = '';
        netEv({ t: 'pkx', id: p.id });
        if (!p.type.startsWith('w_') && !p.type.startsWith('x_') && p.type !== 'heal' && p.type !== 'upgrade' && abilities[p.type]) p.type = 'heal';      // already have that one: patch the ride up instead
        if (p.type === 'heal') car.hp = Math.min(car.maxHp, car.hp + car.maxHp * 0.4);
        else if (p.type === 'upgrade') { upPts++; upGot++; extra = upGot + '/' + UP_MAX; GS.abSig = ''; }
        else if (p.type.startsWith('x_')) fireToken(p.type);
        else if (p.type.startsWith('w_')) { gainWeapon(p.type); extra = '— level it up with upgrades'; }
        else { abilities[p.type] = true; applyAbilityVisuals(); crewSay('ability'); }
        toast(p.type, extra); SFX.play(p.type === 'heal' ? 'heal' : 'pickup', null);
        spawnParticles(tmp.set(p.x, 1.5, p.z), new THREE.Color(AB_INFO[p.type].bg).getHex(), 16, 8);
        flash(tmp, new THREE.Color(AB_INFO[p.type].bg).getHex(), 8, 0.35, 3.5);
        scene.remove(p.sprite, p.ring, p.beam);
        pickups.splice(i, 1);
      }
    }
  }

  // ---------- weapons, survivors-style: broken crates drop chips that add a weapon or level it up ----------
  const W_MAX = 5, WEAPON_DROP = 0.35;
  const weapons = { spread: 0, nova: 0, orbit: 0, mortar: 0 };            // 0 = not owned yet
  let firstCrateDrop = true;

  // HUD: owned weapons with their level
  const wBar = document.getElementById('weapons');
  function updateWeaponHUD(fresh) {                      // fresh: the weapon that just changed pops
    wBar.innerHTML = W_ORDER.filter(k => weapons[k]).map(k =>
      `<div class="wslot${k === fresh ? ' new' : ''}${weapons[k] < W_MAX && GS.gems >= wPrice(k) ? ' can' : ''}"><b class="up" data-k="${k}">+</b><img src="${ICON_URLS['w_' + k]}" draggable="false"><b>${weapons[k] >= W_MAX ? 'MAX' : 'Lv' + wLv(k)}</b>${weapons[k] < W_MAX ? `<i class="cost${GS.gems >= wPrice(k) ? ' ok' : ''}">${wPrice(k)}◆</i>` : ''}</div>`).join('');
  }
  { const spendW = e => { const u = e.target.closest && e.target.closest('.up'); if (!u) return; e.preventDefault(); e.stopPropagation();
      const k = u.dataset.k; if (!weapons[k] || weapons[k] >= W_MAX || GS.gems < wPrice(k)) return; GS.gems -= wPrice(k); const lv = gainWeapon('w_' + k, true);
      toast('w_' + k, lv >= W_MAX ? 'MAX' : 'Lv ' + wLv(k)); SFX.play('pickup', null, { rate: 1.3 }); GS.abSig = ''; };
    wBar.addEventListener('mousedown', spendW); wBar.addEventListener('touchstart', spendW, { passive: false }); }
  GS.wUpSeen = -1;
  function dropWeapon(at) {                                 // after the warm-up: now and then a one-shot token (gear itself only drops for you, from your own kills)
    const onGround = pickups.filter(p => p.type.startsWith('x_') && Math.hypot(p.x - at.x, p.z - at.z) < 45).length;
    if (onGround >= 2) return;
    const r = Math.random(), xs = Object.keys(X_TOKENS);
    if (r < 0.3) spawnPickup(xs[Math.floor(Math.random() * xs.length)], at); else if (r < 0.42) spawnPickup('heal', at);
  }

  function crateDrop(o) {
    if (o.room || PH.i === 0) return;                     // the warm-up is fought with what the ride came with                                    // the boss's ammo doesn't pay out
    if (firstCrateDrop || Math.random() < Math.min(0.8, WEAPON_DROP * (1 + 0.5 * (NET.on && NET.game ? NET.remotes.size : 0)))) { firstCrateDrop = false; dropWeapon(o.mesh.position); }
  }
  const wLv = k => Math.ceil(weapons[k] / 2);                // shown level 1..3 (the stat tables keep 5 steps: 1, 3, 5)
  function gainWeapon(type, up) {
    const k = type.slice(2); weapons[k] = up ? Math.min(W_MAX, weapons[k] + 2) : Math.max(1, weapons[k]);
    updateWeaponHUD(k); crewSay('weapon');
    if (k === 'orbit') buildSaws();
    return weapons[k];
  }

  // ---- nova: a ring of bullets ----
  const novaMat = glow(new THREE.MeshBasicMaterial({ color: 0x5ff5e6 }), 3.5);
  GS.novaT = 0;
  function fireNova() {
    const L = weapons.nova - 1, n = W_STATS.nova.n[L], o = new THREE.Vector3(car.pos.x, 1.0 + car.y, car.pos.z), ph = Math.random() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = ph + i / n * Math.PI * 2, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const m = new THREE.Mesh(bulletGeo, novaMat); m.position.copy(o).addScaledVector(dir, 1.6);
      m.lookAt(m.position.x + dir.x, m.position.y, m.position.z + dir.z); scene.add(m);
      bullets.push({ m, v: dir.multiplyScalar(42), life: 0.55, dmg: W_STATS.nova.dmg[L] });
    }
    flash(o, 0x5ff5e6, 7, 0.25, 3); SFX.play('nova', car.pos); netEv({ t: 'wf', k: 'nova', l: L });
  }

  // ---- beam nova: the halo fires a star of holy rail beams that hold for a while; the unicorn blasts rainbows out of both ends, right across the map ----
  const beams = [], bmV = new THREE.Vector3();
  const beamGeo = new THREE.BoxGeometry(1, 1, 1); beamGeo.translate(0, 0, 0.5);         // runs along +z from its origin
  const railRingGeo = new THREE.TorusGeometry(0.5, 0.045, 5, 18);                       // lies across the beam
  const rbGeo = new THREE.PlaneGeometry(1, 1, 1, 1); rbGeo.rotateX(-Math.PI / 2); rbGeo.translate(0, 0, 0.5);      // flat ribbon along +z, uv.y = 1 at the origin
  const RAINBOW = [0xff4a5a, 0xff9a3a, 0xffe14a, 0x5fd36a, 0x4f9dff, 0xb06cff];
  const addMat = (c, k, o) => { const m = glow(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), k); m.userData.o = o; return m; };
  const rainbowMat = len => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: { value: 0 }, alpha: { value: 0 }, len: { value: len } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, alpha, len; varying vec2 vUv;
      void main(){
        float d = (1.0 - vUv.y) * len;
        float x = (vUv.x - 0.5) * 1.25 + 0.5 + 0.09 * sin(d * 0.5 - time * 13.0) + 0.03 * sin(d * 1.7 + time * 7.0);       // the ribbon wriggles
        if (x < 0.0 || x > 1.0) discard;
        float h = floor(x * 6.0) / 6.0 * 0.86;
        vec3 col = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        col = mix(col, vec3(1.0), 0.12) * (1.0 + 0.25 * sin(d * 0.9 - time * 20.0));                                      // pulses run down it
        float tw = pow(max(0.0, sin(d * 2.3 - time * 31.0) * sin(x * 37.0 + d * 1.3)), 10.0);                             // sparkles
        float edge = smoothstep(0.0, 0.06, x) * smoothstep(1.0, 0.94, x);
        gl_FragColor = vec4(col * 1.15 + tw * 2.5, alpha * edge * smoothstep(0.0, 1.2, d));
      }` });
  const swordMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 }, alpha: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, alpha; varying vec2 vUv;
      void main(){
        float d = 1.0 - vUv.y, x = abs(vUv.x - 0.5) * 2.0;                       // d: 0 at the hilt, 1 at the point
        float blade = 0.34 * min(1.0, (1.0 - d) / 0.2) * step(0.13, d);          // straight blade, tapering to the point
        float guard = step(0.09, d) * step(d, 0.13) * 0.95;                      // crossguard
        float grip = step(d, 0.09) * 0.1;
        float w = max(blade, max(guard, grip));
        float inside = 1.0 - smoothstep(w * 0.8, w, x);
        float core = 1.0 - smoothstep(0.0, w * 0.35 + 0.001, x);                 // white fuller down the middle
        float halo = (1.0 - smoothstep(w, w + 0.45, x)) * 0.16 * step(0.05, d) * (1.0 - smoothstep(0.9, 1.0, d));
        float glint = pow(max(0.0, sin(d * 9.0 - time * 7.0)), 14.0);            // a gleam runs up the blade
        vec3 col = mix(vec3(1.0, 0.72, 0.28), vec3(1.0, 0.97, 0.88), core) * (1.5 + 2.0 * core + 1.6 * glint * inside);
        float a = max(inside, halo);
        gl_FragColor = vec4(col * a, 1.0) * alpha;
      }` });
  const haloHoly = () => GS.ride === 'halo' && beams.some(B => B.kind === 'halo' && !B.fx);
  const carSrc = { get pos() { return car.pos; }, h: () => car.heading, y: () => car.y, alive: () => car.alive && car.depth < 0.3 };
  function fireBeams(src = carSrc, kind = GS.ride, L = weapons.nova - 1, fx = false) {      // fx: somebody else's beams, shown but harmless
    const dmg = W_STATS.nova.dmg[L];
    if (kind === 'halo') {                               // a ring of angelic swords; while they are out nothing can hurt the halo
      const n = HALO_SWORDS.n[L], len = HALO_SWORDS.len[L], ph = Math.random() * 6.283, dirs = [], mt = swordMat();
      for (let i = 0; i < n; i++) { const g = new THREE.Group(), m = new THREE.Mesh(rbGeo, mt); m.scale.set(2.3, 1, len); m.renderOrder = 4; g.add(m); scene.add(g); dirs.push({ g, a: ph + i / n * 6.283 }); }
      beams.push({ src, fx, kind: 'halo', dirs, mats: [mt], len, w: 1.1, t: 0, T: SWORD_T[L], tick: 0, every: HALO_SWORDS.every, dmg: dmg * HALO_SWORDS.dmgK });
      flash(tmp.set(src.pos.x, 2 + src.y(), src.pos.z), 0xfff0c0, 8, 0.3, 2.5);
    } else {
      const per = BEAM_PER[L], offs = per === 1 ? [0] : per === 2 ? [-0.2, 0.2] : [-0.38, 0, 0.38], len = 2 * ARENA + 80, dirs = [], mats = [];   // \|/ at full power, both ends
      for (const base of [0, Math.PI]) for (const o of offs) {
        const mt = rainbowMat(len), m = new THREE.Mesh(rbGeo, mt), g = new THREE.Group(); m.scale.set(2.4, 1, len); m.position.y = dirs.length * 0.015; m.renderOrder = 4; g.add(m);
        scene.add(g); dirs.push({ g, off: base + o, fwd: base === 0 }); mats.push(mt);
      }
      beams.push({ src, fx, kind: 'rainbow', dirs, mats, len, w: 2.0, t: 0, T: 1.0, tick: 0, every: 0.2, dmg: dmg * 1.4 });
      for (const sd of [1, -1]) flash(tmp.set(src.pos.x + Math.sin(src.h()) * 2.3 * sd, 2.6 + src.y(), src.pos.z + Math.cos(src.h()) * 2.3 * sd), 0xff9ad8, 6, 0.25, 2.5, sd > 0);
    }
    if (!fx) netEv({ t: 'wf', k: 'beam', l: L });
    SFX.play('nova', src.pos, { rate: kind === 'halo' ? 0.75 : 1.3 });
  }
  function beamHits(ox, oz, dx, dz, len, w, dmg) {       // everything lying across the beam takes a tick of damage
    const on = (px, pz, r) => { const rx = px - ox, rz = pz - oz, t = rx * dx + rz * dz; return t > -r && t < len + r && Math.abs(rx * dz - rz * dx) < r + w * 0.5; };
    bmV.set(dx, 0, dz);
    for (const e of enemies) if (!e.dead && !e.carried && on(e.pos.x, e.pos.z, e.r)) hitEnemy(e, bmV, dmg, 2);
    for (const m of swarm) if (!m.dead && on(m.pos.x, m.pos.z, m.r)) hitCritter(m, dmg, bmV, 2);
    for (const o of obstacles) if (o.crate && active(o) && on(o.mesh.position.x, o.mesh.position.z, Math.max(o.hx, o.hz))) damageCrate(o, dmg);
    if (boss.state === 'fight' && on(BOSS_POS.x, BOSS_POS.z, 4)) bossDamage(dmg);
  }
  function updateBeams(dt) {
    for (let i = beams.length - 1; i >= 0; i--) {
      const B = beams[i]; B.t += dt;
      const a = Math.max(0, Math.min(1, B.t / 0.08) * Math.min(1, (B.T - B.t) / 0.25));           // snap on, fade off
      for (const mt of B.mats) { mt.uniforms.alpha.value = a; mt.uniforms.time.value = GS.elapsed; }
      const S = B.src, fx = Math.sin(S.h()), fz = Math.cos(S.h()), alive = S.alive(), grow = Math.min(1, B.t / 0.1);
      for (const D of B.dirs) {
        let ang, ox = S.pos.x, oz = S.pos.z, oy;
        if (B.kind === 'halo') {
          D.a += dt * 0.28; ang = D.a; oy = 1.6 + S.y(); D.g.scale.set(1, 1, grow);
        } else {
          ang = S.h() + D.off; ox += fx * (D.fwd ? 2.3 : -1.7); oz += fz * (D.fwd ? 2.3 : -1.7); oy = (D.fwd ? 2.9 : 2.1) + S.y(); D.g.scale.set(1, 1, grow);
          if (alive && Math.random() < 0.5) { const d = 3 + Math.random() * 40; spawnParticles(tmp.set(ox + Math.sin(ang) * d, oy, oz + Math.cos(ang) * d), RAINBOW[Math.floor(Math.random() * 6)], 1, 4); }
        }
        D.g.position.set(ox, oy, oz); D.g.rotation.y = ang; D.g.visible = alive;
        D.dx = Math.sin(ang); D.dz = Math.cos(ang); D.ox = ox; D.oz = oz;
      }
      if (alive && !B.fx && (B.tick -= dt) <= 0) { B.tick = B.every; for (const D of B.dirs) beamHits(D.ox, D.oz, D.dx, D.dz, B.len, B.w, B.dmg * B.every / 0.12); }
      if (B.t >= B.T) { for (const D of B.dirs) scene.remove(D.g); for (const mt of B.mats) mt.dispose(); beams.splice(i, 1); }
    }
  }

  // ---- web nova: the spider spits four webs; whatever stands in one is tangled for as long as it lasts. Levels only make the webs wider ----
  const webs = [];
  const webTex = (() => { const c = mkCanvas(256), x = c.getContext('2d'); x.translate(128, 128); x.strokeStyle = '#fff'; x.lineCap = 'round';
    x.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * 124, Math.sin(a) * 124); x.stroke(); }
    x.lineWidth = 2; for (let r = 1; r <= 6; r++) { x.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * 6.283, a0 = (i - 0.5) / 12 * 6.283, R = r * 20; if (!i) x.moveTo(R, 0); else x.quadraticCurveTo(Math.cos(a0) * R * 0.86, Math.sin(a0) * R * 0.86, Math.cos(a) * R, Math.sin(a) * R); } x.stroke(); }
    return srgbTex(c); })();
  const webGeo = new THREE.CircleGeometry(1, 24); webGeo.rotateX(-Math.PI / 2);
  const webBallGeo = new THREE.IcosahedronGeometry(0.4, 1), webBallMat = glow(new THREE.MeshBasicMaterial({ color: 0xeaf4ff }), 2);
  function fireWebs() {
    const R = WEB_R[weapons.nova - 1], spots = [], near = [];
    for (const m of swarm) if (!m.dead) { const d = Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z); if (d < 22) near.push([d, m]); }
    for (const e of enemies) if (!e.dead && e.awake && !e.carried) { const d = Math.hypot(e.pos.x - car.pos.x, e.pos.z - car.pos.z); if (d < 22) near.push([d, e]); }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, t] of near) { if (spots.length >= WEB_N) break; const qx = t.pos.x + t.vel.x * 0.5, qz = t.pos.z + t.vel.z * 0.5;      // where it will be when the web lands
      if (!spots.some(sp => Math.hypot(sp.x - qx, sp.z - qz) < R * 1.3)) spots.push(new THREE.Vector3(qx, 0, qz)); }   // onto the nearest packs, not on top of each other
    const ph = Math.random() * 6.283;
    for (let i = 0; spots.length < WEB_N; i++) spots.push(new THREE.Vector3(car.pos.x + Math.sin(ph + i * 1.571) * (R + 4.5), 0, car.pos.z + Math.cos(ph + i * 1.571) * (R + 4.5)));
    netEv({ t: 'wf', k: 'web', l: weapons.nova - 1, s: spots.flatMap(q => [r1(q.x), r1(q.z)]) });
    launchWebs(new THREE.Vector3(car.pos.x, 2.6 + car.y, car.pos.z), spots, R, false);
  }
  function launchWebs(from, spots, R, fx) {
    for (const to of spots) { const ball = new THREE.Mesh(webBallGeo, webBallMat); ball.position.copy(from); scene.add(ball);
      webs.push({ ball, from: from.clone(), to, t: 0, fly: 0.3 + from.distanceTo(to) / 60, R, life: WEB_T, tick: 0, mesh: null, fx }); }
    SFX.play('spit', from, { rate: 0.7, vol: 0.7 });
  }
  function updateWebs(dt) {
    for (let i = webs.length - 1; i >= 0; i--) {
      const w = webs[i]; w.t += dt;
      if (!w.mesh) {                                     // still in the air
        const k = Math.min(1, w.t / w.fly); w.ball.position.lerpVectors(w.from, w.to, k); w.ball.position.y += Math.sin(Math.PI * k) * 3;
        if (k < 1) continue;
        scene.remove(w.ball); w.t = 0;
        w.mesh = new THREE.Mesh(webGeo, new THREE.MeshBasicMaterial({ map: webTex, transparent: true, opacity: 0, depthWrite: false })); w.mesh.material.color.setScalar(1.3);
        w.mesh.position.set(w.to.x, 0.08, w.to.z); w.mesh.rotation.y = Math.random() * 6.283; w.mesh.renderOrder = 2; scene.add(w.mesh);
        spawnParticles(tmp.set(w.to.x, 0.5, w.to.z), 0xeaf4ff, 6, 5); SFX.play('hit_dirt', w.to, { vol: 0.5, rate: 1.5 });
      }
      w.mesh.scale.setScalar(w.R * Math.min(1, w.t / 0.15)); w.mesh.material.opacity = Math.min(1, (w.life - w.t) / 0.5) * 0.85;
      if (!w.fx && (w.tick -= dt) <= 0) { w.tick = 0.4;
        for (const m of swarm) if (!m.dead && !m.K.fly && Math.hypot(m.pos.x - w.to.x, m.pos.z - w.to.z) < w.R + m.r * 0.5) { stunCritter(m, 0.6); m.vel.set(0, 0, 0); }   // fliers pass over
        if (!NET.client) for (const e of enemies) if (!e.dead && e.awake && !e.carried && Math.hypot(e.pos.x - w.to.x, e.pos.z - w.to.z) < w.R + e.r * 0.5) e.stun = Math.max(e.stun, 0.6);
      }
      if (w.t >= w.life) { scene.remove(w.mesh); w.mesh.material.dispose(); webs.splice(i, 1); }
    }
  }

  // ---- orbit: spinning saws ----
  const sawMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.25, emissive: 0x5a0a0a, flatShading: true });
  const sawGeo = (() => {
    const g = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 8), teeth = [];
    for (let i = 0; i < 8; i++) {
      const t = new THREE.ConeGeometry(0.16, 0.34, 3); t.rotateZ(-Math.PI / 2); t.translate(0.68, 0, 0); t.rotateY(i / 8 * Math.PI * 2 + 0.2);
      teeth.push(t);
    }
    const parts = [g, ...teeth].map(x => x.toNonIndexed()), pos = [], nor = [];      // tiny merge: positions + normals
    for (const x of parts) { pos.push(...x.attributes.position.array); nor.push(...x.attributes.normal.array); }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return m;
  })();
  const saws = []; let sawAngle = 0;
  const dodecaGeo = new THREE.DodecahedronGeometry(0.62, 0);
  const dodecaMats = RAINBOW.map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.2, flatShading: true }));
  function trimSaws() {                                     // a level or the whole saw gun lost: fewer saws
    const n = weapons.orbit ? W_STATS.orbit.n[weapons.orbit - 1] * (GS.ride === 'halo' ? 2 : 1) : 0;
    while (saws.length > n) scene.remove(saws.pop().m);
  }
  function deathToll() {                                    // dying on the field costs a random upgrade level, or a random skill/gun when nothing is levelled
    const lv = [...kit().filter(t => abilities[t] && abLv[t] > 0).map(t => ['ab', t]), ...W_ORDER.filter(k => weapons[k] > 1).map(k => ['w', k])];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    let lost = null;
    if (lv.length) { const [kind, k] = pick(lv); if (kind === 'ab') abLv[k]--; else { weapons[k] -= 2; trimSaws(); updateWeaponHUD(); } lost = [kind === 'ab' ? k : 'w_' + k, 'lost a level'];
    } else { const own = [...kit().filter(t => abilities[t] && t !== 'jump').map(t => ['ab', t]), ...W_ORDER.filter(k => weapons[k]).map(k => ['w', k])]; if (!own.length) return;
      const [kind, k] = pick(own); if (kind === 'ab') { abilities[k] = false; applyAbilityVisuals(); } else { weapons[k] = 0; trimSaws(); updateWeaponHUD(); } lost = [kind === 'ab' ? k : 'w_' + k, 'LOST']; }
    abDirty = true; GS.abSig = ''; toast(lost[0], lost[1]); lossFxStart(lost[0], lost[1] !== 'LOST');
  }
  // what you lost pops out of the wreck, smoulders and breaks apart: whole icon for a skill or gun, a half-size one for a level
  const lossFx = [];
  function lossFxStart(type, small) {
    if (!pickupTex[type]) pickupTex[type] = srgbTex(ICONS[type]);
    const mat = new THREE.SpriteMaterial({ map: pickupTex[type], transparent: true, depthTest: false }), spr = new THREE.Sprite(mat);
    spr.renderOrder = 20; spr.position.set(car.pos.x, 1.5, car.pos.z); spr.scale.setScalar(0.01); scene.add(spr);
    lossFx.push({ type, spr, mat, t: 0, S: small ? 3 : 5, x: car.pos.x, z: car.pos.z, shards: null });
    SFX.play('clang', car.pos, { rate: 0.6 });
  }
  function lossShatter(F) {
    const y = F.spr.position.y; scene.remove(F.spr); F.shards = [];
    for (let i = 0; i < 4; i++) {                            // the icon cracks into its four quarters, which tumble away
      const tx = pickupTex[F.type].clone(); tx.repeat.set(0.5, 0.5); tx.offset.set((i & 1) * 0.5, (i >> 1) * 0.5); tx.needsUpdate = true;
      const m = new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false, color: 0xc89070 }), sp = new THREE.Sprite(m);
      sp.renderOrder = 20; sp.scale.setScalar(F.S * 0.5); sp.position.set(F.x + ((i & 1) - 0.5) * F.S * 0.5 * 0.7071, y - ((i >> 1) - 0.5) * F.S * 0.5, F.z - ((i & 1) - 0.5) * F.S * 0.5 * 0.7071);
      const a = Math.atan2((i >> 1) - 0.5, (i & 1) - 0.5) + rand(-0.4, 0.4);
      F.shards.push({ sp, m, v: new THREE.Vector3(Math.cos(a) * 5 + rand(-1, 1), 6 + Math.random() * 3, -Math.cos(a) * 5 + rand(-1, 1)), spin: rand(-8, 8) });
      scene.add(sp);
    }
    const p = tmp.set(F.x, y, F.z);
    spawnParticles(p, 0xff7a2a, 16, 9); spawnParticles(p, 0x3a3230, 10, 6); flash(p, 0xff8a3c, 6, 0.25, 2.5, false); burst(p, 0x2e2826, 8, 2.2, 4, 0.5);
    SFX.play('pop', p, { rate: 0.55 });
  }
  function updateLossFx(dt) {
    for (let i = lossFx.length - 1; i >= 0; i--) { const F = lossFx[i]; F.t += dt;
      if (!F.shards) {
        const k = Math.min(1, F.t / 0.35), e = 1 - (1 - k) * (1 - k);                       // pops up out of the wreck
        F.spr.position.y = 1.5 + e * 2.5; F.spr.scale.setScalar(F.S * (e + (F.t > 0.35 ? Math.sin((F.t - 0.35) * 40) * 0.04 : 0)));
        if (F.t > 0.45) { const b = Math.min(1, (F.t - 0.45) / 0.7); F.mat.color.setRGB(1 - b * 0.55, 1 - b * 0.75, 1 - b * 0.85);      // smoulders: reddens and darkens
          F.spr.position.x = F.x + rand(-0.06, 0.06) * b * 2;
          if (Math.random() < dt * 30) spawnParticles(tmp.set(F.x + rand(-1, 1) * F.S * 0.4, F.spr.position.y - F.S * 0.3, F.z + rand(-0.5, 0.5)), Math.random() < 0.6 ? 0xff9a3c : 0x2a2422, 1, 3); }
        if (F.t > 1.15) lossShatter(F);
        continue; }
      const ft = F.t - 1.15;
      for (const s of F.shards) { s.v.y -= 22 * dt; s.sp.position.addScaledVector(s.v, dt); s.m.rotation += s.spin * dt; s.m.opacity = Math.min(1, Math.max(0, 1.6 - ft / 0.55)); }
      if (ft > 0.9) { for (const s of F.shards) { scene.remove(s.sp); s.m.map.dispose(); s.m.dispose(); } F.mat.dispose(); lossFx.splice(i, 1); }
    }
  }
  function buildSaws() {
    const n = W_STATS.orbit.n[weapons.orbit - 1] * (GS.ride === 'halo' ? 2 : 1);
    while (saws.length < n) {
      const uni = GS.ride === 'unicorn', m = new THREE.Mesh(uni ? dodecaGeo : sawGeo, uni ? dodecaMats[saws.length % dodecaMats.length] : sawMat); m.scale.setScalar(uni ? 1.1 : 1.4); m.castShadow = true; scene.add(m);
      if (uni) { saws.push({ m, pos: new THREE.Vector3() }); continue; }
      const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 16), glow(new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }), 2.5));
      glowRing.rotation.x = -Math.PI / 2; m.add(glowRing);
      saws.push({ m, pos: new THREE.Vector3() });
    }
  }
  const sawHitPos = new THREE.Vector3();
  function updateSaws(dt) {
    if (!weapons.orbit) return;
    for (const m of swarm) if (m.sawCd > 0) m.sawCd -= dt;            // per-target cooldowns tick down (they never did: a saw used to hit each monster once)
    for (const e of enemies) if (e.sawCd > 0) e.sawCd -= dt;
    for (const o of obstacles) if (o.sawCd > 0) o.sawCd -= dt;
    if (boss.sawCd > 0) boss.sawCd -= dt;
    const L = weapons.orbit - 1, S = W_STATS.orbit, on = car.alive && car.depth < 0.3;
    sawAngle += S.spd[L] * dt * (GS.ride === 'halo' ? 1.86 : 1);
    saws.forEach((s, i) => {
      const a = sawAngle + i / saws.length * Math.PI * 2;
      s.pos.set(car.pos.x + Math.sin(a) * S.r[L], 1.0 + car.y, car.pos.z + Math.cos(a) * S.r[L]);
      s.m.position.copy(s.pos); s.m.visible = on;
      if (GS.ride === 'unicorn') {                          // dodecahedra: no cutting, every monster they touch (cubes aside) is stunned for half a second
        s.m.rotation.x += dt * 3; s.m.rotation.y += dt * 4; if (!on) return;
        for (const m of swarm) {
          if (m.dead || m.sawCd > 0) continue;
          const dx = m.pos.x - s.pos.x, dz = m.pos.z - s.pos.z, d = Math.hypot(dx, dz);
          if (d < m.r + 0.75) { m.sawCd = 0.5; stunCritter(m, 0.5); spawnParticles(sawHitPos.copy(s.pos).setY(1.6), 0xffe14a, 4, 4); SFX.play('hit_stone', s.pos, { vol: 0.35, rate: 1.6 }); }
        }
        return;
      }
      s.m.rotation.y += dt * 22;
      if (!on) return;
      for (const e of enemies) {
        if (e.dead || e.carried || (e.sawCd || 0) > 0) continue;
        const dx = e.pos.x - s.pos.x, dz = e.pos.z - s.pos.z, d = Math.hypot(dx, dz);
        if (d < e.r + 0.65) {
          e.sawCd = 0.35; hitEnemy(e, sawHitPos.set(dx / (d || 1), 0, dz / (d || 1)), S.dmg[L], 7);
          spawnParticles(sawHitPos.copy(s.pos), 0xff6a5a, 4, 6); SFX.play('saw', s.pos);
        }
      }
      for (const m of swarm) {
        if (m.dead || m.sawCd > 0) continue;
        const dx = m.pos.x - s.pos.x, dz = m.pos.z - s.pos.z, d = Math.hypot(dx, dz);
        if (d < m.r + 0.75) {
          m.sawCd = 0.35; hitCritter(m, S.dmg[L], sawHitPos.set(dx / (d || 1), 0, dz / (d || 1)), 6);
          spawnParticles(sawHitPos.copy(s.pos), m.art.color, 4, 6); SFX.play('saw', s.pos);
        }
      }
      for (const o of obstacles) {
        if (!o.crate || !active(o) || (o.sawCd || 0) > 0) continue;
        const p = o.mesh.position;
        if (Math.abs(s.pos.x - p.x) < o.hx + 0.6 && Math.abs(s.pos.z - p.z) < o.hz + 0.6) {
          o.sawCd = 0.35; damageCrate(o, S.dmg[L]); spawnParticles(sawHitPos.copy(s.pos), 0xd2873c, 3, 6); SFX.play('saw', s.pos);
        }
      }
      if (boss.state === 'fight' && (boss.sawCd || 0) <= 0 && Math.hypot(s.pos.x - BOSS_POS.x, s.pos.z - BOSS_POS.z) < 4.6) {
        boss.sawCd = 0.35; bossDamage(S.dmg[L]); SFX.play('hit_boss', s.pos);
      }
    });
    for (const e of enemies) if (e.sawCd > 0) e.sawCd -= dt;
    for (const m of swarm) if (m.sawCd > 0) m.sawCd -= dt;
    for (const o of obstacles) if (o.sawCd > 0) o.sawCd -= dt;
    if (boss.sawCd > 0) boss.sawCd -= dt;
  }

  // ---- mortar: heavy shell on the densest crowd ----
  let mortarT = 1.5;
  const shells = [];
  const shellGeo = new THREE.IcosahedronGeometry(0.42, 0);
  const shellMat = glow(new THREE.MeshBasicMaterial({ color: 0xb48cff }), 4);
  function mortarTarget(R) {
    let best = null, bestScore = 0;
    const pool = enemies.concat(swarm);
    for (const e of pool) {
      if (e.dead || e.carried || !e.awake) continue;
      const d = Math.hypot(e.pos.x - car.pos.x, e.pos.z - car.pos.z);
      if (d > 32 || d < 3) continue;
      let score = 0;
      for (const o of pool) if (!o.dead && !o.carried && o.awake && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < R) score += o.elite || (o.K && o.K.heavy) ? 2 : 1;
      score -= d * 0.01;
      if (score > bestScore) { bestScore = score; best = e.pos.clone().addScaledVector(e.vel, 0.8); }
    }
    if (boss.state === 'fight' && Math.hypot(BOSS_POS.x - car.pos.x, BOSS_POS.z - car.pos.z) < 36 && bestScore < 3) best = BOSS_POS.clone();
    return best;
  }
  function fireMortar(target, L = weapons.mortar - 1, from, fx = false) {
    if (!from) { from = new THREE.Vector3(); muzzle.getWorldPosition(from); netEv({ t: 'wf', k: 'mortar', l: L, x: r1(target.x), z: r1(target.z) }); }
    const m = new THREE.Mesh(shellGeo, shellMat); m.position.copy(from); scene.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), glow(new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0.7, depthWrite: false }), 2.5));
    ring.geometry.rotateX(-Math.PI / 2); ring.position.set(target.x, 0.06, target.z); ring.scale.setScalar(W_STATS.mortar.r[L]); scene.add(ring);
    shells.push({ m, ring, from, to: new THREE.Vector3(target.x, 0, target.z), t: 0, T: 0.85, R: W_STATS.mortar.r[L], dmg: W_STATS.mortar.dmg[L], fx });
    flash(from, 0xb48cff, 3, 0.15, 3, false); SFX.play('mortar', from);
  }
  function updateShells(dt) {
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i]; s.t += dt;
      const k = Math.min(1, s.t / s.T);
      s.m.position.lerpVectors(s.from, s.to, k); s.m.position.y = s.from.y * (1 - k) + 9 * Math.sin(Math.PI * k);
      s.m.rotation.x += dt * 8; s.ring.rotation.y += dt * 2; s.ring.material.opacity = 0.35 + 0.45 * k;
      if (k < 1) continue;
      // boom
      scene.remove(s.m, s.ring); shells.splice(i, 1);
      const p = tmp.set(s.to.x, 0.6, s.to.z);
      flash(p, 0xc79bff, s.R * 3.2, 0.4, 4); burst(p, 0x6a5a7a, 10, 2.6, 7, 0.5);
      spawnParticles(p, 0xb48cff, 18, 11); spawnParticles(p, 0x8a8a78, 10, 8);
      GS.shake = Math.max(GS.shake, s.fx ? 0.2 : 0.5); SFX.play('blast', p);
      if (s.fx) continue;                                // someone else's shell: the bang without the damage
      for (const e of enemies) {
        if (e.dead || e.carried) continue;
        const dx = e.pos.x - s.to.x, dz = e.pos.z - s.to.z, d = Math.hypot(dx, dz);
        if (d < s.R + e.r * 0.5) hitEnemy(e, sawHitPos.set(dx / (d || 1), 0, dz / (d || 1)), s.dmg * (1 - 0.4 * d / s.R), 16);
      }
      for (const m of swarm) {
        if (m.dead) continue;
        const dx = m.pos.x - s.to.x, dz = m.pos.z - s.to.z, d = Math.hypot(dx, dz);
        if (d < s.R + m.r * 0.5) hitCritter(m, s.dmg * (1 - 0.4 * d / s.R), sawHitPos.set(dx / (d || 1), 0, dz / (d || 1)), 12);
      }
      for (const o of obstacles) if (o.crate && active(o) && Math.hypot(o.mesh.position.x - s.to.x, o.mesh.position.z - s.to.z) < s.R + 0.5) damageCrate(o, 99);
      for (const o of obstacles) if ((o.pillar || o.rock) && active(o) && Math.hypot(o.mesh.position.x - s.to.x, o.mesh.position.z - s.to.z) < s.R * 0.7) smashPillar(o, sawHitPos.set(o.mesh.position.x - s.to.x, 0, o.mesh.position.z - s.to.z).normalize().multiplyScalar(14));
      if (boss.state === 'fight' && Math.hypot(BOSS_POS.x - s.to.x, BOSS_POS.z - s.to.z) < s.R + 3.7) bossDamage(s.dmg * 1.5);
    }
  }

  function updateWeapons(dt) {
    const ready = car.alive && car.depth < 0.3;
    if (weapons.nova) { GS.novaT -= dt; if (GS.novaT <= 0 && ready) { if (threatNear(20)) { GS.novaT = W_STATS.nova.cd[weapons.nova - 1]; if (GS.ride === 'halo') GS.novaT = Math.max(2, GS.novaT) + SWORD_T[weapons.nova - 1]; if (GS.ride === 'halo' || GS.ride === 'unicorn') fireBeams(); else if (GS.ride === 'spider') fireWebs(); else fireNova(); } else GS.novaT = 0.15; } }
    updateSaws(dt);
    updateBeams(dt);
    updateWebs(dt);
    if (weapons.mortar) {
      mortarT -= dt;
      if (mortarT <= 0 && ready) {
        const t = mortarTarget(W_STATS.mortar.r[weapons.mortar - 1]);
        if (t) { mortarT = W_STATS.mortar.cd[weapons.mortar - 1]; fireMortar(t); } else mortarT = 0.3;
      }
    }
    updateShells(dt);
  }

  // ---------- 2D swarm: flat paper-cutout critters that come in waves ----------
  // Every critter is drawn procedurally on a canvas (4-frame walk cycle + a white hit frame), shown as a camera-facing
  // sprite with a blob shadow. Five body plans with three random variants each, so silhouettes differ from the cubes.
  const SW_FRAMES = 4, SW_PX = 128, OUTLINE = '#1b1421';
  const MON = (() => {
const OUT = '#1b1421', TAU = Math.PI * 2;
const hsl = (h, s, l, a = 1) => `hsla(${(((h % 1) + 1) % 1) * 360},${Math.min(1, s) * 100}%,${l * 100}%,${a})`;
const pal = (h, s = 0.62) => ({
  body: hsl(h, s, 0.5), dark: hsl(h, s, 0.33), deep: hsl(h, s * 0.8, 0.2), light: hsl(h + 0.02, s + 0.1, 0.7),
  acc: hsl(h + 0.45, 0.9, 0.6), accDark: hsl(h + 0.45, 0.75, 0.38), gum: '#3a0f1f', tooth: '#fff4dc',
});

// ---------- shared parts ----------
function tentPts(x, y, len, ang, ph, { seg = 12, amp = 0.5, freq = 1.6, curl = 0 } = {}) {
  const pts = [[x, y]], st = len / seg; let px = x, py = y;
  for (let i = 1; i <= seg; i++) {
    const s = i / seg, a = ang + curl * s * s + amp * Math.sin(ph * TAU - s * freq * Math.PI) * s;
    px += Math.cos(a) * st; py += Math.sin(a) * st; pts.push([px, py]);
  }
  return pts;
}
function tentacle(c, pts, w0, w1, fill, suck) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = (w0 + (w1 - w0) * i / (n - 1)) / 2;
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  c.beginPath(); c.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) c.lineTo(L[i][0], L[i][1]);
  const t = pts[n - 1]; c.arc(t[0], t[1], w1 / 2, Math.atan2(L[n - 1][1] - t[1], L[n - 1][0] - t[0]), Math.atan2(R[n - 1][1] - t[1], R[n - 1][0] - t[0]), true);
  for (let i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
  c.closePath(); c.fillStyle = fill; c.fill(); c.stroke();
  if (suck) {
    c.fillStyle = suck;
    for (let i = 2; i < n - 1; i += 2) {
      const w = (w0 + (w1 - w0) * i / (n - 1));
      c.beginPath(); c.arc((pts[i][0] * 2 + L[i][0]) / 3, (pts[i][1] * 2 + L[i][1]) / 3, w * 0.17, 0, TAU); c.fill();
    }
  }
}
function eye(c, x, y, r, o = {}) {
  const { look = [0, 0], iris = null, slit = false, lid = 0, lidCol = '#555', vein = false, angry = 0, glow = false } = o;
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = glow ? iris : '#fff6e0'; c.fill(); c.clip();
  if (vein) { c.strokeStyle = '#d2475a'; c.lineWidth = Math.max(1, r * 0.06); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.4; c.beginPath(); c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.quadraticCurveTo(x + Math.cos(a + 0.3) * r * 0.7, y + Math.sin(a + 0.3) * r * 0.7, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); c.stroke(); } }
  const ix = x + look[0] * r * 0.35, iy = y + look[1] * r * 0.35;
  if (glow) { c.fillStyle = '#fffbe6'; c.beginPath(); c.ellipse(ix, iy, r * 0.22, r * 0.55, 0, 0, TAU); c.fill(); }
  else {
    if (iris) { c.fillStyle = iris; c.beginPath(); c.arc(ix, iy, r * 0.62, 0, TAU); c.fill(); }
    c.fillStyle = OUT; c.beginPath();
    if (slit) c.ellipse(ix, iy, r * 0.16, r * 0.5, 0, 0, TAU); else c.arc(ix, iy, r * (iris ? 0.3 : 0.48), 0, TAU);
    c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ix - r * 0.2, iy - r * 0.22, r * 0.14, 0, TAU); c.fill();
  }
  if (lid > 0) { c.fillStyle = lidCol; c.fillRect(x - r - 1, y - r - 1, 2 * r + 2, 2 * r * lid + 1); c.strokeStyle = OUT; c.lineWidth = Math.max(2, r * 0.18); c.beginPath(); c.moveTo(x - r, y - r + 2 * r * lid); c.lineTo(x + r, y - r + 2 * r * lid); c.stroke(); }
  c.restore();
  c.lineWidth = Math.max(2.5, r * 0.22); c.strokeStyle = OUT;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  if (angry) { c.lineWidth = Math.max(3, r * 0.35); c.beginPath(); c.moveTo(x - r * 1.1, y - r * 1.15 - angry * r * 0.35); c.lineTo(x + r * 1.1, y - r * 1.15 + angry * r * 0.35); c.stroke(); }
}
const blink = (t, at = 0.86, len = 0.07) => { const k = ((t - at) % 1 + 1) % 1; return k < len ? Math.sin(k / len * Math.PI) : 0; };
function teeth(c, x0, x1, y, h, n, down = true, col = '#fff4dc') {
  c.fillStyle = col; c.lineWidth = 2.2; c.beginPath();
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) { c.moveTo(x0 + i * w, y); c.lineTo(x0 + (i + 0.5) * w, y + (down ? h : -h)); c.lineTo(x0 + (i + 1) * w, y); }
  c.fill(); c.stroke();
}
function ringTeeth(c, cx, cy, rx, ry, n, len, rot = 0, col = '#fff4dc') {
  c.fillStyle = col; c.lineWidth = 2; c.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = rot + i / n * TAU, a1 = rot + (i + 1) / n * TAU, am = (a0 + a1) / 2;
    c.moveTo(cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry);
    c.lineTo(cx + Math.cos(am) * (rx - len), cy + Math.sin(am) * (ry - len));
    c.lineTo(cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry);
  }
  c.fill(); c.stroke();
}
function limb(c, pts, w, col) {                          // thick jointed limb: outline pass then colour pass
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = OUT; c.lineWidth = w + 5; c.beginPath(); pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])); c.stroke();
  c.strokeStyle = col; c.lineWidth = w; c.stroke(); c.strokeStyle = OUT;
}
function blob(c, cx, cy, rx, ry, ph, wob = 0.05, k = 3, floor = 1e9) {
  c.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = i / 40 * TAU, m = 1 + wob * Math.sin(a * k + ph) + wob * 0.6 * Math.sin(a * (k + 2) - ph * 1.3);
    c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rx * m, Math.min(floor, cy + Math.sin(a) * ry * m));
  }
  c.closePath();
}
const shadow = (c, x, w) => { c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(x, 119, w, w * 0.18, 0, 0, TAU); c.fill(); };

// ---------- the monsters (128 x 128 space, ground at y = 119) ----------
const MONSTERS = [
{
  id: 'oculon', name: 'Oculon', tag: 'floater · ranged', h: 2.7, hues: [0.78, 0.02, 0.5],
  text: 'A lidded eyeball on a skirt of writhing tentacles. Hovers at range, blinks before it fires a beam.',
  draw(c, P, t, shadowOn = true) {
    const bob = Math.sin(t * TAU) * 3, cx = 64, cy = 44 + bob;
    if (shadowOn) shadow(c, 64, 22 - bob * 0.6);
    c.lineWidth = 3.5;
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + (i - 2.5) * 0.34;
      tentacle(c, tentPts(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, 48 - Math.abs(i - 2.5) * 5, a, t + i * 0.19, { amp: 0.9, curl: (i - 2.5) * 0.35 }), 10, 2, i % 2 ? P.dark : P.body, P.light);
    }
    c.lineWidth = 4.5; c.fillStyle = P.dark; c.beginPath();
    for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU - Math.PI / 2, r = i % 2 ? 31 : 39; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    c.closePath(); c.fill(); c.stroke();
    eye(c, cx, cy, 28, { look: [Math.sin(t * TAU * 0.5) * 0.7, 0.25], iris: P.acc, slit: true, vein: true, lid: 0.18 + 0.82 * blink(t), lidCol: P.body });
  },
},
{
  id: 'maw', name: 'Mawstrider', tag: 'runner · biter', h: 2.5, hues: [0.98, 0.3, 0.12],
  text: 'A walking mouth on five tentacle legs, three eyes on stalks. Fast, swarms in packs.',
  draw(c, P, t, shadowOn = true) {
    const step = Math.sin(t * TAU), bob = Math.abs(Math.cos(t * TAU)) * 3, cy = 60 - bob;
    if (shadowOn) shadow(c, 64, 30);
    c.lineWidth = 3.5;
    for (let i = 0; i < 5; i++) {
      const sx = 64 + (i - 2) * 9, a = Math.PI / 2 + (i - 2) * 0.42 + (i % 2 ? step : -step) * 0.22;
      tentacle(c, tentPts(sx, cy + 18, 46 - Math.abs(i - 2) * 6 + bob, a, t + i * 0.25, { amp: 0.35, curl: (i - 2) * 0.55 }), 11, 3, i === 2 ? P.body : P.dark, P.light);
    }
    for (const [x, len, ph] of [[46, 14, 0], [64, 19, 0.33], [82, 12, 0.66]]) {
      const sw = Math.sin((t + ph) * TAU) * 5, ex = x + sw, ey = cy - 26 - len;
      limb(c, [[x, cy - 22], [x + sw * 0.4, cy - 22 - len * 0.6], [ex, ey]], 4, P.dark);
      eye(c, ex, ey, 6.5, { look: [0.3, 0.4], iris: P.acc, lid: blink(t, 0.3 + ph, 0.06), lidCol: P.dark });
    }
    c.lineWidth = 4.5; c.fillStyle = P.body;
    blob(c, 64, cy, 32, 30, t * TAU, 0.04); c.fill(); c.stroke();
    const open = 0.75 + 0.25 * Math.sin(t * TAU * 2);
    c.fillStyle = P.gum; c.beginPath(); c.ellipse(64, cy + 2, 17, 23 * open, 0, 0, TAU); c.fill(); c.stroke();
    ringTeeth(c, 64, cy + 2, 17, 23 * open, 13, 7);
    c.lineWidth = 3; tentacle(c, tentPts(64, cy + 14 * open, 22, Math.PI / 2 + 0.2, t, { seg: 8, amp: 0.8 }), 8, 3, '#e5627c');
  },
},
{
  id: 'gloop', name: 'Gloop', tag: 'tank · splits', h: 2.0, hues: [0.33, 0.55, 0.15],
  text: 'A slime heap full of mismatched eyes. Slow and soaks damage, bursts into two small gloops.',
  draw(c, P, t, shadowOn = true) {
    const s = Math.sin(t * TAU);
    if (shadowOn) { c.fillStyle = P.dark; c.beginPath(); c.ellipse(64, 117, 50, 7, 0, 0, TAU); c.fill(); c.lineWidth = 3; c.stroke(); }
    c.lineWidth = 3.5;
    tentacle(c, tentPts(30, 84, 28, Math.PI + 0.6, t, { seg: 8, amp: 0.9, curl: 1.4 }), 12, 4, P.body);
    tentacle(c, tentPts(98, 80, 26, -0.6, t + 0.4, { seg: 8, amp: 0.9, curl: -1.2 }), 11, 4, P.body);
    c.lineWidth = 4.5; c.fillStyle = P.body;
    blob(c, 64, 84 - s * 1.5, 42 * (1 + s * 0.03), 40 * (1 - s * 0.03), t * TAU, 0.05, 4, 117); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.ellipse(46, 62, 10, 6, -0.6, 0, TAU); c.fill();
    for (const [i, x, y] of [[0, 52, 112], [1, 80, 110]]) { const d = ((t * 1.3 + i * 0.5) % 1); c.fillStyle = P.body; c.beginPath(); c.ellipse(x, y + d * 4, 3, 4 + d * 3, 0, 0, TAU); c.fill(); }
    const eyes = [[50, 70, 10, 0.1], [74, 62, 13, 0.4], [91, 80, 7, 0.7], [58, 94, 6, 0.25], [80, 95, 8, 0.85], [36, 88, 5, 0.55], [64, 48, 6, 0.15]];
    for (const [x, y, r, ph] of eyes) eye(c, x, y + Math.sin((t + ph) * TAU) * 1.5, r, { look: [Math.sin((t * 0.5 + ph) * TAU) * 0.8, 0.3], iris: r > 8 ? P.acc : null, lid: blink(t, ph, 0.08), lidCol: P.body });
    c.lineWidth = 3; c.beginPath(); c.moveTo(54, 106); for (let i = 1; i <= 6; i++) c.lineTo(54 + i * 4, 106 + (i % 2 ? -3 : 1)); c.stroke();
  },
},
{
  id: 'jelly', name: 'Jellystalker', tag: 'tall · stinger', h: 3.6, hues: [0.55, 0.85, 0.42],
  text: 'A see-through jelly dome on four stilt legs, stingers dangling. Stings everything under it.',
  draw(c, P, t, shadowOn = true) {
    const bob = Math.sin(t * TAU * 2) * 1.5, cx = 64, cy = 40 + bob;
    if (shadowOn) shadow(c, 64, 38);
    const feet = [[16, 0], [44, 0.5], [84, 0.25], [112, 0.75]];
    feet.forEach(([fx, ph], i) => {
      const k = Math.sin((t + ph) * TAU), lift = Math.max(0, k) * 6, x = fx + Math.cos((t + ph) * TAU) * 5;
      const hx = cx + (fx - 64) * 0.35, hy = cy + 16;
      limb(c, [[hx, hy], [hx + (fx - 64) * 0.55, hy - 14], [x, 118 - lift]], 5, P.dark);
    });
    c.lineWidth = 3;
    for (let i = 0; i < 5; i++) tentacle(c, tentPts(cx - 16 + i * 8, cy + 18, 40 + (i % 2) * 12, Math.PI / 2, t + i * 0.2, { amp: 0.5, freq: 2.2 }), 4, 1.5, P.acc);
    c.lineWidth = 4.5;
    c.fillStyle = hsl(0, 0, 1, 0); c.beginPath(); c.ellipse(cx, cy + 4, 36, 30, 0, Math.PI, TAU);
    for (let i = 0; i <= 8; i++) { const x = cx + 36 - i * 9; c.quadraticCurveTo(x - 4.5, cy + 4 + (i % 2 ? 10 : 6), x - 9, cy + 4); }
    c.closePath();
    c.save(); c.globalAlpha = 0.82; c.fillStyle = P.body; c.fill(); c.restore();
    c.save(); c.clip();
    c.fillStyle = P.acc; for (const [x, y, r] of [[52, -8, 8], [72, -14, 6], [66, 0, 5]]) { c.beginPath(); c.arc(cx - 64 + x + Math.sin(t * TAU + x) * 2, cy + y, r, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.ellipse(cx - 14, cy - 14, 12, 6, -0.4, 0, TAU); c.fill();
    c.restore(); c.stroke();
    for (let i = 0; i < 4; i++) eye(c, cx - 15 + i * 10, cy + 2 - Math.abs(i - 1.5) * 2, 4.5, { look: [0, 0.5], lid: blink(t, 0.2 + i * 0.05, 0.06), lidCol: P.body });
  },
},
{
  id: 'grubber', name: 'Grubber', tag: 'heavy · grabber', h: 4.0, hues: [0.08, 0.92, 0.6],
  text: 'A hunched brute with a beard of face tentacles and claw hands. Slow, grabs and pins the car.',
  draw(c, P, t, shadowOn = true) {
    const s = Math.sin(t * TAU), bob = Math.abs(s) * 2;
    if (shadowOn) shadow(c, 64, 46);
    limb(c, [[48, 98], [44, 117]], 14, P.dark); limb(c, [[80, 98], [84, 117]], 14, P.dark);
    c.lineWidth = 4.5; c.fillStyle = P.dark;
    for (let i = 0; i < 5; i++) { const x = 34 + i * 15, y = 34 + Math.abs(i - 2) * 6 + bob; c.beginPath(); c.moveTo(x - 7, y + 10); c.lineTo(x - 2, y - 14 + Math.abs(i - 2) * 3); c.lineTo(x + 7, y + 10); c.fill(); c.stroke(); }
    c.fillStyle = P.body; c.beginPath();
    c.moveTo(26, 102); c.bezierCurveTo(10, 60, 30, 30 + bob, 64, 30 + bob); c.bezierCurveTo(98, 30 + bob, 118, 60, 102, 102); c.quadraticCurveTo(64, 112, 26, 102);
    c.fill(); c.stroke();
    c.fillStyle = P.light; c.lineWidth = 3; c.beginPath(); c.ellipse(64, 84, 24, 18, 0, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = P.dark; c.lineWidth = 2.5;
    for (const [x0, y0, x1, y1] of [[52, 76, 60, 90], [57, 74, 65, 88], [72, 80, 80, 92]]) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
    c.strokeStyle = OUT;
    for (const sd of [-1, 1]) {
      const sw = sd * s * 6, hx = 64 + sd * 50 + sw * 0.3, hy = 96 + sd * s * 3;
      limb(c, [[64 + sd * 34, 54 + bob], [64 + sd * 48, 74], [hx, hy]], 13, P.body);
      c.lineWidth = 3; c.fillStyle = '#efe2c4';
      for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(hx + k * 5, hy + 3); c.quadraticCurveTo(hx + k * 7 + sd * 2, hy + 12, hx + k * 4 - sd * 3, hy + 16); c.lineTo(hx + k * 5 + 3, hy + 4); c.fill(); c.stroke(); }
    }
    const hy = 40 + bob;
    c.lineWidth = 3;
    for (let i = 0; i < 6; i++) tentacle(c, tentPts(52 + i * 4.8, hy + 10, 22 + (i % 3) * 6, Math.PI / 2 + (i - 2.5) * 0.12, t + i * 0.15, { seg: 9, amp: 0.7, curl: (i - 2.5) * 0.2 }), 6, 2, i % 2 ? P.dark : P.body, P.light);
    c.lineWidth = 4.5; c.fillStyle = P.body; c.beginPath(); c.ellipse(64, hy, 18, 16, 0, 0, TAU); c.fill(); c.stroke();
    eye(c, 56, hy - 2, 5, { iris: P.acc, glow: true, angry: 1 }); eye(c, 72, hy - 2, 5, { iris: P.acc, glow: true, angry: -1 });
  },
},
{
  id: 'lamprey', name: 'Lamprey', tag: 'burrower · ambush', h: 3.4, hues: [0.92, 0.12, 0.72],
  text: 'A segmented worm that erupts from a hole, ringed mouth of teeth facing you. Pops up under the car.',
  draw(c, P, t, shadowOn = true) {
    const rise = 0.85 + 0.15 * Math.sin(t * TAU);
    c.lineWidth = 3.5;
    c.fillStyle = '#2a1e18'; c.beginPath(); c.ellipse(64, 114, 28, 8, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#6b5240'; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; c.beginPath(); c.arc(64 + Math.cos(a) * 30, 114 + Math.sin(a) * 9, 4, 0, TAU); c.fill(); c.stroke(); }
    const segs = 8, pts = [];
    for (let k = 0; k <= segs; k++) pts.push([64 + Math.sin(t * TAU + k * 0.55) * k * 2.2, 112 - k * 9.5 * rise]);
    c.lineWidth = 4;
    for (let k = 0; k < segs; k++) {
      const [x, y] = pts[k], r = 15 + k * 0.5;
      c.fillStyle = P.dark; c.beginPath(); c.moveTo(x - 4, y - r + 2); c.lineTo(x, y - r - 7); c.lineTo(x + 4, y - r + 2); c.fill(); c.stroke();
      c.fillStyle = k % 2 ? P.body : P.light; c.beginPath(); c.ellipse(x, y, r, r * 0.8, 0, 0, TAU); c.fill(); c.stroke();
    }
    const [hx, hy] = pts[segs];
    c.fillStyle = P.body; c.beginPath(); c.arc(hx, hy, 25, 0, TAU); c.fill(); c.stroke();
    for (let i = 0; i < 4; i++) eye(c, hx - 18 + i * 12, hy - 22 + Math.abs(i - 1.5) * 4, 4.5, { look: [0, 0.5], lid: blink(t, 0.1 + i * 0.08, 0.05), lidCol: P.body });
    c.fillStyle = P.light; c.beginPath(); c.arc(hx, hy + 2, 19, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = P.gum; c.beginPath(); c.arc(hx, hy + 2, 15, 0, TAU); c.fill();
    ringTeeth(c, hx, hy + 2, 15, 15, 14, 6, t * 1.5);
    c.fillStyle = '#12070c'; c.beginPath(); c.arc(hx, hy + 2, 7, 0, TAU); c.fill();
    ringTeeth(c, hx, hy + 2, 8, 8, 9, 4, -t * 2);
  },
},
{
  id: 'spike', name: 'Spikeroll', tag: 'charger · roller', h: 1.9, hues: [0.12, 0.62, 0.0],
  text: 'A spiny ball with a huge grin. Curls up and rolls at you in straight charges.',
  draw(c, P, t, shadowOn = true) {
    const b = Math.abs(Math.sin(t * TAU)), y = 86 - b * 10, sq = 1 - (1 - b) * 0.1;
    if (shadowOn) shadow(c, 64, 30 - b * 6);
    c.lineWidth = 3.5; c.fillStyle = P.dark;
    const rot = t * TAU * 0.5;
    for (let i = 0; i < 14; i++) {
      const a = rot + i / 14 * TAU, a0 = a - 0.18, a1 = a + 0.18;
      c.beginPath(); c.moveTo(64 + Math.cos(a0) * 27, y + Math.sin(a0) * 27 * sq); c.lineTo(64 + Math.cos(a) * 44, y + Math.sin(a) * 44 * sq); c.lineTo(64 + Math.cos(a1) * 27, y + Math.sin(a1) * 27 * sq); c.fill(); c.stroke();
    }
    c.lineWidth = 4.5; c.fillStyle = P.body; c.beginPath(); c.ellipse(64, y, 31, 31 * sq, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = P.gum; c.beginPath(); c.moveTo(38, y + 2); c.quadraticCurveTo(64, y + 32 * sq, 90, y + 2); c.quadraticCurveTo(64, y + 12, 38, y + 2); c.fill(); c.stroke();
    teeth(c, 44, 84, y + 6, 6, 7);
    eye(c, 52, y - 12, 9, { look: [0.4, 0.3], iris: P.acc, angry: 1 }); eye(c, 76, y - 14, 6, { look: [0.4, 0.3], angry: -1 });
  },
},
{
  id: 'wingmaw', name: 'Wingmaw', tag: 'flyer · diver', h: 2.5, hues: [0.7, 0.45, 0.88],
  text: 'A flying mouth with one eye, bat wings and a barbed tentacle tail. Circles, then dives.',
  draw(c, P, t, shadowOn = true) {
    const s = Math.sin(t * TAU * 2), bob = Math.sin(t * TAU) * 4, cx = 64, cy = 42 + bob;
    if (shadowOn) shadow(c, 64, 16);
    c.lineWidth = 3.5;
    const tail = tentPts(cx, cy + 18, 54, Math.PI / 2, t, { amp: 0.7, freq: 1.8 });
    tentacle(c, tail, 9, 3, P.dark);
    const tp = tail[tail.length - 1]; c.fillStyle = P.acc; c.beginPath(); c.moveTo(tp[0] - 6, tp[1] - 3); c.lineTo(tp[0], tp[1] + 9); c.lineTo(tp[0] + 6, tp[1] - 3); c.closePath(); c.fill(); c.stroke();
    for (const sd of [-1, 1]) {
      const wy = s * 18, tipX = cx + sd * 62, tipY = cy - 18 + wy;
      c.fillStyle = P.dark; c.lineWidth = 4; c.beginPath(); c.moveTo(cx + sd * 14, cy - 8);
      c.quadraticCurveTo(cx + sd * 40, cy - 34 + wy, tipX, tipY);
      for (let k = 0; k < 3; k++) { const fx = cx + sd * (54 - k * 13), fy = cy + 4 + wy * (0.7 - k * 0.2); c.quadraticCurveTo(fx + sd * 4, fy - 10, fx, fy); }
      c.quadraticCurveTo(cx + sd * 20, cy + 6, cx + sd * 14, cy + 8); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = P.light; c.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(cx + sd * 16, cy - 6); c.lineTo(cx + sd * (54 - k * 13), cy + 4 + wy * (0.7 - k * 0.2)); c.stroke(); }
      c.strokeStyle = OUT;
    }
    c.lineWidth = 4.5; c.fillStyle = P.dark;
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(cx + sd * 8, cy - 18); c.lineTo(cx + sd * 16, cy - 32); c.lineTo(cx + sd * 17, cy - 13); c.fill(); c.stroke(); }
    c.fillStyle = P.body; c.beginPath(); c.arc(cx, cy, 23, 0, TAU); c.fill(); c.stroke();
    const open = 0.6 + 0.4 * Math.max(0, Math.sin(t * TAU * 2 + 1));
    c.fillStyle = P.gum; c.beginPath(); c.ellipse(cx, cy + 9, 17, 9 * open + 2, 0, 0, TAU); c.fill(); c.stroke();
    teeth(c, cx - 14, cx + 14, cy + 9 - 9 * open, 5, 6); teeth(c, cx - 12, cx + 12, cy + 9 + 9 * open, 5, 5, false);
    eye(c, cx, cy - 8, 9, { look: [0, 0.6], iris: P.acc, slit: true, lid: 0.15 + 0.85 * blink(t, 0.6), lidCol: P.body });
  },
},
];
    const by = {}; for (const m of MONSTERS) by[m.id] = m;
    return { by, pal };
  })();
  function swRng(seed) { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
  const hsl = (h, s, l) => `hsl(${(((h % 1) + 1) % 1) * 360},${s * 100}%,${l * 100}%)`;

  function drawEye(x, ctx, cx, cy, r, look, angry) {
    ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(cx + look * r * 0.35, cy + r * 0.15, r * 0.48, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + look * r * 0.35 - r * 0.15, cy - r * 0.05, r * 0.15, 0, 6.283); ctx.fill();
    if (angry) { ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - r * 1.1, cy - r * 1.25 - angry * r * 0.3); ctx.lineTo(cx + r * 1.1, cy - r * 1.25 + angry * r * 0.3); ctx.stroke(); }
  }
  function drawTeeth(ctx, x0, x1, y, h, n, down = true) {
    ctx.fillStyle = '#fffbe8'; ctx.beginPath();
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) { ctx.moveTo(x0 + i * w, y); ctx.lineTo(x0 + (i + 0.5) * w, y + (down ? h : -h)); ctx.lineTo(x0 + (i + 1) * w, y); }
    ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
  }
  function blobPath(ctx, cx, cy, rx, ry, r, wob) {          // lumpy closed body outline
    ctx.beginPath();
    const n = 18, ph = r() * 6;
    for (let i = 0; i <= n; i++) {
      const a = i / n * 6.283, k = 1 + wob * Math.sin(a * 3 + ph) + wob * 0.6 * Math.sin(a * 5 + ph * 2);
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
    }
    ctx.closePath();
  }

  // draws one frame of one critter variant; f = 0..3 walk phase
  function drawCritter(ctx, kind, spec, f) {
    if (MON.by[kind]) {                                  // concept-sheet monsters bring their own painter (128 px space, ground at y = 119)
      ctx.save(); ctx.translate(0, 5); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = OUTLINE;
      MON.by[kind].draw(ctx, MON.pal(spec.h), f / SW_FRAMES, false); ctx.restore(); return;
    }
    const r = swRng(spec.seed), ph = f / SW_FRAMES * 6.283, s = Math.sin(ph), c = Math.cos(ph);
    const body = hsl(spec.h, 0.62, 0.5), dark = hsl(spec.h, 0.6, 0.32), light = hsl(spec.h + 0.03, 0.7, 0.68);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 5;
    const leg = (x, y, len, swing, w = 7) => {
      ctx.lineWidth = w + 5; ctx.strokeStyle = OUTLINE; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + swing, y + len); ctx.stroke();
      ctx.lineWidth = w; ctx.strokeStyle = dark; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + swing, y + len); ctx.stroke();
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.ellipse(x + swing + 3, y + len, w * 0.9, w * 0.5, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 5;
    };
    if (kind === 'gremlin') {
      const by = 80 + Math.abs(s) * -4;
      leg(52, by + 18, 22, s * 9); leg(76, by + 18, 22, -s * 9);
      // ears / horns
      ctx.fillStyle = dark;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(64 + sd * 14, by - 22); ctx.lineTo(64 + sd * (spec.ear ? 46 : 30), by - (spec.ear ? 30 : 52)); ctx.lineTo(64 + sd * 28, by - 6); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = body; blobPath(ctx, 64, by, 30, 28, r, 0.06); ctx.fill(); ctx.stroke();
      ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(64, by + 10, 16, 12, 0, 0, 6.283); ctx.fill();
      // arms
      ctx.lineWidth = 6; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(64 + sd * 26, by + 4); ctx.lineTo(64 + sd * 38, by + 14 + sd * s * 6); ctx.stroke(); }
      ctx.lineWidth = 4;
      if (spec.eyes === 1) drawEye(0, ctx, 64, by - 8, 11, 0.4, 1); else { drawEye(0, ctx, 53, by - 8, 8, 0.4, 1); drawEye(0, ctx, 75, by - 8, 8, 0.4, -1); }
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.ellipse(64, by + 10, 13, 5 + Math.abs(c) * 3, 0, 0, 6.283); ctx.fill();
      drawTeeth(ctx, 53, 75, by + 6, 6, 4);
    } else if (kind === 'stilt') {
      const by = 36 + Math.abs(s) * 3;
      leg(58, by + 22, 64, s * 16, 6); leg(70, by + 22, 64, -s * 16, 6);
      ctx.lineWidth = 5; ctx.strokeStyle = OUTLINE;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(64 + sd * 14, by + 8); ctx.quadraticCurveTo(64 + sd * 30, by + 30, 64 + sd * (22 + c * 6), by + 52); ctx.stroke(); }
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(64, by, 18, 30, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(64, by + 4 + i * 8, 10 - i * 2, 2.5, 0, 0, 6.283); ctx.fill(); }
      if (spec.ear) { ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(64, by - 30); ctx.quadraticCurveTo(76, by - 46, 70 + s * 4, by - 52); ctx.stroke(); ctx.fillStyle = light; ctx.beginPath(); ctx.arc(70 + s * 4, by - 52, 5, 0, 6.283); ctx.fill(); ctx.stroke(); }
      ctx.lineWidth = 4; drawEye(0, ctx, 64, by - 12, 12, 0.3, 0);
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.moveTo(56, by + 8); ctx.quadraticCurveTo(64, by + 16 + Math.abs(c) * 3, 72, by + 8); ctx.fill();
    } else if (kind === 'brute') {
      const by = 70 + Math.abs(s) * 3;
      leg(48, by + 30, 18, s * 6, 13); leg(80, by + 30, 18, -s * 6, 13);
      ctx.lineWidth = 12;
      for (const sd of [-1, 1]) { ctx.strokeStyle = OUTLINE; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(64 + sd * 40, by - 8); ctx.lineTo(64 + sd * 52, by + 26 + sd * s * 5); ctx.stroke();
        ctx.strokeStyle = dark; ctx.lineWidth = 11; ctx.stroke(); ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(64 + sd * 52, by + 30 + sd * s * 5, 9, 0, 6.283); ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 5; ctx.stroke(); }
      ctx.lineWidth = 5; ctx.strokeStyle = OUTLINE;
      ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(30, by + 34); ctx.bezierCurveTo(14, by - 10, 30, by - 52, 64, by - 52); ctx.bezierCurveTo(98, by - 52, 114, by - 10, 98, by + 34); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(64, by + 12, 24, 18, 0, 0, 6.283); ctx.fill();
      if (spec.ear) { ctx.fillStyle = '#e8dcc0'; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(64 + sd * 20, by - 46); ctx.lineTo(64 + sd * 34, by - 66); ctx.lineTo(64 + sd * 32, by - 42); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
      ctx.lineWidth = 4; drawEye(0, ctx, 54, by - 26, 6, 0.3, 1); drawEye(0, ctx, 74, by - 26, 6, 0.3, -1);
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.ellipse(64, by - 6, 22, 9, 0, 0, 6.283); ctx.fill();
      drawTeeth(ctx, 46, 82, by - 1, 12, 4, false);
    } else if (kind === 'flapper') {
      const by = 50, wy = s * 16;
      ctx.fillStyle = dark;
      for (const sd of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(64 + sd * 12, by - 4);
        ctx.quadraticCurveTo(64 + sd * 40, by - 30 + wy, 64 + sd * 60, by - 8 + wy);
        ctx.lineTo(64 + sd * 50, by + 4 + wy * 0.6); ctx.lineTo(64 + sd * 40, by - 2 + wy * 0.5); ctx.lineTo(64 + sd * 30, by + 8 + wy * 0.3);
        ctx.quadraticCurveTo(64 + sd * 20, by + 4, 64 + sd * 12, by + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(64, by, 18, 0, 6.283); ctx.fill(); ctx.stroke();
      for (const sd of [-1, 1]) { ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(64 + sd * 6, by - 14); ctx.lineTo(64 + sd * 14, by - 32); ctx.lineTo(64 + sd * 16, by - 10); ctx.fill(); ctx.stroke(); }
      ctx.lineWidth = 3; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(64 + sd * 5, by + 17); ctx.lineTo(64 + sd * 7, by + 30 + c * 3); ctx.stroke(); }
      ctx.lineWidth = 4; drawEye(0, ctx, 57, by - 3, 6, 0.2, 1); drawEye(0, ctx, 71, by - 3, 6, 0.2, -1);
      drawTeeth(ctx, 58, 70, by + 8, 5, 2);
    } else if (kind === 'spitter') {
      const sq = 1 + s * 0.08, by = 96;
      ctx.fillStyle = body; ctx.beginPath();
      ctx.moveTo(26, by + 20); ctx.quadraticCurveTo(22, by - 30 * sq, 64, by - 50 * sq); ctx.quadraticCurveTo(106, by - 30 * sq, 102, by + 20);
      ctx.quadraticCurveTo(64, by + 30, 26, by + 20); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = light; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(44 + i * 13, by + 8 - (i % 2) * 6, 4, 0, 6.283); ctx.fill(); }
      // eye stalks
      ctx.lineWidth = 5;
      for (const sd of [-1, 1]) { const ex = 64 + sd * (16 + c * 3), ey = by - 66 * sq; ctx.beginPath(); ctx.moveTo(64 + sd * 8, by - 44 * sq); ctx.lineTo(ex, ey); ctx.stroke(); ctx.lineWidth = 4; drawEye(0, ctx, ex, ey, 7, 0.2, 0); ctx.lineWidth = 5; }
      // big round mouth
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.ellipse(64, by - 18 * sq, 14, 11 + Math.abs(c) * 4, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = hsl(spec.h + 0.05, 0.9, 0.55); ctx.beginPath(); ctx.ellipse(64, by - 15 * sq, 7, 4, 0, 0, 6.283); ctx.fill();
    }
  }

  // build sprite materials: frames[variant][frame], plus white hit frames
  const swShadowTex = (() => {
    const c = mkCanvas(64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const swShadowMat = new THREE.MeshBasicMaterial({ map: swShadowTex, transparent: true, depthWrite: false });
  const swShadowGeo = new THREE.PlaneGeometry(1, 1); swShadowGeo.rotateX(-Math.PI / 2);
  const SW_ART = {};
  const SW_TINT = 0.36;                                  // sprites are unlit: scale into the HDR range the 3D scene lives in
  for (const kind of Object.keys(SW_KINDS)) {
    if (SW_KINDS[kind].art) { SW_ART[kind] = SW_ART[SW_KINDS[kind].art]; continue; }
    SW_ART[kind] = [0, 1, 2].map(v => {
      const rr = swRng(kind.length * 977 + v * 131);
      const spec = { seed: 11 + v * 37 + kind.length, h: SW_KINDS[kind].hue[v] + (rr() - 0.5) * 0.03, eyes: rr() < 0.4 ? 1 : 2, ear: rr() < 0.5 };
      const mk = (white) => Array.from({ length: white ? 1 : SW_FRAMES }, (_, f) => {      // one hit frame is plenty: it shows for a blink
        const cv = mkCanvas(SW_PX), x = cv.getContext('2d');
        drawCritter(x, kind, spec, f);
        if (white) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#fff'; x.fillRect(0, 0, SW_PX, SW_PX); }
        const m = new THREE.SpriteMaterial({ map: srgbTex(cv), transparent: true, alphaTest: 0.35, depthWrite: true });
        if (white) m.color.setRGB(0.6, 0.24, 0.2); else m.color.setScalar(SW_TINT);   // hit frame: warm tint, not a white strobe
        return m;
      });
      return { walk: mk(false), hit: mk(true), color: new THREE.Color(hsl(spec.h, 0.62, 0.5)).getHex() };
    });
  }

  const swarm = [], globs = [];
  const SW_CAP = 110;
  GS.swId = 0; const swById = new Map(), SW_KEYS = Object.keys(SW_KINDS);
  function spawnCritter(kind, x, z, variant, id) {
    const v = variant == null ? Math.floor(Math.random() * 3) : variant, K = SW_KINDS[kind], art = SW_ART[kind][v];
    const sprite = new THREE.Sprite(art.walk[0]); sprite.center.set(0.5, 0.03); sprite.scale.set(0.01, 0.01, 1); scene.add(sprite);
    const shadow = new THREE.Mesh(swShadowGeo, swShadowMat); shadow.scale.set(K.r * 2.6, 1, K.r * 2.2); scene.add(shadow);
    const m = { kind, K, art, sprite, shadow, pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), hp: K.hp * (1 + 0.6 * (NET.on && NET.game ? Math.min(2, NET.remotes.size) : 0)), dead: false, awake: true, carried: false,
                flash: 0, cd: 0.5, phase: Math.random() * 4, facing: 1, think: Math.random() * 0.3, prey: null, home: null, throwT: 0.4 + Math.random() * 2.2, cartFan: Math.random() < 0.5, spitT: 1 + Math.random() * 2, born: 0, sawCd: 0, r: K.r, swarm: true };
    m.v = v; m.id = id == null ? ++GS.swId : id; swById.set(m.id, m);
    swarm.push(m);
    burst(tmp.set(x, 0.3, z), 0x8a7a6a, 2, 1.2, 2, 0.3);
    return m;
  }
  function killCritter(m, dir) {
    if (m.dead) return;
    if (m.net) { hitCritter(m, 9999, dir, 0); return; }          // not ours to kill: the lobby host decides
    m.dead = true; scene.remove(m.sprite, m.shadow);
    const p = tmp.set(m.pos.x, (m.K.fly || 0) + m.K.size * 0.4, m.pos.z);
    spawnParticles(p, m.art.color, m.K.heavy ? 18 : 9, m.K.heavy ? 10 : 7);
    flash(p, m.art.color, m.K.heavy ? 6 : 3, 0.18, 1.6, false);
    SFX.play('pop', p, { rate: m.K.heavy ? 0.7 : 0.9 + Math.random() * 0.3 });
    if (!NET.applying) { GS.enemyKills++; ekillsEl.textContent = GS.enemyKills; crewKill(false); myKill(m.pos.x, m.pos.z, 1); }
    waves.lastKill.copy(m.pos);
    if (m.wb) { GS.wbKilled++; if (m.wbLoot) { bossDrop(m.pos.x, m.pos.z); if (!NET.client) netEv({ t: 'bdrop', x: r1(m.pos.x), z: r1(m.pos.z) }); } GS.shake = Math.max(GS.shake, 0.6); }
    else if (m.mini && !NET.client) { if (PH.i > 0) dropWeapon(m.pos); GS.shake = Math.max(GS.shake, 0.4); }
    if (!NET.client) lootFrom(m.rig ? 'rig' : m.wb ? 'wb' : m.mini ? 'mini' : m.K.heavy ? 'brute' : m.K.ranged || m.K.fly ? 'tough' : 'mob', m.pos.x, m.pos.z);
    if (m.K.split && !m.mini) for (const sd of [-1, 1]) { const c = spawnCritter(m.K.split, m.pos.x + sd * 0.7, m.pos.z + rand(-0.4, 0.4), m.v); c.home = m.home; c.vel.set(sd * 6, 0, rand(-3, 3)); }
  }
  function hitCritter(m, dmg, dir, push = 3) {
    if (m.dead) return;
    if (m.rig && RIG.tame) return;                         // for now the rigs can't be hurt
    if (m.net) { m.flash = 0.08; m.myHit = GS.elapsed; netEv({ t: 'hit', i: m.id, d: Math.min(9999, dmg), x: dir ? r2(dir.x) : 0, z: dir ? r2(dir.z) : 0, p: push }, NET.hostPeer); return; }
    if (m.rig && push <= 3 && !(dir && dir.x * Math.sin(m.rig.rh) + dir.z * Math.cos(m.rig.rh) > 0.3)) dmg *= 0.4;      // the booth walls soak bullets and beams; the back window doesn't
    m.hp -= dmg; if (m.flash < -0.12) m.flash = 0.08;      // blinks under constant fire instead of staying lit
    if (dir && !m.rig) m.vel.addScaledVector(dir, push * (m.K.heavy ? 0.3 : 1));
    if (m.hp <= 0) killCritter(m, dir);
  }
  // ---- mini-bosses: the same monsters a fifth bigger with a hellfire on their heads; they shoot like the players do and throw bullet patterns ----
  const hellTex = (() => {                              // a crown of fire: five flame tongues on a glowing band
    const c = mkCanvas(128, 96), x = c.getContext('2d'), g = x.createLinearGradient(0, 96, 0, 0);
    g.addColorStop(0, 'rgba(255,60,40,0.95)'); g.addColorStop(0.35, 'rgba(255,150,30,1)'); g.addColorStop(0.7, 'rgba(255,230,120,1)'); g.addColorStop(1, 'rgba(255,255,230,0.9)');
    x.fillStyle = g; x.beginPath(); x.moveTo(8, 92);
    const tips = [[14, 30], [38, 44], [64, 4], [90, 44], [114, 30]];
    x.lineTo(6, 58);
    tips.forEach(([tx, ty], i) => { const nx = i < 4 ? (tx + tips[i + 1][0]) / 2 : 122, vy = 66; x.quadraticCurveTo(tx - 9, ty + 26, tx, ty); x.quadraticCurveTo(tx + 9, ty + 26, nx, i < 4 ? vy : 58); });
    x.lineTo(120, 92); x.closePath(); x.shadowColor = 'rgba(255,90,20,0.9)'; x.shadowBlur = 10; x.fill();
    x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,220,0.9)'; for (const tx of [26, 64, 102]) { x.beginPath(); x.arc(tx, 80, 5, 0, 6.283); x.fill(); }
    return srgbTex(c); })();
  const hellMat = glow(new THREE.SpriteMaterial({ map: hellTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 2.2);
  const MINI_SIZE = Math.max(...Object.values(SW_KINDS).map(K => K.size)) * 1.15;        // every mini-boss is the same size: 15% over the biggest monster there is
  function makeMini(m, gate) {
    if (m.mini) return m;
    m.mini = true; m.gate = !!gate; { const k = MINI_SIZE / m.K.size; m.K = { ...m.K, size: MINI_SIZE, r: Math.min(1.9, m.K.r * k), bite: Math.round(m.K.bite * 1.3), spiky: true }; }   // cannot be run over
    m.r = m.K.r; m.hp = (m.K.hp * 4 + 26) * (1 + 0.6 * (NET.on && NET.game ? Math.min(2, NET.remotes.size) : 0)); m.atkT = 1.5 + Math.random() * 2;
    const f = new THREE.Sprite(hellMat); f.center.set(0.5, 0.05); f.position.set(0, 0.86, 0); f.scale.set(0.5, 0.36, 1); m.sprite.add(f); m.fire = f;
    m.shadow.scale.set(m.K.r * 2.6, 1, m.K.r * 2.2);
    return m;
  }
  // ---- elite rigs: a mast on a crawling base sweeps a long spiked log round and round at car height; the elite sits in a booth on top and shoots down.
  //      Kill it and the rig falls apart ----
  const rigWood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95, flatShading: true }), rigMetal = new THREE.MeshStandardMaterial({ color: 0x8c8478, roughness: 0.55, metalness: 0.4, flatShading: true }),
        rigRust = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9, flatShading: true }), rigDark = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.9, flatShading: true });
  const rigLogGeo = new THREE.CylinderGeometry(0.8, 0.8, RIG.half * 2, 12); rigLogGeo.rotateZ(Math.PI / 2);
  const rigSpikeGeo = new THREE.ConeGeometry(0.26, 1.0, 5), rigCapGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.25, 12); rigCapGeo.rotateZ(Math.PI / 2);
  const RIG_OPS = MINI_KINDS.filter(k => !SW_KINDS[k].fly);
  const rigHpTex = [3, 2, 1, 0].map(left => { const c = mkCanvas(256, 44), x = c.getContext('2d');           // three chunks: one bomb takes one
    x.fillStyle = '#1b1421'; x.beginPath(); x.roundRect(0, 0, 256, 44, 12); x.fill();
    for (let i = 0; i < 3; i++) { x.fillStyle = i < left ? (left === 1 ? '#ff4a2a' : '#ffb03a') : '#4a3f48'; x.beginPath(); x.roundRect(8 + i * 81, 8, 77, 28, 7); x.fill(); }
    return srgbTex(c); });
  GS.rigT = 8; GS.rigOwed = 0;
  function makeRig(m) {
    if (m.rig) return m; makeMini(m); m.hp *= 1.6; m.K = { ...m.K, heavy: true };
    const g = new THREE.Group(), box = (w, h, d, x, y, z, mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.3, 0.7, 10), rigRust); base.position.y = 0.35; base.castShadow = true; g.add(base);
    for (const [x, z] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 10), rigDark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.45, z); g.add(w); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, RIG.top, 8), rigMetal); mast.position.y = RIG.top / 2; mast.castShadow = true; g.add(mast);
    const sweep = new THREE.Group(); sweep.position.y = 1.55; g.add(sweep);         // the log spins around the mast
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.1, 10), rigDark); sweep.add(hub);
    const log = new THREE.Mesh(rigLogGeo, rigWood); log.castShadow = true; sweep.add(log);
    for (let i = 0; i < 28; i++) { const x = (i < 14 ? -1 : 1) * (5.8 + (i % 14) * (RIG.half - 6.3) / 13); for (let j = 0; j < 5; j++) {
      const sp = new THREE.Mesh(rigSpikeGeo, rigMetal), a = j / 5 * 6.283 + (i % 2) * 0.63; sp.position.set(x, Math.cos(a) * 1.15, Math.sin(a) * 1.15); sp.rotation.x = a; sp.castShadow = true; sweep.add(sp); } }
    for (const sd of [-1, 1]) { const c = new THREE.Mesh(rigCapGeo, rigMetal); c.position.x = sd * RIG.half; sweep.add(c); }
    const booth = new THREE.Group(); booth.position.y = RIG.top; g.add(booth);        // the elite's nest on top; the low side is the window
    const bb = (w, h, d, x, y, z, mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = true; booth.add(b); };
    bb(3.6, 0.3, 3.6, 0, 0, 0, rigDark); bb(3.6, 1.5, 0.25, 0, 0.9, 1.7, rigRust); bb(0.25, 1.5, 3.6, -1.7, 0.9, 0, rigRust); bb(0.25, 1.5, 3.6, 1.7, 0.9, 0, rigRust); bb(3.6, 0.5, 0.25, 0, 0.4, -1.7, rigRust);
    for (const [x, z] of [[-1.7, 1.7], [1.7, 1.7], [-1.7, -1.7], [1.7, -1.7]]) bb(0.3, 1.9, 0.3, x, 1.1, z, rigDark);
    const levers = [];                                                               // a row of levers the elite keeps yanking
    for (let i = 0; i < 3; i++) { const lv = new THREE.Group(); lv.position.set(-0.9 + i * 0.9, 0.15, 1.15);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 6), rigMetal); stick.position.y = 0.65; lv.add(stick);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: [0xe03a2a, 0xf0c020, 0x3aa0e0][i], roughness: 0.5 })); knob.position.y = 1.32; lv.add(knob);
      booth.add(lv); levers.push(lv); }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.4, 8), rigDark); pipe.position.set(-1.5, 1.6, -1.4); pipe.castShadow = true; g.add(pipe);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 8), rigDark); cap.position.set(-1.5, 2.85, -1.4); g.add(cap);
    g.position.copy(m.pos); scene.add(g);
    const hp = new THREE.Sprite(new THREE.SpriteMaterial({ map: rigHpTex[0], transparent: true, depthTest: false })); hp.renderOrder = 22; hp.scale.set(7, 1.2, 1); hp.position.y = RIG.top + 7.0; g.add(hp);
    m.rig = { g, sweep, booth, levers, hp, hpN: 0, rh: Math.random() * 6.283, a: Math.random() * 6.283, fall: 1.0, hitCd: 0, puff: 0, bob: 0 };
    m.atkT = 2.5; m.shadow.scale.set(5, 1, 4.4);
    return m;
  }
  function rigAnchors() {                                  // the gun pedestals (everybody's) and, once the world is up, the altars
    const a = pedestals.filter(P => P.state !== 'gone').map(P => [P.x, P.z]);
    for (const R of NET.remotes.values()) if (R.up && Array.isArray(R.pp)) for (const q of R.pp) a.push(q);
    if (PH.i >= 1) for (const A of altars) a.push([A.x, A.z]);
    return a;
  }
  function spawnRig() {                                    // host: a rig drops out of the sky next to a pedestal or an altar, the one with the fewest rigs around
    const views = lobbyViews(), V = views[Math.floor(Math.random() * views.length)], wp = V.r ? V.r.pos : car.pos;
    const an = rigAnchors(), rigs = swarm.filter(m => m.rig && !m.dead);
    let x, z;
    if (an.length) { an.sort((p, q) => rigs.filter(m => Math.hypot(m.pos.x - p[0], m.pos.z - p[1]) < 45).length - rigs.filter(m => Math.hypot(m.pos.x - q[0], m.pos.z - q[1]) < 45).length || Math.random() - 0.5);
      const [ax, az] = an[0], a = Math.random() * 6.283, d = 14 + Math.random() * 8; x = ax + Math.cos(a) * d; z = az + Math.sin(a) * d; }
    else [x, z] = offscreenSpot(wp, Math.random() * 6.283, 8, false);
    x = THREE.MathUtils.clamp(x, -ARENA + 22, ARENA - 22); z = THREE.MathUtils.clamp(z, -ARENA + 22, ARENA - 22);
    if (obstacles.some(o => active(o) && Math.hypot(o.mesh.position.x - x, o.mesh.position.z - z) < 6)) return false;
    if (rigs.some(m => Math.hypot(m.pos.x - x, m.pos.z - z) < RIG.half * 2 * 2.4)) return false;      // never two logs close: at least 2.4 log lengths apart
    const m = makeRig(spawnCritter(RIG_OPS[Math.floor(Math.random() * RIG_OPS.length)], x, z));
    m.rig.rh = Math.atan2(wp.x - x, wp.z - z); return true;
  }
  function rigDirector(dt) {
    if (NET.client || startEl.isConnected || PH.brk > 0) return;
    const want = RIG.n[PHASES[PH.i].key] || 0, have = swarm.filter(m => m.rig && !m.dead).length;
    if (PH.i === 0 && GS.wbSpawned) { if (GS.rigOwed > 0 && (GS.rigT -= dt) <= 0) { GS.rigT = 0.5; if (spawnRig()) GS.rigOwed--; } return; }      // boss hunt: the rigs standing are targets, no more come (but there are at least two)
    if (have >= want) { GS.rigT = Math.max(GS.rigT, 6); return; }
    if ((GS.rigT -= dt) <= 0) GS.rigT = spawnRig() ? (have < want / 2 ? 9 : 16) : 1;
  }
  const angTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  function rigAI(m, dt, T) {                                // host: crawl about its own patch, away from other rigs; stay on the plain
    const R = m.rig; if (m.stun > 0) m.stun -= dt; if (m.slow > 0) m.slow -= dt; if (R.fall > 0) { m.vel.set(0, 0, 0); return; }
    if (!R.home) R.home = [m.pos.x, m.pos.z];
    if (!R.wp || Math.hypot(R.wp[0] - m.pos.x, R.wp[1] - m.pos.z) < 4) { const a = Math.random() * 6.283, d = Math.random() * 22; R.wp = [R.home[0] + Math.cos(a) * d, R.home[1] + Math.sin(a) * d]; }
    let want = Math.atan2(R.wp[0] - m.pos.x, R.wp[1] - m.pos.z);      // it patrols its own patch: it does not chase players, so rigs never pile up
    for (const o of swarm) if (o !== m && o.rig && !o.dead && Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) < RIG.half * 2 * 2.4) { want = Math.atan2(m.pos.x - o.pos.x, m.pos.z - o.pos.z); R.wp = null; break; }
    const lim = ARENA - 22; if (Math.abs(m.pos.x) > lim || Math.abs(m.pos.z) > lim) want = Math.atan2(-m.pos.x, -m.pos.z);
    R.rh += THREE.MathUtils.clamp(angTo(R.rh, want), -RIG.turn * dt, RIG.turn * dt);
    const sp = m.stun > 0 ? 0 : RIG.speed * (m.slow > 0 ? 0.5 : 1);
    m.vel.set(Math.sin(R.rh) * sp, 0, Math.cos(R.rh) * sp);
    const ox = m.pos.x, oz = m.pos.z; m.pos.addScaledVector(m.vel, dt);
    for (const o of obstacles) if (active(o)) pushOutOfBox(m.pos, 2.3, o);
    if (Math.hypot(m.pos.x - ox, m.pos.z - oz) < sp * dt * 0.3) R.rh += 1.2 * dt;       // stuck on a rock: swing round
    m.pos.x = THREE.MathUtils.clamp(m.pos.x, -ARENA + 4, ARENA - 4); m.pos.z = THREE.MathUtils.clamp(m.pos.z, -ARENA + 4, ARENA - 4);
    const f = rigLog(m);                                      // the log mows monsters down too
    for (const o of swarm) { if (o === m || o.dead || o.rig || o.wb || o.K.fly || (o.rigCd || 0) > GS.elapsed) continue; if (rigDist(f, o.pos) < RIG.logR + o.r) { o.rigCd = GS.elapsed + 0.8; hitCritter(o, o.mini ? 2 : 6, rigFling(f, o.pos).clone(), 16); o.stun = Math.max(o.stun || 0, 0.4); } }
  }
  function rigLog(m) { const a = m.rig.a; return { cx: m.pos.x, cz: m.pos.z, rx: Math.cos(a), rz: -Math.sin(a) }; }       // the log as a segment through the mast
  function rigDist(f, p) { const dx = p.x - f.cx, dz = p.z - f.cz, t = THREE.MathUtils.clamp(dx * f.rx + dz * f.rz, -RIG.half, RIG.half); return Math.abs(t) < RIG.mastR ? 99 : Math.hypot(dx - f.rx * t, dz - f.rz * t); }
  function rigFling(f, p) {                                 // which way a hit flies: along the sweep, and out from the mast
    const dx = p.x - f.cx, dz = p.z - f.cz, t = dx * f.rx + dz * f.rz, s = Math.sign(t) || 1;
    const tx = f.rz * s, tz = -f.rx * s, ox = f.rx * s, oz = f.rz * s;              // the log turns with growing angle: its tangent at side s
    return tmp.set(tx * 0.8 + ox * 0.6, 0, tz * 0.8 + oz * 0.6).normalize();
  }
  function rigTick(m, dt) {                                 // everybody: spin it, draw it, and let it toss my own car
    const R = m.rig;
    if (m.net && Math.hypot(m.vel.x, m.vel.z) > 0.5) R.rh += angTo(R.rh, Math.atan2(m.vel.x, m.vel.z)) * Math.min(1, 3 * dt);
    if (R.fall > 0) { R.fall -= dt; const y = Math.max(0, R.fall) * 26; R.g.position.set(m.pos.x, y, m.pos.z);
      if (R.fall <= 0) { GS.shake = Math.max(GS.shake, Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z) < 40 ? 0.9 : 0.2); burst(tmp.set(m.pos.x, 0.5, m.pos.z), 0x8a7a64, 26, 4.5, 9, 0.6); SFX.play('tent_slam', m.pos);
        if (car.alive && Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z) < RIG.half + 1) rigToss(m, rigLog(m)); }
      return; }
    R.a = (GS.elapsed * RIG.spin + m.id * 1.7) % 6.283;        // spins on its own; each player is judged against what they see
    const t = GS.elapsed + m.id;                                                    // cartoon excavator: everything rattles, the cab bounces, the elite yanks levers
    R.bob = Math.abs(Math.sin(t * 10)) * 0.14 + Math.abs(Math.sin(t * 23)) * 0.05;
    R.g.position.set(m.pos.x + Math.sin(t * 31) * 0.05, Math.abs(Math.sin(t * 13)) * 0.07, m.pos.z + Math.cos(t * 27) * 0.05);
    R.g.rotation.z = Math.sin(t * 8.3) * 0.025; R.g.rotation.x = Math.sin(t * 6.7) * 0.02;
    R.sweep.rotation.y = R.a; R.sweep.position.y = 1.55 + Math.sin(t * 17) * 0.05;
    R.booth.rotation.y = R.rh; R.booth.position.y = RIG.top + R.bob; R.booth.rotation.z = Math.sin(t * 7.1) * 0.07; R.booth.rotation.x = Math.sin(t * 5.3) * 0.05;
    R.levers.forEach((lv, i) => { const ph = Math.sin(t * (3.1 + i * 1.3) + i * 2); lv.rotation.x = Math.sign(ph) * Math.min(1, Math.abs(ph) * 4) * 0.55; });      // jerky yanks, not smooth swings
    if ((R.puff -= dt) <= 0) { R.puff = 0.22 + Math.random() * 0.15;
      burst(tmp.set(m.pos.x - 1.5, 3.1, m.pos.z - 1.4), Math.random() < 0.3 ? 0x1a1a1a : 0x555049, 2, 0.9, 1.8, 0.55); }
    if (Math.random() < dt * 3) burst(tmp.set(m.pos.x + rand(-2, 2), 0.2, m.pos.z + rand(-2, 2)), 0x8a7a64, 2, 1.2, 2, 0.3);
    if ((R.hits || 0) !== R.hpN) { R.hpN = R.hits || 0; R.hp.material.map = rigHpTex[Math.min(3, R.hpN)]; R.hp.scale.set(9, 1.55, 1); }      // the bar jumps when a chunk goes
    if (R.hp.scale.x > 7) R.hp.scale.set(Math.max(7, R.hp.scale.x - dt * 6), Math.max(1.2, R.hp.scale.y - dt * 1.05), 1);
    if (R.hits >= 1 && Math.random() < dt * 9) puff(tmp.set(m.pos.x + rand(-1.5, 1.5), RIG.top + 1.5, m.pos.z + rand(-1.5, 1.5)), 0x221e1c, 1.8, 1.1, rand(-0.5, 0.5), 3, rand(-0.5, 0.5));
    if (R.hits >= 2) { if (Math.random() < dt * 14) spawnParticles(tmp.set(m.pos.x + rand(-1.6, 1.6), RIG.top + 0.6, m.pos.z + rand(-1.6, 1.6)), Math.random() < 0.5 ? 0xff7a2a : 0xffc040, 2, 4); R.booth.rotation.z += 0.12; }
    if ((R.hitCd -= dt) > 0 || GS.elapsed < (car.rigCd || 0) || !car.alive || car.burrow !== 'up' || car.y > 2.6) return;
    const f = rigLog(m);
    if (rigDist(f, car.pos) < RIG.logR + car.radius) { rigToss(m, f); return; }
    const bx = car.pos.x - m.pos.x, bz = car.pos.z - m.pos.z, bd = Math.hypot(bx, bz) || 1e-3;      // the base is solid
    if (bd < 2.3 + car.radius) { const push = 2.3 + car.radius - bd; car.pos.x += bx / bd * push; car.pos.z += bz / bd * push;
      const vn = (car.vel.x * bx + car.vel.z * bz) / bd; if (vn < 0) { car.vel.x -= bx / bd * vn * 1.4; car.vel.z -= bz / bd * vn * 1.4; } }
  }
  function rigToss(m, f) {                                  // whack! up and away along the sweep
    const d = rigFling(f, car.pos);
    car.vel.x = d.x * 5; car.vel.z = d.z * 5; car.speed = 0;      // a short hop: the log passes under you while you're up
    car.vy = 10; car.airborne = true; m.rig.hitCd = 1.0; car.rigCd = GS.elapsed + 1.8;      // no chain of tosses from two logs
    if (GS.myTow) bombOff(bombs.find(B => B.id === GS.myTow));      // the jolt throws the bomb off the cart
    hurtCar(car.maxHp * 0.08, d.clone());
    GS.shake = Math.max(GS.shake, 0.6); SFX.play('clang', car.pos, { rate: 0.8 }); spawnParticles(tmp.copy(car.pos).setY(1), 0xd8cfc0, 10, 8);
  }
  function rigBreak(m, quiet) {                             // the elite is dead: the rig falls apart
    const R = m.rig; if (!R || R.gone) return; R.gone = true; scene.remove(R.g); if (R.zone) scene.remove(R.zone); if (quiet) return;
    const p = tmp.set(m.pos.x, 1.2, m.pos.z);
    spawnParticles(p, 0x6b4a2a, 26, 13); spawnParticles(p, 0x8c8478, 14, 10); burst(p, 0x5a4a3a, 18, 4, 9, 0.6); flash(p, 0xffb060, 7, 0.3, 3, false);
    const f = rigLog(m); for (const sd of [-1, 1]) spawnParticles(tmp.set(f.cx + f.rx * sd * RIG.half * 0.6, 1.5, f.cz + f.rz * sd * RIG.half * 0.6), 0x6b4a2a, 14, 11);
    if (Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z) < 50) GS.shake = Math.max(GS.shake, 0.6);
    SFX.play('crate_break', m.pos, { rate: 0.6 }); SFX.play('clang', m.pos, { rate: 0.5 });
  }
  // ---- BOMBS: the only thing that breaks a rig. Drive into one and it pops onto your cart (half speed, full while a friend drives right next to you);
  //      bring it next to a rig and keep it there 5 s; it jumps onto the elite and goes off ----
  const bombs = []; GS.bombSpawnT = 4; GS.towCd = 0; GS.bombNetT = 0; GS.bombId = 0; GS.myTow = 0;
  const bombGeo = new THREE.SphereGeometry(1.1, 16, 12), bombMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.35, metalness: 0.3 });
  const sparkMat = glow(new THREE.SpriteMaterial({ color: 0xffc040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 3);
  const bombNeckGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.45, 10), bombFuseGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5), bombFuseMat = new THREE.MeshStandardMaterial({ color: 0xc8a878 });
  function numTex(n) { const c = mkCanvas(96, 96), x = c.getContext('2d'); x.font = '900 72px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = '#1a0e08'; x.strokeText(String(n), 48, 52); x.fillStyle = n <= 2 ? '#ff4a2a' : '#ffd23a'; x.fillText(String(n), 48, 52); return srgbTex(c); }
  const bombNums = [1, 2, 3, 4, 5].map(numTex);
  // The delivery hand: a big white four-fingered cartoon glove, 1930s rubber-hose style, just the hand. It slides in from the top right of the screen,
  // sets the bomb down gently, lets go and pulls back the same way.
  const HAND = { arrive: 1.5, hold: 0.45, leave: 1.0, far: 62, S: 1.7, ink: 0.2 };
  const handAxis = new THREE.Vector3(0.26, 0.63, -0.74).normalize();                // toward the top right of the screen, nearly flat to the camera: we see the glove side-on, like a drawing
  const handQuat = (() => { const cam = new THREE.Vector3(1, 1.1, 1).normalize(), Z = cam.clone().addScaledVector(handAxis, -cam.dot(handAxis)).normalize(), X = handAxis.clone().cross(Z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, handAxis, Z)); })();
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.85 }), inkMat = new THREE.MeshBasicMaterial({ color: 0x15101a }), inkBack = new THREE.MeshBasicMaterial({ color: 0x15101a, side: THREE.BackSide });      
  const gSph = new THREE.SphereGeometry(1, 20, 16), gCyl = new THREE.CylinderGeometry(1, 1, 1, 16), gTap = new THREE.CylinderGeometry(1, 0.82, 1, 16), gRoll = new THREE.TorusGeometry(1.05, 0.42, 12, 26), gRollInk = new THREE.TorusGeometry(1.05, 0.42 + HAND.ink, 12, 26);
  // three fat fingers and a thumb, two joints each: [x, y, z, radius, len1, len2, carrying [z1, x1, z2, x2], sprung open [z1, x1, z2, x2]]. Carrying, the index hooks round to pinch against the thumb.
  const HAND_F = [
    [0.78, -0.72, 0.12, 0.5, 0.9, 0.75, [0.25, 0.1, 0.95, 0], [0.22, -0.55, 0.1, -0.25]],
    [0, -0.8, 0.2, 0.5, 1.05, 0.85, [-0.12, -0.1, -0.1, 0.25], [-0.08, -0.6, 0, -0.25]],
    [-0.78, -0.72, 0.12, 0.47, 0.95, 0.8, [-0.42, -0.2, -0.15, 0.3], [-0.5, -0.55, -0.1, -0.25]],
    [1.3, -0.05, 0.1, 0.5, 0.9, 1.0, [0.9, 0.1, -1.2, 0], [1.4, -0.3, 0.25, -0.2]] ];
  // ---- the flat set: the delivery glove and the bombs are drawn art (a sprite sheet generated from the approved glove concept, cut out and embedded), standing in the 3D world as sprites ----
  // ART_META: [width, height, anchor x, anchor y] in sheet pixels. A glove's anchor is where its pinch holds the fuse; the frames share it, so swapping them does not make the hand jump.
  const FLAT = { hand: true, gs: 0.022 };      // metres per sheet pixel for the gloves
  const ART_META = { pinch: [267, 358, 133.1, 349], half: [315, 320, 183.2, 343.8], open: [376, 355, 210.1, 347.6], slap: [303, 336, 157.7, 343.5], bomb: [252, 314, 125.6, 194.7], spark: [160, 169, 80, 88] };
  const ART_SRC = { pinch: 'data:image/webp;base64,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', half: 'data:image/webp;base64,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', open: 'data:image/webp;base64,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', slap: 'data:image/webp;base64,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', bomb: 'data:image/webp;base64,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', spark: 'data:image/webp;base64,UklGRsgbAABXRUJQVlA4WAoAAAAQAAAAnwAAqAAAQUxQSCQMAAABZ6ambSOoOQJ3/OHe9O8RISBJ6IDdkAMYWQlQMa0pn8xFwmEAtG0jBNnk/4Mt2WkviOj/BER9zzc5/xt/ok/GZyAW0pkk2URldoYq1oMkDZgKSSinAFaGbzKM5ZfHM+eRgfJaKK8LFk5kWZikT1iauUjyTEtnlyxsSUvx/wwFbdtIMX/a9x+BiJiApk521Dt+iuLEg5xYJexEZzmxyY4DkNYNKna0ObrsW9s/pbG2bftVQRUOgUBIkHinh4/L3d2va+rariW51uCavdbG3d3dTvdzaEuS7ghMdEJIU82lExExAZRsa08jSV9lrqJGVfvfBjQz46yYQvql37/0ixosCDgeR8QE4H/5Ca853mSSuKsD0xy99p1ve21fri08vvmej33ivXfS+mK2J83kDbdHXl2hTNUA49YkqCtZJgHAaBRZdWVxfgHDtldTlmfTDWkaajVlNp1dQD/16gmEeafX92g9iZ2wG1r1RMXtoBd69SQJ7SVpS68lWajsII3sWpKitXu9vl9LmpjTXrsfWHUEbMwe0rZbSwL1YiyO64g415GS7KiOKJmyhxRndaQ4ZzuJNNVrCIS5g3TVrCNR3ABCXkOycI+3E6+GJPE9DId+DSmBpYdB6NSPqm4b6Xr1A8o00O7Fev0INIL+oFk/hPzIcBiQ2qHkRvRx0qwfTCPoDzq1I5CLI9pk5NUNBOIRjMeBIHTXwGNZDLL5oeYktURA4mHSWjw7kYWgsg1hMIrKsuj88tjR5E6/cfKnyBZCUR5zDw6apaidmN73LwkxRndu3TRw9jNbEkPwY5iMOqQEPh4P8UyiXArd8W7eOQCAb6/WQkjqdCyaxF4J8Z3XTNZ/6NqXwfQ76U0DAF798nNHQijq3RiGqb+b3b39Gg+Ro+7Pdl3PMXAx+/E3Xl4LAcHTRJCE1k7R6NADJJrvS7Jb3V6KzT//8c9ehhiFeALd1N3FG17rAsgW8p4sN2j6OjY7qqZAkOrszHAY0B2C6zcBYAZpP2Yr7cfYSnWFQ5RCfsbsh41iZjoJL5xA3oemG47DsNVVTQnCVKYZpHFAC0XjA2xYkz0YXtKJsF2yZRXijM7rjJdGdhF3fGhfWB5RlM7shu4xbHe4zSHQxsQz6KVukejGDVw8fSSVpjmt1EdBasoKEwnE2amk5yvb3PRac8PJqVwSSeyGaaMoM5gEoUY/5/RDcwtLhgNskcrRb7wrTlCYU04gVlXMFNLIJ5u83tDpBKxU/abtuSis6IxBsJIYmfLS2N1A/MEY5zD9ZNylKKxSWYZwgzFT6KWbrPYo2eRpgWo0PNtDcdVRKMTrzce5ft9VLvhxD5uNjVO2HbQjguIa1RgELNbO6d3QBqC1onSLI50gHc9sWNhRMWUOEasxc0giXwaaaQ9bieKYlthuaGBHWeISxLS5Bc2440D1CvGYH5oMu/tcomJKzm1zGHQ902x2W9uC5AEp9S1l+ZudqM0JxJyFaEGv1/b9VoLt5/PlNrvheA52902TQdQbuwXmOI3SOCyyyDZJph912tid2aqGipt0uViXpEwL0BuPR11tW7ZY5RsMu+F4KNEyPBXVtiJXP3109Hh2VoawW6Ffu319iO2r5QoXzaCddlCmzS1SLdK2HW92/OqDh/cfsd2yWLcAkzu3ogLLRUYB23EaNkGZmqsqqLapmW6PrB6+8uJzz8VNvkuTD3YFmg4Kni+gaY6fxG2U6klcQsUJ5aoDAMvnnhn0k7ZVDGJOS4rn3E6anulqKNXoaBKqPp9lvHsBwBtee2ecuHqhYOlsxIqvR90Q5WpyQ0P1vfRmtAXWsNdL045T4Hy6v/mP73uuhXJpQzUgQOoEXN4CWDfu3jqIPX3b8f7wwipC2ZImExFAM7lZAOD9NI2jwNqwmp7M97ZHT1NliJFTtiwC8JvXr/VjVwewXkxPK0MMLkOURIJSCCBJnKZJ5HENi2lVGprBIM58vT4vBug3blwf3en5KuYV4ZaiQayE7gDwfvqON9/uObQaqulqEOt6tThd7QDon/rUh94yNKphKQYTDFoOSDMX78OvhOZxGcItJXNZUFGHagwCrjnfldugBSqHmGsVvQU6s1WIqmjTG9DQNCoqtJpYro5qkgRx19pQr8xTDRliz+G6FFdTIHbWnrzpuQot/yRpEL2dXv/GrDq/I6oiOGZY4egHR5V5dq1pVGQqN0zHj0aPUdl73DL4fNlukswN22o4jaDZSVHdhmFymayiRA2xtttBmGYaju+HrVYYoNKjvqHm69w7ckSiMWgu6eoUt2sYjuN5fhj6qDz3HNuim7OOaNtqzTVmCSarDNX84Wvf/9nA9/2mB3Gq2M1aa5asOYx7Hd9QWX5hTHVMzXYafuD5gQ5xqz15YywRC8tYz9eXhJq20wxbzWaz6Um4CtUZZ6zKKVudzffHLMtzA6/VCQIdV6q3DdNQWT4je5GMhtuK07jt6bh6G2Gaerq6nMjlmY1mMwijJDFxVcteRFbvD8qygzBJozjScaWTAJ85JGWYnt9qJ2nawpX/6PTNY+xMvNAzjbjt4+p/+YnnHhr6LiSMku6gn1Jc9dmj+y8BqnqPSXVw+9qkp+FqPz958OjB0VJSVFvHLDm4+5ZbDVzhy5OTo6N5JuWEMkJQYvvNb32Dgit5MX18fHJ0tADhssIVRUPJ3i1fwVW7nJ6eTE8XOZATiVBGGfZpxo/n2hWxOp3OTufT2ew8zymVGdcUhVPs3/rrb2LHYOJbP3Fvuc4ICMkkQmSCS7s4DjueqWucyVxROFMoV2VGmSycv/96uoIky0xScelNQ9PYBcYVxmRFkSQmybLMCKMSoZBAkSFHhgwE7Il71fjL92bzNSosSaCUMkJlmVIqUcgyY4RJIFQCKHJIWGcSIPMvfeeJShx9bTZbVqlcIksEVMImCgASVP23f32xEvjZ6uRYNCUrwb0ZqcZp/nh6dBXQ9HhpVAPR+dmr+RVg34COio6ks5NHV8DwzdCqgkl2dE989t0PeqjsSDo5mokuI1BZdTBOQwg+oxpzUeFo1NcFt84UBZWe9H2xrUiu2uWdnl+K65EsNMKIg7IXTz3+w2XAqN8R2blkKryso9+v1H+Yyi7BLOhNBqbAKNUDlHzvCXDtYRjt8sPnf8sUJsNAYEy2UPIzT0m2oazifrMYPfnkq+/d1MH1SBfWg1efRMl/fSRrFDiH1ClmRDiURw8n8MzvQ1G5r9yfl5N+d8wbALDKZa8Y18hE9fEM/pRaYlK9Z15FqcrgJi7mGXeMQlpyFOuLzPxt5IrJ855Cqe+tUXVsXqumWSjfVZQ3Hz58CBP5YUhEpLvGvVLUS5SxjatMKZIeNADmRUQcw7gfisg3TJRYT+SkoCClSlAk4x4AQo026FD/2pCLx3E5ShQNMTYUXUtKp0hC+x+gEWkI1w7b4gld+e+7mY/EEeNrSfdZgYy7PaBIkpHDW6kqmjxTm5jmyKKY1hqNbZpTFFzTjBaAuqIrsSwkamJX+fh+04LptW4724SwIqDL9XkBM1cg1Dxn0HcpLCxYmKm6ofYyXgg5o8o2aNr6TCTnmeliR8suJCyVFd3vMFgxKJRl2yxlsRBIRtcK36HFpIrF3Oh3PJF3AJXBt0A9y8/FQVTqoTiJxILFK+6knRNRdiHZWlpv0XK2Fgc4JcXuS0pYLzfijgHbBTnhGd0Ehc6F4WZqE4W9asUZJSvonHLsTvLFcr7JlOemIEj7t1cYfqAl45wrrWkYF6ZnUgloFaXt4O3noSAavd8wml3SgrPmhkk7Fx4RUgZQt7jt4PNYF4M/ej6S7lMpODPVsvaF+wwlp5byznexKwQ1uo5BpagF587ldQIgf0UpC2Xb3P/eJo4QwsFoIFbNCWdf0dU6Bp4lbmkoKRYBbMNWBGCPD4NecKq4RDI/a+mLp3W7PAjbF69OL7muCSA8nKAbkRQXeT59vNBnio59RjEf//7l/nlePS067G3ZODdc6HP3j5fcMfaCRm9+/fr3r8yrF/aH2NiChoKLtXo3D1Tsm3jDno7K6/1BZ8MmPiYcUK8/xsbUYsIRbR1s8IFSxhH1or4MoGYojmkQhwD+HjjjmPIgULD+249qwUE1Q/vkwc+/+7OCo9r45Oe/+IXP3dVwWMm1937sXV2GA6u32w7+nyNWUDggfg8AAHBCAJ0BKqAAqQA+PRqLQ6IhoRTarZwgA8S2DgBPgAzBinfkv4q94ZcbnH5Hf1n9nvlKrD9D++v9r/aL4uf47vZ5x8u/xv81/3H+C/KH4If5b2Efd17gv6Uf9D/O/kB3G/6//wfUF/S/8n/yf9B7vf+G/yX+A9zf9c9QX+Tf3n/2+1B/1PYz/tXqF/zb+5/9/2Wf9x+xPwN/tZ+2//c+Q/+b/4X/6/7X3APQA9RH+Afv/3NP9z/FD9GPMb/S/kJyS37AdBFp1E+wAngdoFBBq92+frKNvJe6hmKcZU+fbURIzGPbFhQRyj6p3/I4L3wSdywHbGRIWt0UM7IjNaJFZz7f0Ai5aB6KaglA1wmC2BiV2pzFIJaN7YodnTQZvikVSWdYuez+a1HLPYNQ5dsoX0ymidU2kUBctUddIDT085+JL0ZmvePC2sEdaBP/94M96/VdJJtzyL2FRyG3Ro3pysGYr8pBIx1LAw3CcBv7k7bGE1Ynoi8hJVwOIxmiTXetEPNX/Op0gUuqQt/kjsjFMMDtA7amFePdlmrIo648uwv07Z+Wug73EMjyXQBnUpl3Yyh9j0LQLhVlGGqyCz1xvcmMEbuyPaibGK8/KJf/jpiYHlmhWwOlZ301ya8W/mOzNb2099cmzCwzJikVx1GBrM6eHxqQDwed0a4r+ZqxGoGkvM2dawkRuDnsd96G/xJKX7mj4zVXb3BeNJeYAAD+9pG9a7rSeyOpR01MJFpv2S34QiBpeRa6a9z0kXk3Vzc873DzPvLPCSWMonBPOCepbPllf//B1f/wjF//4O8TvIly2zBbPG/2KszbiJg38hPef6+5CRdP/OaCHSeNiAHLYqsJElhEw/nG9fTutVcXdvlsLjLBeNL5uCfyMn0srbrzf0hKlSVU0wJEXKXpR4ugSHAet6MhHmlB9FT0WQRdzCmz15IWDcIQ0suAhOTREdGVe5fzQJrpnPd+775Nb8+fiKJAAB/qA9EB9e5YLFdjeOOg0eArOLvPsFcXmfNbwpobT78RZIs/+JYHX6YRXAAf7dl0WzH6pz2Ek3nfvbEtHWz+EM9Cp6bUyHYCXTfTNBQ78iyds+3VZxhpFzPWHdkVVqwTQ5izpWOKy/lmb6yisSxADxQBgrBLRVRatbQIar0c56TlcXmV+Tth0znPHhHMi59V9ASQPsUWk3KsWSHE4vCQX7sG1lL/j4eH5sv08dZSH1Wm43QxqVDXpeH6yQY3U6xP+VlKMh+F1uLwyEhdji60FDNW9Td+QE7BkoR2LgIrtjPnOcJZPrS7LoNWheaM/1Lv5vstoBPSwf3val8mt2lDKOiPw+WmymltCgcHyTirp2QdEC9wCfBJhH2CEFyNHRddyb5Za4l/8hRal49f0PZCEAn5aomws1y0iSAY/HHO91nJjbo+8mgCysDYZgcexPFhTKCTjt31qr3XAQDbxtCFqiN36VrIlpcd/KXdvoCZ/LgvHprP58LdB2F9K6GNxZMxRZ7z1frfT1TD59zzHa33a0o1vQaONhfPDxNK8dGawgFs8iU2SfjHJEd7GCwHlAIYlzdoYaNzqmqHKMrMM1iAm1OTS2TC4RyaRSUSDmXhYgAmCMDwk7Gwmnum+7IB9Wb/n6Ef1od51z7PFAeH6MyEDEuqJW6L16bqyr6/SM0calUOo33xKUKDpvPlC/7REtK+zpZncL4WpxybHCCEGWbmbDPFeRGVc1si5zhknB4ldEJJMWMDmAv8RMusGBxA7FFAED9xcBM6LwDAY6nVxTK7hLUoGsnm55mYC/iQ8ubQq49L7HjtNn3c79LCtoUoBqT1RwkBIt9h8pBYhcobcDv4s3/r4svIfBoGOOrDJcX1aP7FJZwNJ5k89o2bFictMnSnDPKLCMx8NU33mTU9we1PsRnhaGv7a9aB/AFGSB7/vBGfLSakVxP2BZc+oy7cWI+nqqy1EErwzkhbuA1rZqLjEQmB1OBLMdPjEtUykLlAKTSvgHR1rabK4owm1Wmq7GXqdr9zEvkCoghRQq2sUdVbxCD04LvEVFlkqWD7SMiSjWH5Nnjd4e8+aGKK1aBv4bNUaXqkj7+K//UmSn0WzYkk5AI5N8x9cJs8Id5b2+DIZG9jleYl2baL5+6n5QVqOc66aHCPjqcKynXbFTr/VCbAXBQgBxVP9nVCQn3ah6loP4f0xaD9g9XJkFcjAdmj7V2BmOdLAprD1yVVUx6de3dboUJ23POVQ5tlcBWQm5UFZ5yRE1tomjXusiLZufCRrzWwvhBYbOM1IFAg9G49poiScUxsQaNbDiPWGosByla3Gm8fm8ZT3Np2vBNqzp+pp4skqzi65YcuG84KhndHrbJHZS3WO2JT309ob6hSXUlLjanDPTJtCcLcWXv+MH+rMpyazJMC2BejBTDDspth/Vn5T3AQvK9OpE4yrQj96SUlf/l8HFmTTAlvNY3LM7R8z6RWwpRkLlqG3A7+jL3cvCnMg/tiisGBBlr0Q3FyIOll8LY4IIU636Dp8DtPuMses2Lu4qxKoMUk7V/oby7AAVfDqNg52tivfU74BJnJeZlqzZ/uTxTP0kAnO3AlCcByajOgJXrvx9fbRvgx8vMWfsqEG5HmT/O9tOMfkHvz92oPQdBpWXvYul0F0eED2QZ0MlxqD4gMPVhQIOTCS2mKz9nY/bznq33pWRuVy6dztuLY2rBInQdQFfNn6r6Tfuz/+LHpTuOeJoEWtfosh+T53E7VU6QLP/udDRbnHgF0lBrxVAyVl/X9NcWmf4MoaGT8VW00idCOMHH5U9UNm0NAzeW1gETKYva0/QsPbNpdjXcX6pMDszhJqJS11xII2dPZS7xSb6uEH1amDHc3lYS9rhDwCBSqNE3h5vBp7YgyeXSkLZb6FPnBgHaoLfSDGkZUt4o7GQCrgPcnK0MDx+XO4DftM+AXBWKfIk3q7DiIMRuxM7nEyLM749w4JKZrvg2sdHxOvf//p+rRxdtlQ8D+0fgVnwAwv/5QRUnxuFHv//V7BgXq7mIB8PQKEa67a5nRdwZ/NeIOwEAA1CNAK+9ApyZR/6pXWS8AAa+zVNxEjhWx7wTAiwFV4o1LdqEX+9zKZL856km90Vi1Kctg6XtS//6XsJKy42bdZ9WnlFe2NWOPGwzoPzQCvmf1Eq1U0LTt34NZYJNIwZTqQN7EdZLcBiDgqeX93m4OQzqocRtXIiDJDYd2yXxG7x40TMXlLnyDXsgdEU7ZhBbFUBiNKcb3JNcD1/BaAOBYBWgS30a2XN6y1JGX64mv/ep86sssnRb2Nzlobgm0YG/oAedXXOaeUQB/0vPJIWP89eE9xGGnT/+CIkqT0m+31HjGLW6NMpdoKEp2FiAKb0EgLt9Wd2QDU+jeyjrWnXDz3iszTKprEAXKNWv+0TAlguatG2bTpZ1658jW0nrPz96bfRXfzfulDJLiOUPUQ2KukTQGuoSIvppiY2MPhc/hiHQ9YNq91JaZKGMsbmH8CG2KHIj82kXH3wHtNMjaERQG93iWvUnPWHKTjnP+cEpIAyaVdInsG6dPKlYQnjhEy+9Xiaei1h3xcxerG99VrmdDoR1WFqNUCZi0SeFaKO0YArca144Gs1KW+mZK+smWvAAD67YjlSl8SFFHkap3Hq5WmVreW5FPUZ2q+vH5f4QKiwNLO1NKscVnSwhzB5Ws/Px7LcGVxXUWfnJRtTv5qBipZ6YEk1BZi2tHrGF+yqCJAHF7axYXtvmFDMj611zXWrMQZ9YDd3aqgucn0lqy8zUA34c8S34Tga1ouAQDxGpayBzZ6OB0iUFiLg+ZoUa6Hq87TZDyvQBprasjaOxUstIFIlfb4Fdp5KL5b0g1eKQH0h3twJGmnKvLd83xIV5cTSgiJxt4bW5o67YE7oiEXEcSW0ZLotd+nXQzNQuFnkBnLVNyCSmbjByQujh0M9KeMAg7rMMk4Jb5+WUECtY5gB0P62V6fOh3nVHieRKaSBiomwucSdx5D57s77rvGRQnD7ZLHdiWysNqaponOJO2LhDy7UlcAHXoc1vUaV0TksiuZlLaut7uxp3Nm5y58K2+Mqkqb+jJwGe/lwBNpVWGwSb6AKh/7EQhDnu+Z7Ivxm5mwqTQ3NYZK0zZq7nKAyo/OZuZib6herDq9R5sU/k4W+v8/4cHL5N/DEF9bYf7GQ3iAI7wNkNFNqZqvIq0klgfaBkY9Be4NsbuLlEM9Mm729K+ViCDDiIhyAnop3LQJFGt/+QfT4mwKIAXtaIGIgMP8JS/Geqfo1JOL/FH/mr83VMLZeJbvrh1wkqVi/I5TTQxL+gfbyR2pw6fUtEYqkjeYW3ryuQYd8ohuMO3DmilcnvS8w8Rr5XYJVnxfIPxcKb4NwGC5rWIl+ReqV3FqwwOpIUW5YqzsF3yx5vXzVWipKoQqD+ZAVVMSgKHkzA9CAl2qbD0v/2gNWdXiXmAsaCenVCXqIY321VKK0hEJ2ljmiewTrygfoll8LY4IIVmk4/+6XjuGvytmc0sKfl8NO7Wu8vv92m1tCKws4/SAA0VzSWDzPTp2S01i6j0bJ+Ev+MRvX8XOhZy/C3GWgDUDvyh/4TgjZA7RW+HOZaNZ31PA60sUBNyzyB+cBkW7ut6joM9YbX8z61vPGC5Zqu0mkIkgKd6TQfDGWWKplfn1GEIz4VWxq4cwrbIlmQd/j5Rifc7E0U9INgurRfJbapMaG+O1/UOrDFpxNpMh0IpN2aWxrwWFHxRmkvKfu2ITWydejE61aiTC/+BL3FBkaIgQ5HcLl9axnGHonX8R5TlyXAueQj6f0eB7jCQIQ8d1Y84a/DfIkzA0suxPF+lbwh9uQPEGNgKsHIsJ8Je3G0FxFotngBPxoConKICbg1Mbc/T/sExIbMNlsev8LWBD4IVE6C8pe8MsZ0uGcf0NwbneGlSafadoiTLbRJ+VRWuRcWlUHFbtEWp4NUhArqTwDHD3LHDf/nNIBILMENEKgGwwTS8oNdpVYZkjhHyxVyuxD+DmShiMNrSqprGy0+G2H/WsgIIT00dPsfj3v8TkHQgJulcn//i///9/Of/v3R//3514Vi0fp3EAq2EQt4Q2Vws4GtTySMJg6Zy74gLkrSRUspQS4QwWXA86qV++lU5EHGIzs2zRFDPbec+qAYpkC9OY6AlLy+5ijHDD7iZ8WpT9fnAQ18A9u7nvcsI2oxI2mXpPj+v69vXjdO575r3K7blqvQA41yR+rrgdGw1F48Jh4qnVFEcXkbeEpr75FvC8wAYl0D56Zt//qHYPf+l0utNR5tu1RQxnYgAAAAAAA==' };
  const ART = {};
  for (const k in ART_SRC) { const im = new Image(), t = new THREE.Texture(im), M = ART_META[k]; t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
    ART[k] = { tex: t, w: M[0], h: M[1], cx: M[2] / M[0], cy: 1 - M[3] / M[1], ok: false }; im.onload = () => { t.needsUpdate = true; ART[k].ok = true; }; im.src = ART_SRC[k]; }
  const camRight = new THREE.Vector3(1, 0, -1).normalize(), camUp = new THREE.Vector3(-0.434, 0.789, -0.434);      // the sprite plane, in world terms
  const fuseTip = new THREE.Vector3(0.32, 3.1, 0);      // from a bomb's foot to the tip of its fuse: where the glove pinches and the spark sits
  function makeHand2D(k = 1) { const H = new THREE.Sprite(new THREE.SpriteMaterial({ map: ART.pinch.tex, transparent: true, depthTest: false })); H.renderOrder = 22; H.flat = true; H.k = k; handPose(H, 0); return H; }
  function handPose(H, e, stretch = 0, tilt = 0, name) {  // e: 0 pinching the fuse .. 1 sprung open; or a frame by name
    const A = ART[name || (e < 0.25 ? 'pinch' : e < 0.72 ? 'half' : 'open')], s = FLAT.gs * H.k * (1 + stretch * 0.07) * (e > 1 ? 1 + (e - 1) * 0.6 : 1);
    if (H.material.map !== A.tex) H.material.map = A.tex; H.center.set(A.cx, A.cy); H.scale.set(A.w * s, A.h * s, 1); H.material.rotation = tilt; }
  function bombModel() {                                    // the bomb is a solid thing: ball, neck, fuse, spark (only the glove that brings it is drawn)
    const g = new THREE.Group(), body = new THREE.Mesh(bombGeo, bombMat); body.position.y = 1.1; body.castShadow = true;
    const neck = new THREE.Mesh(bombNeckGeo, rigDark); neck.position.y = 2.3; const fuse = new THREE.Mesh(bombFuseGeo, bombFuseMat); fuse.position.set(0.15, 2.75, 0); fuse.rotation.z = -0.5;
    const spark = new THREE.Sprite(sparkMat); spark.position.copy(fuseTip); spark.scale.setScalar(0.7); g.add(body, neck, fuse, spark); g.spark = spark; return g; }
  function makeHand() {
    const H = new THREE.Group(), k = HAND.ink, inked = (geo, sx, sy, sz, par, x, y, z) => { const m = new THREE.Mesh(geo, gloveMat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; par.add(m);
      const o = new THREE.Mesh(geo, inkBack); o.scale.set(sx + k, sy + k, sz + k); o.position.copy(m.position); par.add(o); return m; };      // every white part gets a bold black ink outline
    inked(gSph, 1.5, 1.2, 1.0, H, 0, 0, 0);                                           // palm
    const roll = new THREE.Mesh(gRoll, gloveMat); roll.rotation.x = Math.PI / 2; roll.position.y = 1.22; roll.castShadow = true; H.add(roll);      // the puffy rolled cuff
    const rollInk = new THREE.Mesh(gRollInk, inkBack); rollInk.rotation.x = Math.PI / 2; rollInk.position.y = 1.22; H.add(rollInk);
    inked(gSph, 1.05, 0.55, 1.05, H, 0, 1.36, 0);                                      // just the hand: a white puffed top closes the cuff
    for (const x of [-0.5, 0, 0.5]) { const d = new THREE.Mesh(gSph, inkMat); d.scale.set(0.085, 0.5, 0.05); d.position.set(x, 0.2, 0.99 - x * x * 0.24); d.rotation.x = 0.1; H.add(d); }      // three brush strokes on the back of the hand
    H.fingers = [];
    for (const [x, y, z, r, l1, l2, carry, open] of HAND_F) {
      const f = new THREE.Group(), t = new THREE.Group(), r2 = r * 0.84; f.position.set(x, y, z); t.position.y = -l1; f.add(t);
      inked(gSph, r, r, r, f, 0, 0, 0); inked(gTap, r, l1, r, f, 0, -l1 / 2, 0);
      inked(gSph, r2, r2, r2, t, 0, 0, 0); inked(gTap, r2, l2, r2, t, 0, -l2 / 2, 0); inked(gSph, r2 * 0.82, r2 * 0.82, r2 * 0.82, t, 0, -l2, 0);
      f.tip = t; f.carry = carry; f.open = open; H.add(f); H.fingers.push(f); }
    H.scale.setScalar(HAND.S); H.quaternion.copy(handQuat); return H;
  }
  const handOff = new THREE.Vector3(1.72, -1.78, 0.1).multiplyScalar(HAND.S).applyQuaternion(handQuat);      // where the pinch sits: the hand holds the bomb by its fuse
  function handTick(B, dt) {                                                         // returns true while the bomb is still in the hand
    const D = B.drop; D.t += dt; const H = D.hand, a = HAND.arrive, h = HAND.hold;
    let dist, curl;
    if (D.t < a) { const k = D.t / a; dist = HAND.far * Math.pow(1 - k, 2.6); curl = 1; }                              // fast in, slowing right down for the last metre
    else if (D.t < a + h) { dist = 0; curl = 1 - (D.t - a) / h; }                                                      // fingers let go
    else { const k = (D.t - a - h) / HAND.leave; dist = HAND.far * k * k; curl = 0; }
    if (D.t >= a && !D.set) { D.set = true; burst(tmp.set(B.x, 0.3, B.z), 0x8a7a64, 10, 2, 5, 0.5); SFX.play('land', tmp.set(B.x, 0, B.z), { vol: 0.5, rate: 1.3 }); }
    const wob = D.t < a ? Math.sin(D.t * 9) * 0.25 * (1 - D.t / a) : 0;
    const o = 1 - curl, e = o <= 0 ? 0 : 1 + 2.70158 * Math.pow(o - 1, 3) + 1.70158 * Math.pow(o - 1, 2);      // the fingers spring open with a little overshoot
    if (H.flat) { H.position.set(B.x, wob, B.z).add(fuseTip).addScaledVector(handAxis, dist); const sp = Math.abs(dist - (D.d0 === undefined ? dist : D.d0)) / Math.max(dt, 1e-3); D.d0 = dist;
      handPose(H, e, Math.min(1, sp / 70), D.t < a ? Math.sin(D.t * 9) * 0.06 * (1 - D.t / a) : 0); }
    else { H.position.set(B.x, 2.8, B.z).sub(handOff).addScaledVector(handAxis, dist); H.position.y += wob;
      for (const f of H.fingers) { const a = f.carry, b = f.open; f.rotation.set(a[1] + (b[1] - a[1]) * e, 0, a[0] + (b[0] - a[0]) * e); f.tip.rotation.set(a[3] + (b[3] - a[3]) * e, 0, a[2] + (b[2] - a[2]) * e); } }
    if (D.t < a) B.g.position.set(B.x, wob, B.z).addScaledVector(handAxis, dist);
    if (D.t >= a + h + HAND.leave) { scene.remove(H); if (H.flat) H.material.dispose(); B.drop = null; }
    return D.t < a;
  }
  function addBomb(id, x, z, delivered) {
    const g = bombModel(), spark = g.spark;
    const num = new THREE.Sprite(new THREE.SpriteMaterial({ map: bombNums[4], transparent: true, depthTest: false })); num.renderOrder = 21; num.position.y = 4.6; num.scale.setScalar(2.6); num.visible = false; g.add(num);
    g.position.set(x, 0, z); scene.add(g);
    const B = { id, x, z, tx: x, tz: z, g, spark, num, n: 0, gone: false, fly: null, drop: null };
    if (delivered) { B.drop = { t: 0, hand: FLAT.hand ? makeHand2D() : makeHand(), set: false }; scene.add(B.drop.hand); handTick(B, 0); }
    bombs.push(B); return B;
  }

  // ---------- the shop and the level's ultimates ----------
  // Crystals buy charges; a charge fires once. TEN HANDS: ten gloves slap the ground in a ring around you, each leaving a bomb; when the last one is down they all go off and
  // everything inside dies, log machines included. PUNISHING SWORD: a huge angelic blade drops out of the sky ahead of you, sticks, then ploughs on through the ground and throws aside whatever it meets.
  const ULT_ART = { sword: 'data:image/webp;base64,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', hands: 'data:image/webp;base64,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' };
  const ULT_NAME = { sword: 'PUNISHING SWORD', hands: 'TEN HANDS' }, ultFx = [], furrows = [];
  const shopEl = document.getElementById('shop'), convEl = document.getElementById('conv'); let shopSig = '';
  for (const b of shopEl.querySelectorAll('.ult')) { const k = b.dataset.u; b.style.backgroundImage = 'url(' + ULT_ART[k] + ')'; b.title = ULT_NAME[k];
    const go = e => { e.preventDefault(); e.stopPropagation(); useUlt(k); }; b.addEventListener('mousedown', go); b.addEventListener('touchstart', go, { passive: false }); }
  { const go = e => { e.preventDefault(); e.stopPropagation(); convertCoins(); }; convEl.addEventListener('mousedown', go); convEl.addEventListener('touchstart', go, { passive: false }); }
  for (const ev of ['pointerdown', 'click']) shopEl.addEventListener(ev, e => e.stopPropagation());
  function convertCoins() { if (GS.coins < SHOP.conv[0]) { SFX.play('hit_stone', null, { vol: 0.35, rate: 0.6 }); return; } GS.coins -= SHOP.conv[0]; GS.gems += SHOP.conv[1]; GS.abSig = ''; SFX.play('pickup', null, { rate: 1.9, vol: 0.6 }); }
  function buyUlt(k) { if (GS.gems < SHOP.ult[k]) { SFX.play('hit_stone', null, { vol: 0.35, rate: 0.6 }); return false; } GS.gems -= SHOP.ult[k]; ult[k]++; GS.abSig = ''; SFX.play('pickup', null, { rate: 0.8 }); flashAlert(ULT_NAME[k] + ' READY'); return true; }
  function useUlt(k) {                                     // a charge in hand fires; with none, the same press buys one
    if (startEl.isConnected || !car.alive) return;
    if (ult[k] <= 0) { buyUlt(k); return; }
    ult[k]--; const x = car.pos.x, z = car.pos.z, h = car.heading; castUlt(k, x, z, h, true); netEv({ t: 'ult', k, x: r1(x), z: r1(z), h: +h.toFixed(2) });
    const b = shopEl.querySelector('.ult[data-u=' + k + ']'); b.classList.remove('fired'); void b.offsetWidth; b.classList.add('fired');
  }
  function updateShop() {
    const show = !startEl.isConnected; if (shopEl.style.display !== (show ? 'flex' : 'none')) shopEl.style.display = show ? 'flex' : 'none'; if (!show) return;
    const sig = GS.coins + '|' + GS.gems + '|' + ult.sword + '|' + ult.hands; if (sig === shopSig) return; shopSig = sig;
    for (const b of shopEl.querySelectorAll('.ult')) { const k = b.dataset.u, n = ult[k], can = GS.gems >= SHOP.ult[k];
      b.classList.toggle('has', n > 0); b.classList.toggle('buy', !n && can); b.querySelector('.n').textContent = n > 0 ? '×' + n : '';
      b.querySelector('.act').innerHTML = n > 0 ? 'USE' : (can ? 'BUY ' : '') + '<span class="g">◆' + SHOP.ult[k] + '</span>'; }
    convEl.classList.toggle('can', GS.coins >= SHOP.conv[0]); convEl.innerHTML = '<span class="c">●' + SHOP.conv[0] + '</span> ➜ <span class="g">◆' + SHOP.conv[1] + '</span>';
  }
  // -- ten hands --
  function ultKillAt(x, z, R) {                            // host: nothing inside the ring survives, log machines included
    for (const m of swarm.slice()) { if (m.dead) continue; const dx = m.pos.x - x, dz = m.pos.z - z, d = Math.hypot(dx, dz) || 1e-3; if (d > R + m.r) continue;
      if (m.rig) { m.rig.hits = 3; netEv({ t: 'righit', m: m.id, n: 3 }); killCritter(m); } else { m.dig = 0; hitCritter(m, 99999, tmp.set(dx / d, 0, dz / d).clone(), 14); } }
  }
  function ultBoom(F) {                                    // the caster's side of the blast
    for (const e of enemies) { if (e.dead || e.carried) continue; const dx = e.pos.x - F.x, dz = e.pos.z - F.z, d = Math.hypot(dx, dz) || 1e-3; if (d < ULT.hands.R + e.r) hitEnemy(e, tmp.set(dx / d, 0, dz / d).clone(), 999, 12); }
    if (boss.state === 'fight' && Math.hypot(BOSS_POS.x - F.x, BOSS_POS.z - F.z) < ULT.hands.R + 8) bossDamage(BOSS_HP * 0.2);      // the Pyramidon is not "everything": it loses a fifth
    if (NET.client) netEv({ t: 'ultboom', x: r1(F.x), z: r1(F.z) }, NET.hostPeer); else ultKillAt(F.x, F.z, ULT.hands.R);
  }
  function castHands(x, z, own) {
    const U = ULT.hands, ph = Math.random() * 6.283, items = [];
    for (let i = 0; i < U.n; i++) { const a = ph + i / U.n * 6.283, r = U.ring * (i % 2 ? 0.72 : 1.08); items.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, t0: i * U.every, hand: null, bomb: null, st: 0 }); }
    ultFx.push({ k: 'hands', x, z, own, t: 0, items, boomT: (U.n - 1) * U.every + U.fly + U.lift + U.fuse, done: false });
  }
  function tickHands(F, dt) {
    const U = ULT.hands; F.t += dt;
    for (const it of F.items) { const t = F.t - it.t0; if (t < 0) continue;
      if (it.st === 0) { it.st = 1; it.hand = makeHand2D(0.62); scene.add(it.hand); }
      if (it.st === 1) { const k = Math.min(1, t / U.fly), dist = 46 * Math.pow(1 - k, 2.2); handPose(it.hand, 0, 1 - k, 0, 'slap'); it.hand.position.set(it.x, 1.4, it.z).addScaledVector(handAxis, dist);      // the slap comes down
        if (k >= 1) { it.st = 2; tmp.set(it.x, 0.3, it.z); burst(tmp, 0x8a7a64, 10, 2.4, 6, 0.5); waveFx(it.x, it.z, 3.4, 0xfff4c8, 0.25); SFX.play('land', tmp, { vol: 0.55, rate: 1.1 + Math.random() * 0.4 });
          if (Math.hypot(it.x - car.pos.x, it.z - car.pos.z) < 40) GS.shake = Math.max(GS.shake, 0.35);
          if (F.own) { if (NET.client) netEv({ t: 'blast', x: r1(it.x), z: r1(it.z), r: 3.6, d: 2, p: 10, s: 1 }, NET.hostPeer); else blastAt(it.x, it.z, 3.6, 2, 10, true); }
          const g = bombModel(); g.position.set(it.x, 0, it.z); scene.add(g); it.bomb = g; it.spark = g.spark; } }
      else if (it.st === 2) { const k = (t - U.fly - U.lift) / 0.32; if (k > 0) { handPose(it.hand, 1, k, 0, 'open'); it.hand.position.set(it.x, 1.4, it.z).addScaledVector(handAxis, 46 * k * k); }      // and whisks away, the bomb stays
        if (k >= 1) { scene.remove(it.hand); it.hand.material.dispose(); it.hand = null; it.st = 3; } }
      if (it.bomb) { const pulse = 1 + Math.max(0, F.t - F.boomT + U.fuse) / U.fuse * 0.25 * Math.abs(Math.sin(F.t * 26)); it.bomb.scale.setScalar(pulse); it.spark.scale.setScalar(0.7 + Math.random() * 0.8); } }
    if (!F.done && F.t >= F.boomT) { F.done = true; if (F.own) ultBoom(F);
      SFX.play('boss_roar', tmp.set(F.x, 2, F.z), { rate: 1.3, vol: 0.6 }); if (Math.hypot(F.x - car.pos.x, F.z - car.pos.z) < 80) GS.shake = Math.max(GS.shake, 1.6);
      waveFx(F.x, F.z, U.R, 0xffa040, 0.45); waveFx(F.x, F.z, U.R * 0.6, 0xfff4c8, 0.3); }
    if (F.done) { let left = 0; for (let i = 0; i < F.items.length; i++) { const it = F.items[i]; if (!it.bomb) continue;      // the bombs go off one after another, fast
        if (F.t >= F.boomT + i * 0.045) { const p = tmp.set(it.x, 1.6, it.z); flash(p, 0xffa040, 16, 0.5, 8, false); spawnParticles(p, 0xff7a2a, 26, 16); spawnParticles(p, 0x2a2420, 14, 10); SFX.play('explode', p, { rate: 0.8 + Math.random() * 0.4, vol: 0.7 });
          scene.remove(it.bomb); it.bomb = null; } else left++; }
      if (!left && F.items.every(it => !it.hand)) return true; }
    return false;
  }
  // -- the punishing sword --
  const uswMat = glow(new THREE.MeshBasicMaterial({ color: 0xf6fbff }), 1.25), uswGold = glow(new THREE.MeshBasicMaterial({ color: 0xffc83a }), 1.2), uswWing = new THREE.MeshBasicMaterial({ color: 0xfffaf0 });
  const gPrism = new THREE.CylinderGeometry(1, 1, 1, 4), gSpike = new THREE.ConeGeometry(1, 1, 4), gBox = new THREE.BoxGeometry(1, 1, 1);
  const furrowGeo = new THREE.PlaneGeometry(1, 1); furrowGeo.rotateX(-Math.PI / 2);
  function makeSword() {                                   // point at y = 0, pommel up; the flat of the blade faces the camera
    const S = new THREE.Group(), G = new THREE.Group(), k = 0.2, part = (geo, mat, sx, sy, sz, x, y, z, rz = 0, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(0, ry, rz); G.add(m);
      const o = new THREE.Mesh(geo, inkBack); o.scale.set(sx + k, sy + k, sz + k); o.position.copy(m.position); o.rotation.copy(m.rotation); G.add(o); return m; };
    part(gPrism, uswMat, 1.5, 9.6, 0.42, 0, 7.0, 0); const tip = part(gSpike, uswMat, 1.5, 2.3, 0.42, 0, 1.1, 0); tip.rotation.x = Math.PI; G.children[G.children.length - 1].rotation.x = Math.PI;      // blade and point
    const full = new THREE.Mesh(gBox, uswGold); full.scale.set(0.34, 7.6, 0.5); full.position.set(0, 7.6, 0); G.add(full);                                    // the gold line down the blade
    part(gBox, uswGold, 4.0, 0.8, 0.9, 0, 12.1, 0);                                                                                                  // guard
    for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { const a = 0.15 + i * 0.3; part(gSph, uswWing, 2.1 - i * 0.22, 0.52, 0.24, sd * (2.4 + Math.cos(a) * 1.5), 12.5 + Math.sin(a) * 1.9 + i * 0.25, -0.1, sd * (a + 0.15)); }      // two wings of five feathers
    part(gCyl, uswGold, 0.34, 2.3, 0.34, 0, 13.6, 0); part(gSph, uswGold, 0.62, 0.62, 0.62, 0, 15.0, 0);                                                // grip and pommel
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.13, 8, 26), glow(new THREE.MeshBasicMaterial({ color: 0xffe27a }), 2.2)); halo.rotation.x = Math.PI / 2 - 0.25; halo.position.y = 16.5; G.add(halo);
    const eye = new THREE.Mesh(gSph, new THREE.MeshBasicMaterial({ color: 0xfffaf0 })); eye.scale.set(0.5, 0.36, 0.1); eye.position.set(0, 10.6, 0.3); const pup = new THREE.Mesh(gSph, inkMat); pup.scale.set(0.2, 0.2, 0.06); pup.position.set(0, 10.6, 0.38); G.add(eye, pup);
    G.rotation.y = Math.PI / 4; S.add(G); S.blade = G; return S;
  }
  function castSword(x, z, h, own) { const U = ULT.sword, dx = Math.sin(h), dz = Math.cos(h), g = makeSword(); scene.add(g); SFX.play('whoosh', tmp.set(x, 2, z), { rate: 0.7, vol: 0.8 });
    ultFx.push({ k: 'sword', own, t: 0, x: x + dx * U.ahead, z: z + dz * U.ahead, dx, dz, g, hit: new Set(), ehit: new Set(), run: 0, laid: 0, st: 0 }); }
  function swordHits(F, r, kill) {                         // the caster's side: whatever the blade meets is thrown aside
    for (const m of swarm) { if (m.dead || m.rig || F.hit.has(m.id)) continue; const ox = m.pos.x - F.x, oz = m.pos.z - F.z, d = Math.hypot(ox, oz) || 1e-3; if (d > r + m.r) continue; F.hit.add(m.id);
      const side = (ox * F.dz - oz * F.dx) >= 0 ? 1 : -1, px = kill ? ox / d : F.dz * side * 0.85 + F.dx * 0.5, pz = kill ? oz / d : -F.dx * side * 0.85 + F.dz * 0.5;
      m.dig = m.net ? m.dig : 0; if (isFry(m)) hitCritter(m, 99, tmp.set(px, 0, pz).clone(), 24); else { hitCritter(m, kill ? 8 : 6, tmp.set(px, 0, pz).clone(), 20 / (m.K.heavy ? 0.3 : 1)); stunCritter(m, 1.5); } }
    for (const e of enemies) { if (e.dead || e.carried || F.ehit.has(e)) continue; const ox = e.pos.x - F.x, oz = e.pos.z - F.z, d = Math.hypot(ox, oz) || 1e-3; if (d > r + e.r) continue; F.ehit.add(e);
      const side = (ox * F.dz - oz * F.dx) >= 0 ? 1 : -1; hitEnemy(e, tmp.set(F.dz * side, 0, -F.dx * side).clone(), e.elite ? 6 : 99, 16); }
  }
  function tickSword(F, dt) {
    const U = ULT.sword; F.t += dt; const g = F.g; let y = 0, lean = 0;
    if (F.t < U.fall) { const k = F.t / U.fall; y = 70 * (1 - k * k); lean = 0.18; }
    else { if (F.st === 0) { F.st = 1; tmp.set(F.x, 0.5, F.z); flash(tmp, 0xbfe9ff, 22, 0.5, 6); waveFx(F.x, F.z, U.R0, 0xffe27a, 0.4); waveFx(F.x, F.z, U.R0 * 0.55, 0xffffff, 0.25); burst(tmp, 0xc9a070, 30, 5, 12, 0.7);
        SFX.play('boss_roar', tmp, { rate: 1.7, vol: 0.55 }); SFX.play('land', tmp, { vol: 0.9, rate: 0.6 }); if (Math.hypot(F.x - car.pos.x, F.z - car.pos.z) < 80) GS.shake = Math.max(GS.shake, 1.5); if (F.own) swordHits(F, U.R0, true); }
      const t = F.t - U.fall - U.hold; y = -1.6; lean = -0.12;
      if (t > 0 && F.run < U.run) { const step = Math.min(U.run - F.run, U.speed * dt); F.run += step; F.x += F.dx * step; F.z += F.dz * step; lean = -0.42 + Math.sin(F.t * 40) * 0.03; y = -1.9 + Math.sin(F.t * 31) * 0.12;      // ploughing on
        if (Math.abs(F.x) > ARENA - 3 || Math.abs(F.z) > ARENA - 3) F.run = U.run;
        if (F.own) swordHits(F, U.w, false);
        while (F.laid < F.run) { F.laid += 1.7; const fx = F.x - F.dx * 1.2, fz = F.z - F.dz * 1.2;
          for (const [col, w, life, yy, add] of [[0x1a1014, 2.3, 7, 0.09, false], [0x9fe8ff, 1.3, 1.6, 0.13, true]]) { const m = new THREE.Mesh(furrowGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: add ? 0.95 : 0.62, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
            m.scale.set(w, 1, 2.1); m.rotation.y = Math.atan2(F.dx, F.dz); m.position.set(fx, yy, fz); scene.add(m); furrows.push({ m, t: 0, life, o: m.material.opacity }); }
          for (const sd of [-1, 1]) { tmp.set(fx + F.dz * sd * 1.6, 0.5, fz - F.dx * sd * 1.6); burst(tmp, 0xb8895e, 4, 2.2, 7, 0.55); }
          if (Math.random() < 0.5) SFX.play('land', tmp, { vol: 0.25, rate: 1.6 + Math.random() * 0.5 }); }
        if (Math.hypot(F.x - car.pos.x, F.z - car.pos.z) < 50) GS.shake = Math.max(GS.shake, 0.3); }
      if (F.run >= U.run) { F.out = (F.out || 0) + dt; const k = F.out / U.out; y = -1.9 + 60 * k * k; g.scale.setScalar(Math.max(0.01, 1 - k * 0.6)); if (k >= 1) { scene.remove(g); return true; } } }
    g.position.set(F.x, y, F.z); g.rotation.set(F.dz * lean, 0, -F.dx * lean);      // leaning into its path
    return false;
  }
  function castUlt(k, x, z, h, own) { if (k === 'hands') castHands(x, z, own); else if (k === 'sword') castSword(x, z, h, own); if (own) flashAlert(ULT_NAME[k] + '!'); }
  function updateUlts(dt) {
    for (let i = ultFx.length - 1; i >= 0; i--) if ((ultFx[i].k === 'hands' ? tickHands : tickSword)(ultFx[i], dt)) ultFx.splice(i, 1);
    for (let i = furrows.length - 1; i >= 0; i--) { const f = furrows[i]; f.t += dt; f.m.material.opacity = f.o * Math.max(0, 1 - f.t / f.life); if (f.t >= f.life) { scene.remove(f.m); f.m.material.dispose(); furrows.splice(i, 1); } }
    updateShop();
  }
  function dropBomb(B) { if (B.gone) return; B.gone = true; scene.remove(B.g); if (B.drop) scene.remove(B.drop.hand); bombs.splice(bombs.indexOf(B), 1); if (GS.myTow === B.id) GS.myTow = 0; }
  function bombSpot(m) {                                   // a bomb lies 30-40 m from the rig it is meant for
    for (let i = 0; i < 30; i++) { const a = Math.random() * 6.283, d = 30 + Math.random() * 10, x = m.pos.x + Math.cos(a) * d, z = m.pos.z + Math.sin(a) * d;
      if (Math.abs(x) > ARENA - 6 || Math.abs(z) > ARENA - 6 || inRoom(x, z) || obstacles.some(o => active(o) && Math.hypot(o.mesh.position.x - x, o.mesh.position.z - z) < 5)) continue;
      return [Math.round(x), Math.round(z)]; }
    return null;
  }
  function bombRefill(by, m) {                              // host: a hit! the glove brings the next bomb right to the thrower, just outside the log's reach
    const bx = by ? by[0] : m.pos.x + 20, bz = by ? by[1] : m.pos.z; let dx = bx - m.pos.x, dz = bz - m.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const r = Math.max(d + 9, RIG.half + 3.5), x = THREE.MathUtils.clamp(m.pos.x + dx * r, -ARENA + 6, ARENA - 6), z = THREE.MathUtils.clamp(m.pos.z + dz * r, -ARENA + 6, ARENA - 6);
    addBomb(++GS.bombId, Math.round(x), Math.round(z), true); GS.bombSpawnT = 8;
  }
  function carrierOf(B) {                                   // whose cart this bomb rides on: where that cart is
    if (GS.myTow === B.id && car.alive) return cart.pos;
    for (const R of NET.remotes.values()) if (R.up && R.tw === B.id) return R.cpos;
    return null;
  }
  function bombOff(B) {                                     // knocked off my cart: it rolls off where the cart is
    GS.myTow = 0; GS.towCd = 2; if (!B) return; B.x = B.tx = cart.pos.x; B.z = B.tz = cart.pos.z;
    for (let i = 0; i < 4; i++) puff(tmp.set(cart.pos.x + rand(-1, 1), 1, cart.pos.z + rand(-1, 1)), 0xe8e0d0, 1.4, 0.6, rand(-2, 2), 2, rand(-2, 2));
  }
  function bombBoom(B, m) {                                // everybody: the bomb hops onto the elite and blows the rig apart
    if (GS.myTow === B.id) GS.myTow = 0;
    const sx = B.x, sz = B.z, tx = m ? m.pos.x : B.x, tz = m ? m.pos.z : B.z; B.g.visible = true; B.num.visible = false; B.g.scale.setScalar(1);
    B.leap = { t: 0, sx, sz, tx, tz };
  }
  function updateBombs(dt) {
    if (startEl.isConnected) return;
    if ((GS.towCd -= dt) < 0) GS.towCd = 0;
    const rigs = swarm.filter(m => m.rig && !m.dead && !m.rig.gone);
    if (!NET.client) {                                     // host: a bomb for every rig; drag physics; the hold count; the bang
      if (rigs.length > bombs.length && (GS.bombSpawnT -= dt) <= 0) { GS.bombSpawnT = 3;
        const m = rigs[Math.floor(Math.random() * rigs.length)], sp = bombSpot(m); if (sp) addBomb(++GS.bombId, sp[0], sp[1], true); }
      for (const B of bombs.slice()) { if (B.leap || B.fly) continue;
        const C = carrierOf(B); B.n = C ? 1 : 0; if (C) { B.x = C.x; B.z = C.z; }
        if (!rigs.length && !C) dropBomb(B);
      }
      if ((GS.bombNetT -= dt) <= 0 && NET.on && NET.game) { GS.bombNetT = 0.1; netEv({ t: 'bm', b: bombs.filter(B => !B.leap).map(B => [B.id, r1(B.x), r1(B.z), B.fly ? 1 : B.drop && B.drop.t < HAND.arrive ? 2 : 0, B.n]) }); }
    } else for (const B of bombs) if (!B.leap && !B.n && !B.fly) { const k = 1 - Math.exp(-10 * dt); B.x += (B.tx - B.x) * k; B.z += (B.tz - B.z) * k; }
    // everybody: grab, draw, ropes
    for (const B of bombs.slice()) {
      if (B.leap) { const L = B.leap; L.t += dt; const k = Math.min(1, L.t / 0.7);
        B.g.position.set(L.sx + (L.tx - L.sx) * k, Math.sin(k * Math.PI) * 9 + k * RIG.top, L.sz + (L.tz - L.sz) * k); B.g.rotation.z += dt * 9;
        if (k >= 1) { const p = tmp.set(L.tx, RIG.top, L.tz);
          flash(p, 0xffa040, 22, 0.6, 9, false); spawnParticles(p, 0xff7a2a, 40, 18); spawnParticles(p, 0x2a2420, 24, 12); burst(tmp.set(L.tx, 0.6, L.tz), 0x4a3a2a, 30, 6, 12, 0.7);
          SFX.play('boss_roar', p, { rate: 1.6, vol: 0.5 }); SFX.play('crate_break', p, { rate: 0.4 }); if (Math.hypot(L.tx - car.pos.x, L.tz - car.pos.z) < 70) GS.shake = Math.max(GS.shake, 1.2);
          if (!NET.client) { const m = B.rigM; if (m && !m.dead) { m.rig.hits = (m.rig.hits || 0) + 1; netEv({ t: 'righit', m: m.id, n: m.rig.hits }); flashAlert(m.rig.hits >= 3 ? 'LOG MACHINE DOWN!' : 'HIT ' + m.rig.hits + '/3'); if (m.rig.hits >= 3) killCritter(m); else bombRefill(B.by, m); }
            blastAt(L.tx, L.tz, 10, 6, 24, true); }
          dropBomb(B); }
        continue; }
      if (B.fly) { const F = B.fly; F.vy -= TNT.g * dt; F.x += F.vx * dt; F.y += F.vy * dt; F.z += F.vz * dt;
        B.g.position.set(F.x, F.y - 1.1, F.z); B.g.scale.setScalar(0.9); B.g.rotation.x += dt * 8; B.g.rotation.z += dt * 5; B.spark.scale.setScalar(0.6 + Math.random() * 0.6);
        if (Math.random() < dt * 30) puff(tmp.set(F.x, F.y + 1.5, F.z), 0xb0a898, 0.6, 0.5, 0, 1, 0);
        if (F.own) for (const m of rigs) if (F.vy < 0 && F.y > RIG.top - 0.3 && F.y < RIG.top + 2.4 && Math.hypot(m.pos.x - F.x, m.pos.z - F.z) < 2.6) {      // in the booth!
          B.fly = null; B.leap = { t: 0.62, sx: F.x, sz: F.z, tx: m.pos.x, tz: m.pos.z }; B.rigM = m; B.by = [car.pos.x, car.pos.z];
          if (NET.client) netEv({ t: 'bmhit', i: B.id, m: m.id }, NET.hostPeer); else netEv({ t: 'bmx', i: B.id, m: m.id, q: 1 });
          break; }
        if (B.fly && F.y <= 1.1) { B.fly = null; B.x = B.tx = F.x; B.z = B.tz = F.z;      // missed: it thuds down and lies there
          burst(tmp.set(F.x, 0.4, F.z), 0x8a7a64, 10, 2.5, 6, 0.5); SFX.play('land', tmp, { vol: 0.6 }); if (F.own && NET.client) netEv({ t: 'bml', i: B.id, x: r1(F.x), z: r1(F.z) }, NET.hostPeer); }
        continue; }
      if (B.drop && handTick(B, dt)) { B.spark.scale.setScalar(0.5 + Math.random() * 0.5); continue; }      // still in the glove: nobody can take it yet
      let ride_ = null; if (GS.myTow === B.id) ride_ = [cart.pos, (GS.ride === 'spider' ? 0 : car.y * 0.8)]; else for (const R of NET.remotes.values()) if (R.up && R.tw === B.id) ride_ = [R.cpos, R.pos.y || 0];
      if (ride_) { B.x = ride_[0].x; B.z = ride_[0].z; B.g.position.set(B.x, 1.0 + ride_[1] + Math.abs(Math.sin(GS.elapsed * 11 + B.id)) * 0.12, B.z); B.g.scale.setScalar(0.8); B.g.rotation.set(Math.sin(GS.elapsed * 9) * 0.15, 0, Math.sin(GS.elapsed * 7) * 0.15); }
      else { B.g.position.set(B.x, 0, B.z); B.g.scale.setScalar(1); B.g.rotation.set(0, 0, 0); }
      B.spark.scale.setScalar(0.5 + Math.random() * 0.5);
      if (!GS.myTow && !GS.towCd && !B.n && !(B.drop && B.drop.t < HAND.arrive + HAND.hold) && car.alive && car.burrow === 'up' && car.y < 1.5 && (Math.hypot(car.pos.x - B.x, car.pos.z - B.z) < TNT.grab || (cart.shown && Math.hypot(cart.pos.x - B.x, cart.pos.z - B.z) < TNT.grab))) {
        GS.myTow = B.id; B.n = 1; if (!cart.shown) { cart.shown = true; cartReset(); }
        for (let i = 0; i < 7; i++) puff(tmp.set(B.x + rand(-1.2, 1.2), 0.8 + Math.random(), B.z + rand(-1.2, 1.2)), 0xf0ead8, 1.6, 0.7, rand(-2.5, 2.5), 2.5, rand(-2.5, 2.5));
        SFX.play('clang', car.pos, { rate: 1.4 }); SFX.play('pickup', car.pos, { vol: 0.6 }); flashAlert('BOMB! JUMP TO THROW'); }
    }
    if (GS.myTow && (!car.alive || car.burrow !== 'up')) bombOff(bombs.find(B => B.id === GS.myTow));      // wrecked or gone underground: the bomb rolls off
    if (GS.myTow && !bombs.some(B => B.id === GS.myTow && !B.leap)) GS.myTow = 0;
    for (const m of rigs) { const R = m.rig; if (!R.zone) { R.zone = new THREE.Mesh(new THREE.RingGeometry(TNT.near + 1, TNT.far - 1, 72), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0, depthWrite: false })); R.zone.geometry.rotateX(-Math.PI / 2); scene.add(R.zone); }
      R.zone.visible = !!GS.myTow; if (GS.myTow) { R.zone.position.set(m.pos.x, 0.06, m.pos.z); R.zone.material.opacity = 0.16 + Math.sin(GS.elapsed * 6) * 0.08; } }      // throw from inside this band
  }
  function throwBomb() {                                    // jump with the bomb aboard: the cart flings it forward in a high lob; drop it into a booth and it goes off
    const B = bombs.find(B => B.id === GS.myTow); if (!B) { GS.myTow = 0; return; }
    const h = car.heading, fx = Math.sin(h), fz = Math.cos(h), x = cart.pos.x, z = cart.pos.z, y = 1.4 + car.y * 0.8;
    const tUp = TNT.vy / TNT.g, tHit = tUp + Math.sqrt(Math.max(0, 2 * (y + TNT.vy * TNT.vy / (2 * TNT.g) - RIG.top - 0.8) / TNT.g));      // when the lob comes down through booth height
    let vh = 13, dx = fx, dz = fz;
    for (const m of swarm) if (m.rig && !m.dead && !m.rig.gone) {                // aim assist: a booth roughly ahead and in range gets the lob dropped right into it
      const ex = m.pos.x - x, ez = m.pos.z - z, d = Math.hypot(ex, ez); if (d < TNT.near || d > TNT.far) continue;
      if ((ex * fx + ez * fz) / d < Math.cos(TNT.aim)) continue; dx = ex / d; dz = ez / d; vh = d / tHit; break; }
    const vx = dx * vh + car.vel.x * 0.3, vz = dz * vh + car.vel.z * 0.3;
    GS.myTow = 0; GS.towCd = 1; B.n = 0; B.fly = { x, y, z, vx, vy: TNT.vy, vz, own: true };
    netEv({ t: 'bmt', i: B.id, x: r1(x), y: r1(y), z: r1(z), vx: r2(vx), vy: TNT.vy, vz: r2(vz) });
    if (!car.airborne) { car.vy = JUMP_V * 0.75; car.airborne = true; }
    for (let i = 0; i < 5; i++) puff(tmp.set(x + rand(-1, 1), 1, z + rand(-1, 1)), 0xf0ead8, 1.4, 0.6, rand(-2, 2), 3, rand(-2, 2));
    SFX.play('jump', car.pos, { rate: 0.8 }); SFX.play('clang', cart.pos, { rate: 1.2 });
  }
  const towK = () => { if (!GS.myTow) return 1; for (const R of NET.remotes.values()) if (R.up && Math.hypot(R.pos.x - car.pos.x, R.pos.z - car.pos.z) < TNT.help) return 1; return 0.5; };      // a friend right alongside helps push
  function spawnMinis(n, x, z, gate) {
    for (let i = 0; i < n; i++) { const a = i / n * 6.283 + Math.random(), d = 3 + Math.random() * 3 + (n > 3 ? 4 : 0);
      makeMini(spawnCritter(MINI_KINDS[Math.floor(Math.random() * MINI_KINDS.length)], THREE.MathUtils.clamp(x + Math.cos(a) * d, -ARENA + 3, ARENA - 3), THREE.MathUtils.clamp(z + Math.sin(a) * d, -ARENA + 3, ARENA - 3)), gate); }
    SFX.play('growl_elite', tmp.set(x, 0, z));
  }
  // attack sequences run on every player's machine from one start message, so everybody sees and dodges the same pattern
  function miniStart(m, pat, a) { m.seq = { pat, a, i: 0, t: 0 }; m.flash = 0.1; SFX.play('growl', m.pos, { vol: 0.5, rate: 0.7 }); }
  function miniShot(m, ang, speed, geo, life, look) {
    const L = mobLook(m.art.color, look), from = tmp.set(m.pos.x, (m.K.fly || 0) + m.K.size * 0.5 + (m.rig ? RIG.top : 0), m.pos.z);
    const mesh = new THREE.Mesh(mobGeo[geo], L.core); mesh.position.copy(from); if (geo === 0) mesh.rotation.y = ang; mesh.scale.setScalar(1.25);
    const halo = new THREE.Sprite(L.halo); halo.scale.setScalar(1.7); mesh.add(halo); scene.add(mesh);
    eshots.push({ m: mesh, v: new THREE.Vector3(Math.sin(ang) * speed, (1.0 - from.y) / life, Math.cos(ang) * speed), life, dmg: 3, k: 0, col: m.art.color, small: true, dart: geo === 0 });
  }
  function miniSeq(m, dt) {
    const q = m.seq, S = MINI_SEQ[q.pat]; if ((q.t -= dt) > 0) return;
    q.t = S.gap; const i = q.i++;
    if (Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z) < 75) {
      if (q.pat === 0) miniShot(m, q.a + Math.sin(i * 2.4) * 0.07, 21, 0, 1.5, 0);
      else if (q.pat === 1) for (let j = 0; j < 7; j++) miniShot(m, q.a + (j / 6 - 0.5) * 1.1 + (i % 2) * 0.09, 11.5, 1, 2.2, 1);
      else if (q.pat === 2) for (let j = 0; j < 16; j++) miniShot(m, q.a + j / 16 * 6.283 + i * 0.196, 9, 2, 2.4, 2);
      else if (q.pat === 3) for (const o of [0, Math.PI]) miniShot(m, q.a + i * 0.4 + o, 8.5, 2, 2.6, 2);
      else for (let j = 0; j < 4; j++) for (const sp of [8, 11]) miniShot(m, q.a + j * 1.5708 + i * 0.3, sp, 1, 2.2, 1);
      if (q.pat !== 3 || i % 4 === 0) SFX.play('spit', m.pos, { vol: 0.45, rate: q.pat === 0 ? 1.9 : 1.0 });
    }
    if (q.i >= S.n) m.seq = null;
  }
  let starsM = null;
  function starsMat() {                                // one shared ring of little yellow stars, spun in the update
    if (starsM) return starsM;
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    const star = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); x.stroke(); };
    x.strokeStyle = '#1b1421'; x.lineWidth = 3; x.fillStyle = '#ffe14a';
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; star(64 + Math.cos(a) * 46, 32 + Math.sin(a) * 18, 11 - (Math.sin(a) < 0 ? 3 : 0)); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    starsM = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }); return starsM;
  }
  function stunCritter(m, t) { if (m.net) { m.stunVis = Math.max(m.stunVis || 0, t); netEv({ t: 'stun', i: m.id, s: t }, NET.hostPeer); return; } m.stun = Math.max(m.stun || 0, t); }
  const critterTop = m => (m.K.fly || 0) + m.K.size * 0.85;

  // waves: a new pack arrives off-screen every ~35 s (or sooner once the last one is nearly gone)
  const waves = { n: 0, t: 16, since: 0, lastKill: new THREE.Vector3(), pending: false, alive: 0, size: 0, gap: 0 };
  // a ground point just past the edge of the visible screen around player p, in screen direction th (0 = right, pi/2 = down)
  // every screen in the lobby: centre (with the camera's look-ahead) and half-size in ground units
  function lobbyViews() {
    const v = [{ x: camFocus.x, z: camFocus.z, R: camera.right / camera.zoom, T: camera.top / camera.zoom }];
    if (NET.on && NET.game && !NET.client) for (const R of NET.remotes.values()) v.push({ x: R.pos.x + R.vel.x * 0.35, z: R.pos.z + R.vel.z * 0.35, R: R.vw || 34, T: R.vh || 22, r: R });
    return v;
  }
  function inView(V, x, z, m) {                       // is ground point x,z inside view V, with margin m
    const dx = x - V.x, dz = z - V.z, u = (dx - dz) * 0.7071, w = (dx + dz) * 0.7071 * ISO_SQUASH;
    return Math.abs(u) < V.R + m && Math.abs(w) < V.T + m;
  }
  // a ground point just past the edge of player p's screen, in screen direction th (0 = right, pi/2 = down), and off everybody else's screen too
  function offscreenSpot(p, th, pad, fly) {
    const views = lobbyViews(), lim = fly ? ARENA + 45 : ARENA - 3, own = p === car.pos ? views[0] : views.find(V => V.r && V.r.pos === p) || views[0];
    let best = null, bestD = -1, first = null;
    for (const extra of [0, 10, 22]) for (let k = 0; k < 12; k++) {
      const a = th + (k ? (k & 1 ? 1 : -1) * Math.ceil(k / 2) * 0.52 : 0), su = Math.cos(a), sv = Math.sin(a);
      const t = Math.min(own.R / Math.max(1e-3, Math.abs(su)), own.T / Math.max(1e-3, Math.abs(sv))) + pad + extra;
      const u = su * t, w = sv * t / ISO_SQUASH;          // screen right = world (1,0,-1), screen down = world (1,0,1), depth foreshortened
      const x = THREE.MathUtils.clamp(own.x + (u + w) * 0.7071, -lim, lim), z = THREE.MathUtils.clamp(own.z + (w - u) * 0.7071, -lim, lim);
      if (fly && inRoom(x, z)) continue;
      if (!first) first = [x, z];                // fliers come in from the dark, never through the boss room
      if (!views.some(V => inView(V, x, z, 2))) return [x, z, true];
      let d = 1e9; for (const V of views) d = Math.min(d, Math.hypot(x - V.x, z - V.z));
      if (d > bestD) { bestD = d; best = [x, z]; }
    }
    if (fly && first) return [first[0], first[1], false];       // a flier just comes in over the nearest edge, in plain sight
    return [best[0], best[1], false];                   // nowhere hidden (players spread over the whole arena): as far from everyone as it gets, dug in on screen
  }
  function gateSpot() {                                     // a wave for somebody in the boss room: it gathers out on the plain in front of the gate and charges in
    return [ARENA - 22 - Math.random() * 22, (Math.random() - 0.5) * 50, false];
  }
  const DIG_T = 1.1;
  function digOut(m) { m.dig = DIG_T; burst(tmp.set(m.pos.x, 0.2, m.pos.z), 0x6f5f4c, 5, 1.6 + m.K.r, 2.5, 0.5); SFX.play('land', m.pos, { vol: 0.45, rate: 0.6 }); }
  function digTick(m, dt) {                              // still climbing out of the ground: dust, no moving, no biting
    m.dig -= dt; m.vel.set(0, 0, 0);
    if (Math.random() < dt * 9) burst(tmp.set(m.pos.x + rand(-0.6, 0.6), 0.15, m.pos.z + rand(-0.6, 0.6)), 0x7a6a56, 2, 0.8 + m.K.r * 0.6, 1.5, 0.4);
  }
  function spawnWave() {
    const roll = PHASES[PH.i].key === 'roll', pick = a => a[Math.floor(Math.random() * a.length)];
    const n = roll ? waves.n : waves.n++, plan = roll ? [[pick(['gremlin', 'gremlin', 'maw', 'stilt']), 12], [pick(['gremlin', 'flapper', 'maw', 'gloopling']), 8]]      // the warm-up: lots of small fry, easy to mow
      : n < WAVE_PLANS.length ? WAVE_PLANS[n]
      : [[['gremlin', 'stilt', 'flapper', 'spitter', 'maw', 'jelly', 'wingmaw', 'spike'][Math.floor(Math.random() * 8)], 10 + Math.min(14, n * 2)],
         [['brute', 'spitter', 'gremlin', 'gloop', 'grubber', 'oculon', 'lamprey'][Math.floor(Math.random() * 7)], 3 + Math.min(6, n >> 1)]];
    const hell = PHASES[PH.i].key === 'hell';
    const wp = netAnyPlayer(), groups = plan.length, base = Math.random() * 6.283;      // in a lobby the pack turns up around a random player
    let made = 0;
    plan.forEach(([kind, count], gi) => {
      const ang = base + gi * 6.283 / Math.max(2, groups) + (Math.random() - 0.5) * 0.8;      // groups come from different sides of the screen
      count = Math.round(count * waveMul());            // the phase sets the pressure
      for (let i = 0; i < count && swarm.length < SW_CAP; i++) { made++;
        const fly = !!SW_KINDS[kind].fly, [x, z, hid] = inRoom(wp.x, wp.z) ? gateSpot() : offscreenSpot(wp, ang + (Math.random() - 0.5) * 0.9, 3 + Math.random() * 5, fly);
        const m = spawnCritter(kind, x, z);
        if (fly) m.inbound = Math.abs(x) > ARENA || Math.abs(z) > ARENA;      // flies in over the wall
        else if (!hid) digOut(m);
      }
    });
    const [mx, mz, mhid] = inRoom(wp.x, wp.z) ? gateSpot() : offscreenSpot(wp, base + 3.14, 6), swN = swarm.length;
    if (hell) { const per = Math.ceil(hellTotal() / 3); if (PH.hellN < hellTotal()) { const k = Math.min(per, hellTotal() - PH.hellN); const before = swarm.length; spawnMinis(k, mx, mz); for (let i = before; i < swarm.length; i++) if (swarm[i].mini) swarm[i].hell = true; PH.hellN += k; } }
    else if (PH.i >= 1) spawnMinis(1, mx, mz);          // from the scouting phase on, every wave brings one mini-boss
    if (!mhid) for (let i = swN; i < swarm.length; i++) if (!swarm[i].K.fly) digOut(swarm[i]);
    waves.since = 0; waves.t = 35; waves.pending = true; waves.size = made; PH.wv++;
    const wn = 'WAVE ' + (roll ? PH.wv : n + 1); flashAlert(wn); SFX.play('wave', null); crewSay('wave', 0.85, true); netEv({ t: 'alert', s: wn });
  }

  const swA = new THREE.Vector3();
  function updateSwarm(dt) {
    // director: no waves during the boss fight, inside the boss room, or while dead
    const calm = !waveTargets().length || (!GS.gateOpen && (boss.state === 'fight' || boss.state === 'emerging')) || angel.on;      // nobody out in the open: no waves
    let alive = 0, mob = 0;
    for (const m of swarm) if (!m.dead) { if (!m.home && !m.rig) alive++; if (!m.K.ranged && Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z) < 15) mob++; }
    waves.alive = alive;
    if (!car.alive || threatNear(45)) crew.calm = 0; else if ((crew.calm += dt) > 24) { crew.calm = 0; crewSay('idle'); }
    if (!NET.client && !startEl.isConnected) {          // the phase decides whether waves come at all; a wave is cleared once ~80% of it is down
      const P = PHASES[PH.i], thr = Math.max(2, Math.ceil(waves.size * 0.2));
      waves.since += dt; waves.gap -= dt;
      if (waves.pending && alive <= thr && waves.since > 6) { waves.pending = false; PH.clr = PH.wv; waves.gap = 2; }
      const press = waves.pending && waves.since > 8 && alive <= waves.size * P.over;      // later phases do not wait for the last wave to be cleared
      const room = alive < P.max;                          // a mess, not a pile-up: no new wave while the field is full
      rigDirector(dt);
      if (!calm && room && PH.brk <= 0 && PH.wv < P.waves && ((!waves.pending && waves.gap <= 0) || press || waves.since >= P.cap)) spawnWave();
    }

    for (let i = swarm.length - 1; i >= 0; i--) {
      const m = swarm[i];
      if (m.dead) { swarm.splice(i, 1); if (swById.get(m.id) === m) swById.delete(m.id); if (m.stars) scene.remove(m.stars); if (m.rig) rigBreak(m); continue; }
      const K = m.K; m.born += dt; m.cd -= dt; m.flash -= dt;
      ai: {
        if (m.net) {                                     // mirrored from the lobby host: glide to the last reported spot
          const k = 1 - Math.exp(-10 * dt), ox = m.pos.x, oz = m.pos.z;
          if (Math.abs(m.tx - ox) + Math.abs(m.tz - oz) > 20) { m.pos.x = m.tx; m.pos.z = m.tz; } else { m.pos.x += (m.tx - ox) * k; m.pos.z += (m.tz - oz) * k; }
          m.vel.set((m.pos.x - ox) / Math.max(dt, 1e-3), 0, (m.pos.z - oz) / Math.max(dt, 1e-3));
          if (m.dig > 0) digTick(m, dt);
          break ai;
        }
        if (m.dig > 0) { digTick(m, dt); break ai; }
        const T = m.tgt && m.tgt.up && NET.remotes.get(m.tgt.peer) === m.tgt ? m.tgt.tc : car, mine = T === car, seen = mine ? carSeen() : true;
        const dx = T.pos.x - m.pos.x, dz = T.pos.z - m.pos.z, dist = Math.hypot(dx, dz) || 1e-4, nx = dx / dist, nz = dz / dist;
        // steering
        let tx = 0, tz = 0;
        if (m.rig) rigAI(m, dt, T); else {
        if ((m.think -= dt) <= 0) { m.think = 0.3 + Math.random() * 0.25; m.prey = pickPrey(m, dist); m.tgt = netPick(m); }
        const prey = m.prey && chubVulnerable(m.prey) ? m.prey : null, dec = decoys.length ? decoyNear(m) : null;
        if (m.lost > 0) m.lost -= dt;
        if (dec) { const ex = dec.x - m.pos.x, ez = dec.z - m.pos.z, ed = Math.hypot(ex, ez) || 1e-3; tx = ex / ed * K.speed * 1.15; tz = ez / ed * K.speed * 1.15; }      // squeak! everybody goes for the decoy
        else if (m.wb && wbFar(m)) { if (!m.wp || Math.hypot(m.wp[0] - m.pos.x, m.wp[1] - m.pos.z) < 6) m.wp = [rand(-ARENA * 0.7, ARENA * 0.7), rand(-ARENA * 0.7, ARENA * 0.7)];
          const ex = m.wp[0] - m.pos.x, ez = m.wp[1] - m.pos.z, ed = Math.hypot(ex, ez) || 1; tx = ex / ed * K.speed * 0.55; tz = ez / ed * K.speed * 0.55; }
        else if (m.lost > 0) { tx = Math.sin(m.phase * 0.7) * K.speed * 0.5; tz = Math.cos(m.phase * 0.9) * K.speed * 0.5; }      // stepped on the rainbow: wanders, lost
        else if (prey) {                                        // run a chubzik down and eat it
          const px = prey.pos.x - m.pos.x, pz = prey.pos.z - m.pos.z, pd = Math.hypot(px, pz) || 1e-4;
          tx = px / pd * K.speed; tz = pz / pd * K.speed;
          if (pd < K.r + 0.6 && m.cd <= 0) { m.cd = 0.7; eatChub(prey, m); }
        }
        else if (m.home && (dist > 24 || !seen)) {    // residents circle their rock while the car is far away
          const R = m.home, a = m.phase * 0.12 + R.r, rr = R.r + (K.ranged ? 8 : 4.5);
          const lx = R.mesh.position.x + Math.cos(a) * rr - m.pos.x, lz = R.mesh.position.z + Math.sin(a) * rr - m.pos.z, ld = Math.hypot(lx, lz) || 1;
          tx = lx / ld * K.speed * 0.45; tz = lz / ld * K.speed * 0.45;
        }
        else if (!seen) { tx = -nx * K.speed * 0.8; tz = -nz * K.speed * 0.8; }            // car went underground: scatter
        else if (inRoom(T.pos.x, T.pos.z) !== inRoom(m.pos.x, m.pos.z)) {
          if (!GS.gateOpen) { tx = Math.sin(m.phase * 0.3) * 2; tz = Math.cos(m.phase * 0.3) * 2; }   // boss arena is sealed: loiter
          else { const inside = inRoom(m.pos.x, m.pos.z), gz = THREE.MathUtils.clamp(m.pos.z, -GATE_HZ + 2.5, GATE_HZ - 2.5), lined = Math.abs(m.pos.z) < GATE_HZ - 1.5 && Math.abs(m.pos.x - ARENA) < 6;
            const gx = lined ? (inside ? ARENA - 6 : ARENA + 6) : (inside ? ARENA + 4 : ARENA - 4), ex = gx - m.pos.x, ez = gz - m.pos.z, ed = Math.hypot(ex, ez) || 1;   // through the gate, not into the wall
            tx = ex / ed * K.speed; tz = ez / ed * K.speed; } }
        else if (K.ranged && dist < 11) { tx = -nx * K.speed; tz = -nz * K.speed; }         // spitters keep their distance
        else if (K.ranged && dist < 15) { tx = -nz * K.speed * 0.6; tz = nx * K.speed * 0.6; }   // and strafe
        else if (m.cartFan && (mine ? cart.riders.length : T.R.cn)) {        // half of them go for the cart instead of the car
          const cp = mine ? cart.pos : T.R.cpos, cx = cp.x - m.pos.x, cz = cp.z - m.pos.z, cd = Math.hypot(cx, cz) || 1; tx = cx / cd * K.speed; tz = cz / cd * K.speed;
        }
        else { const q = K.lunge ? (dist < 10 ? 1.75 : 0.7) : 1; tx = nx * K.speed * q; tz = nz * K.speed * q; }
        if (m.slow > 0) { m.slow -= dt; tx *= 0.5; tz *= 0.5; }
        for (const o of swarm) {                           // separation (local only)
          if (o === m || o.dead) continue;
          const sx = m.pos.x - o.pos.x, sz = m.pos.z - o.pos.z, md = K.r + o.K.r + 0.3;
          if (Math.abs(sx) > md || Math.abs(sz) > md) continue;
          const sd = Math.hypot(sx, sz) || 1e-3; if (sd < md) { tx += sx / sd * 8 * (md - sd); tz += sz / sd * 8 * (md - sd); }
        }
        const dazed = m.stun > 0; if (dazed) { m.stun -= dt; tx = 0; tz = 0; m.vel.set(0, 0, 0); }      // knocked silly (webs, the unicorn's dodecahedra): frozen on the spot
        const k = Math.min(1, 4 * dt);
        m.vel.x += (tx - m.vel.x) * k; m.vel.z += (tz - m.vel.z) * k;
        m.pos.addScaledVector(m.vel, dt);
        if (!K.fly) for (const o of obstacles) if (active(o)) pushOutOfBox(m.pos, K.r, o);
        if (m.inbound) { if (Math.abs(m.pos.x) < ARENA - 1.5 && Math.abs(m.pos.z) < ARENA - 1.5) m.inbound = false; }
        else if (!inWorld(m.pos.x, m.pos.z)) { m.pos.x = THREE.MathUtils.clamp(m.pos.x, -ARENA + 1.5, ARENA - 1.5); m.pos.z = THREE.MathUtils.clamp(m.pos.z, -ARENA + 1.5, ARENA - 1.5); }
  
        // contact with the car: get run over, get shoved, or bite
        const reachR = T.radius + K.r;
        if (T.alive && T.depth < 0.3 && dist < reachR) {
          const carSpeed = Math.hypot(T.vel.x, T.vel.z), airOK = K.fly ? T.y < K.fly + 1.5 : T.y < 1.2;
          if (!K.fly && !K.heavy && !K.spiky && carSpeed > 9 && T.y < 0.8) { killCritter(m, swA.set(-nx, 0, -nz)); SFX.play('hit_flesh', m.pos); continue; }
          const push = reachR - dist;
          m.pos.x -= nx * push; m.pos.z -= nz * push;
          if (K.heavy && mine) { car.pos.x += nx * push * 0.5; car.pos.z += nz * push * 0.5; }
          if (airOK && m.cd <= 0 && !dazed && T.burrow === 'up') { m.cd = 0.9; SFX.play('chomp', m.pos, { rate: K.heavy ? 0.8 : 1.25 }); if (mine) hurtCar(K.bite, swA.set(nx, 0, nz).clone()); else netEv({ t: 'hurt', i: m.id, d: K.bite, x: r2(nx), z: r2(nz) }, T.R.peer); }
        }
        if (!mine && T.R.cn > 0 && m.cd <= 0 && Math.hypot(m.pos.x - T.R.cpos.x, m.pos.z - T.R.cpos.z) < 1.7 + m.r) {      // snatch a passenger off another player's cart
          m.cd = 1; T.R.cn--; netEv({ t: 'lose' }, T.R.peer); SFX.play('chomp', m.pos, { rate: 1.4, vol: 0.7 });
        }
        }
        // spitters lob acid
        const dazed = m.stun > 0 && !m.rig;
        if (m.mini && !dazed && !(m.rig && (m.rig.fall > 0 || RIG.tame)) && !m.seq && seen && dist < 34 && (m.atkT -= dt) <= 0) {
          m.atkT = 2.4 + Math.random() * 1.8; const pat = Math.floor(Math.random() * MINI_SEQ.length), a = r2(Math.atan2(nx, nz));
          miniStart(m, pat, a); netEv({ t: 'fx', k: 'mb', i: m.id, p: pat, a });
        }
        if (!dazed && !m.rig && seen && dist < 45 && (m.throwT -= dt) <= 0 && dist < 26) {      // the timer runs on the way in, so a pack arrives already shooting      // every kind has a shot of its own: straight, fan or ring
          const pat = MOB_PAT[m.kind] || 0;
          if (GS.mobShots > 44 || (pat === 2 && dist > 13)) m.throwT = 0.5 + Math.random() * 0.8;      // too much in the air already, or a ring would not reach
          else { m.throwT = (pat === 2 ? 4.5 : pat === 1 ? 3.6 : 2.8) + Math.random() * 2.5;
          mobThrow(m, nx, nz, dist, pat); netEv({ t: 'fx', k: 'th', i: m.id, x: r2(nx), z: r2(nz), d: r1(dist), p: pat }); }

        }
        if (K.ranged && !m.rig) {                                    // the car if it is in range, otherwise whoever sits on a rock
          if (!dazed) m.spitT -= dt;
          if (m.spitT <= 0 && !dazed) {
            if (seen && dist < 17) { m.spitT = 2.6 + Math.random(); spit(m, null, T); }
            else { const c = perchedNear(m.pos, 19); if (c) { m.spitT = 3.5 + Math.random() * 2.5; spit(m, c); } else m.spitT = 0.4; }
          }
        }
  
      }
      if (m.rig) rigTick(m, dt);
      if (m.seq && !(m.stun > 0)) miniSeq(m, dt);
      if (m.fire) { const fl = 1 + 0.18 * Math.sin(GS.elapsed * 17 + m.id); m.fire.scale.set(0.5 * (2 - fl), 0.36 * fl, 1); }
      { const st = m.net ? (m.stunVis = Math.max(0, (m.stunVis || 0) - dt)) > 0 : m.stun > 0;      // stars circle a stunned head
        if (st && !m.stars) { m.stars = new THREE.Sprite(starsMat()); m.stars.renderOrder = 6; scene.add(m.stars); }
        if (m.stars) { m.stars.visible = st; if (st) { const s = K.size * 0.75; m.stars.position.set(m.pos.x, (K.fly || 0) + K.size * 1.02, m.pos.z); m.stars.scale.set(s, s * 0.5, 1); m.stars.material.rotation = Math.sin(GS.elapsed * 7) * 0.35; } } }
      // draw: walk cycle, face the way it moves, hop a little, pop in when spawned
      m.phase += dt * (2.5 + Math.hypot(m.vel.x, m.vel.z) * 0.45);
      const f = Math.floor(m.phase) % SW_FRAMES;
      m.sprite.material = m.flash > 0 ? m.art.hit[0] : m.art.walk[f];
      const sx = m.vel.x - m.vel.z;                      // screen-right in this iso view is world (+x, -z)
      if (Math.abs(sx) > 0.4) m.facing = sx > 0 ? -1 : 1;
      const grow = Math.min(1, m.born / 0.35), sz = K.size * grow;
      m.sprite.scale.set(sz * m.facing, sz, 1);
      const hop = K.fly ? K.fly + Math.sin(m.phase * 1.6) * 0.25 : Math.abs(Math.sin(m.phase * Math.PI)) * (K.heavy ? 0.05 : 0.18);
      m.sprite.position.set(m.pos.x, hop - (m.dig > 0 ? m.dig / DIG_T * K.size * 1.05 : 0) + (m.rig ? m.rig.g.position.y + RIG.top + 0.15 + (m.rig.bob || 0) : 0), m.pos.z);
      m.shadow.position.set(m.pos.x, 0.03, m.pos.z);
      m.shadow.material.opacity = 1;
    }
    updateGlobs(dt);
  }

  // ---- spitter acid globs: lobbed at where the car will be, telegraphed on the ground ----
  const globGeo = new THREE.IcosahedronGeometry(0.38, 0), globMat = glow(new THREE.MeshBasicMaterial({ color: 0x9cff3a }), 2.6);
  function spit(m, chub, tg, at) {
    const from = new THREE.Vector3(m.pos.x, m.K.size * 0.6, m.pos.z);
    tg = tg || car;
    const lead = at || (chub ? chub.pos.clone().add(swA.set(rand(-1.3, 1.3), 0, rand(-1.3, 1.3))) : new THREE.Vector3(tg.pos.x + tg.vel.x * 0.6, 0, tg.pos.z + tg.vel.z * 0.6));
    if (!at) netEv({ t: 'fx', k: 'sp', i: m.id, x: r1(lead.x), y: r1(lead.y), z: r1(lead.z) });
    const T = THREE.MathUtils.clamp(from.distanceTo(lead) / 15, 0.6, 1.2);
    const g = new THREE.Mesh(globGeo, globMat); g.position.copy(from); scene.add(g);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.45, 24), glow(new THREE.MeshBasicMaterial({ color: 0x9cff3a, transparent: true, opacity: 0.6, depthWrite: false }), 1.5));
    ring.geometry.rotateX(-Math.PI / 2); ring.position.set(lead.x, lead.y + 0.05, lead.z); scene.add(ring);
    globs.push({ g, ring, from, to: lead, t: 0, T, chub });
    SFX.play('spit', from);
  }
  function updateGlobs(dt) {
    for (let i = globs.length - 1; i >= 0; i--) {
      const s = globs[i]; s.t += dt;
      const k = Math.min(1, s.t / s.T);
      s.g.position.lerpVectors(s.from, s.to, k); s.g.position.y = s.from.y * (1 - k) + s.to.y * k + 4 * Math.sin(Math.PI * k);
      s.g.rotation.x += dt * 6;
      if (k < 1) continue;
      scene.remove(s.g, s.ring); globs.splice(i, 1);
      spawnParticles(tmp.set(s.to.x, s.to.y + 0.3, s.to.z), 0x9cff3a, 8, 6); SFX.play('hit_flesh', s.to, { rate: 1.4 });
      if (s.chub && s.chub.state === 'perch' && Math.hypot(s.chub.pos.x - s.to.x, s.chub.pos.z - s.to.z) < 1.2) knockOff(s.chub, s.to.x - s.from.x, s.to.z - s.from.z);
      if (car.alive && car.depth < 0.3 && car.y < 1.2 && Math.hypot(car.pos.x - s.to.x, car.pos.z - s.to.z) < car.radius + 1.3)
        hurtCar(8, swA.set(car.pos.x - s.to.x, 0, car.pos.z - s.to.z).normalize().clone());
    }
  }

  function clearSwarm() {
    if (PHASES[PH.i].key === 'hell') PH.hellN = Math.max(0, PH.hellN - hellAlive());      // wiped, not killed: they come back with the next waves
    for (const m of swarm) { m.dead = true; scene.remove(m.sprite, m.shadow); if (m.rig) rigBreak(m, true); }
    for (const g of globs) scene.remove(g.g, g.ring);
    swarm.length = 0; globs.length = 0; waves.t = 14; waves.pending = false; waves.since = 0;
    resetChubs();
  }

  // is anything worth shooting at within range?
  function threatNear(range) {
    for (const e of enemies) if (!e.dead && !e.carried && e.awake && Math.hypot(e.pos.x - car.pos.x, e.pos.z - car.pos.z) < range) return true;
    for (const m of swarm) if (!m.dead && Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z) < range) return true;
    return boss.state === 'fight' && Math.hypot(BOSS_POS.x - car.pos.x, BOSS_POS.z - car.pos.z) < range + 4;
  }

  // ---------- chubziks: small blue locals. Monsters hunt them, they hide on rocks, you scoop them into a cart ----------
  const CHUB_FR = 4, CHUB_SIZE = 1.3, CHUB_CAP = 34;
  function drawChub(c, f, scared) {                    // 96 x 96
    const TAU = Math.PI * 2, s = Math.sin(f / CHUB_FR * TAU), bob = Math.abs(s) * 3, ink = '#14233f';
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = ink; c.lineWidth = 4;
    c.fillStyle = '#2b5fd0';
    for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(48 + sd * 12 + sd * s * 4, 88 - Math.max(0, sd * s) * 5, 9, 5, 0, 0, TAU); c.fill(); c.stroke(); }
    for (const pass of [0, 1]) {                       // the tuft
      c.strokeStyle = pass ? '#7fc0ff' : ink; c.lineWidth = pass ? 3.5 : 8;
      for (const dx of [-9, 0, 9]) { c.beginPath(); c.moveTo(48 + dx * 0.4, 32 - bob); c.quadraticCurveTo(48 + dx * 1.1, 16 - bob, 48 + dx * 1.9 + s * 3, 9 - bob + Math.abs(dx) * 0.5); c.stroke(); }
    }
    c.strokeStyle = ink; c.lineWidth = 4;
    c.beginPath(); c.ellipse(48, 58 - bob, 30, 28 + bob * 0.3, 0, 0, TAU); c.fillStyle = '#4f9dff'; c.fill(); c.stroke();
    c.fillStyle = '#c4e2ff'; c.beginPath(); c.ellipse(48, 69 - bob, 17, 12, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,120,170,.55)'; for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(48 + sd * 22, 62 - bob, 5, 3, 0, 0, TAU); c.fill(); }
    for (const sd of [-1, 1]) {
      const ex = 48 + sd * 11, ey = 51 - bob, r = scared ? 10.5 : 9;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, r, 0, TAU); c.fill(); c.lineWidth = 3; c.stroke();
      c.fillStyle = ink; c.beginPath(); c.arc(ex + (scared ? 0 : 1.5), ey + 1, scared ? 3 : 5.5, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex - 1.5, ey - 2, 2, 0, TAU); c.fill();
    }
    c.lineWidth = 3;
    if (scared) { c.fillStyle = '#3a0f2a'; c.beginPath(); c.ellipse(48, 68 - bob, 5, 6.5, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#bfefff'; c.beginPath(); c.moveTo(80, 34); c.quadraticCurveTo(87, 46, 80, 48); c.quadraticCurveTo(73, 46, 80, 34); c.fill(); c.lineWidth = 2; c.stroke(); }
    else { c.beginPath(); c.moveTo(41, 65 - bob); c.quadraticCurveTo(48, 72 - bob, 55, 65 - bob); c.stroke(); }
  }
  const chubMats = [false, true].map(sc => Array.from({ length: CHUB_FR }, (_, f) => {
    const cv = mkCanvas(96), x = cv.getContext('2d'); drawChub(x, f, sc);
    const m = new THREE.SpriteMaterial({ map: srgbTex(cv), transparent: true, alphaTest: 0.35 }); m.color.setScalar(0.5); return m;
  }));
  const chubs = [];
  GS.chubTick = 0; GS.chubSpawnT = 4; GS.chubEaten = 0;
  const cartNEl = document.getElementById('cartN'), eatNEl = document.getElementById('eatN');
  const chubVulnerable = c => !c.dead && !angel.on && (c.state === 'roam' || c.state === 'flee' || c.state === 'tocar' || c.state === 'dazed');
  const carOK = () => car.alive && car.depth < 0.3 && car.y < 1;
  function perchSlot(rock) { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * rock.top * 0.62; return new THREE.Vector3(rock.mesh.position.x + Math.cos(a) * d, rock.h, rock.mesh.position.z + Math.sin(a) * d); }
  GS.chubId = 0;
  function spawnChub(rock, perched) {
    const sprite = new THREE.Sprite(chubMats[0][0]); sprite.center.set(0.5, 0.04); scene.add(sprite);
    const shadow = new THREE.Mesh(swShadowGeo, swShadowMat); shadow.scale.set(1, 1, 0.8); scene.add(shadow);
    const c = { sprite, shadow, pos: new THREE.Vector3(), vel: new THREE.Vector3(), state: 'roam', t: 0, think: Math.random() * 0.3, home: rock, rock, phase: Math.random() * 4,
                goal: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), T: 1, arcH: 1, next: 'roam', face: 1, calm: 0, dead: false, threat: 99 };
    if (perched) { c.pos.copy(perchSlot(rock)); c.state = 'perch'; }
    else { const a = Math.random() * 6.283, d = rock.r + 2 + Math.random() * 5; c.pos.set(rock.mesh.position.x + Math.cos(a) * d, 0, rock.mesh.position.z + Math.sin(a) * d); c.goal.copy(c.pos); }
    c.id = ++GS.chubId; chubs.push(c); return c;
  }
  function monsterDist(x, z) {                         // distance to the nearest thing with teeth
    let best = 99;
    for (const m of swarm) if (!m.dead) { const d = Math.hypot(m.pos.x - x, m.pos.z - z); if (d < best) best = d; }
    for (const e of enemies) if (!e.dead && e.awake && !e.carried) { const d = Math.hypot(e.pos.x - x, e.pos.z - z); if (d < best) best = d; }
    return best;
  }
  function nearestRock(x, z) { let b = rocks[0], bd = 1e9; for (const r of rocks) { const d = Math.hypot(r.mesh.position.x - x, r.mesh.position.z - z); if (d < bd) { bd = d; b = r; } } return b; }
  function groundChubNear(pos, range) { let b = null, bd = range; for (const c of chubs) if (chubVulnerable(c)) { const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z); if (d < bd) { bd = d; b = c; } } return b; }
  function perchedNear(pos, range) { let b = null, bd = range; for (const c of chubs) if (!c.dead && c.state === 'perch') { const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) + Math.random() * 3; if (d < bd) { bd = d; b = c; } } return b; }
  function pickPrey(m, carDist) {                      // a monster weighs the nearest loose chubzik against the car (a loaded cart is tastier)
    const c = groundChubNear(m.pos, 24); if (!c) return null;
    const d = Math.hypot(c.pos.x - m.pos.x, c.pos.z - m.pos.z);
    return !carSeen() || d < carDist * (cart.riders.length ? 0.8 : 1.4) ? c : null;
  }
  function chubArc(c, to, T, next, h) { c.from.copy(c.pos); c.to.copy(to); c.t = 0; c.T = T; c.arcH = h; c.next = next; c.state = 'arc'; }
  function knockOff(c, vx, vz) {                       // shot off the rock
    const d = Math.hypot(vx, vz) || 1, R = c.rock, a = Math.atan2(vz / d, vx / d) + rand(-0.5, 0.5);
    tmp.set(R.mesh.position.x + Math.cos(a) * (R.r + 2.6), 0, R.mesh.position.z + Math.sin(a) * (R.r + 2.6));
    chubArc(c, tmp, 0.6, 'dazed', 2.2); c.dazeT = 1.0;
    spawnParticles(c.pos, 0x7fc0ff, 5, 5); SFX.play('chub', c.pos, { rate: 0.8 });
  }
  function eatChub(c, by) {
    if (c.dead) return;
    c.dead = true; scene.remove(c.sprite, c.shadow);
    tmp.set(c.pos.x, c.pos.y + 0.6, c.pos.z);
    spawnParticles(tmp, 0x4f9dff, 10, 7); spawnParticles(tmp, 0xffffff, 4, 5);
    SFX.play('chomp', tmp, { rate: 1.4, vol: 0.7 }); SFX.play('chub', tmp, { rate: 0.6 });
    GS.chubEaten++; eatNEl.textContent = GS.chubEaten; if (!NET.client) netEv({ t: 'eat', x: r1(c.pos.x), z: r1(c.pos.z) });
    if (Math.hypot(c.pos.x - car.pos.x, c.pos.z - car.pos.z) < 30) crewSay('eaten', 0.5);
  }

  // ---- the cart: weightless for the car, but the more passengers the wilder it swings — and a swinging cart sheds them ----
  const CART_L = 2.9;
  const cart = { pos: new THREE.Vector3(0, 0, -5.4), heading: 0, prevH: 0, phi: 0, phiV: 0, riders: [], shown: false, lost: 0, vis: 0, prevX: 0, prevZ: 0 };
  const cartG = new THREE.Group(), cartBody = new THREE.Group(); cartG.add(cartBody); cartG.visible = false; scene.add(cartG);
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.85, flatShading: true });
    const woodDk = new THREE.MeshStandardMaterial({ color: 0x5e3a1e, roughness: 0.9, flatShading: true });
    const P = (geo, mat, x, y, z, par = cartBody) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    P(new THREE.BoxGeometry(2.0, 0.14, 2.4), woodDk, 0, 0.62, 0);
    for (const x of [-1, 1]) { P(new THREE.BoxGeometry(0.12, 0.6, 2.4), wood, x * 0.98, 0.95, 0); P(new THREE.BoxGeometry(0.16, 0.12, 2.5), metal, x * 0.98, 1.28, 0); }
    for (const z of [-1, 1]) P(new THREE.BoxGeometry(2.0, 0.6, 0.12), wood, 0, 0.95, z * 1.18);
    P(new THREE.BoxGeometry(0.14, 0.14, 1.7), metal, 0, 0.55, 1.9);                    // drawbar
    P(new THREE.BoxGeometry(2.5, 0.12, 0.12), metal, 0, 0.5, 0);                       // axle
    for (const x of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), tyreMat); w.rotation.z = Math.PI / 2; w.position.set(x * 1.28, 0.5, 0); w.castShadow = true; cartG.add(w); }
    P(new THREE.BoxGeometry(0.03, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0x4f9dff, roughness: 0.9 }), 0.98, 1.75, -1.1);
    P(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), metal, 0.98, 1.6, -0.86);
  }
  function cartAdd(c) {
    c.state = 'cart'; c.shadow.visible = false; cart.riders.push(c);
    if (!cart.shown) { cart.shown = true; cartReset(); flashAlert('CHUBZIK ABOARD'); }
    cartNEl.textContent = cart.riders.length;
    SFX.play('chub', car.pos, { rate: 1.1 + Math.min(0.6, cart.riders.length * 0.04) }); SFX.play('pickup', car.pos, { vol: 0.5 });
    crewSay('chub', 0.6);
  }
  function cartReset() { const h = car.heading; cart.pos.set(car.pos.x - Math.sin(h) * (2.45 + CART_L), 0, car.pos.z - Math.cos(h) * (2.45 + CART_L)); cart.heading = cart.prevH = h; cart.phi = cart.phiV = 0; }
  const safeKeeps = () => GS.ride === 'buggy' && Math.random() < 0.5;      // the steel churn: only half of knocks and bites get a chubzik
  function safeClang() { SFX.play('clang', cart.pos, { vol: 0.45, rate: 1.4 }); spawnParticles(tmp.set(cart.pos.x, 1.6, cart.pos.z), 0xffd27a, 5, 5); }
  const safeCount = n => { let k = 0; for (let i = 0; i < n; i++) if (!safeKeeps()) k++; if (k < n) safeClang(); return k; };
  let spillT = 0;
  function cartSpill(n) { if (GS.elapsed < spillT || !cart.riders.length) return; spillT = GS.elapsed + 0.6; cartFling(safeCount(n), 0); }   // a hard knock shakes a few out
  function cartFling(n, side) {
    for (let i = 0; i < n && cart.riders.length; i++) {
      const c = cart.riders.pop(), h = cart.heading, s = side || (Math.random() < 0.5 ? -1 : 1), lat = rand(4, 8) * s, back = rand(0, 4);
      tmp.set(cart.pos.x + Math.cos(h) * lat - Math.sin(h) * back, 0, cart.pos.z - Math.sin(h) * lat - Math.cos(h) * back);
      tmp.x = THREE.MathUtils.clamp(tmp.x, -ARENA + 3, inRoom(cart.pos.x, cart.pos.z) ? ROOM_X2 - 3 : ARENA - 3); tmp.z = THREE.MathUtils.clamp(tmp.z, -ARENA + 3, ARENA - 3);
      c.shadow.visible = true; chubArc(c, tmp, 0.7, 'dazed', 3); c.dazeT = 0.7; cart.lost++;
      SFX.play('chub', c.pos, { rate: 1.4 });
    }
    cartNEl.textContent = cart.riders.length;
    if (n) crewSay('lost', 0.6);
  }
  const cartKick = k => { if (cart.shown) cart.phiV += k * (Math.random() < 0.5 ? -1 : 1) * (1 + cart.riders.length * 0.08); };
  function updateCart(dt) {
    if (!cart.shown) return;
    const n = cart.riders.length, h = car.heading, hx = car.pos.x - Math.sin(h) * 2.45, hz = car.pos.z - Math.cos(h) * 2.45;
    let dx = cart.pos.x - hx, dz = cart.pos.z - hz, d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = -Math.sin(h); dz = -Math.cos(h); d = 1; }
    cart.pos.x = hx + dx / d * CART_L; cart.pos.z = hz + dz / d * CART_L;
    cart.heading = Math.atan2(-dx, -dz);
    let dh = cart.heading - cart.prevH; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); cart.prevH = cart.heading;
    const speed = Math.hypot(car.vel.x, car.vel.z);
    const lat = THREE.MathUtils.clamp(dh / Math.max(dt, 1e-3) * Math.max(speed, 6), -110, 110);
    // sway: a spring that gets less damped and harder driven as the cart fills up; at speed a full cart fishtails on its own
    const drive = lat * 0.085 * (1 + n * 0.12) + (speed > 12 ? Math.sin(GS.elapsed * 7.3) * n * 0.7 * Math.min(1, (speed - 12) / 12) : 0);
    cart.phiV += (-42 * cart.phi - 5.5 / (1 + n * 0.22) * cart.phiV + drive) * dt;
    cart.phi = THREE.MathUtils.clamp(cart.phi + cart.phiV * dt, -0.75, 0.75);
    const over = Math.abs(cart.phi) - 0.33;
    if (!car.alive && n) cartFling(n, 0);
    const up = car.alive && car.depth < 0.5;
    cartG.visible = up;
    cartG.position.set(cart.pos.x, (GS.ride === 'spider' ? 0 : car.y * 0.8) - car.depth * 3, cart.pos.z);   // the cart cannot climb
    { // the spider's bug faces the way it is actually running, a wheeled cart points at its hitch
      const vx = (cart.pos.x - cart.prevX) / Math.max(dt, 1e-3), vz = (cart.pos.z - cart.prevZ) / Math.max(dt, 1e-3); cart.prevX = cart.pos.x; cart.prevZ = cart.pos.z;
      if (Math.hypot(vx, vz) > 2) { const d = Math.atan2(vx, vz) - cart.vis; cart.vis += Math.atan2(Math.sin(d), Math.cos(d)) * (1 - Math.exp(-9 * dt)); }
      cartG.rotation.y = (GS.ride === 'spider' ? cart.vis : cart.heading) + cart.phi * 0.35; }
    cartBody.rotation.z = cart.phi; cartBody.position.y = Math.abs(cart.phi) * 0.25;
    if (GS.safe) { GS.safe.body.rotation.z = cart.phi; GS.safe.body.position.y = Math.abs(cart.phi) * 0.25; }
    // passengers ride in rows of three, stacked when it gets crowded
    const ch = cartG.rotation.y, rx = Math.cos(ch), rz = -Math.sin(ch), fx = Math.sin(ch), fz = Math.cos(ch), cp = Math.cos(cart.phi), sp = Math.sin(cart.phi);
    cart.riders.forEach((c, i) => {
      const lx = (i % 3 - 1) * 0.56, lz = (Math.floor(i / 3) % 3 - 1) * 0.66, ly = 0.2 + Math.floor(i / 9) * 0.5;
      const x2 = lx * cp - ly * sp, y2 = ly * cp + lx * sp;
      c.pos.set(cart.pos.x + rx * x2 + fx * lz, cartG.position.y + 0.68 + y2 + Math.abs(Math.sin(GS.elapsed * 9 + i)) * 0.08 * Math.min(1, speed / 8 + Math.abs(cart.phi) * 3), cart.pos.z + rz * x2 + fz * lz);
      c.sprite.visible = up;
    });
    // anything that catches the cart helps itself
    if (up && n) {
      for (const m of swarm) if (!m.dead && !m.net && m.cd <= 0 && cart.riders.length && Math.hypot(m.pos.x - cart.pos.x, m.pos.z - cart.pos.z) < 1.7 + m.r) { m.cd = 1; if (safeKeeps()) safeClang(); else eatChub(cart.riders.pop(), m); cartKick(2); }
      for (const e of enemies) if (!e.dead && e.awake && !e.carried && e.biteCd <= 0 && cart.riders.length && Math.hypot(e.pos.x - cart.pos.x, e.pos.z - cart.pos.z) < 1.7 + e.r) { e.biteCd = 0.8; if (safeKeeps()) safeClang(); else eatChub(cart.riders.pop(), e); cartKick(3); }
      cartNEl.textContent = cart.riders.length;
    }
  }

  // ---- rocks can be flattened: everyone on top tumbles off, and nothing respawns there again ----
  function rockGrow(o) { if (!o || !o.rock || o.mesh.visible) return; o.mesh.visible = true; if (!rocks.includes(o)) rocks.push(o); burst(tmp.copy(o.mesh.position).setY(0.5), 0x8a7a6a, 8, 3, 6, 0.5); SFX.play('door', o.mesh.position, { vol: 0.5 }); }
  function rockSmashed(o) {
    const i = rocks.indexOf(o); if (i >= 0) rocks.splice(i, 1);
    for (const c of chubs) {
      if (c.dead) continue;
      if (c.rock === o && (c.state === 'perch' || (c.state === 'arc' && c.next === 'perch'))) {
        const a = Math.random() * 6.283; tmp.set(o.mesh.position.x + Math.cos(a) * (o.r + 3), 0, o.mesh.position.z + Math.sin(a) * (o.r + 3));
        chubArc(c, tmp, 0.6, 'dazed', 2.5); c.dazeT = 1.2;
      }
      if (c.home === o) c.home = nearestRock(c.pos.x, c.pos.z) || o;
    }
    for (const m of swarm) if (m.home === o) m.home = null;
    if (!rocks.length) flashAlert('NO ROCKS LEFT');
  }

  // ---- altars: three of them, each wants ALTAR_NEED chubziks from the cart. All three lit opens the boss gate ----
  seedRandom(SEED + 7);
  const ALTAR_NEED = 5, ALTAR_WAVE = 30, altars = [];
  const altTEl = document.getElementById('altT');
  const ALTAR_ZONE = 11;
  const zoneGeo = (() => { const g = new THREE.RingGeometry(ALTAR_ZONE - 0.35, ALTAR_ZONE, 72, 1); g.rotateX(-Math.PI / 2); const p = g.attributes.position, keep = [];      // dashed ring
    const idx = g.index.array; for (let i = 0; i < idx.length; i += 6) if (Math.floor(i / 6) % 3 !== 2) keep.push(...idx.slice(i, i + 6)); g.setIndex(keep); return g; })();
  GS.gateSpawned = false; GS.altarsDone = 0; GS.gateOpen = false;
  function openGate() { if (GS.gateOpen) return; GS.gateOpen = true; flashAlert('THE GATE OPENS'); setDoor(false); crewSay('gate', 1, true); }
  function gateTick() {                                 // host: all three altars fed -> nine mini-bosses at the gate; it opens when they are dead
    return;                                            // the phases open the gate now (after the loot run)
  }
  const altNEl = document.getElementById('altN');
  {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a4458, roughness: 0.9, flatShading: true });
    for (let k = 0; k < 3; k++) {
      const a = 2.4 + k * 2.094; let x = Math.cos(a) * 112, z = Math.sin(a) * 112;
      for (let t = 0; t < 60; t++) {
        const cx = Math.cos(a) * 112 + rand(-1, 1) * t * 0.3, cz = Math.sin(a) * 112 + rand(-1, 1) * t * 0.3;
        if (!obstacles.some(o => o.mesh.visible && Math.abs(o.mesh.position.x - cx) < o.hx + 6 && Math.abs(o.mesh.position.z - cz) < o.hz + 6)) { x = cx; z = cz; break; }
      }
      const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 4.1, 0.3, 8), stone); dais.position.y = 0.15; dais.receiveShadow = true; g.add(dais);
      const runes = [];
      for (let i = 0; i < ALTAR_NEED; i++) {
        const ra = i / ALTAR_NEED * 6.283, st = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.6), stone); st.position.set(Math.cos(ra) * 3.2, 0.8, Math.sin(ra) * 3.2); st.rotation.y = -ra; st.castShadow = true; g.add(st);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0x1c2a3a })); cap.position.set(st.position.x, 1.45, st.position.z); g.add(cap); runes.push(cap);
      }
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: 0x2a4a6a })); crystal.position.y = 3.3; crystal.scale.y = 1.6; g.add(crystal);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.3, 34, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 17; g.add(beam);
      const bar = new THREE.Group(); bar.position.set(x, 6, z); scene.add(bar);
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.85, depthTest: false })); bg.renderOrder = 10;
      const fg = new THREE.PlaneGeometry(3, 0.26); fg.translate(1.5, 0, 0);
      const fill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0x5fd0ff, depthTest: false, transparent: true })); fill.position.set(-1.5, 0, 0.01); fill.renderOrder = 11; fill.scale.x = 0.001;
      bar.add(bg, fill);
      const zone = new THREE.Mesh(zoneGeo, glow(new THREE.MeshBasicMaterial({ color: 0xff7ad8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }), 2));
      zone.position.set(x, 0.07, z); scene.add(zone);                 // stay inside this ring while the chubziks are being fed in
      altars.push({ zone, x, z, g, runes, crystal, beam, bar, fill, n: 0, pending: 0, done: false, cd: 0, pulse: 0,
                    mesh: { position: new THREE.Vector3(x, 0, z), visible: true }, r: 3, awake: false, spawnT: 0, stopT: 0, approved: false });
    }
  }
  // ---- the first phase is an empty warm-up arena: nests and altars rise out of the ground when scouting starts ----
  const sleepRocks = rocks.slice(); GS.worldUp = false; const rising = [];
  for (const o of sleepRocks) { o.dormant = true; o.mesh.visible = false; } rocks.length = 0;
  for (const A of altars) { A.g.visible = A.bar.visible = A.zone.visible = false; A.mesh.visible = false; }
  function worldWake() {                               // everybody, as soon as the phase index says scouting has begun (late joiners too)
    GS.worldUp = true;
    for (const o of sleepRocks) { if (!o.dormant) continue; o.dormant = false; o.mesh.visible = true; if (!rocks.includes(o)) rocks.push(o);
      const d = Math.hypot(o.mesh.position.x - car.pos.x, o.mesh.position.z - car.pos.z); o.mesh.scale.y = 0.01; rising.push({ g: o.mesh, y: o.h / 2, t: -Math.min(1.2, d / 120), dust: true }); }
    for (const A of altars) { A.g.visible = true; A.mesh.visible = true; A.g.scale.y = 0.01;
      rising.push({ g: A.g, y: 0, t: -Math.min(1.2, Math.hypot(A.x - car.pos.x, A.z - car.pos.z) / 120), dust: true, base: true }); }
    SFX.play('door', null, { vol: 0.7, rate: 0.7 }); GS.shake = Math.max(GS.shake, 0.2);
  }
  function updateRising(dt) {
    for (let i = rising.length - 1; i >= 0; i--) {
      const r = rising[i]; r.t += dt; if (r.t < 0) continue;
      if (r.dust) { r.dust = false; burst(tmp.set(r.g.position.x, 0.4, r.g.position.z), 0x8a7a6a, 10, 3.5, 6, 0.6); }
      const k = Math.min(1, r.t / 0.7), e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);      // ease-out with a little overshoot
      r.g.scale.y = Math.max(0.01, e); if (!r.base) r.g.position.y = r.y * r.g.scale.y;
      if (k >= 1) { r.g.scale.y = 1; if (!r.base) r.g.position.y = r.y; rising.splice(i, 1); }
    }
  }
  function altarGuards(A, n) {
    if (NET.client) { netEv({ t: 'guards', k: altars.indexOf(A), n }, NET.hostPeer); return; }
    const kinds = ['gremlin', 'maw', 'stilt', 'gremlin', 'oculon', 'maw', 'jelly', Math.random() < 0.5 ? 'brute' : 'grubber'];
    for (let i = 0; i < n && swarm.length < SW_CAP; i++) {
      const a = Math.random() * 6.283, d = 5 + Math.random() * 6;
      const m = spawnCritter(n > 2 ? kinds[i % kinds.length] : kinds[Math.floor(Math.random() * 5)], A.x + Math.cos(a) * d, A.z + Math.sin(a) * d); m.home = A;
      tmp.set(m.pos.x, 0.5, m.pos.z); flash(tmp, 0xff3a5a, 3, 0.25, 2, false);
    }
  }
  function drawCarBubble(sp, left, mode) {             // mode: 0 = stabbed chubzik, 1 = + question mark, 2 = + thumbs-up
    const cv = mkCanvas(320, 250), c = cv.getContext('2d'), W = sp, ink = '#1b1421', TAU = Math.PI * 2;
    c.lineJoin = 'round'; c.lineCap = 'round';
    const x0 = left ? 44 : 8, x1 = left ? 312 : 276;
    c.beginPath(); c.moveTo(x0 + 34, 8); c.lineTo(x1 - 34, 8); c.quadraticCurveTo(x1, 8, x1, 42); c.lineTo(x1, 150); c.quadraticCurveTo(x1, 184, x1 - 34, 184); c.lineTo(x0 + 34, 184); c.quadraticCurveTo(x0, 184, x0, 150); c.lineTo(x0, 42); c.quadraticCurveTo(x0, 8, x0 + 34, 8); c.closePath();
    c.fillStyle = '#fffdf4'; c.fill(); c.lineWidth = 8; c.strokeStyle = ink; c.stroke(); c.lineWidth = 3; c.strokeStyle = W.accent; c.stroke();
    c.strokeStyle = ink;
    c.save(); c.translate(mode ? x0 + 82 : (x0 + x1) / 2, 98);                        // the chubzik, belly up, very dead
    c.strokeStyle = ink; c.lineWidth = 8; for (const dx of [-9, 0, 9]) { c.beginPath(); c.moveTo(-34 + dx * 0.3, -16); c.quadraticCurveTo(-56, -14 + dx, -64, 4 + dx * 1.4); c.stroke(); }
    c.strokeStyle = '#7fc0ff'; c.lineWidth = 3.5; for (const dx of [-9, 0, 9]) { c.beginPath(); c.moveTo(-34 + dx * 0.3, -16); c.quadraticCurveTo(-56, -14 + dx, -64, 4 + dx * 1.4); c.stroke(); }
    c.strokeStyle = ink; c.lineWidth = 5;
    c.fillStyle = '#2b5fd0'; for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * 22, 46, 10, 6, sd * 0.5, 0, TAU); c.fill(); c.stroke(); }
    c.beginPath(); c.ellipse(0, 10, 46, 38, 0, 0, TAU); c.fillStyle = '#4f9dff'; c.fill(); c.stroke();
    c.fillStyle = '#c4e2ff'; c.beginPath(); c.ellipse(0, 26, 24, 14, 0, 0, TAU); c.fill();
    c.lineWidth = 5; for (const sd of [-1, 1]) { const ex = sd * 17, ey = 2; c.beginPath(); c.moveTo(ex - 7, ey - 7); c.lineTo(ex + 7, ey + 7); c.moveTo(ex + 7, ey - 7); c.lineTo(ex - 7, ey + 7); c.stroke(); }
    c.lineWidth = 4; c.beginPath(); c.moveTo(-10, 24); c.lineTo(10, 24); c.stroke();
    c.fillStyle = '#ff7fa8'; c.beginPath(); c.moveTo(2, 24); c.lineTo(12, 24); c.quadraticCurveTo(13, 38, 7, 38); c.quadraticCurveTo(1, 38, 2, 24); c.fill(); c.lineWidth = 3; c.stroke();
    c.save(); c.translate(14, -22); c.rotate(0.5);                                    // the knife
    c.beginPath(); c.moveTo(-7, 0); c.lineTo(7, 0); c.lineTo(5, -30); c.lineTo(-5, -30); c.closePath(); c.fillStyle = '#d5d9e2'; c.fill(); c.lineWidth = 4; c.stroke();
    c.beginPath(); c.rect(-13, -37, 26, 8); c.fillStyle = '#8f8a86'; c.fill(); c.stroke();
    c.beginPath(); c.rect(-6, -66, 12, 30); c.fillStyle = '#7a4a26'; c.fill(); c.stroke();
    c.restore(); c.restore();
    if (mode === 1) { c.font = '900 130px Impact, "Arial Black", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 10; c.strokeStyle = ink; c.strokeText('?', x1 - 68, 102); c.fillStyle = '#ffd95a'; c.fillText('?', x1 - 68, 102); }
    if (mode === 2) {
      c.save(); c.translate(x1 - 74, 108); c.rotate(-0.12); c.lineWidth = 5; c.strokeStyle = ink;
      c.beginPath(); c.moveTo(-30, -14); c.lineTo(-24, -52); c.quadraticCurveTo(-20, -68, -6, -64); c.quadraticCurveTo(4, -60, 0, -44); c.lineTo(-4, -14); c.closePath(); c.fillStyle = W.skin; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-34, -16); c.lineTo(30, -16); c.quadraticCurveTo(40, -16, 40, -6); c.lineTo(40, 34); c.quadraticCurveTo(40, 44, 30, 44); c.lineTo(-34, 44); c.closePath(); c.fill(); c.stroke();
      c.lineWidth = 3.5; for (const yy of [-1, 14, 29]) { c.beginPath(); c.moveTo(12, yy); c.lineTo(40, yy); c.stroke(); }
      c.beginPath(); c.rect(-50, -22, 18, 72); c.fillStyle = W.jacket; c.fill(); c.lineWidth = 5; c.stroke();
      c.restore();
    }
    c.save(); c.translate(left ? 46 : 274, 196); sp.head(c, mode); c.restore();
    const m = new THREE.SpriteMaterial({ map: srgbTex(cv), transparent: true, depthTest: false, depthWrite: false }); m.color.setScalar(0.8); return m;
  }
  function bubbleMats(k) {                             // who is talking depends on the ride
    const girl = who => ({ ...CrewArt.WHO[who], head: (c, mode) => { c.scale(0.6, 0.6); CrewArt.head(c, who, mode === 2 ? 'grin' : mode === 1 ? 'smirk' : 'neutral'); } });
    const chubS = sc => ({ accent: '#4f9dff', skin: '#4f9dff', jacket: '#2b5fd0', head: (c, mode) => { c.translate(-40, -52); c.scale(0.85, 0.85); drawChub(c, 0, sc && mode !== 2); } });
    const grem = v => ({ accent: v ? '#ffb040' : '#9cff3a', skin: v ? '#d9a13a' : '#8fd13a', jacket: '#3a2c22', head: (c) => { c.translate(-44, -62); c.scale(0.7, 0.7); drawCritter(c, 'gremlin', { seed: 11 + v * 37 + 7, h: SW_KINDS.gremlin.hue[v], eyes: 2, ear: !!v }, 0); } });
    const pair = k === 'spider' ? [chubS(true), chubS(false)] : k === 'halo' ? [girl('jan2'), girl('jan')] : k === 'unicorn' ? [grem(0), grem(1)] : [girl('vee'), girl('roxy')];
    return { q1: drawCarBubble(pair[0], true, 0), q2: drawCarBubble(pair[0], true, 1), ok: drawCarBubble(pair[1], false, 2) };
  }
  const carBub = { t: -1, said: 0, altar: null, mats: bubbleMats('buggy') };
  carBub.vee = new THREE.Sprite(carBub.mats.q1); carBub.roxy = new THREE.Sprite(carBub.mats.ok);
  for (const sp of [carBub.vee, carBub.roxy]) { sp.center.set(0.5, 0); sp.visible = false; sp.renderOrder = 30; scene.add(sp); }

  const altHud = () => { altNEl.textContent = altars.map(A => A.done ? '✔' : A.n + '/' + ALTAR_NEED).join(' · '); };
  const aliveNEl = document.getElementById('aliveN'), unloadBtn = document.getElementById('unload');
  let aliveT = 0; GS.unloadAltar = null;
  function doUnload() { if (GS.unloadAltar && carBub.t < 0) { carBub.t = 0; carBub.altar = GS.unloadAltar; unloadBtn.style.display = 'none'; } unloadBtn.blur(); }
  for (const ev of ['mousedown', 'touchstart', 'pointerdown']) unloadBtn.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'touchstart') { e.preventDefault(); doUnload(); } }, { passive: false });
  unloadBtn.addEventListener('click', e => { e.stopPropagation(); doUnload(); });
  addEventListener('keydown', e => { if (e.code === 'KeyG' && !e.repeat) doUnload(); });
  const unloadV = new THREE.Vector3();
  function altarFeed(c) {                              // a chubzik arrives at the crystal
    const A = c.altar; c.dead = true; scene.remove(c.sprite, c.shadow);
    A.pending--; A.n++; A.pulse = 1;
    tmp.set(A.x, 3.3, A.z); spawnParticles(tmp, 0x5fd0ff, 14, 8); flash(tmp, 0x5fd0ff, 6, 0.3, 3);
    SFX.play('heal', tmp, { rate: 0.8 + A.n * 0.12 }); SFX.play('chub', tmp, { rate: 0.7 });
    netEv({ t: 'altar', k: altars.indexOf(A), n: A.n });
    altarApply(A);
  }
  function altarApply(A) {                              // show the progress; wake the altar when it is full (also called for progress made by other players)
    for (let i = 0; i < Math.min(A.n, ALTAR_NEED); i++) A.runes[i].material.color.setHex(0x5fd0ff).multiplyScalar(3);
    A.fill.scale.x = Math.max(0.001, A.n / ALTAR_NEED); altHud();
    if (A.n >= ALTAR_NEED && !A.done) {
      A.done = true; GS.altarsDone++; altHud();
      A.beam.material.color.setHex(0xffc24a); A.beam.material.opacity = 0.45; A.fill.material.color.setHex(0xffc24a);
      tmp.set(A.x, 2, A.z); flash(tmp, 0xffd27a, 30, 0.6, 5); burst(tmp, 0xffd27a, 16, 3, 9, 0.5); GS.shake = Math.max(GS.shake, 0.7);
      SFX.play('boss_roar', tmp, { rate: 1.6, vol: 0.6 }); SFX.play('loot', tmp);
      flashAlert(GS.altarsDone >= 3 ? 'ALL ALTARS FED' : 'ALTAR AWAKENED ' + GS.altarsDone + '/3'); crewSay('altar', 1, true);
    }
  }
  function altarNear(A) {                                // distance from the altar to the nearest player who is up
    let d = car.alive && car.depth < 0.3 ? Math.hypot(car.pos.x - A.x, car.pos.z - A.z) : 1e9;
    if (NET.on && NET.game) for (const R of NET.remotes.values()) if (R.up) d = Math.min(d, Math.hypot(R.pos.x - A.x, R.pos.z - A.z));
    return d;
  }
  function altarWave(A, kind) {                          // kind 1: it just woke up; 2: the timer ran out. The host also spawns the guard
    A.waveAt = GS.elapsed; A.pulse = 1;
    if (!NET.client) altarGuards(A, Math.round(10 * waveMul()));
    const near = Math.hypot(car.pos.x - A.x, car.pos.z - A.z) < 70;      // only the players around it hear it laugh
    tmp.set(A.x, 3, A.z);
    if (kind === 1) { if (near) { SFX.play('laugh', null); flashAlert('THE ALTAR HUNGERS'); GS.shake = Math.max(GS.shake, 0.5); } flash(tmp, 0xff3a5a, 18, 0.5, 4); burst(tmp, 0x5a2a4a, 14, 3, 8, 0.5); }
    else { if (near) SFX.play('laugh', null, { rate: 1.05 }); flash(tmp, 0xff3a5a, 14, 0.4, 3); }
  }
  function updateAltars(dt) {
    let offer = null, offerD = 99, timerA = null, timerD = 60;
    for (const A of altars) {
      A.pulse = Math.max(0, A.pulse - dt * 2); A.cd -= dt;
      A.crystal.rotation.y += dt * (A.done ? 3 : 0.8 + A.n * 0.4);
      A.crystal.position.y = 3.3 + Math.sin(GS.elapsed * 2 + A.x) * 0.25;
      const lv = A.done ? 3.2 : 0.35 + A.n / ALTAR_NEED * 1.6 + A.pulse * 2;
      A.crystal.material.color.setRGB(A.done ? lv : lv * 0.25, A.done ? lv * 0.72 : lv * 0.7, A.done ? lv * 0.25 : lv);
      if (!GS.worldUp) { A.bar.visible = A.zone.visible = false; continue; }
      A.bar.quaternion.copy(camera.quaternion); A.bar.visible = !A.done || A.pulse > 0;
      if (A.done || PH.i < 2) { A.zone.visible = false; continue; }      // altars sleep until the chubziks hatch
      const dA = Math.hypot(car.pos.x - A.x, car.pos.z - A.z), up = car.alive && car.depth < 0.3;
      let guards = 0, close = 0;
      for (const m of swarm) if (!m.dead) { if (m.home === A) guards++; if (Math.hypot(m.pos.x - A.x, m.pos.z - A.z) < 15) close++; }
      for (const e of enemies) if (!e.dead && e.awake && !e.carried && Math.hypot(e.pos.x - A.x, e.pos.z - A.z) < 15) close++;
      // the altar notices a player: it laughs and calls its guard. In a lobby the host keeps every altar's clock for everyone
      if (!NET.client) {
        const dP = altarNear(A), k = altars.indexOf(A);
        if (!A.awake && dP < 30) {
          A.awake = true; A.pulse = 1;
          const since = GS.elapsed - (A.waveAt == null ? -999 : A.waveAt);
          if (since < ALTAR_WAVE) { A.spawnT = ALTAR_WAVE - since; netEv({ t: 'aw', k, s: 1, n: r1(A.spawnT), w: 0 }); }   // came back before its timer ran out: no fresh wave, no laugh
          else { A.spawnT = ALTAR_WAVE; altarWave(A, 1); netEv({ t: 'aw', k, s: 1, n: ALTAR_WAVE, w: 1 }); }
        } else if (A.awake && dP > 52) { A.awake = false; netEv({ t: 'aw', k, s: 0 }); }
        if (A.awake && (A.spawnT -= dt) <= 0) {          // one wave at a time, the next one is on a visible timer
          A.spawnT = ALTAR_WAVE; altarWave(A, 2); netEv({ t: 'aw', k, s: 1, n: ALTAR_WAVE, w: 2 });
        }
      } else if (A.awake) A.spawnT = Math.max(0, A.spawnT - dt);
      if (A.awake && dA < timerD) { timerA = A; timerD = dA; }
      if (A.awake) A.crystal.material.color.setRGB(guards ? 2.2 + A.pulse * 2 : A.crystal.material.color.r, guards ? 0.25 : A.crystal.material.color.g, guards ? 0.4 : A.crystal.material.color.b);
      // close enough with passengers: offer the unload button over the altar
      A.zone.visible = true; A.zone.rotation.y += dt * 0.15;
      { const inZ = up && dA < ALTAR_ZONE, has = cart.riders.length > 0; A.zone.material.opacity += ((inZ ? 0.9 : has ? 0.5 : 0.16) - A.zone.material.opacity) * Math.min(1, 6 * dt); }
      if (dA > ALTAR_ZONE) A.approved = false;                // drive out of the ring and the sacrifice stops
      else if (!A.approved && up && dA < ALTAR_ZONE && cart.riders.length && carBub.t < 0 && A.n + A.pending < ALTAR_NEED && (!offer || dA < offerD)) { offer = A; offerD = dA; }
      if (!A.approved || A.cd > 0 || !cart.riders.length || !up) continue;
      if (A.n + A.pending >= ALTAR_NEED || dA > ALTAR_ZONE) continue;
      const c = cart.riders.pop(); cartNEl.textContent = cart.riders.length;      // off the cart, up to the crystal
      A.cd = 0.4; A.pending++; c.altar = A;
      tmp.set(A.x, 3.3, A.z); chubArc(c, tmp, 0.55, 'sacrifice', 2.5);
      SFX.play('chub', c.pos, { rate: 1.3 });
    }
    if (timerA) {
      unloadV.set(timerA.x, 9.2, timerA.z).project(camera);
      altTEl.style.display = 'block'; altTEl.style.left = (unloadV.x * 0.5 + 0.5) * innerWidth + 'px'; altTEl.style.top = Math.max(40, (-unloadV.y * 0.5 + 0.5) * innerHeight) + 'px';
      const sec = Math.ceil(timerA.spawnT); if (altTEl.textContent !== 'next wave ' + sec) altTEl.textContent = 'next wave ' + sec;
      altTEl.classList.toggle('soon', sec <= 5);
    } else altTEl.style.display = 'none';
    GS.unloadAltar = offer;
    if (offer) {
      unloadV.set(offer.x, 7.6, offer.z).project(camera);
      unloadBtn.style.display = 'block'; unloadBtn.style.left = (unloadV.x * 0.5 + 0.5) * innerWidth + 'px'; unloadBtn.style.top = Math.max(70, (-unloadV.y * 0.5 + 0.5) * innerHeight) + 'px';
    } else unloadBtn.style.display = 'none';
    if ((aliveT -= dt) <= 0) { aliveT = 0.4; let n = 0; for (const c of chubs) if (!c.dead) n++; aliveNEl.textContent = n; }
    // bubbles over the car: Vee holds up a stabbed chubzik and a question mark, Roxy answers with a thumbs-up
    if (carBub.t >= 0) {
      const t = (carBub.t += dt), rx = 0.707, rz = -0.707, y = 3.4 + car.y;
      const pop = (sp, t0, x) => { const k = THREE.MathUtils.clamp((t - t0) / 0.18, 0, 1), s = k * (1 + 0.25 * Math.sin(k * Math.PI)); sp.visible = t >= t0 && t < 3.6; sp.scale.set(4.6 * s, 3.6 * s, 1); sp.position.set(car.pos.x + rx * x, y + (x > 0 ? 0.9 : 0), car.pos.z + rz * x); };
      carBub.vee.material = t < 0.9 ? carBub.mats.q1 : carBub.mats.q2;
      pop(carBub.vee, 0, -2.7); pop(carBub.roxy, 1.8, 2.7);
      if (carBub.said < 1 && t >= 0) { carBub.said = 1; SFX.play('chub', car.pos, { rate: 0.55 }); }
      if (carBub.said < 2 && t >= 0.9) { carBub.said = 2; SFX.play('pickup', car.pos, { vol: 0.4, rate: 1.5 }); }
      if (carBub.said < 3 && t >= 1.8) { carBub.said = 3; SFX.play('pickup', car.pos, { vol: 0.5, rate: 0.8 }); }
      if (t > 2.5 && carBub.altar) { carBub.altar.approved = true; carBub.altar = null; }
      if (t > 3.6 || !car.alive) { carBub.t = -1; carBub.said = 0; carBub.vee.visible = carBub.roxy.visible = false; if (carBub.altar) carBub.altar = null; }
    }
    gateTick();
    if (!GS.gateOpen && boss.state === 'idle' && door.targetY < 0) { door.targetY = 2.3; }       // sealed until the altars are fed
  }

  // ---------- finale: once Pyramidon is down, a huge blue cube-angel descends and every surviving chubzik flies up into it ----------
  const angel = { on: false, t: 0, phase: 'wait', g: null, eyes: [], wings: [], list: [], saved: 0, total: 0, pos: new THREE.Vector3(), shown: false };
  const ascEl = document.getElementById('asc'), resEl = document.getElementById('results');
  function angelStart() {
    if (angel.on) return;
    angel.on = true; angel.t = 0; angel.phase = 'wait';
    if (NET.on && NET.game) angel.pos.set(ROOM_X1 + 14, 0, 0);          // in a lobby everyone watches the same angel over the boss room
    else { const d = Math.hypot(BOSS_POS.x - car.pos.x, BOSS_POS.z - car.pos.z) || 1, k = Math.min(1, 13 / d);
      angel.pos.set(car.pos.x + (BOSS_POS.x - car.pos.x) * k, 0, car.pos.z + (BOSS_POS.z - car.pos.z) * k); }
    const S = 8, g = angel.g = new THREE.Group(); g.position.set(angel.pos.x, 80, angel.pos.z); scene.add(g);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), new THREE.MeshStandardMaterial({ color: 0x3f8cff, emissive: 0x0a2a7a, roughness: 0.35, metalness: 0.2, flatShading: true }));
    cube.rotation.y = Math.PI / 4; cube.castShadow = true; g.add(cube);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.34, 6, 28), glow(new THREE.MeshBasicMaterial({ color: 0xffe07a }), 3.2)); halo.rotation.x = Math.PI / 2; halo.position.y = S / 2 + 2.4; g.add(halo); angel.halo = halo;
    // the blissful face, on the side that looks at the camera
    const fc = mkCanvas(512), c = fc.getContext('2d'); c.lineCap = 'round'; c.strokeStyle = '#0c1c4a'; c.lineWidth = 16;
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(256 + sd * 150, 210); c.quadraticCurveTo(256 + sd * 100, 150, 256 + sd * 50, 210); c.stroke(); c.fillStyle = 'rgba(255,130,180,.75)'; c.beginPath(); c.ellipse(256 + sd * 170, 290, 44, 26, 0, 0, 6.283); c.fill(); }
    c.beginPath(); c.moveTo(150, 300); c.quadraticCurveTo(256, 430, 362, 300); c.stroke();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.9, S * 0.9), new THREE.MeshBasicMaterial({ map: srgbTex(fc), transparent: true, depthWrite: false }));
    face.material.color.setScalar(0.5); face.position.set(0, 0, S / 2 + 0.03); cube.add(face);
    // eyes everywhere
    const mkEye = open => { const e = mkCanvas(96), x = e.getContext('2d'); x.lineWidth = 7; x.strokeStyle = '#0c1c4a';
      if (open) { x.beginPath(); x.arc(48, 48, 38, 0, 6.283); x.fillStyle = '#fffaf0'; x.fill(); x.stroke(); x.fillStyle = '#ffb040'; x.beginPath(); x.arc(48, 50, 22, 0, 6.283); x.fill(); x.fillStyle = '#0c1c4a'; x.beginPath(); x.arc(48, 50, 11, 0, 6.283); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(40, 40, 6, 0, 6.283); x.fill(); }
      else { x.lineCap = 'round'; x.beginPath(); x.moveTo(12, 44); x.quadraticCurveTo(48, 78, 84, 44); x.stroke(); }
      const m = new THREE.SpriteMaterial({ map: srgbTex(e), transparent: true, alphaTest: 0.3 }); m.color.setScalar(0.6); return m; };
    const eyeOpen = mkEye(true), eyeShut = mkEye(false);
    for (let i = 0; i < 34; i++) {
      const f = i % 5, u = rand(-0.42, 0.42) * S, v = rand(-0.42, 0.42) * S, h = S / 2 + 0.15;
      const p = f === 0 ? [u, h, v] : f === 1 ? [h, u, v] : f === 2 ? [u, v, h] : f === 3 ? [-h, u, v] : [u, v, -h];
      if (f === 2 && Math.abs(u) < S * 0.36 && v > -S * 0.25 && v < S * 0.18) { i--; continue; }      // keep the smile clear
      const s = new THREE.Sprite(eyeOpen), sc = rand(0.7, 1.5); s.position.set(p[0], p[1], p[2]); s.scale.set(sc, sc, 1); cube.add(s);
      angel.eyes.push({ s, t: rand(0.5, 4), sc });
    }
    angel.eyeMats = [eyeOpen, eyeShut];
    // sprite wings
    const wc = mkCanvas(256, 320), w = wc.getContext('2d'); w.lineJoin = 'round'; w.strokeStyle = '#3a6ad0'; w.lineWidth = 7; w.fillStyle = '#fbfdff';
    for (let i = 6; i >= 0; i--) { const a = -1.15 + i * 0.36, L = 230 - i * 14; w.save(); w.translate(18, 120); w.rotate(a); w.beginPath(); w.moveTo(0, -16); w.quadraticCurveTo(L * 0.6, -44, L, 0); w.quadraticCurveTo(L * 0.6, 34, 0, 18); w.closePath(); w.fill(); w.stroke(); w.restore(); }
    const wm = new THREE.SpriteMaterial({ map: srgbTex(wc), transparent: true, alphaTest: 0.2 }); wm.color.setScalar(0.62);
    const wmL = wm.clone(); wmL.map = wm.map.clone(); wmL.map.repeat.x = -1; wmL.map.offset.x = 1; wmL.map.needsUpdate = true;
    for (const sd of [-1, 1]) { const s = new THREE.Sprite(sd > 0 ? wm : wmL); s.center.set(sd > 0 ? 0 : 1, 0.4); s.position.set(sd * 0.707 * S * 0.72, 0.5, -sd * 0.707 * S * 0.72); s.scale.set(9, 11, 1); g.add(s); angel.wings.push({ s, sd }); }
    const ray = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 90, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); ray.position.y = 30; g.add(ray);
    // the world goes quiet
    for (const m of swarm) { m.dead = true; scene.remove(m.sprite, m.shadow); if (Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z) < 40) spawnParticles(tmp.set(m.pos.x, 1, m.pos.z), m.art.color, 6, 6); }
    waves.t = 1e9; GS.chubSpawnT = 1e9;
    SFX.play('choir', null);
  }
  function updateAngel(dt) {
    if (!angel.on) return;
    const t = (angel.t += dt), g = angel.g, Y = 15;
    const k = THREE.MathUtils.clamp((t - 1.5) / 4, 0, 1), e = 1 - Math.pow(1 - k, 3);
    g.position.y = 80 + (Y - 80) * e + Math.sin(GS.elapsed * 1.3) * 0.5;
    angel.halo.rotation.z += dt * 0.8;
    for (const w of angel.wings) { const f = Math.sin(GS.elapsed * 2.4); w.s.material.rotation = w.sd * (0.15 + f * 0.28); w.s.scale.set(9, 11 * (1 + f * 0.08), 1); }
    for (const E of angel.eyes) { E.t -= dt; E.s.material = angel.eyeMats[E.t < 0.14 ? 1 : 0]; if (E.t < 0) E.t = rand(1.5, 5); }
    if (angel.phase === 'wait' && t > 5.2) {             // call them all home, cart included, wherever they are
      angel.phase = 'gather';
      cart.riders.length = 0; cartNEl.textContent = 0;
      const all = chubs.filter(c => !c.dead && c.state !== 'sacrifice');
      if (NET.on && NET.game) for (const R of NET.remotes.values()) {            // whoever rides with passengers sends them up as well
        for (const sp of (R.riders || []).filter(q => q.visible)) all.push({ sprite: sp, shadow: new THREE.Object3D(), pos: sp.position.clone(), from: new THREE.Vector3(), t: 0, T: 1, state: 'ascend', ghost: true });
        R.riders = [];
      }
      all.sort((a, b) => Math.hypot(a.pos.x - angel.pos.x, a.pos.z - angel.pos.z) - Math.hypot(b.pos.x - angel.pos.x, b.pos.z - angel.pos.z));
      all.forEach((c, i) => { c.state = 'ascend'; c.shadow.visible = false; if (c.ghost) { c.from.copy(c.pos); c.t = -i * 0.09; c.T = 1.5; return; } c.sprite.visible = true; c.from.copy(c.pos); c.t = -i * 0.09; c.T = 1.5; });
      angel.list = all; angel.total = all.length; angel.saved = 0;
      ascEl.style.display = 'block'; ascEl.textContent = '0';
      flashAlert(all.length ? 'COME HOME, LITTLE ONES' : 'NO ONE LEFT TO SAVE');
    }
    if (angel.phase === 'gather') {
      for (let i = angel.list.length - 1; i >= 0; i--) {
        const c = angel.list[i]; c.t += dt; if (c.t < 0) continue;
        const u = Math.min(1, c.t / c.T), s = u * u * (3 - 2 * u);
        c.pos.set(c.from.x + (angel.pos.x - c.from.x) * s, c.from.y + (g.position.y - c.from.y) * s + Math.sin(Math.PI * u) * 6, c.from.z + (angel.pos.z - c.from.z) * s);
        c.sprite.position.copy(c.pos); c.sprite.material = chubMats[0][Math.floor(GS.elapsed * 8 + i) % CHUB_FR];
        const sc = CHUB_SIZE * (1 + 0.6 * Math.sin(Math.PI * u)) * (u > 0.85 ? (1 - u) / 0.15 : 1); c.sprite.scale.set(sc, sc, 1);
        if (u >= 1) {
          c.dead = true; scene.remove(c.sprite); if (c.shadow) scene.remove(c.shadow); angel.list.splice(i, 1);
          angel.saved++; ascEl.textContent = angel.saved;
          SFX.play('chub', null, { rate: 0.9 + Math.min(1.1, angel.saved * 0.02), vol: 0.6 }); flash(tmp.copy(c.pos), 0x9ad0ff, 2.5, 0.2, 2, false);
        }
      }
      if (!angel.list.length) { angel.phase = 'done'; angel.doneT = t; }
    }
    if (angel.phase === 'done' && !angel.shown && t > angel.doneT + 1.4) {
      angel.shown = true; ascEl.style.display = 'none';
      const fed = altars.reduce((a, A) => a + A.n, 0), mm = Math.floor(GS.elapsed / 60), ss = String(Math.floor(GS.elapsed % 60)).padStart(2, '0');
      const verdict = angel.saved === 0 ? 'The angel came for nothing.' : angel.saved >= GS.chubEaten + fed ? 'More saved than lost. The angel beams.' : angel.saved >= fed ? 'A fair trade, by wasteland standards.' : 'The altars ate better than the angel.';
      resEl.innerHTML = `<h2>THE CHUBZIKS ASCEND</h2><div class="big">${angel.saved}</div><div class="sub">saved</div>
        <table><tr><td>Fed to the altars</td><td>${fed}</td></tr><tr><td>Eaten by monsters</td><td>${GS.chubEaten}</td></tr>
        <tr><td>Monsters destroyed</td><td>${GS.enemyKills}</td></tr><tr><td>Crates smashed</td><td>${GS.kills}</td></tr><tr><td>Pillars and rocks flattened</td><td>${GS.pillarsSmashed}</td></tr>
        <tr><td>Time</td><td>${mm}:${ss}</td></tr></table><p>${verdict}</p><button id="again">PLAY AGAIN</button>`;
      resEl.style.display = 'block';
      document.getElementById('again').addEventListener('click', hardReload);
    }
  }

  let resInit = false;
  function seedResidents() {                           // packs that live around some of the rocks and lay siege to them
    if (!rocks.length || NET.client) return;
    for (const R of rocks.slice().sort(() => Math.random() - 0.5).slice(0, 9)) {
      const kinds = [['gremlin', 'gremlin', 'stilt', 'spitter'], ['maw', 'maw', 'jelly', 'oculon'], ['gremlin', 'spike', 'lamprey', 'spitter']][Math.floor(Math.random() * 3)];
      kinds.forEach((k, i) => { const a = i * 1.6 + Math.random(), m = spawnCritter(k, R.mesh.position.x + Math.cos(a) * (R.r + 6), R.mesh.position.z + Math.sin(a) * (R.r + 6)); m.home = R; if (!m.K.fly) digOut(m); });
    }
  }
  function updateChubs(dt) {
    if (!resInit && !NET.client && GS.worldUp) { resInit = true; seedResidents(); }      // the nests' guards move in when the nests rise
    if (!GS.chubInit && !NET.client && PH.i >= 2) { GS.chubInit = true; for (const R of rocks) for (let i = 0; i < 6; i++) spawnChub(R, i < 4); }      // the chubziks hatch with SAVE & SACRIFICE
    GS.chubSpawnT -= dt;
    if (GS.chubSpawnT <= 0 && !NET.client) {                             // the colony slowly refills, a resident pack too
      GS.chubSpawnT = 3; GS.chubTick++;
      if (GS.worldUp && rocks.length < 8 && GS.chubTick % 4 === 0) {      // too few rocks left for the colony: one of the flattened ones rises again, away from everybody
        const far = o => { if (Math.hypot(o.mesh.position.x - car.pos.x, o.mesh.position.z - car.pos.z) < 35) return false; for (const R of NET.remotes.values()) if (Math.hypot(o.mesh.position.x - R.pos.x, o.mesh.position.z - R.pos.z) < 35) return false; return true; };
        const gone = obstacles.filter(o => o.rock && !o.dormant && !o.mesh.visible && far(o));
        if (gone.length) { const o = gone[Math.floor(Math.random() * gone.length)]; rockGrow(o); netEv({ t: 'rock', i: obstacles.indexOf(o) }); for (let i = 0; i < 4; i++) spawnChub(o, true); }
      }
      let loose = 0; for (const c of chubs) if (c.state !== 'cart') loose++;
      if (PH.i >= 2 && rocks.length && loose < rocks.length * 8) spawnChub(rocks[Math.floor(Math.random() * rocks.length)], true);   // only surviving rocks breed
      let res = 0; for (const m of swarm) if (!m.dead && m.home) res++;
      if (GS.chubTick % 2 === 0 && !angel.on && res < 40 && rocks.length) { const R = rocks[Math.floor(Math.random() * rocks.length)]; if (Math.hypot(R.mesh.position.x - car.pos.x, R.mesh.position.z - car.pos.z) > 45) { const a = Math.random() * 6.283; spawnCritter(Math.random() < 0.3 ? 'spitter' : 'gremlin', R.mesh.position.x + Math.cos(a) * (R.r + 7), R.mesh.position.z + Math.sin(a) * (R.r + 7)).home = R; } }
    }
    const okMe = carOK();
    for (let i = chubs.length - 1; i >= 0; i--) {
      const c = chubs[i];
      if (c.dead) { chubs.splice(i, 1); continue; }
      if (c.net && !angel.on) {                          // mirrored from the lobby host
        const k = 1 - Math.exp(-9 * dt), ox = c.pos.x, oz = c.pos.z;
        if (c.pos.distanceTo(c.tp) > 12) c.pos.copy(c.tp); else c.pos.lerp(c.tp, k);
        const mx = c.pos.x - ox, mz = c.pos.z - oz, sp = Math.hypot(mx, mz) / Math.max(dt, 1e-3);
        if (Math.abs(mx - mz) > 0.3 * dt) c.face = mx - mz > 0 ? -1 : 1;
        c.phase += dt * (sp > 0.5 ? 3 + Math.min(9, sp) * 0.9 : 2.2);
        c.sprite.material = chubMats[c.fl & 1 ? 1 : 0][Math.floor(c.phase) % CHUB_FR];
        c.sprite.position.set(c.pos.x, c.pos.y + (sp > 0.5 ? Math.abs(Math.sin(c.phase * Math.PI * 0.5)) * 0.22 : 0), c.pos.z); c.sprite.scale.set(CHUB_SIZE * c.face, CHUB_SIZE, 1);
        c.shadow.position.set(c.pos.x, (c.fl & 2 ? c.tp.y : 0) + 0.04, c.pos.z);
        continue;
      }
      if (NET.client && !c.net && !angel.on && c.state !== 'cart' && c.state !== 'ascend' && c.state !== 'sacrifice' && !(c.state === 'arc' && c.next === 'sacrifice')) {
        const q = c.state === 'arc' ? c.to : c.pos;      // fell off my cart: from here on it lives in the host's world
        netEv({ t: 'drop', fx: r1(c.pos.x), fz: r1(c.pos.z), x: r1(q.x), z: r1(q.z) }, NET.hostPeer);
        c.dead = true; scene.remove(c.sprite, c.shadow); chubs.splice(i, 1); continue;
      }
      if (c.state === 'ascend') continue;
      if (c.state === 'cart') { c.phase += dt * 3; c.sprite.material = chubMats[Math.abs(cart.phi) > 0.25 ? 1 : 0][Math.floor(c.phase) % CHUB_FR]; c.sprite.position.copy(c.pos); c.sprite.scale.set(CHUB_SIZE * 0.85, CHUB_SIZE * 0.85, 1); continue; }
      let dcx = car.pos.x - c.pos.x, dcz = car.pos.z - c.pos.z, dCar = Math.hypot(dcx, dcz), ok = okMe, other = null;
      for (const R of NET.remotes.values()) {            // another player's ride may be closer: go to whichever is nearest
        if (!R.up || R.pos.y > 1) continue;
        const rx = R.pos.x - c.pos.x, rz = R.pos.z - c.pos.z, rd = Math.hypot(rx, rz);
        if (rd < dCar || !ok) { dcx = rx; dcz = rz; dCar = rd; ok = true; other = R; }
      }
      let catchR = car.radius + 0.75;
      if (c.state !== 'perch') {                         // a cart is as good as the ride itself: run for whichever is nearer
        if (okMe && cart.shown && car.depth < 0.3) { const kx = cart.pos.x - c.pos.x, kz = cart.pos.z - c.pos.z, kd = Math.hypot(kx, kz) - 0.9; if (kd < dCar - car.radius * 0.5 || !ok) { dcx = kx; dcz = kz; dCar = kd + car.radius; ok = true; other = null; } }
        for (const R of NET.remotes.values()) if (R.up && R.cart && R.cart.visible) { const kx = R.cpos.x - c.pos.x, kz = R.cpos.z - c.pos.z, kd = Math.hypot(kx, kz) - 0.9; if (kd < dCar - car.radius * 0.5 || !ok) { dcx = kx; dcz = kz; dCar = kd + car.radius; ok = true; other = R; } }
      }
      if ((c.think -= dt) <= 0) { c.think = 0.3; c.threat = monsterDist(c.pos.x, c.pos.z); }
      let speed = 0, gx = 0, gz = 0, scared = false;
      if (c.state === 'arc') {
        c.t += dt; const k = Math.min(1, c.t / c.T);
        c.pos.lerpVectors(c.from, c.to, k); c.pos.y += Math.sin(Math.PI * k) * c.arcH; scared = c.next !== 'perch' && c.next !== 'roam';
        if (k >= 1) {
          c.pos.copy(c.to); c.state = c.next; c.calm = 0; c.goal.copy(c.pos);
          if (c.state === 'sacrifice') { altarFeed(c); continue; }
          if (c.state === 'perch' && !c.rock.mesh.visible) { c.pos.y = 0; c.state = 'dazed'; c.dazeT = 0.8; }
        }
      } else if (c.state === 'perch') {
        if (GS.ride === 'spider' && !other && car.alive && dCar < car.radius + 0.7 && Math.abs(car.y - c.pos.y) < 1.3) { c.pos.y = 0; cartAdd(c); continue; }
        { let got = null; for (const R of NET.remotes.values()) if (R.up && R.ride === 'spider' && Math.hypot(R.pos.x - c.pos.x, R.pos.z - c.pos.z) < car.radius + 0.7 && Math.abs(R.pos.y - c.pos.y) < 1.3) got = R;
          if (got) { netEv({ t: 'chub' }, got.peer); c.dead = true; scene.remove(c.sprite, c.shadow); continue; } }
        c.calm = c.threat > 12 ? c.calm + dt : 0; scared = c.threat < 9;
        const comeDown = ok && dCar < 11 && c.threat > 8;
        if (c.calm > 2.5 || comeDown) {
          const R = c.rock, a = comeDown ? Math.atan2(dcz, dcx) : Math.random() * 6.283;
          tmp.set(R.mesh.position.x + Math.cos(a) * (R.r + 1.6), 0, R.mesh.position.z + Math.sin(a) * (R.r + 1.6));
          chubArc(c, tmp, 0.45, comeDown ? 'tocar' : 'roam', 1.2);
        }
      } else if (c.state === 'dazed') {
        scared = true; if ((c.dazeT -= dt) <= 0) { c.rock = nearestRock(c.pos.x, c.pos.z); c.state = ok && dCar < 14 ? 'tocar' : c.rock ? 'flee' : 'roam'; }
      } else if (c.state === 'roam') {
        if (ok && dCar < 13) c.state = 'tocar';
        else if (c.threat < 8 && rocks.length) { c.state = 'flee'; c.rock = nearestRock(c.pos.x, c.pos.z); }
        else {
          if ((c.t -= dt) <= 0 || Math.hypot(c.goal.x - c.pos.x, c.goal.z - c.pos.z) < 0.5) { c.t = 2 + Math.random() * 3; const R = c.home, a = Math.random() * 6.283, d = R.r + 2 + Math.random() * 7; c.goal.set(R.mesh.position.x + Math.cos(a) * d, 0, R.mesh.position.z + Math.sin(a) * d); }
          gx = c.goal.x - c.pos.x; gz = c.goal.z - c.pos.z; speed = 2.6;
        }
      } else if (c.state === 'flee') {
        scared = true; if (!c.rock || !c.rock.mesh.visible) c.rock = nearestRock(c.pos.x, c.pos.z);
        const R = c.rock;
        if (!R) c.state = 'roam';
        else if ((gx = R.mesh.position.x - c.pos.x, gz = R.mesh.position.z - c.pos.z, speed = 8, Math.hypot(gx, gz)) < R.r * 1.25 + 0.6) { chubArc(c, perchSlot(R), 0.42, 'perch', 1.6); speed = 0; }
        else if (ok && dCar < 7 && c.threat > 4) c.state = 'tocar';
      } else if (c.state === 'tocar') {
        if (!ok || dCar > 17) c.state = 'roam'; else { gx = dcx; gz = dcz; speed = 8.5; scared = c.threat < 9; }
      }
      if (speed) {
        const g = Math.hypot(gx, gz) || 1; c.vel.set(gx / g * speed, 0, gz / g * speed);
        c.pos.addScaledVector(c.vel, dt);
        for (const o of obstacles) if (active(o)) pushOutOfBox(c.pos, 0.4, o);
        const sx = c.vel.x - c.vel.z; if (Math.abs(sx) > 0.3) c.face = sx > 0 ? -1 : 1;
        c.phase += dt * (3 + speed * 0.9);
      } else c.phase += dt * 2.2;
      if (chubVulnerable(c) && ok && dCar < catchR + 2.4 && dCar > 0.01) {   // close enough: a gentle tug toward the ride or cart
        const pull = Math.min(dCar, (3 + 6 * (1 - (dCar - catchR) / 2.4)) * dt); c.pos.x += dcx / Math.hypot(dcx, dcz) * pull; c.pos.z += dcz / Math.hypot(dcx, dcz) * pull; dCar -= pull;
      }
      if (chubVulnerable(c) && ok && dCar < catchR) {
        if (!other) cartAdd(c);
        else { netEv({ t: 'chub' }, other.peer); c.dead = true; scene.remove(c.sprite, c.shadow); flash(tmp.copy(c.pos).setY(0.8), 0x9ad0ff, 2, 0.2, 2, false); SFX.play('chub', c.pos, { rate: 1.2, vol: 0.6 }); }   // it hopped into their cart
        continue;
      }
      if (angel.on && c.state === 'ascend') continue;
      c.sprite.material = chubMats[scared ? 1 : 0][Math.floor(c.phase) % CHUB_FR];
      const hop = speed ? Math.abs(Math.sin(c.phase * Math.PI * 0.5)) * 0.22 : 0;
      c.sprite.position.set(c.pos.x, c.pos.y + hop, c.pos.z); c.sprite.scale.set(CHUB_SIZE * c.face, CHUB_SIZE, 1);
      c.shadow.position.set(c.pos.x, (c.state === 'perch' ? c.rock.h : 0) + 0.04, c.pos.z);
    }
    updateCart(dt);
  }
  function resetChubs() {                              // respawn: passengers scatter, the colony stays
    cartFling(cart.riders.length, 0); cartReset(); seedResidents();
  }
  GS.chubInit = false;

  // ---- mobile auto-fire: lock the turret on the nearest awake biter (or the boss) like a shmup ----
  GS.autoTarget = null;
  const autoV = new THREE.Vector3();
  function onScreen(x, z) { autoV.set(x, 1, z).project(camera); return Math.abs(autoV.x) < 1.05 && Math.abs(autoV.y) < 1.05; }
  function pickAutoTarget() {
    const ok = e => e && !e.dead && !e.carried && e.awake && Math.hypot(e.pos.x - car.pos.x, e.pos.z - car.pos.z) < 30 && onScreen(e.pos.x, e.pos.z);
    if (GS.autoTarget && GS.autoTarget !== boss && ok(GS.autoTarget)) return GS.autoTarget;   // sticky, no jitter between two biters
    let best = null, bd = 26;
    for (const e of enemies) if (ok(e)) { const d = Math.hypot(e.pos.x - car.pos.x, e.pos.z - car.pos.z); if (d < bd) { bd = d; best = e; } }
    for (const e of swarm) if (ok(e)) { const d = Math.hypot(e.pos.x - car.pos.x, e.pos.z - car.pos.z) - (e.K.ranged ? 4 : 0); if (d < bd) { bd = d; best = e; } }
    if (!best && boss.state === 'fight' && Math.hypot(BOSS_POS.x - car.pos.x, BOSS_POS.z - car.pos.z) < 32) best = boss;
    return best;
  }
  function autoTargetPos(t) { return t === boss ? BOSS_POS : t.pos; }

  // ---------- выкапывание ----------
  const DIG_TIME = 3, digTime = () => DIG_TIME * (abLv.burrow >= 1 ? 1.6 : 1);                                // одна архизлюка откапывает за 3 с, несколько — быстрее
  const digBar = new THREE.Group();
  const dbBg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.3), new THREE.MeshBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.8, depthTest: false }));
  const dbFillGeo = new THREE.PlaneGeometry(2.5, 0.2); dbFillGeo.translate(1.25, 0, 0);
  const dbFill = new THREE.Mesh(dbFillGeo, new THREE.MeshBasicMaterial({ color: 0xd040a0, depthTest: false, transparent: true }));
  dbFill.position.set(-1.25, 0, 0.01); dbBg.renderOrder = 10; dbFill.renderOrder = 11;
  digBar.add(dbBg, dbFill); digBar.visible = false; scene.add(digBar);
  const alertEl = document.getElementById('alert'); let alertT = 0;
  function flashAlert(text) { alertEl.textContent = text; alertEl.style.opacity = 1; alertT = 1.4; }
  let digDirtT = 0;
  function updateDig(dt) {
    alertT -= dt; if (alertT <= 0) alertEl.style.opacity = 0;
    const hidden = car.alive && (car.burrow === 'under' || car.burrow === 'down');
    if (!hidden) { car.dig = 0; digBar.visible = false; return; }
    car.dig = car.dig || 0;
    if (GS.diggers > 0) {
      crewSay('dig');
      car.dig += dt * GS.diggers;
      digDirtT -= dt;
      if (digDirtT <= 0) { digDirtT = 0.06; spawnParticles(tmp.copy(car.pos).setY(0.5), Math.random() < 0.7 ? 0x6b5a3e : 0xd040a0, 2, 7); }
      mound.position.x += rand(-0.08, 0.08); mound.position.z += rand(-0.08, 0.08);   // нора трясётся
      SFX.play('scratch', car.pos);
      GS.shake = Math.max(GS.shake, 0.12);
    } else car.dig = Math.max(0, car.dig - dt * 0.5);  // бросили копать — нора потихоньку «заживает»
    digBar.visible = car.dig > 0;
    if (digBar.visible) {
      digBar.position.set(car.pos.x, 4.3, car.pos.z);
      digBar.quaternion.copy(camera.quaternion);
      dbFill.scale.x = Math.max(0.001, Math.min(1, car.dig / digTime()));
    }
    if (car.dig >= digTime()) {                         // откопали: выкидывает наверх
      car.dig = 0; digBar.visible = false;
      car.burrow = 'up'; car.depth = 0; car.burrowCd = 2;
      car.vy = 9; car.airborne = true; car.usedDouble = true; car.popped = true;
      spawnParticles(tmp.copy(car.pos).setY(0.5), 0x6b5a3e, 26, 12);
      GS.shake = Math.max(GS.shake, 0.7);
      flashAlert('DUG OUT!'); SFX.play('dig_up', car.pos); SFX.play('growl_elite', car.pos, { delay: 0.1 });
    }
  }

  // ---------- shield (то, что висит на буре) ----------
  function shield() {
    if (grab.state !== 'hold' || !grab.held || !car.alive) return null;
    return { x: holdPos.x, z: holdPos.z, r: grab.held.r * 0.9, h: grab.held };
  }
  const shieldBar = new THREE.Group();
  const sbBg = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.26), new THREE.MeshBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.8, depthTest: false }));
  const sbFillGeo = new THREE.PlaneGeometry(1.9, 0.16); sbFillGeo.translate(0.95, 0, 0);
  const sbFill = new THREE.Mesh(sbFillGeo, new THREE.MeshBasicMaterial({ color: 0x5fd36a, depthTest: false, transparent: true }));
  sbFill.position.set(-0.95, 0, 0.01);
  sbBg.renderOrder = 10; sbFill.renderOrder = 11;
  shieldBar.add(sbBg, sbFill); shieldBar.visible = false; scene.add(shieldBar);

  function chewShield(e) {
    const h = grab.held;
    SFX.play('chomp', e.pos); SFX.play(h.kind === 'crate' ? 'hit_wood' : 'hit_flesh', holdPos);
    h.shieldHp -= e.bite;
    GS.shake = Math.max(GS.shake, 0.2);
    spawnParticles(tmp.set((e.pos.x + holdPos.x) / 2, holdPos.y, (e.pos.z + holdPos.z) / 2),
                   h.kind === 'crate' ? 0xd2873c : 0xc8323c, 5, 6);
    if (h.kind === 'crate') h.ref.flash = 0.08;
    e.vel.set(0, 0, 0);
    if (h.shieldHp <= 0) {                                   // прогрызли
      if (h.kind === 'crate') damageCrate(h.ref, 99);
      else hitEnemy(h.ref, tmp.set(0, 0, 0), 999, 0);
      spawnParticles(tmp.copy(holdPos), h.kind === 'crate' ? 0xd2873c : 0xc8323c, 14, 9);
      GS.shake = Math.max(GS.shake, 0.45);
    }
  }
  function updateShieldBar() {
    const sh = shield();
    shieldBar.visible = !!sh;
    if (!sh) return;
    const h = sh.h, f = Math.max(0, h.shieldHp / h.shieldMax);
    shieldBar.position.set(holdPos.x, holdPos.y + h.s / 2 + 1.5, holdPos.z);
    shieldBar.quaternion.copy(camera.quaternion);
    sbFill.scale.x = Math.max(0.001, f);
    sbFill.material.color.setHex(f > 0.55 ? 0x5fd36a : f > 0.25 ? 0xf0b43c : 0xe5484d);
  }

  // ---------- BOSS: Пирамидон ----------
  const bossBarEl = document.getElementById('bossbar'), bossFillEl = document.getElementById('bossfill');
  const boss = { state: 'idle', hp: BOSS_HP, dealt: 0, t: 0, throwCd: 2, lashCd: 1.5, lifting: null, flash: 0, dirtT: 0, ph: 1, mv: null, vol: null };
  // Two halves of the fight. In the lair it loses half its health, then breaks out through the gate into the field, heals (the bar comes back in another colour) and fights on there:
  // it moves in dashes between volleys, and every volley of quake rings comes with a ring of lava around it that has to be jumped, from either side.
  const BOSS_SINK = 10.5;                              // how deep it hides before the fight
  const bossGroup = new THREE.Group();
  bossGroup.position.set(BOSS_POS.x, -BOSS_SINK, BOSS_POS.z); bossGroup.visible = false; scene.add(bossGroup);
  const bossMat = new THREE.MeshStandardMaterial({ color: 0x3c2656, emissive: 0x1a0830, flatShading: true, metalness: 0.55, roughness: 0.45, envMap: GS.ENV, envMapIntensity: 1.0 });
  const bossDark = new THREE.MeshStandardMaterial({ color: 0x241634, flatShading: true, metalness: 0.6, roughness: 0.45 });
  const seamMat = glow(new THREE.MeshBasicMaterial({ color: 0xff3d9a }), 2.4);
  const bput = (geo, mat, x, y, z, parent = bossGroup) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = mat !== seamMat; parent.add(m); return m; };
  {
    // three-tier ziggurat with light leaking out of the seams
    const tier = (rTop, rBot, h) => { const g = new THREE.CylinderGeometry(rTop, rBot, h, 4, 1); g.rotateY(Math.PI / 4); return g; };
    bput(tier(4.15, 5.0, 1.6), bossMat, 0, 0.8, 0).receiveShadow = true;
    bput(new THREE.BoxGeometry(5.4, 0.2, 5.4), seamMat, 0, 1.7, 0);
    bput(tier(3.1, 3.95, 1.5), bossMat, 0, 2.55, 0);
    bput(new THREE.BoxGeometry(3.95, 0.2, 3.95), seamMat, 0, 3.4, 0);
    bput(tier(2.1, 2.9, 1.45), bossMat, 0, 4.225, 0);
    bput(new THREE.BoxGeometry(1.5, 0.1, 1.5), bossDark, 0, 5.0, 0);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, cx = Math.cos(a), cz = Math.sin(a);
      // sockets the tentacles grow out of
      bput(new THREE.CylinderGeometry(1.0, 1.3, 0.75, 6), bossDark, cx * 5.1, 0.37, cz * 5.1);
      bput(new THREE.CylinderGeometry(0.68, 0.68, 0.08, 6), seamMat, cx * 5.1, 0.76, cz * 5.1);
      // corner ribs up the first two tiers
      const rib = bput(new THREE.BoxGeometry(0.6, 3.75, 0.6), bossDark, cx * 4.2, 1.65, cz * 4.2);
      rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-cx * 0.5, 0.87, -cz * 0.5).normalize());
      // rune slab on each face of the middle tier
      const fa = k * Math.PI / 2, slab = bput(new THREE.BoxGeometry(1.5, 0.75, 0.08), seamMat, Math.sin(fa) * 2.5, 2.55, Math.cos(fa) * 2.5);
      slab.rotation.set(0, fa, 0); slab.rotateX(-0.38);
      const mask = bput(new THREE.BoxGeometry(0.5, 0.8, 0.1), bossDark, Math.sin(fa) * 2.52, 2.55, Math.cos(fa) * 2.52);
      mask.rotation.set(0, fa, 0); mask.rotateX(-0.38);
    }
  }
  // the eye hovers between the top tier and a floating capstone
  const eye = bput(new THREE.IcosahedronGeometry(0.85, 0), glow(new THREE.MeshBasicMaterial({ color: 0xff2a50 }), 2.4), 0, 6.0, 0);
  eye.castShadow = false;
  const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.95, 0.12), new THREE.MeshBasicMaterial({ color: 0x110008 }));
  pupil.position.z = 0.78; eye.add(pupil);
  const capstone = new THREE.Group(); capstone.position.y = 7.15; bossGroup.add(capstone);
  {
    const cg = new THREE.ConeGeometry(1.8, 2.1, 4); cg.rotateY(Math.PI / 4);
    bput(cg, bossMat, 0, 1.05, 0, capstone);
    bput(new THREE.BoxGeometry(2.1, 0.1, 2.1), seamMat, 0, -0.02, 0, capstone);
  }
  const orbit = [];
  for (let i = 0; i < 20; i++) {
    const geo = i % 3 === 0 ? new THREE.OctahedronGeometry(0.34, 0) : i % 3 === 1 ? new THREE.TetrahedronGeometry(0.4, 0) : new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a3ab0, emissive: 0xa020e0, roughness: 0.4, metalness: 0.4, flatShading: true }));
    bossGroup.add(m);
    orbit.push({ m, a: rand(0, Math.PI * 2), r: rand(5.8, 7.4), y: rand(1, 8), sp: rand(0.5, 1.3) * (GS.worldRnd() < 0.5 ? -1 : 1) });
  }
  const bossCol = { mesh: new THREE.Object3D(), hx: 3.7, hz: 3.7, h: 5, solid: true, crate: false, boss: true, disabled: true };
  bossCol.mesh.position.copy(BOSS_POS); obstacles.push(bossCol);

  // щупальца из кубиков
  const tentGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const tentacles = [];
  for (let k = 0; k < 4; k++) {
    const a0 = Math.PI / 4 + k * Math.PI / 2;
    tentacles.push({ k, a0, theta: a0, reach: 0, lift: 0.3, wave: 0.4, n: TENT_MIN, segs: [], pts: [],
                     mat: new THREE.MeshStandardMaterial({ color: 0x7a34a0, emissive: 0x220033, roughness: 0.35, metalness: 0.45 }),
                     state: 'idle', t: 0, aim: a0, hitDone: false, glow: 0,
                     tip: new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), seamMat) });
    scene.add(tentacles[k].tip); tentacles[k].tip.visible = false;
  }
  const hideTent = tn => { tn.segs.forEach(m => m.visible = false); tn.tip.visible = false; };
  const tRoot = new THREE.Vector3();
  function tentRoot(tn) { return tRoot.set(BOSS_POS.x + Math.cos(tn.a0) * 5.1, 0, BOSS_POS.z + Math.sin(tn.a0) * 5.1); }
  function syncSegs(tn) {
    while (tn.segs.length < tn.n) {
      const m = new THREE.Mesh(tentGeo, tn.mat); m.castShadow = true; m.rotation.set(rand(0, 3), rand(0, 3), 0);
      scene.add(m); tn.segs.push(m); tn.pts.push(new THREE.Vector3());
      if (boss.state === 'fight') spawnParticles(tn.pts[Math.max(0, tn.segs.length - 2)] || BOSS_POS, 0xd040a0, 3, 4);
    }
  }
  tentacles.forEach(syncSegs);
  const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  function updateTentacle(tn, dt) {
    tn.t += dt;
    const r = tentRoot(tn);
    let tTheta = tn.a0 + 0.3 * Math.sin(GS.elapsed * 0.7 + tn.k * 1.7), tReach = 1, tLift = 0.45, tWave = 0.45, tGlow = 0, rate = 2.5;
    if (tn.state === 'wind') {
      const tp = tn.tp || car.pos; tn.aim = Math.atan2(tp.z - r.z, tp.x - r.x);   // tracks whoever it is swinging at
      tTheta = tn.aim; tReach = 0.5; tLift = 3.4; tWave = 0.12; tGlow = 1; rate = 7;
      if (tn.t > 0.65) { tn.state = 'strike'; tn.t = 0; tn.hitDone = false; SFX.play('whoosh', tn.pts[tn.n >> 1], { rate: 0.8 }); }
    } else if (tn.state === 'strike') {
      tTheta = tn.aim; tReach = 1.15; tLift = 0; tWave = 0; tGlow = 1; rate = 28;
      if (tn.t > 0.16) { tn.state = 'slam'; tn.t = 0; GS.shake = Math.max(GS.shake, 0.35); SFX.play('tent_slam', tn.pts[tn.n - 1]);
        for (let i = 0; i < tn.n; i += 3) { spawnParticles(tn.pts[i], 0x6a5a7a, 2, 5); burst(tn.pts[i], 0x8a7a9a, 1, 1.8, 3, 0.3); } }
    } else if (tn.state === 'slam') {
      tTheta = tn.aim; tReach = 1.15; tLift = 0; tWave = 0; tGlow = 0.6; rate = 28;
      if (tn.t > 0.4) { tn.state = 'retract'; tn.t = 0; }
    } else if (tn.state === 'retract') {
      rate = 3;
      if (tn.t > 0.7) {                                                 // отросло: +2 кубика
        tn.state = 'idle'; tn.t = 0;
        tn.n = Math.min(TENT_MAX, tn.n + 2); syncSegs(tn);
      }
    }
    const k = Math.min(1, rate * dt);
    tn.theta = angLerp(tn.theta, tTheta, k);
    tn.reach += (tReach - tn.reach) * k; tn.lift += (tLift - tn.lift) * k; tn.wave += (tWave - tn.wave) * k;
    tn.glow += (tGlow - tn.glow) * Math.min(1, 8 * dt);
    tn.mat.emissive.setRGB(0.02 + tn.glow * 1.3, tn.glow * 0.02, 0.05 * (1 - tn.glow));   // idle: faint violet; wind-up: HDR red that blooms

    for (let i = 0; i < tn.segs.length; i++) {
      const m = tn.segs[i], p = tn.pts[i];
      if (i >= tn.n) { m.visible = false; continue; }
      const f = (i + 1) / tn.n;
      const ang = tn.theta + tn.wave * Math.sin(GS.elapsed * 2.6 + i * 0.55 + tn.k) * f;
      const d = (i + 1) * TENT_SP * tn.reach;
      p.set(r.x + Math.cos(ang) * d, 0.5 + tn.lift * Math.sin(Math.PI * Math.min(1, f * 1.1)) + 0.12 * Math.sin(GS.elapsed * 4 + i), r.z + Math.sin(ang) * d);
      m.position.copy(p);
      m.scale.setScalar(1.1 - 0.55 * f);
      if (i === tn.n - 1) { tn.tip.position.copy(p); tn.tip.rotation.y += dt * 4; tn.tip.rotation.x += dt * 2.5; tn.tip.visible = true; }
      m.rotation.x += dt * (1.5 + i * 0.08); m.rotation.y += dt * (1 + i * 0.05);   // кубики крутятся как частицы
      m.visible = true;
    }
    // попадание по машине во время удара
    if ((tn.state === 'strike' || (tn.state === 'slam' && tn.t < 0.1)) && !tn.hitDone &&
        car.alive && car.depth < 0.3 && car.y < 2.2) {
      for (let i = 0; i < tn.n; i++) {
        const p = tn.pts[i];
        if (Math.hypot(p.x - car.pos.x, p.z - car.pos.z) < car.radius + 0.5) {
          tn.hitDone = true;
          hurtCar(22, tmp.set(car.pos.x - BOSS_POS.x, 0, car.pos.z - BOSS_POS.z).normalize().clone());
          spawnParticles(tmp.copy(car.pos).setY(1.2), 0xd040a0, 8, 7);
          break;
        }
      }
    }
  }

  // ящики в комнате — снаряды для босса (и для нас)
  function roomSpot(r = 1.2) {
    for (let i = 0; i < 60; i++) {
      const x = rand(ROOM_X1 + 5, ROOM_X2 - 5), z = rand(-ROOM_HZ + 5, ROOM_HZ - 5);
      if (Math.hypot(x - BOSS_POS.x, z - BOSS_POS.z) < 10) continue;
      if (x < ROOM_X1 + 8 && Math.abs(z) < GATE_HZ + 3) continue;
      if (obstacles.some(o => o.crate && o.mesh.visible && Math.abs(o.mesh.position.x - x) < o.hx + r + 1 && Math.abs(o.mesh.position.z - z) < o.hz + r + 1)) continue;
      return [x, z];
    }
    return [BOSS_POS.x - 15, rand(-20, 20)];
  }
  for (let i = 0; i < 12; i++) {
    const sz = rand(1.6, 2.2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), crateMat);
    const [x, z] = roomSpot(sz);
    m.position.set(x, sz / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
    obstacles.push({ mesh: m, hx: sz / 2, hz: sz / 2, h: sz, solid: true, crate: true, hp: 3, flash: 0, room: true });
  }

  function bossFan(n, spread, speed, aim) {             // a fan (or a full ring) of slow glowing shots from the pyramid
    const from = new THREE.Vector3(BOSS_POS.x, 2.4, BOSS_POS.z);
    for (let i = 0; i < n; i++) {
      const a = aim + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0), m = new THREE.Mesh(eshotGeo, eshotMat[1]);
      m.position.set(from.x + Math.sin(a) * 4.5, from.y, from.z + Math.cos(a) * 4.5); m.scale.setScalar(1.15);
      const halo = new THREE.Sprite(eshotHaloMat[1]); halo.scale.setScalar(2.2); m.add(halo); scene.add(m);
      eshots.push({ m, v: new THREE.Vector3(Math.sin(a) * speed, -0.35, Math.cos(a) * speed), life: 4.2, dmg: 6, k: 1 });
    }
    SFX.play('eshot', from, { rate: 0.7, vol: 1 });
  }
  function bossFanNet(n, spread, speed, aim) { bossFan(n, spread, speed, aim); netEv({ t: 'bf', n, s: r2(spread), v: r1(speed), a: r2(aim) }); }
  // everyone the pyramid can reach: players alive and above ground inside its room
  function bossTgts(all) {
    const a = [], ok = p => boss.ph === 2 ? all || Math.hypot(p.x - BOSS_POS.x, p.z - BOSS_POS.z) < BOSS2.sight : inRoom(p.x, p.z);      // out in the field: whoever is near enough (or anybody, for choosing where to dash)
    if (car.alive && car.depth < 0.3 && ok(car.pos)) a.push({ pos: car.pos, vel: car.vel, peer: String(NET.on && NET.game ? netMe() : 'me') });
    if (NET.on && NET.game) for (const R of NET.remotes.values()) if (R.up && ok(R.pos)) a.push({ pos: R.pos, vel: R.vel, peer: String(R.peer) });
    return a;
  }
  function netPeerPos(p) {
    if (!(NET.on && NET.game) || String(p) === String(netMe())) return car.pos;
    for (const R of NET.remotes.values()) if (String(R.peer) === String(p)) return R.pos;
    return car.pos;
  }
  function bossFanTick(dt) {
    const tg = bossTgts(); if (boss.state !== 'fight' || !tg.length) return;
    let T = boss.fanT && tg.find(t => t.peer === boss.fanT.peer); if (!T) T = boss.fanT = tg[Math.floor(Math.random() * tg.length)];
    const rage = bossRage(), aim = Math.atan2(T.pos.x - BOSS_POS.x, T.pos.z - BOSS_POS.z);
    if (boss.fanLeft > 0 && (boss.fanGap -= dt) <= 0) {                  // a burst: several fans in a row, each offset half a step so the gaps move
      boss.fanLeft--; boss.fanGap = 0.42;
      if (boss.fanRing) bossFanNet(18, 6.283 * 17 / 18, 9.5, boss.fanLeft * 0.175); else bossFanNet(rage ? 9 : 7, rage ? 1.5 : 1.15, 11.5, aim + (boss.fanLeft % 2 ? 0.09 : -0.09));
    }
    if ((boss.fanCd = (boss.fanCd == null ? 3 : boss.fanCd) - dt) <= 0) {
      boss.fanRing = rage && Math.random() < 0.45; boss.fanLeft = boss.fanRing ? 3 : rage ? 4 : 3; boss.fanGap = 0; boss.fanT = tg[Math.floor(Math.random() * tg.length)];
      boss.fanCd = rage ? rand(3.2, 4.4) : rand(4.5, 6);
    }
  }
  function bossLift(o) { o.carried = true; boss.lifting = { o, t: 0, from: o.mesh.position.clone() }; SFX.play('boss_lift', BOSS_POS); }
  function bossHurl(o, from, vel, lead) {
    o.carried = true; o.mesh.position.copy(from);
    const r = Math.max(o.hx, o.hz) * 1.2;
    const marker = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.7, 28),
      glow(new THREE.MeshBasicMaterial({ color: 0xff3d5a, transparent: true, opacity: 0.85, depthWrite: false }), 4));
    marker.geometry.rotateX(-Math.PI / 2); marker.position.set(lead.x, 0.05, lead.z); scene.add(marker);
    thrown.push({ kind: 'crate', ref: o, r, s: o.h, pos: from.clone(), vel: vel.clone(), spin: rand(6, 10), rot: 0, hostile: true, marker });
    SFX.play('whoosh', from);
    if (boss.lifting && boss.lifting.o === o) boss.lifting = null;
  }
  function bossThrowTick(dt) {
    if (NET.client) { bossLiftAnim(dt); return; }        // a guest only animates what the host's pyramid does
    bossFanTick(dt);
    boss.throwCd -= dt;
    if (!boss.lifting && boss.throwCd <= 0 && !boss.mv) {
      let best = null, bd = Infinity;
      for (const o of obstacles) {
        if (!(boss.ph === 2 ? o.crate : o.room) || !active(o)) continue;      // in the field it throws whatever crates lie around it
        const d = Math.hypot(o.mesh.position.x - BOSS_POS.x, o.mesh.position.z - BOSS_POS.z);
        if (d < bd && (boss.ph !== 2 || d < 45)) { bd = d; best = o; }
      }
      if (best) { bossLift(best); netEv({ t: 'bl', i: obstacles.indexOf(best) }); }
      boss.throwCd = rand(2.2, 3.2);
    }
    bossLiftAnim(dt);
  }
  function bossLiftAnim(dt) {
    const L = boss.lifting;
    if (!L) return;
    L.t += dt;
    const k = Math.min(1, L.t / 0.8), e = k * k * (3 - 2 * k);
    const top = tmp.set(BOSS_POS.x, 11, BOSS_POS.z);
    L.o.mesh.position.lerpVectors(L.from, top, e);
    L.o.mesh.position.y += Math.sin(k * Math.PI) * 3;
    L.o.mesh.rotation.x += dt * 6; L.o.mesh.rotation.z += dt * 4;
    if (L.t >= 0.95 && !NET.client) {                            // hurls it at someone in the room, leading them a little
      const tg = bossTgts(); if (!tg.length) { releaseLift(); return; }
      const T = tg[Math.floor(Math.random() * tg.length)], from = L.o.mesh.position.clone();
      const lead = new THREE.Vector3(T.pos.x + T.vel.x * 0.55, 0, T.pos.z + T.vel.z * 0.55);
      if (boss.ph !== 2 && !inRoom(lead.x, lead.z)) lead.set(T.pos.x, 0, T.pos.z);
      const dx = lead.x - from.x, dz = lead.z - from.z, dist = Math.hypot(dx, dz);
      const tt = THREE.MathUtils.clamp(dist / 22, 0.6, 1.5);
      const vel = new THREE.Vector3(dx / tt, 0.5 * G * tt - (from.y - L.o.h / 2) / tt, dz / tt);
      netEv({ t: 'bh', i: obstacles.indexOf(L.o), f: [r2(from.x), r2(from.y), r2(from.z)], v: [r2(vel.x), r2(vel.y), r2(vel.z)], l: [r1(lead.x), r1(lead.z)] });
      bossHurl(L.o, from, vel, lead);
    }
  }

  // In a lobby the host keeps the one true count: a guest shows its own hits at once and sends them to the host (bd), the host
  // sends everybody the count and the size of the pool (bhp); only the host starts the break-out and only the host kills it.
  function bossDamage(d) {
    if (boss.state !== 'fight') return;
    const was = boss.dealt; boss.dealt += d; boss.flash = 0.06;
    bossHealth(); if (NET.client) NET.bdAcc = (NET.bdAcc || 0) + Math.max(0, boss.dealt - was);      // what the lair's half cut off is not sent
  }
  // One counter for both halves: the lair takes it from 0 to half of bossMax() (and no further), the field from there to one and a half.
  function bossHealth() {
    const M = bossMax();
    if (boss.ph !== 2) { boss.dealt = Math.min(boss.dealt, M * 0.5); if (!NET.client && boss.state === 'fight' && boss.dealt >= M * 0.5) bossFlee(); }
    else if (boss.state === 'fight' && boss.dealt >= M * 1.5) { if (NET.client) boss.dealt = M * 1.5; else { killBoss(); netEv({ t: 'bk' }); } }      // a guest's bar may show zero: the host says when it dies
    bossBar();
  }
  const bossRage = () => boss.ph === 2 ? boss.dealt > bossMax() : boss.dealt > bossMax() * 0.25;      // the second half of each bar
  const bossMax = () => NET.client && boss.hm ? boss.hm : BOSS_HP * (1 + 1.5 * (NET.on && NET.game ? NET.remotes.size : 0));       // every extra player: +150%; a guest takes the host's number
  const bossBar = () => { const M = bossMax(); let f = boss.ph === 2 ? 1 - (boss.dealt - M * 0.5) / M : 1 - boss.dealt / M;
    if (boss.state === 'flee' && boss.mv) f = 0.5 + 0.5 * Math.min(1, boss.mv.t / boss.mv.T);      // healing on the run
    bossFillEl.style.width = Math.max(0, Math.min(1, f) * 100) + '%'; bossBarEl.classList.toggle('p2', boss.ph === 2); };
  function setDoor(closed) { if (door.targetY !== (closed ? 2.3 : -2.5)) SFX.play('door', doorMesh.position); door.targetY = closed ? 2.3 : -2.5; }
  function releaseLift() {
    if (!boss.lifting) return;
    const o = boss.lifting.o; boss.lifting = null;
    thrown.push({ kind: 'crate', ref: o, r: Math.max(o.hx, o.hz) * 1.2, s: o.h, pos: o.mesh.position.clone(), vel: new THREE.Vector3(), spin: 3, rot: 0 });
  }
  function killBoss() {
    boss.state = 'dead'; boss.t = 0; boss.mv = null; boss.vol = null; bossCol.disabled = true; clearLava(); crewSay('bossdead', 1, true);
    releaseLift();
    for (const tn of tentacles) {
      for (let i = 0; i < tn.n; i += 2) spawnParticles(tn.pts[i], 0x8a3ab0, 2, 7);
      hideTent(tn);
    }
    clearQuakes();
    spawnParticles(tmp.set(BOSS_POS.x, 3, BOSS_POS.z), 0xd040a0, 40, 14);
    flash(tmp, 0xff50c0, 46, 0.7, 6); burst(tmp, 0x5a3070, 22, 4, 9, 0.55);
    spawnParticles(tmp.set(BOSS_POS.x, 5, BOSS_POS.z), 0xff2255, 20, 12);
    GS.shake = 1.2;
    flashAlert('PYRAMIDON DEFEATED'); SFX.play('boss_die', BOSS_POS);
    if (!NET.client) { dropLoot(new THREE.Vector3(BOSS_POS.x - 7, 0, BOSS_POS.z - 3)); dropLoot(new THREE.Vector3(BOSS_POS.x - 7, 0, BOSS_POS.z + 3)); lootFrom('boss', BOSS_POS.x - 10, BOSS_POS.z); }
    angelStart();
    setDoor(false);
  }
  function bossEmerge() {
    boss.state = 'emerging'; boss.t = 0; crewSay('boss', 1, true);
    bossGroup.visible = true;
    bossBarEl.style.display = 'block'; bossBar();
    flashAlert('PYRAMIDON'); SFX.play('boss_emerge', BOSS_POS); SFX.play('boss_roar', BOSS_POS, { delay: 1.6 });
  }
  function bossFightNow(ns, bp) {                            // joined mid-fight: skip the rising
    boss.state = 'fight'; boss.t = 0; bossGroup.visible = true; bossGroup.position.y = 0; bossCol.disabled = false;
    bossBarEl.style.display = 'block'; bossBar();
    if (Array.isArray(ns)) tentacles.forEach((tn, k) => { tn.n = Math.round(num(ns[k], TENT_MIN, TENT_MAX)); syncSegs(tn); });
    if (Array.isArray(bp) && bp[0] === 2) { boss.ph = 2; boss.dealt = Math.max(boss.dealt, bossMax() * 0.5); bossSetPos(num(bp[1], -ARENA, ROOM_X2), num(bp[2], -ARENA, ARENA)); bossBar(); }
  }
  function resetBoss() {
    if (boss.state === 'dead' || boss.state === 'idle') return;
    boss.state = 'idle'; boss.t = 0; boss.throwCd = 2; boss.lashCd = 1.5; boss.quakeCd = null; boss.mv = null; boss.vol = null;
    if (!(NET.on && NET.game)) { boss.dealt = 0; boss.ph = 1; }           // solo: the fight starts over, back in the lair; in a lobby the damage already done stays
    if (boss.ph !== 2) bossSetPos(LAIR_POS.x, LAIR_POS.z);
    bossGroup.rotation.set(0, 0, 0); bossBar();
    releaseLift();
    clearQuakes(); clearLava();
    for (let i = thrown.length - 1; i >= 0; i--) if (thrown[i].hostile) finishThrown(thrown[i], i);
    bossCol.disabled = true; bossGroup.visible = false; bossGroup.position.y = -BOSS_SINK;
    for (const tn of tentacles) {
      tn.n = TENT_MIN; tn.reach = 0; tn.state = 'idle'; tn.t = 0; hideTent(tn);
    }
    bossBarEl.style.display = 'none';
    setDoor(!GS.gateOpen);
  }

  const quakes = [], QUAKE_T = 2.4;
  const quakeRingGeo = new THREE.RingGeometry(0.955, 1, 72); quakeRingGeo.rotateX(-Math.PI / 2);
  const quakeDiscGeo = new THREE.CircleGeometry(1, 56); quakeDiscGeo.rotateX(-Math.PI / 2);
  function bossQuake(x, z, r, dmg = 26) {
    const ring = new THREE.Mesh(quakeRingGeo, glow(new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.9, depthWrite: false }), 3));
    const disc = new THREE.Mesh(quakeDiscGeo, glow(new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.22, depthWrite: false }), 1.6));
    ring.position.set(x, 0.09, z); ring.scale.setScalar(r); disc.position.set(x, 0.08, z); disc.scale.setScalar(0.01); scene.add(ring, disc);
    quakes.push({ x, z, r, dmg, t: 0, ring, disc }); SFX.play('boss_roar', BOSS_POS, { rate: 0.6, vol: 0.7 });
    if (Math.hypot(car.pos.x - x, car.pos.z - z) < r + 4) flashAlert('GET OUT OF THE RING');
  }
  function clearQuakes() { for (const q of quakes) scene.remove(q.ring, q.disc); quakes.length = 0; }
  function updateQuakes(dt) {
    for (let i = quakes.length - 1; i >= 0; i--) {
      const q = quakes[i]; q.t += dt; const k = Math.min(1, q.t / QUAKE_T);
      q.disc.scale.setScalar(Math.max(0.01, q.r * k)); q.ring.material.opacity = 0.55 + 0.4 * Math.sin(q.t * (6 + 14 * k));      // the fill creeps out to the ring: that is the countdown
      GS.shake = Math.max(GS.shake, 0.08 + 0.12 * k);
      if (k < 1) continue;
      scene.remove(q.ring, q.disc); q.ring.material.dispose(); q.disc.material.dispose(); quakes.splice(i, 1);
      GS.shake = Math.max(GS.shake, 1); SFX.play('blast', tmp.set(q.x, 0, q.z)); SFX.play('tent_slam', tmp);
      flash(tmp.set(q.x, 1, q.z), 0xff7a2a, q.r * 2.2, 0.45, 3);
      for (let j = 0; j < 22; j++) { const a = j / 22 * 6.283, d = q.r * (0.3 + 0.7 * Math.random()); tmp.set(q.x + Math.cos(a) * d, 0.4, q.z + Math.sin(a) * d); spawnParticles(tmp, 0x6a5a4a, 3, 9); if (j % 3 === 0) burst(tmp, 0x8a7a6a, 2, 2.4, 5, 0.4); }
      if (car.alive && car.depth < 0.3 && car.y < 1.5 && Math.hypot(car.pos.x - q.x, car.pos.z - q.z) < q.r)
        hurtCar(q.dmg, new THREE.Vector3(car.pos.x - q.x, 0, car.pos.z - q.z).normalize());
    }
  }
  // -- the break-out, the dashes, the lava --
  function bossSetPos(x, z) { BOSS_POS.x = x; BOSS_POS.z = z; bossGroup.position.x = x; bossGroup.position.z = z; bossCol.mesh.position.set(x, 0, z); }
  function bossMove(x, z, v) { const d = Math.hypot(x - BOSS_POS.x, z - BOSS_POS.z); boss.mv = { sx: BOSS_POS.x, sz: BOSS_POS.z, tx: x, tz: z, t: 0, T: Math.max(0.5, d / v), hit: false, dustT: 0 };
    SFX.play('whoosh', BOSS_POS, { rate: 0.5, vol: 1 }); SFX.play('boss_roar', BOSS_POS, { rate: 1.25, vol: 0.5 }); }
  function bossFlee() {                                  // half its health gone: out of the lair, through the gate, into the field, healing as it goes
    if (boss.ph === 2 || boss.state === 'dead') return;
    boss.ph = 2; boss.dealt = Math.max(boss.dealt, bossMax() * 0.5); boss.vol = null; releaseLift(); clearQuakes();
    for (const tn of tentacles) { tn.reach = 0; tn.state = 'idle'; tn.t = 0; hideTent(tn); }
    boss.state = 'flee'; boss.t = 0; bossGroup.visible = true; bossGroup.position.y = 0; bossCol.disabled = false; bossBarEl.style.display = 'block';
    bossMove(BOSS2.out[0], BOSS2.out[1], BOSS2.fleeV); flashAlert('PYRAMIDON BREAKS OUT'); bossBar();
    if (!NET.client) netEv({ t: 'bs', s: 'f' });
  }
  function bossMoveTick(dt) {                            // everybody plays the same run: start, end and speed come from the host
    const M = boss.mv; M.t += dt; const k = Math.min(1, M.t / M.T), e = k * k * (3 - 2 * k), px = BOSS_POS.x, pz = BOSS_POS.z;
    bossSetPos(M.sx + (M.tx - M.sx) * e, M.sz + (M.tz - M.sz) * e);
    const vx = (BOSS_POS.x - px) / Math.max(dt, 1e-3), vz = (BOSS_POS.z - pz) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vz), lean = Math.min(0.17, sp * 0.006);
    bossGroup.rotation.set(sp > 0.1 ? vz / sp * lean : 0, 0, sp > 0.1 ? -vx / sp * lean : 0);      // leaning into the run
    if ((M.dustT -= dt) <= 0) { M.dustT = 0.04; burst(tmp.set(px + rand(-4, 4), 0.4, pz + rand(-4, 4)), 0x8a7a64, 5, 3, 8, 0.6); }
    const dc = Math.hypot(car.pos.x - BOSS_POS.x, car.pos.z - BOSS_POS.z) || 1e-3; if (dc < 60) GS.shake = Math.max(GS.shake, 0.25);
    if (!M.hit && sp > 6 && car.alive && car.y < 1.5 && dc < 7.2) { M.hit = true; hurtCar(BOSS2.ram, tmp.set((car.pos.x - BOSS_POS.x) / dc, 0, (car.pos.z - BOSS_POS.z) / dc).clone()); }      // run over: once a dash
    for (const o of obstacles) { if (o === bossCol || !(o.crate || o.pillar) || !active(o)) continue;                                                         // crates and pillars in its way are gone
      if (Math.abs(o.mesh.position.x - BOSS_POS.x) > o.hx + 4.2 || Math.abs(o.mesh.position.z - BOSS_POS.z) > o.hz + 4.2) continue;
      const was = NET.applying; NET.applying = true; if (o.crate) damageCrate(o, 99); else smashPillar(o, tmp.set(vx, 0, vz).clone()); NET.applying = was; }      // every side smashes its own copy: no loot, no events
    if (boss.state === 'flee') bossBar();
    if (k < 1) return;
    boss.mv = null; bossGroup.rotation.set(0, 0, 0);
    waveFx(BOSS_POS.x, BOSS_POS.z, 10, 0xff7ad8, 0.4); burst(tmp.set(BOSS_POS.x, 0.5, BOSS_POS.z), 0x8a7a64, 26, 5, 12, 0.6); SFX.play('land', tmp, { vol: 0.9, rate: 0.55 }); if (dc < 70) GS.shake = Math.max(GS.shake, 0.9);
    if (boss.state === 'flee') { boss.state = 'fight'; boss.t = 0; boss.quakeCd = 2.5; boss.throwCd = 2; boss.lashCd = 1; bossBar(); flashAlert('PYRAMIDON IS LOOSE'); }
  }
  function bossDash() {                                  // host: to a new spot beside somebody, so the next ring of lava closes around them
    const tg = bossTgts(true); if (!tg.length) return false;
    const T = tg[Math.floor(Math.random() * tg.length)], dx = BOSS_POS.x - T.pos.x, dz = BOSS_POS.z - T.pos.z, d = Math.hypot(dx, dz), keep = rand(BOSS2.near[0], BOSS2.near[1]);
    const a = d < keep + 10 ? Math.random() * 6.283 : Math.atan2(dz, dx) + rand(-0.6, 0.6), lim = ARENA - 14;      // already beside them: round to another side
    let x = THREE.MathUtils.clamp(T.pos.x + Math.cos(a) * keep, -lim, lim), z = THREE.MathUtils.clamp(T.pos.z + Math.sin(a) * keep, -lim, lim);
    if (Math.hypot(x - BOSS_POS.x, z - BOSS_POS.z) < 6) return false;
    x = r1(x); z = r1(z); bossMove(x, z, BOSS2.dashV); netEv({ t: 'bgo', x, z, v: BOSS2.dashV }); return true;      // the guests get it rounded: so does the host
  }
  function bossVolleyTick(dt) {                          // host: quake rings one after another; in the field a ring of lava stands around the pyramid while they go off
    if (boss.mv) return;
    const field = boss.ph === 2, Q = field ? BOSS2.fieldQ : BOSS2.lairQ, V = boss.vol;
    if (!V) {
      if ((boss.quakeCd = (boss.quakeCd == null ? 8 : boss.quakeCd) - dt) > 0) return;
      const tg = bossTgts();
      if (!tg.length) { boss.quakeCd = field && bossDash() ? 0.5 : 1; return; }      // nobody near: go and find them
      const sp = [];
      for (const T of tg.sort(() => Math.random() - 0.5)) if (!field || Math.hypot(T.pos.x - BOSS_POS.x, T.pos.z - BOSS_POS.z) < BOSS2.lavaR + 20) sp.push([T.pos.x, T.pos.z]);      // one under each player
      while (sp.length < Q.n) { const a = Math.random() * 6.283;                                                                                                              // the rest scattered
        if (field) { const d = rand(4, BOSS2.lavaR - 8); sp.push([BOSS_POS.x + Math.cos(a) * d, BOSS_POS.z + Math.sin(a) * d]); }
        else { const T = tg[Math.floor(Math.random() * tg.length)], d = rand(10, 22); sp.push([THREE.MathUtils.clamp(T.pos.x + Math.cos(a) * d, ROOM_X1 + 4, ROOM_X2 - 4), THREE.MathUtils.clamp(T.pos.z + Math.sin(a) * d, -ROOM_HZ + 4, ROOM_HZ - 4)]); } }
      sp.length = Q.n; boss.vol = { i: 0, t: 0, sp };
      if (field) { const q = { t: 'bv', x: r1(BOSS_POS.x), z: r1(BOSS_POS.z), r: BOSS2.lavaR, T: r1((Q.n - 1) * BOSS2.step + QUAKE_T + 0.3) }; bossLava(q.x, q.z, q.r, q.T); netEv(q); }
      return;
    }
    V.t += dt;
    while (V.i < Q.n && V.t >= V.i * BOSS2.step) { const [x, z] = V.sp[V.i++], q = { t: 'bq', x: r1(x), z: r1(z), r: Q.r, d: Q.dmg }; bossQuake(q.x, q.z, q.r, q.d); netEv(q); }
    if (V.t < (Q.n - 1) * BOSS2.step + QUAKE_T + 0.5) return;
    boss.vol = null; const G = bossRage() ? Q.rage : Q.gap; boss.quakeCd = rand(G[0], G[1]);
    if (field) bossDash();
  }
  // The fire wall (build 134, concept B1 with the ground glow of A1): a low ribbon of magenta fire in the Pyramidon's colours, torn at the top by
  // rising noise like a dissolve shader, a hot line where it meets the ground and a wide pink glow on the ground on both sides.
  const lavas = [], lavaWallGeo = new THREE.CylinderGeometry(1, 1, 1, 180, 1, true); lavaWallGeo.translate(0, 0.5, 0);
  const SHV = 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const fireWallMat = rep => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uA: { value: 0 }, uRep: { value: rep } }, vertexShader: SHV,
    fragmentShader: `uniform float uT, uA, uRep; varying vec2 vUv;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p, float P){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = mod(i.x, P), b = mod(i.x + 1.0, P);      // value noise that wraps round the circle
        return mix(mix(hs(vec2(a, i.y)), hs(vec2(b, i.y)), f.x), mix(hs(vec2(a, i.y + 1.0)), hs(vec2(b, i.y + 1.0)), f.x), f.y); }
      void main(){
        float v = vUv.y, u = vUv.x * uRep;
        float c = vn(vec2(u, uT * 0.8), uRep), tb = vn(vec2(u * 2.0, v * 3.0 - uT * 3.2), uRep * 2.0);                         // c: how tall this tongue is now; tb: turbulence rising through it
        float top = 0.3 + pow(c, 1.4) * 0.7, m = top - v + (tb - 0.5) * 0.26;                                                   // a row of tongues, each with its own height, licking up
        if (m < 0.0) discard;
        float k = clamp(v / top, 0.0, 1.0), rim = 1.0 - smoothstep(0.0, 0.07, m);                                               // k: 0 at the foot of a tongue, 1 at its tip
        vec3 deep = vec3(0.34, 0.02, 0.78), mag = vec3(0.95, 0.03, 0.55), pink = vec3(1.0, 0.42, 0.85);
        vec3 col = mix(deep, mag, smoothstep(0.0, 0.45, k)); col = mix(col, pink, smoothstep(0.55, 1.0, k));
        col += pink * rim * 0.7 + mag * (1.0 - smoothstep(0.0, 0.07, v)) * 1.1;                                                 // a hot rim on every edge, a hot line along the foot
        gl_FragColor = vec4(col * (0.8 + 0.35 * k), uA * (0.82 + 0.18 * smoothstep(0.0, 0.15, m)));
      }` });
  const fireGlowMat = r => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uA: { value: 0 }, uR: { value: r } }, vertexShader: SHV,
    fragmentShader: `uniform float uT, uA, uR; varying vec3 vP;
      void main(){
        float d = length(vP.xy) - uR, a = atan(vP.y, vP.x);
        float g = d < 0.0 ? exp(d / 5.0) * 0.8 + 0.05 : exp(-d / 3.5);                                                            // wide on the inside, the whole floor in it faintly tinted
        g *= 0.85 + 0.15 * sin(a * 23.0 + uT * 3.0) * sin(a * 7.0 - uT * 1.7);
        gl_FragColor = vec4(vec3(1.0, 0.1, 0.6) * g * 0.3 * uA, 1.0);
      }` });
  function bossLava(x, z, r, T) {                        // the fire wall: it rises, stands T seconds, sinks; on the ground you do not cross it unhurt, in the air you do
    const G = new THREE.Group(), wall = new THREE.Mesh(lavaWallGeo, fireWallMat(Math.round(2 * Math.PI * r / 2.6)));
    wall.scale.set(r, 0.01, r); wall.renderOrder = 3;
    const gl = new THREE.Mesh(new THREE.RingGeometry(0.5, r + 14, 180, 1), fireGlowMat(r)); gl.rotation.x = -Math.PI / 2; gl.position.y = 0.06; gl.renderOrder = 2;
    const line = new THREE.Mesh(new THREE.RingGeometry(r - 0.22, r + 0.22, 180), glow(new THREE.MeshBasicMaterial({ color: 0xff4ad0, transparent: true, opacity: 0, depthWrite: false }), 3)); line.rotation.x = -Math.PI / 2; line.position.y = 0.09;
    G.add(gl, line, wall); G.position.set(x, 0, z); scene.add(G); lavas.push({ x, z, r, t: 0, T, G, wall, gl, line });
    SFX.play('boss_roar', tmp.set(x, 0, z), { rate: 0.45, vol: 0.8 }); if (Math.hypot(car.pos.x - x, car.pos.z - z) < r + 25) flashAlert('FIRE WALL: JUMP IT');
  }
  function lavaOff(L) { scene.remove(L.G); for (const m of L.G.children) { m.material.dispose(); if (m.geometry !== lavaWallGeo) m.geometry.dispose(); } }
  function clearLava() { for (const L of lavas) lavaOff(L); lavas.length = 0; }
  function updateLava(dt) {
    for (let i = lavas.length - 1; i >= 0; i--) { const L = lavas[i]; L.t += dt;
      if (L.t >= L.T) { lavaOff(L); lavas.splice(i, 1); continue; }
      const up = Math.min(1, L.t / 0.45) * Math.min(1, (L.T - L.t) / 0.4), h = BOSS2.lavaH * up;
      L.wall.scale.y = Math.max(0.01, h); L.wall.material.uniforms.uT.value = L.gl.material.uniforms.uT.value = L.t; L.wall.material.uniforms.uA.value = L.gl.material.uniforms.uA.value = up; L.line.material.opacity = (0.75 + 0.25 * Math.sin(L.t * 14)) * up;
      const dx = car.pos.x - L.x, dz = car.pos.z - L.z, d = Math.hypot(dx, dz) || 1e-3, a0 = Math.atan2(dz, dx);
      for (let j = 0; j < 3; j++) if (Math.random() < dt * 30) { const a = a0 + rand(-0.8, 0.8); spawnParticles(tmp.set(L.x + Math.cos(a) * L.r, 0.5 + Math.random() * h, L.z + Math.sin(a) * L.r), Math.random() < 0.5 ? 0xff6ae0 : 0xb04aff, 2, 5); }      // embers on the stretch you can see
      if (up > 0.6 && car.alive && car.y < 1.5 && Math.abs(d - L.r) < BOSS2.lavaW + 0.5 && (car.lavaT || 0) < GS.elapsed) { car.lavaT = GS.elapsed + 0.5; const sd = d < L.r ? -1 : 1;
        hurtCar(BOSS2.lavaDmg, tmp.set(dx / d * sd, 0, dz / d * sd).clone()); }      // burnt, and thrown back to the side you came from
    }
  }
  function updateBoss(dt) {
    updateQuakes(dt); updateLava(dt);
    const runeTarget = boss.state === 'fight' ? 1.5 + 0.6 * Math.sin(GS.elapsed * 3) : boss.state === 'emerging' ? 3.2 : boss.state === 'dead' ? 0.25 : 0.8;
    GS.runeLevel += (runeTarget - GS.runeLevel) * Math.min(1, 3 * dt); runeMat.color.setScalar(GS.runeLevel);
    // дверь
    const dy = door.targetY - doorMesh.position.y;
    doorMesh.position.y += Math.sign(dy) * Math.min(Math.abs(dy), 9 * dt);
    door.disabled = doorMesh.position.y < 0.3;

    if (boss.state === 'idle') {
      tentacles.forEach(tn => hideTent(tn));
      if (!NET.client && bossTgts().some(t => t.pos.x > ROOM_X1 + 5)) { bossEmerge(); netEv({ t: 'bs', s: 'e' }); }   // someone drove in: it rises (the gate stays open)
      return;
    }
    if (NET.on && NET.game && !NET.client && boss.state === 'fight' && boss.ph !== 2) {              // nobody left in the room for a while: it sinks back and waits (once it is out in the field it stays out)
      if (bossTgts().length) boss.empty = 0; else if ((boss.empty = (boss.empty || 0) + dt) > 6) { boss.empty = 0; resetBoss(); netEv({ t: 'bs', s: 'i' }); return; }
    }
    boss.t += dt;
    if (boss.state === 'emerging') {
      const k = Math.min(1, boss.t / 2.6), e = 1 - Math.pow(1 - k, 3);
      bossGroup.position.y = -BOSS_SINK + BOSS_SINK * e;
      GS.shake = Math.max(GS.shake, 0.3 * (1 - k) + 0.1);
      boss.dirtT -= dt;
      if (boss.dirtT <= 0) {
        boss.dirtT = 0.05;
        const a = rand(0, Math.PI * 2);
        spawnParticles(tmp.set(BOSS_POS.x + Math.cos(a) * 5, 0.3, BOSS_POS.z + Math.sin(a) * 5), 0x5a4a6a, 3, 8);
      }
      if (k >= 1) { boss.state = 'fight'; boss.t = 0; bossCol.disabled = false; }
    }
    if (boss.state === 'dead') {
      bossGroup.position.y -= dt * 3;
      if (bossGroup.position.y < -BOSS_SINK) { bossGroup.visible = false; bossBarEl.style.display = 'none'; }
      return;
    }
    if (boss.mv) bossMoveTick(dt);

    // глаз и орбита
    eye.lookAt(car.pos.x, 1, car.pos.z);
    eye.position.y = 6.0 + 0.12 * Math.sin(GS.elapsed * 2.3);
    capstone.position.y = 7.15 + 0.22 * Math.sin(GS.elapsed * 1.4); capstone.rotation.y += dt * 0.5;
    for (const o of orbit) {
      o.a += o.sp * dt;
      o.m.position.set(Math.cos(o.a) * o.r, o.y + Math.sin(GS.elapsed * 2 + o.a) * 0.4, Math.sin(o.a) * o.r);
      o.m.rotation.x += dt * 2; o.m.rotation.y += dt * 3;
    }
    boss.flash -= dt;
    if (boss.flash > 0) bossMat.emissive.setRGB(0.55, 0.3, 0.55);
    else { const g = 0.02 + 0.012 * Math.sin(GS.elapsed * 3); bossMat.emissive.setRGB(g * 0.7, g * 0.15, g * 1.6); }

    if (boss.state !== 'fight') return;
    for (const tn of tentacles) updateTentacle(tn, dt);

    // хлёст щупальцем по кд — хост выбирает, кого бить
    if (!NET.client) bossVolleyTick(dt);
    if (!NET.client) bossLash(dt);
    bossThrowTick(dt);
  }
  function bossLash(dt) {                                // the host picks who gets whipped: the tentacle best placed for someone in reach
    boss.lashCd -= dt;
    if (boss.lashCd > 0) return;
    const tg = bossTgts(); boss.lashCd = 0.4;
    for (const T of tg.sort(() => Math.random() - 0.5)) {
      const toT = Math.atan2(T.pos.z - BOSS_POS.z, T.pos.x - BOSS_POS.x), dT = Math.hypot(T.pos.x - BOSS_POS.x, T.pos.z - BOSS_POS.z);
      let best = null, bd = Infinity;
      for (const tn of tentacles) { if (tn.state !== 'idle') continue; const da = Math.abs(Math.atan2(Math.sin(toT - tn.a0), Math.cos(toT - tn.a0))); if (da < bd) { bd = da; best = tn; } }
      if (best && dT < 5.1 + best.n * TENT_SP * 1.15 + 3) {
        best.state = 'wind'; best.t = 0; best.tp = T.pos; boss.lashCd = rand(1.3, 2.1) / Math.max(1, Math.sqrt(tg.length));
        SFX.play('tent_wind', tentRoot(best)); netEv({ t: 'bt', k: best.k, p: T.peer }); break;
      }
    }
  }

  // ---------- loop ----------
  const clock = new THREE.Timer();      // Clock is deprecated since r183
  const tmp = new THREE.Vector3();
  let roll = 0, pitch = 0, wheelSpin = 0, prevSpeed = 0;
  GS.hurtFlash = 0; GS.elapsed = 0; GS.shake = 0;
  const lastValid = new THREE.Vector3();
  const hpFill = document.getElementById('hpfill');

  // ---- spider locomotion (ported from the mech prototype): it sticks to pillars and rocks, walks up their sides and over the top ----
  const SPL = { L1: 1.15, L2: 1.6, bodyH: 0.95 }, SP_MG = 1.0;
  const SPD = { n: new THREE.Vector3(0, 1, 0), surf: null, fwd: new THREE.Vector3(0, 0, 1), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), p: new THREE.Vector3() };
  const spUp = new THREE.Vector3(), spO = new THREE.Vector3(), spDn = new THREE.Vector3(), spC = new THREE.Vector3(), spIn = new THREE.Vector3(), spF = new THREE.Vector3(),
        spA = new THREE.Vector3(), spT = new THREE.Vector3(), spW = new THREE.Vector3(), spV = new THREE.Vector3(), spQ = new THREE.Vector3(), spN = new THREE.Vector3(),
        spX = new THREE.Vector3(), spZ = new THREE.Vector3(), spM = new THREE.Matrix4(), spQt = new THREE.Quaternion(), spHit = new THREE.Vector3();
  const spRay = new THREE.Ray(), spBox = new THREE.Box3(), spBoxes = [];
  const climbable = o => (o.pillar || o.rock) && active(o);
  function spCast(o, d, maxD, out) {                     // ray against the ground plane and nearby climbable boxes
    let best = maxD, found = false;
    if (d.y < -1e-4) { const t = -o.y / d.y; if (t >= 0 && t < best) { best = t; found = true; out.copy(o).addScaledVector(d, t); } }
    spRay.set(o, d);
    for (const b of spBoxes) {
      const q = b.mesh.position; spBox.min.set(q.x - b.hx, 0, q.z - b.hz); spBox.max.set(q.x + b.hx, b.h, q.z + b.hz);
      if (spRay.intersectBox(spBox, spHit)) { const t = spHit.distanceTo(o); if (t < best) { best = t; found = true; out.copy(spHit); } }
    }
    return found;
  }
  function spSide(o, p, n, mg) {                         // nearest side face: snaps p onto it, returns its normal
    const q = o.mesh.position, dxm = p.x - (q.x - o.hx - mg), dxp = (q.x + o.hx + mg) - p.x, dzm = p.z - (q.z - o.hz - mg), dzp = (q.z + o.hz + mg) - p.z, m = Math.min(dxm, dxp, dzm, dzp);
    if (m === dxm) { p.x = q.x - o.hx; return n.set(-1, 0, 0); } if (m === dxp) { p.x = q.x + o.hx; return n.set(1, 0, 0); }
    if (m === dzm) { p.z = q.z - o.hz; return n.set(0, 0, -1); } p.z = q.z + o.hz; return n.set(0, 0, 1);
  }
  function spiderWrap() {                                // keep the body on its surface, rolling over box edges onto the next face
    const p = SPD.p, v = SPD.vel, b = SPD.surf;
    if (!b) {
      if (p.y > 0.3) for (const o of obstacles) {        // landed on top of something
        if (!climbable(o) || Math.abs(p.y - o.h) > 0.8) continue;
        const q = o.mesh.position; if (Math.abs(p.x - q.x) < o.hx + 0.3 && Math.abs(p.z - q.z) < o.hz + 0.3) { SPD.surf = o; SPD.n.set(0, 1, 0); p.y = o.h; return; }
      }
      p.y = 0;
      for (const o of obstacles) {
        if (!climbable(o)) continue;
        const q = o.mesh.position;
        if (Math.abs(p.x - q.x) < o.hx + SP_MG && Math.abs(p.z - q.z) < o.hz + SP_MG) {
          spQ.copy(p); const n = spSide(o, spQ, spN, SP_MG), into = -v.dot(n);
          if (into > 0.5) { p.copy(spQ); p.y = 0.02; v.addScaledVector(n, into); v.y += into; SPD.surf = o; SPD.n.copy(n); return; }   // walking into it: start climbing
          if (n.x) p.x = spQ.x + n.x * SP_MG; else p.z = spQ.z + n.z * SP_MG;                                                       // otherwise slide past
        }
      }
      return;
    }
    const q = b.mesh.position, min = { x: q.x - b.hx, z: q.z - b.hz }, max = { x: q.x + b.hx, y: b.h, z: q.z + b.hz }, n = SPD.n;
    let e;
    if (n.y > 0.5) {
      p.y = max.y;
      if (p.x > max.x) { e = p.x - max.x; p.x = max.x; p.y = max.y - e; n.set(1, 0, 0); v.y = -v.x; v.x = 0; }
      else if (p.x < min.x) { e = min.x - p.x; p.x = min.x; p.y = max.y - e; n.set(-1, 0, 0); v.y = v.x; v.x = 0; }
      else if (p.z > max.z) { e = p.z - max.z; p.z = max.z; p.y = max.y - e; n.set(0, 0, 1); v.y = -v.z; v.z = 0; }
      else if (p.z < min.z) { e = min.z - p.z; p.z = min.z; p.y = max.y - e; n.set(0, 0, -1); v.y = v.z; v.z = 0; }
      return;
    }
    const ax = n.x !== 0 ? 'x' : 'z', ot = ax === 'x' ? 'z' : 'x', sg = n[ax] > 0 ? 1 : -1, plane = sg > 0 ? max[ax] : min[ax];
    p[ax] = plane;
    if (p.y > max.y) { e = p.y - max.y; p.y = max.y; p[ax] = plane - sg * e; n.set(0, 1, 0); v[ax] = -sg * v.y; v.y = 0; }
    else if (p.y < 0) { e = -p.y; p.y = 0; p[ax] = plane + sg * e; SPD.surf = null; n.set(0, 1, 0); v[ax] = sg * -v.y; v.y = 0; }
    else if (p[ot] > max[ot]) { e = p[ot] - max[ot]; p[ot] = max[ot]; p[ax] = plane - sg * e; n.set(0, 0, 0); n[ot] = 1; v[ax] = -sg * v[ot]; v[ot] = 0; }
    else if (p[ot] < min[ot]) { e = min[ot] - p[ot]; p[ot] = min[ot]; p[ax] = plane - sg * e; n.set(0, 0, 0); n[ot] = -1; v[ax] = sg * v[ot]; v[ot] = 0; }
  }
  // the unicorn: a horse, not a car — bites into the ground, no drifting, stops short, backs up slowly
  // the buggy handles exactly like the unicorn, 10% quicker, and backs up almost as fast as it goes forward
  // the halo: hovers. Goes wherever you point (screen directions), picks up speed slowly and keeps gliding when you let go
  function haloDrive(dt, ctl, stick) {
    let dx = 0, dz = 0, mag = 0;
    if (stick) { stickWorld(touch.move.x, touch.move.y, tmp); const l = Math.hypot(tmp.x, tmp.z) || 1; dx = tmp.x / l; dz = tmp.z / l; mag = Math.min(1, touch.move.mag * 1.15); }
    else if (ctl) {
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      dx = r - f; dz = -r - f; const l = Math.hypot(dx, dz); if (l > 0) { dx /= l; dz /= l; mag = 1; }
    }
    if (!car.airborne) {                                 // goes where you point almost at once, drifts to a stop in about half a second
      const top = TUNE.maxSpeed * 1.05 * mag * towK(), q = 1 - Math.exp(-(mag ? 6.5 : 3.2) * dt);
      car.vel.x += (dx * top - car.vel.x) * q; car.vel.z += (dz * top - car.vel.z) * q;
      if (car.burrow !== 'up') car.vel.multiplyScalar(Math.max(0, 1 - 9 * dt));
    }
    const sp = Math.hypot(car.vel.x, car.vel.z);
    if (mag || sp > 3) {                                // the rings lean and swing round to where it is being pushed, lazily
      const want = mag ? Math.atan2(dx, dz) : Math.atan2(car.vel.x, car.vel.z), d = Math.atan2(Math.sin(want - car.heading), Math.cos(want - car.heading));
      car.heading += d * (1 - Math.exp(-9 * dt)); car.steer = THREE.MathUtils.clamp(d, -1, 1);
    } else car.steer = 0;
    car.speed = sp;
  }
  function spiderDrive(dt, ctl, stick) {                // runs straight where you point: screen-relative, no steering, almost no inertia
    let dx = 0, dz = 0, mag = 0;
    if (stick) { stickWorld(touch.move.x, touch.move.y, tmp); const l = Math.hypot(tmp.x, tmp.z) || 1; dx = tmp.x / l; dz = tmp.z / l; mag = Math.min(1, touch.move.mag * 1.15); }
    else if (ctl) {
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      dx = r - f; dz = -r - f; const l = Math.hypot(dx, dz); if (l > 0) { dx /= l; dz /= l; mag = 1; }
    }
    const n = SPD.n;
    if (SPD.surf && !active(SPD.surf)) { SPD.surf = null; n.set(0, 1, 0); if (car.y > 0.2) { car.airborne = true; car.vy = 0; } }   // the thing under us got smashed
    if (car.airborne) {
      SPD.surf = null; n.set(0, 1, 0); SPD.vel.set(car.vel.x, 0, car.vel.z);
      for (const o of obstacles) {                       // grab a wall mid-jump
        if (!climbable(o) || car.y > o.h - 0.15 || car.vy > 2) continue;
        const q = o.mesh.position;
        if (Math.abs(car.pos.x - q.x) < o.hx + 0.4 && Math.abs(car.pos.z - q.z) < o.hz + 0.4) {
          SPD.p.set(car.pos.x, car.y, car.pos.z); spSide(o, SPD.p, n, 0.4); car.pos.x = SPD.p.x; car.pos.z = SPD.p.z;
          SPD.surf = o; car.airborne = false; car.vy = 0; SPD.vel.set(0, 0, 0); car.vel.set(0, 0, 0); SFX.play('land', car.pos, { vol: 0.5 }); break;
        }
      }
    } else {
      const dn = dx * n.x + dz * n.z;
      spW.set(dx - n.x * dn, n.y < 0.5 ? -dn : 0, dz - n.z * dn);                // on a wall, pushing into it means "up"
      if (spW.lengthSq() > 1e-4) spW.normalize();
      SPD.vel.addScaledVector(n, -SPD.vel.dot(n));
      SPD.vel.lerp(spW.multiplyScalar(TUNE.maxSpeed * 0.85 * mag * towK() * (n.y < 0.5 ? 0.75 : 1)), 1 - Math.exp(-11 * dt));
      if (car.burrow !== 'up') SPD.vel.multiplyScalar(Math.max(0, 1 - 9 * dt));
      SPD.p.set(car.pos.x, car.y, car.pos.z).addScaledVector(SPD.vel, dt);
      spiderWrap();
      car.pos.x = SPD.p.x; car.pos.z = SPD.p.z; car.y = SPD.p.y; car.vel.set(SPD.vel.x, 0, SPD.vel.z);
    }
    car.speed = SPD.vel.length(); car.steer = 0;
    { const wall = !car.airborne && n.y < 0.5;            // scuttling up a wall shakes the passengers out: one as it mounts, then one a second while it climbs
      if (wall && !SPD.wasWall) { cartKick(4); cartSpill(1); SPD.wallT = 1; }
      else if (wall && car.speed > 3 && (SPD.wallT -= dt) <= 0) { SPD.wallT = 1; cartKick(3); cartSpill(1); }
      SPD.wasWall = wall; }
    // facing and orientation: up is the surface normal
    spV.copy(SPD.vel).addScaledVector(n, -SPD.vel.dot(n));
    if (spV.length() > 1) SPD.fwd.lerp(spV.normalize(), 1 - Math.exp(-12 * dt));
    SPD.fwd.addScaledVector(n, -SPD.fwd.dot(n)); if (SPD.fwd.lengthSq() < 1e-4) SPD.fwd.set(0, n.y < 0.5 ? 1 : 0, n.y < 0.5 ? 0 : 1); SPD.fwd.normalize();
    if (n.y > 0.5) car.heading = Math.atan2(SPD.fwd.x, SPD.fwd.z);
    spX.crossVectors(n, SPD.fwd).normalize(); spZ.crossVectors(spX, n);
    spM.makeBasis(spX, n, spZ); spQt.setFromRotationMatrix(spM);
    SPD.quat.slerp(spQt, 1 - Math.exp(-(car.airborne ? 5 : 12) * dt));
  }
  function update(dt) {
    GS.elapsed += dt;
    const ctl = car.alive && car.burrow === 'up';
    updateJump(dt);
    updateBurrow(dt);
    const stick = ctl && touch.move.mag > 0.18;             // touch: turn toward the stick, throttle once roughly facing it
    let stickTurn = 0;
    if (stick) {
      stickWorld(touch.move.x, touch.move.y, tmp);
      const want = Math.atan2(tmp.x, tmp.z);
      stickTurn = Math.atan2(Math.sin(want - car.heading), Math.cos(want - car.heading));
    }
    const up = ctl && (keys.KeyW || keys.ArrowUp || (stick && Math.abs(stickTurn) < 1.3)), down = ctl && (keys.KeyS || keys.ArrowDown);
    const left = ctl && (keys.KeyA || keys.ArrowLeft), right = ctl && (keys.KeyD || keys.ArrowRight);
    if (!car.alive) { car.deadTimer -= dt; if (car.deadTimer <= 0) respawn(); }
    else if (GS.elapsed - car.lastHurt > 3 && car.hp < car.maxHp) car.hp = Math.min(car.maxHp, car.hp + car.maxHp * 0.06 * dt);

    if (GS.ride === 'spider') spiderDrive(dt, ctl, stick); else if (GS.ride === 'halo') haloDrive(dt, ctl, stick); else {
    const RT = GS.ride === 'unicorn' ? UNI : BUG;
    // throttle / brake
    if (up) car.speed += (car.speed < 0 ? RT.brake : RT.accel) * dt;
    else if (down) car.speed -= (car.speed > 0 ? RT.brake : RT.reverseAccel) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), RT.coast * dt);
    car.speed = THREE.MathUtils.clamp(car.speed, RT.maxReverse * towK(), RT.maxSpeed * towK() * (stick ? Math.max(0.45, touch.move.mag) : 1));   // analog throttle
    if (car.burrow !== 'up') { const f = Math.max(0, 1 - 9 * dt); car.speed *= f; car.vel.multiplyScalar(f); }

    // steering — eased, scaled by speed so it doesn't spin in place
    let steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
    let cursorTurn = 0;
    const turnMode = stick ? 'cursor' : car.mode;
    if (stick) { cursorTurn = stickTurn; steerTarget = THREE.MathUtils.clamp(cursorTurn * 2, -1, 1); }
    else if (car.mode === 'cursor' && ctl && Math.hypot(groundAim.x - car.pos.x, groundAim.z - car.pos.z) > 1.5) {
      const want = Math.atan2(groundAim.x - car.pos.x, groundAim.z - car.pos.z);
      cursorTurn = Math.atan2(Math.sin(want - car.heading), Math.cos(want - car.heading));
      steerTarget = THREE.MathUtils.clamp(cursorTurn * 2, -1, 1);   // для колёс и крена
    }
    car.steer += (steerTarget - car.steer) * Math.min(1, (turnMode !== 'car' ? RT.spinSteerRate : RT.steerRate) * dt);
    if (turnMode === 'cursor') {
      // разворачивается к курсору: быстро издалека, плавно доводит у цели
      const step = RT.spinRate * 1.2 * dt;
      car.heading += Math.sign(cursorTurn) * Math.min(Math.abs(cursorTurn), Math.max(step * Math.min(1, Math.abs(cursorTurn) * 3), step * 0.25));
    } else if (turnMode === 'human') {
      // поворот на месте с постоянной скоростью, не зависит ни от скорости, ни от заднего хода
      car.heading += car.steer * RT.spinRate * dt;
    } else {
      const speedFactor = THREE.MathUtils.clamp(car.speed / 7, -1, 1);
      const highSpeedDamp = 1 - 0.35 * Math.min(1, Math.abs(car.speed) / RT.maxSpeed);
      car.heading += car.steer * RT.turnRate * speedFactor * highSpeedDamp * dt;
    }

    }
    // velocity chases the heading → light drift
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const k = car.airborne || GS.ride === 'spider' || GS.ride === 'halo' ? 0 : Math.min(1, (GS.ride === 'unicorn' ? UNI.grip : BUG.grip) * dt);   // в воздухе летим по инерции
    car.vel.x += (fx * car.speed - car.vel.x) * k;
    car.vel.z += (fz * car.speed - car.vel.z) * k;
    car.vel.y = 0; car.pos.y = 0;                         // height lives in car.y; the position vector stays on the ground plane
    if (!(GS.ride === 'spider' && !car.airborne)) car.pos.addScaledVector(car.vel, GS.ride === 'unicorn' && !car.airborne ? dt * (1 + 0.16 * Math.sin(GS.ridePhase * 4.8)) : dt);   // a gallop surges with every stride

    // collisions
    const crawler = GS.ride === 'spider';
    for (const o of obstacles) if (active(o) && (o.wall || car.y < o.h - 0.2) && !(crawler && (o.pillar || o.rock))) resolveCarVsBox(o);
    if (crawler) {                                       // the spider walks over pillars and rocks instead of ramming them
      let gh = 0;
      for (const o of obstacles) if ((o.pillar || o.rock) && active(o) && Math.abs(o.mesh.position.x - car.pos.x) < o.hx + 0.5 && Math.abs(o.mesh.position.z - car.pos.z) < o.hz + 0.5) gh = Math.max(gh, o.h);
      car.ground = gh;
    } else car.ground = 0;   // ящики можно перепрыгнуть, стены — нет
    if (inWorld(car.pos.x, car.pos.z)) lastValid.copy(car.pos);    // страховка, если всё-таки вылетели за стены
    else { car.pos.copy(lastValid); car.vel.multiplyScalar(-0.3); car.speed *= 0.5; }

    // car visuals
    carGroup.position.set(car.pos.x, car.y - car.depth * BURY_DEPTH, car.pos.z);   // высота: прыжок минус закапывание
    carGroup.rotation.y = car.heading;
    if (crawler) carGroup.quaternion.copy(SPD.quat);
    const accelNow = (car.speed - prevSpeed) / Math.max(dt, 1e-4); prevSpeed = car.speed;
    const lateral = car.vel.x * fz - car.vel.z * fx; // sideways slip
    updateSkid(dt, GS.ride === 'buggy' ? lateral : 0);
    roll += (THREE.MathUtils.clamp(-car.steer * Math.abs(car.speed) * 0.006 + lateral * 0.02, -0.12, 0.12) - roll) * Math.min(1, 8 * dt);
    pitch += (THREE.MathUtils.clamp(-accelNow * 0.002, -0.06, 0.06) - pitch) * Math.min(1, 6 * dt);
    body.rotation.z = roll; body.rotation.x = pitch + Math.sin(car.depth * Math.PI) * 0.45 - THREE.MathUtils.clamp(car.vy * 0.025, -0.3, 0.3); // ныряет носом; в прыжке задирает/клюёт
    wheelSpin += car.speed * dt / 0.48;
    for (const w of wheels) {
      w.mesh.rotation.x = wheelSpin;
      w.pivot.rotation.y = w.front ? car.steer * 0.5 : 0;
    }

    // shooting
    GS.fireCooldown -= dt;
    let autoFire = false;
    if (GS.autoTarget) {                                   // shoot once the turret is roughly on target
      const tp = autoTargetPos(GS.autoTarget), want = Math.atan2(tp.x - car.pos.x, tp.z - car.pos.z) - car.heading - turret.rotation.y;
      autoFire = Math.abs(Math.atan2(Math.sin(want), Math.cos(want))) < 0.22;
    }
    if (ctl && (GS.mouseFire || touch.aim.mag > 0.3 || autoFire) && GS.fireCooldown <= 0) {
      fire(); GS.fireCooldown = 1 / (FIRE_RATE * (weapons.spread ? W_STATS.spread.rate[weapons.spread - 1] : 1));
    }
    GS.muzzleTimer -= dt;
    muzzle.visible = GS.muzzleTimer > 0;
    if (muzzle.visible) muzzle.scale.setScalar(rand(0.7, 1.3));

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt;
      b.m.position.addScaledVector(b.v, dt);
      if (b.spin) { b.m.rotation.x += dt * 16; b.m.rotation.z += dt * 11; }
      const bp = b.m.position;
      let hit = b.life <= 0 || !inWorld(bp.x, bp.z);
      if (!hit && bp.y < 0.05) { hit = true; spawnParticles(bp.setY(0.1), 0x8a8a78, 2, 3); SFX.play('hit_dirt', bp); }
      if (!hit) for (const e of enemies) {
        if (e.dead || e.carried) continue;
        if (Math.hypot(bp.x - e.pos.x, bp.z - e.pos.z) < e.r + 0.25 && bp.y < e.s + e.hop.position.y + 0.6) {
          hit = true;
          spawnParticles(bp, 0xff6a6a, 3, 5); flash(bp, 0xff7050, 1.8, 0.12, 2.5, false); SFX.play('hit_flesh', bp, { vol: 0.6 });
          hitEnemy(e, tmp.copy(b.v).setY(0).normalize(), b.dmg || 1);
          break;
        }
      }
      if (!hit) for (const m of swarm) {
        if (m.dead || (m.rig && RIG.tame) || Math.hypot(bp.x - m.pos.x, bp.z - m.pos.z) > m.r + 0.35 || bp.y > critterTop(m) + 0.6) continue;
        hit = true;
        spawnParticles(bp, m.art.color, 3, 5); SFX.play('hit_flesh', bp, { vol: 0.5, rate: 1.2 });
        hitCritter(m, b.dmg || 1, tmp.copy(b.v).setY(0).normalize(), 2.5);
        break;
      }
      if (!hit) for (const o of obstacles) {
        if (!active(o)) continue;
        const p = o.mesh.position;
        if (Math.abs(bp.x - p.x) < o.hx + 0.15 && Math.abs(bp.z - p.z) < o.hz + 0.15 && bp.y < o.h + 0.2) {
          hit = true;
          spawnParticles(bp, o.crate ? 0xffc06a : 0xbfc3c9, 3, 5); flash(bp, 0xffc070, 1.5, 0.1, 2.5, false);
          SFX.play(o.crate ? 'hit_wood' : o.boss ? 'hit_boss' : 'hit_stone', bp);
          if (o.crate) damageCrate(o, b.dmg || 1);
          else if (o.boss) bossDamage(b.dmg || 1);
          break;
        }
      }
      if (hit) { scene.remove(b.m); bullets.splice(i, 1); }
    }

    for (const o of obstacles) if (o.crate && o.mesh.visible) {
      o.flash -= dt;
      o.mesh.material = o.flash > 0 ? crateHitMat : crateMat;
    }
    for (let i = respawnQueue.length - 1; i >= 0; i--) {
      const r = respawnQueue[i];
      r.t -= dt;
      if (r.t <= 0) {
        const [x, z] = r.o.room ? roomSpot(r.o.hx) : crateSpot(r.o);
        r.o.mesh.position.set(x, r.o.h / 2, z); r.o.mesh.rotation.set(0, 0, 0); r.o.hp = 3; r.o.mesh.visible = true;
        respawnQueue.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.v.y -= 25 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.15) { p.m.position.y = 0.15; p.v.y *= -0.3; p.v.x *= 0.7; p.v.z *= 0.7; }
      p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt;
      p.m.scale.multiplyScalar(p.life < 0.3 ? 0.9 : 1);
      if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); }
    }

    updateAim(dt);
    updateFx(dt);
    updateHeadlight();
    updateBoss(dt);
    updateShieldBar();
    updatePickups(dt); updateLoot(dt); updateWbMarks(); updatePedestals(dt); updateBombs(dt); updateLossFx(dt); updateDomes(dt); updateDecoys(dt); updateCubes(dt); updateLandFx(dt); updateUlts(dt); updateTrails(dt); updateAbHud();
    updateDrill(dt);
    updateWeapons(dt);
    updateGrab(dt);
    updateEnemies(dt);
    updateSwarm(dt);
    updateChunks(dt);
    updateChubs(dt);
    updateAltars(dt);
    updateAngel(dt);
    updateRide(dt);
    if (GS.ride === 'unicorn') updateHorn();
    updateNet(dt);
    updatePhases(dt); updateHints(dt); updateMinimap(dt);
    updateDiag();

    GS.hurtFlash -= dt;
    paint.emissive.setHex(GS.hurtFlash > 0 ? 0xaa1111 : 0x000000);
    const hpK = car.hp / car.maxHp * 100;
    hpFill.style.width = hpK + '%';
    hpFill.style.background = hpK > 55 ? '#5fd36a' : hpK > 25 ? '#f0b43c' : '#e5484d';

    // camera: fixed iso angle, smooth follow + small look-ahead along velocity
    tmp.copy(car.pos).addScaledVector(car.vel, 0.35);
    camFocus.lerp(tmp, 1 - Math.exp(-5 * dt));
    camera.position.copy(camFocus).add(ISO_OFFSET);
    camera.lookAt(camFocus);
    GS.shake = Math.max(0, GS.shake - dt * 2.5);
    if (GS.shake > 0) camera.position.add(tmp.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(GS.shake * 0.6));

    sun.position.copy(camFocus).add(SUN_OFFSET);
    sun.target.position.copy(camFocus);

    spdEl.textContent = Math.round(Math.abs(car.speed) * 3.6 * 1.5);
    // engine pitch follows speed, filter opens with throttle; wind outside, drone in the boss room
    {
      const thr = up || down ? 1 : 0, spdK = Math.min(1, Math.abs(car.speed) / TUNE.maxSpeed);
      const live = car.alive && car.depth < 0.6, vK = Math.min(1, Math.hypot(car.vel.x, car.vel.z) / TUNE.maxSpeed);
      SFX.loop('hum', GS.ride === 'halo' && live ? 0.05 + 0.04 * vK : 0, 1);
      SFX.loop('servo', GS.ride === 'spider' && live ? 0.11 * vK : 0, 0.8 + 0.5 * vK);
      SFX.loop('engine', GS.ride === 'buggy' && live ? 0.16 + 0.2 * thr + 0.12 * spdK : 0, 0.72 + 1.3 * spdK + 0.12 * thr, 450 + 2300 * Math.min(1, 0.35 * thr + spdK));
      const inBoss = inRoom(car.pos.x, car.pos.z);
      SFX.loop('wind', (inBoss ? 0.05 : 0.13) + (GS.ride === 'halo' ? 0.05 * vK : 0), 1);
      SFX.loop('drone', inBoss && (boss.state === 'fight' || boss.state === 'emerging') ? 0.32 : 0, 1);
      SFX.setRoom(inBoss ? 0.12 : 0);
    }
  }

  // drop render resolution if the machine can't hold ~40 fps (only ever goes down, so it can't oscillate)
  let perfT = 0, perfN = 0, warmup = 30;
  function adaptQuality(raw) { if (HX) return;      // tests: the picture must not change with the machine's speed
    if (warmup > 0) { warmup--; return; }           // shader compiles make the first frames slow
    if (raw > 1) return;                            // tab was in the background
    perfT += raw; perfN++;
    if (perfT < 1 || perfN < 3) return;
    const avg = perfT / perfN; perfT = 0; perfN = 0;
    const floor = COARSE ? 0.5 : 0.6;
    if (avg > 1 / 45 && GS.PR > floor) {
      GS.PR = Math.max(floor, GS.PR * 0.8);
      renderer.setPixelRatio(GS.PR);
      if (GS.composer) GS.composer.setPixelRatio(GS.PR);
      if (GS.fxaaPass) GS.fxaaPass.uniforms.resolution.value.set(1 / (innerWidth * GS.PR), 1 / (innerHeight * GS.PR));
    } else if (avg > 1 / 38 && GS.PR <= floor) {             // resolution is at the floor and it still drags: shed effects
      if (GS.shadowEvery < 3) GS.shadowEvery = 3;
      else if (GS.fxaaPass && GS.fxaaPass.enabled) GS.fxaaPass.enabled = false;
      else if (GS.bloomPass && GS.bloomPass.enabled) GS.bloomPass.enabled = false;
    }
  }

  // ---------- multiplayer over the artifact's room channel: lobby list on the start screen, other players as ghost rides ----------
  // Rides travel in presence. Monsters and chubziks are simulated by the lobby host and mirrored to the others; cubes and the boss stay per player.
  const NET = { room: null, on: false, game: null, hostNick: '', nick: '', sel: null, sendT: 0, fireSeq: 0, remotes: new Map(), shots: [] };
  const mpState = document.getElementById('mpState'), mpList = document.getElementById('mpList'), nickEl = document.getElementById('nick'), netEl = document.getElementById('net');
  const cleanNick = v => String(v == null ? '' : v).replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12);
  try { nickEl.value = cleanNick(localStorage.getItem('carproto.nick')) || ''; } catch (e) {}
  if (!nickEl.value) nickEl.value = 'Driver' + Math.floor(100 + trueRandom() * 900);
  const num = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);     // presence is untrusted input
  const VER = '38.' + DATA_HASH;                          // players on different builds must not share a lobby: their monsters would not match. The data hash keeps out players whose combat numbers differ (ADR-0006)
  function netGames(peers) {
    const g = {};
    for (const p of peers) { const pr = p.presence || {}; if (typeof pr.game !== 'string' || !/^g[a-z0-9]{1,10}$/.test(pr.game)) continue;
      (g[pr.game] = g[pr.game] || { id: pr.game, host: cleanNick(pr.hostNick) || '?', n: 0, old: false }).n++; if (pr.v !== VER) g[pr.game].old = true; }
    return Object.values(g);
  }
  const hostBtn = document.getElementById('hostBtn');
  function renderLobby() {
    if (!startEl.isConnected) return;
    if (!NET.room) { hostBtn.style.display = 'none'; return; }
    hostBtn.style.display = '';
    const peers = NET.room.peers(), games = netGames(peers);
    const sig = games.map(g => g.id + g.host + g.n + g.old).join('|') + '#' + peers.length;
    if (sig === NET.sig) return; NET.sig = sig;               // only touch the DOM when the list really changed, so taps land
    mpState.textContent = `Online now: ${Math.max(1, peers.length)}. ` + (games.length ? 'Join a lobby or host your own:' : 'No lobbies yet — host one and the others will see it here.');
    mpList.textContent = '';
    for (const g of games) {
      const b = document.createElement('button'); b.textContent = `${g.host}'s lobby · ${g.n} in`;
      if (g.old) { b.disabled = true; b.textContent = `${g.host}'s lobby · other game version — everyone reload the page`; }
      b.addEventListener('click', () => toComic(g.id));
      mpList.appendChild(b);
    }
  }
  renderLobby();
  (async () => {
    try {
      const r = window.claude ? await window.claude.use('room') : await p2pRoom({ logError });      // src/net/p2p-room.ts. Inside Claude: its room channel; anywhere else: plain WebRTC
      if (!r) { mpState.textContent = 'Multiplayer is off on this device: the page must be open in Claude by a signed-in member of the owner\'s organization or an invited guest (a plain public link does not connect).'; return; }
      NET.room = r;
      if (r.sendEv) { NET.tx = (d, to) => r.sendEv(d, to); r.onEv(netOnEv); }                   // WebRTC: direct messages
      else if (typeof r.emit === 'function') {                                                    // Claude room: one shared topic, addressed inside the payload
        NET.tx = (d, to) => { r.emit('ev', to ? { ...d, to } : d).catch(() => {}); };
        r.on('ev', m => { if (m && !(m.isMe && m.sameTab) && m.data && typeof m.data === 'object' && (!m.data.to || m.data.to === netMe())) netOnEv(m.data, m.peer); }, () => {});
      }
      r.onPeers(() => renderLobby(), () => { NET.room = null; NET.on = false; mpState.textContent = 'Multiplayer: the connection was refused for this viewer.'; renderLobby(); });
      renderLobby();
    } catch (e) { mpState.textContent = 'Multiplayer: could not start the network module.'; }
  })();
  function netStart(mode) {                              // 'solo', 'host', or the id of a lobby to join; the lobby is announced right away
    NET.nick = cleanNick(nickEl.value) || 'Driver'; try { localStorage.setItem('carproto.nick', NET.nick); } catch (e) {}
    NET.game = null;
    if (!NET.room || mode === 'solo') return;
    const g = mode !== 'host' && netGames(NET.room.peers()).find(x => x.id === mode && !x.old);
    NET.game = g ? g.id : 'g' + trueRandom().toString(36).slice(2, 8); NET.hostNick = g ? g.host : NET.nick;
    NET.isHost = !g;
    NET.room.presence({ game: NET.game, hostNick: NET.hostNick, nick: NET.nick, a: 0, hp: NET.isHost ? 1 : 0, v: VER }).catch(() => {});
  }
  if (window.__skipLobby) toComic('solo');
  // ---- shared world: who broke what, altar progress, chubzik hand-offs. The lobby host answers newcomers with the full state ----
  const netMe = () => { if (!NET.me && NET.room) { const p = NET.room.peers().find(q => q.isMe && q.sameTab); if (p) NET.me = p.peer; } return NET.me; };
  function netEv(d, to) { if (NET.on && NET.game && NET.tx) NET.tx({ ...d, g: NET.game }, to); }
  const obAt = i => (Number.isInteger(i) && i >= 0 && i < obstacles.length ? obstacles[i] : null);
  function netWorld() {                                  // everything a newcomer needs to match this world
    const sm = [], cr = [];
    obstacles.forEach((o, i) => { if ((o.pillar || o.rock) && !o.mesh.visible && !o.dormant) sm.push(i); if (o.crate && !o.room) cr.push([i, r1(o.mesh.position.x), r1(o.mesh.position.z), o.mesh.visible ? 1 : 0, o.rc || 0]); });
    return { t: 'sync', sm, cr, al: altars.map(A => A.n), bd: Math.round(boss.dealt), bk: boss.state === 'dead' ? 1 : 0, go: GS.gateOpen ? 1 : 0, bst: boss.state === 'fight' || boss.state === 'emerging' || boss.state === 'flee' ? 1 : 0, bp: [boss.ph, r1(boss.mv ? boss.mv.tx : BOSS_POS.x), r1(boss.mv ? boss.mv.tz : BOSS_POS.z)], pk: pickups.filter(p => !p.own).slice(0, 30).map(p => [p.id, p.type, r1(p.x), r1(p.z)]), lt: loot.slice(0, 120).map(L => [L.id, L.gem ? 1 : 0, r1(L.x), r1(L.z)]), aw: altars.map(A => A.awake ? r1(A.spawnT) : -1), bn: tentacles.map(t => t.n), ph: [PH.i, r1(PH.brk), PH.clr, PH.wv, PH.hellN, r1(PH.t), PH.gate ? 1 : 0], fa: altars.map(A => A.found ? 1 : 0), fr: rocks.filter(R => R.found).map(R => obstacles.indexOf(R)) };
  }
  const netGamePeers = () => NET.room.peers().filter(p => (p.presence || {}).game === NET.game && (p.presence || {}).v === VER);
  function netHostPeer() { return netGamePeers().filter(p => (p.presence || {}).hp === 1).map(p => String(p.peer)).sort()[0] || null; }
  function netAmHost() { const h = netHostPeer(); return h ? h === String(netMe()) : !NET.client; }
  function netRole() {                                   // the lobby host runs monsters and chubziks; if it leaves, the lowest peer id takes over
    const h = netHostPeer(), me = String(netMe());
    if (h) { NET.noHost = 0; NET.hostPeer = h === me ? null : h;
      if (h === me) { if (NET.client) netAdopt(); }
      else { if (!NET.client) netPurge(); NET.client = true; NET.isHost = false; } }
    else if ((NET.noHost = (NET.noHost || 0) + 1) > 6 && NET.client && netGamePeers().map(p => String(p.peer)).sort()[0] === me) netAdopt();
  }
  const rockStub = (x, z) => nearestRock(x, z) || { mesh: { position: new THREE.Vector3(x, 0, z), visible: true }, r: 3, h: 2.5, top: 2 };
  function netPurge() {                                  // joining someone's lobby: their monsters and chubziks replace mine
    netLog('became a guest: dropped my own monsters, mirroring the host');
    DG.lastSw = performance.now(); DG.gap = false;
    for (const m of swarm) { m.dead = true; scene.remove(m.sprite, m.shadow); if (m.rig) rigBreak(m, true); } swarm.length = 0; swById.clear();
    for (const g of globs) scene.remove(g.g, g.ring); globs.length = 0;
    for (let i = chubs.length - 1; i >= 0; i--) { const c = chubs[i]; if (c.state !== 'cart') { c.dead = true; scene.remove(c.sprite, c.shadow); chubs.splice(i, 1); } }
    GS.chubInit = true; waves.pending = false; NET.chMir = new Map();
  }
  function netAdopt() {                                  // the host left and I am next in line: the mirrors become mine to simulate
    netLog('host is gone: I took over the monsters (' + swarm.length + ') and chubziks');
    for (const m of swarm) { GS.swId = Math.max(GS.swId, m.id); if (m.net) { m.net = false; m.think = Math.random() * 0.3; m.cd = 0.5; } }
    for (const c of chubs) { if (!c.net) continue; c.net = false; c.id = ++GS.chubId; c.rock = c.home = rockStub(c.pos.x, c.pos.z);
      if (c.fl & 2 && c.rock.mesh.visible && Math.hypot(c.rock.mesh.position.x - c.pos.x, c.rock.mesh.position.z - c.pos.z) < c.rock.r + 1) c.state = 'perch'; else { c.pos.y = 0; c.state = 'roam'; c.goal.copy(c.pos); c.t = 0; } }
    NET.client = false; NET.isHost = true; NET.hostPeer = null; NET.chMir = new Map(); waves.t = Math.max(waves.t, 10);
    GS.wbSpawned = swarm.some(m => m.wb && !m.dead);      // the bosses were the old host's: carry on topping them up
  }
  function netPick(m) {                                  // host: each monster goes for the nearest player
    if (NET.client || !NET.remotes.size) return null;
    let best = null, bd = carSeen() ? Math.hypot(car.pos.x - m.pos.x, car.pos.z - m.pos.z) : 1e9;
    for (const R of NET.remotes.values()) if (R.up && R.tc) { const d = Math.hypot(R.pos.x - m.pos.x, R.pos.z - m.pos.z); if (d < bd) { bd = d; best = R; } }
    return best;
  }
  function waveTargets() {                              // players a wave could be sent at: up and outside the boss room
    const a = []; if (carSeen() && (GS.gateOpen || !inRoom(car.pos.x, car.pos.z))) a.push(car.pos);
    if (NET.on && NET.game && !NET.client) for (const R of NET.remotes.values()) if (R.up && (GS.gateOpen || !inRoom(R.pos.x, R.pos.z))) a.push(R.pos);
    return a;
  }
  function netAnyPlayer() { const a = waveTargets(); return a.length ? a[Math.floor(Math.random() * a.length)] : car.pos; }
  function netSnap() {                                   // host -> everyone: where every monster and loose chubzik is
    const q = NET.q = (NET.q || 0) + 1;
    const chunks = (rows, per, t) => { const n = Math.max(1, Math.ceil(rows.length / per)); for (let c = 0; c < n; c++) netEv({ t, q, c, n, a: rows.slice(c * per, c * per + per) }); };
    const sw = []; for (const m of swarm) if (!m.dead) sw.push([m.id, SW_KEYS.indexOf(m.kind) * 3 + m.v, r1(m.pos.x), r1(m.pos.z), (m.flash > 0 ? 1 : 0) | (m.mini ? 2 : 0) | (m.gate ? 4 : 0) | (m.stun > 0 ? 8 : 0) | (m.dig > 0 ? 16 : 0) | (m.wb ? 32 : 0) | (m.rig ? 64 : 0) | (m.guard ? 128 : 0) | (m.wbLoot ? 256 : 0)]);
    chunks(sw, 60, 'sw');
    const en = []; enemies.forEach((e, i) => en.push([i, r1(e.pos.x), r1(e.pos.z), r2(e.yaw), (e.awake ? 1 : 0) | (e.dead ? 2 : 0) | (e.flash > 0 ? 4 : 0) | (e.charge > 0 ? 8 : 0) | (e.carried ? 16 : 0)]));
    netEv({ t: 'en', a: en });
    if (q % 2) return;
    const ch = []; for (const c of chubs) if (!c.dead && c.state !== 'cart') ch.push([c.id, r1(c.pos.x), r1(c.pos.z), r1(c.pos.y), (c.state === 'flee' || c.state === 'dazed' || c.state === 'tocar' || (c.state === 'arc' && c.next === 'dazed') ? 1 : 0) | (c.state === 'perch' ? 2 : 0)]);
    chunks(ch, 70, 'ch');
  }
  function netMirror(d, from) {
    if (!NET.client || (NET.hostPeer && String(from) !== NET.hostPeer) || !Array.isArray(d.a)) return;
    DG.rx++; if (d.t === 'sw') DG.lastSw = performance.now();
    const q = num(d.q, 0, 1e9), G = NET.got || (NET.got = {}), gt = G[d.t] && G[d.t].q === q ? G[d.t] : (G[d.t] = { q, c: new Set() });
    gt.c.add(d.c); const last = gt.c.size >= num(d.n, 1, 99) && !gt.done; if (last) gt.done = true;      // prune only when every chunk of this snapshot has arrived
    if (d.t === 'sw') {
      for (const e of d.a.slice(0, 80)) {
        if (!Array.isArray(e) || !Number.isInteger(e[0])) continue;
        const kind = SW_KEYS[Math.floor(num(e[1], 0, 99) / 3)] || 'gremlin', x = num(e[2], -ARENA - 50, ARENA + 50), z = num(e[3], -ARENA - 50, ARENA + 50);
        let m = swById.get(e[0]);
        if (!m || m.dead) { if (swarm.length > SW_CAP + 60) continue; m = spawnCritter(kind, x, z, Math.floor(num(e[1], 0, 99)) % 3, e[0]); m.net = true; if (e[4] & 16) digOut(m); if (e[4] & 2) makeMini(m, e[4] & 4); if (e[4] & 32) { makeWanderer(m); if (e[4] & 256) m.wbLoot = true; } if (e[4] & 64) makeRig(m); if (e[4] & 128) m.guard = true; if (e[4] & 4) GS.gateSpawned = true; }
        m.tx = x; m.tz = z; m.q = q; m.seenT = GS.elapsed; if ((e[4] & 1) && m.flash <= 0) m.flash = 0.1; if (e[4] & 8) m.stunVis = Math.max(m.stunVis || 0, 0.3);
      }
      for (const m of swarm) if (m.net && !m.dead && (last ? m.q !== q : GS.elapsed - m.seenT > 3)) {             // not in the host's list any more: it died
        m.dead = true; scene.remove(m.sprite, m.shadow);
        if (Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z) < 60) {
          const p = tmp.set(m.pos.x, (m.K.fly || 0) + m.K.size * 0.4, m.pos.z);
          spawnParticles(p, m.art.color, m.K.heavy ? 18 : 9, m.K.heavy ? 10 : 7); flash(p, m.art.color, m.K.heavy ? 6 : 3, 0.18, 1.6, false); SFX.play('pop', p, { rate: m.K.heavy ? 0.7 : 0.9 + Math.random() * 0.3 });
        }
        if (GS.elapsed - (m.myHit || -9) < 1.2) { GS.enemyKills++; ekillsEl.textContent = GS.enemyKills; crewKill(false); myKill(m.pos.x, m.pos.z, 1); }
      }
    } else if (!angel.on) {
      const M = NET.chMir || (NET.chMir = new Map());
      for (const e of d.a.slice(0, 90)) {
        if (!Array.isArray(e) || !Number.isInteger(e[0])) continue;
        const x = num(e[1], -ARENA, ARENA), z = num(e[2], -ARENA, ARENA), y = num(e[3], 0, 40);
        let c = M.get(e[0]);
        if (!c || c.dead) { if (M.size > 400) continue; c = spawnChub(rockStub(x, z), false); c.net = true; c.state = 'net'; c.tp = new THREE.Vector3(); c.pos.set(x, y, z); M.set(e[0], c); }
        c.tp.set(x, y, z); c.q = q; c.fl = num(e[4], 0, 3);
      }
      if (last) for (const [id, c] of M) if (c.q !== q) { c.dead = true; scene.remove(c.sprite, c.shadow); M.delete(id); }
    }
  }
  function netOnEv(d, from) {
    if (!NET.on || d.g !== NET.game) return;
    NET.applying = true;
    try {
      if (d.t === 'smash') { const o = obAt(d.i); if (o && (o.pillar || o.rock) && o.mesh.visible) smashPillar(o, tmp2net.set(num(d.vx, -40, 40), 0, num(d.vz, -40, 40))); }
      else if (d.t === 'crate') { const o = obAt(d.i); if (o && o.crate && !o.room && o.mesh.visible) crateRemote(o); }
      else if (d.t === 'altar') { const A = altars[d.k]; if (A && Number.isInteger(d.n) && d.n > A.n) { A.n = Math.min(ALTAR_NEED, d.n); A.pulse = 1; altarApply(A); } }
      else if (d.t === 'chub') { chubGift(); }
      else if (d.t === 'wf') { let R = null; for (const q of NET.remotes.values()) if (String(q.peer) === String(from)) R = q;
        const L = Math.round(num(d.l, 0, 4));
        if (R && R.up && Math.hypot(R.pos.x - car.pos.x, R.pos.z - car.pos.z) < 110) {
          if (d.k === 'beam' && (R.ride === 'halo' || R.ride === 'unicorn')) fireBeams({ pos: R.pos, h: () => R.h, y: () => R.pos.y, alive: () => R.up && NET.remotes.get(R.peer) === R }, R.ride, L, true);
          else if (d.k === 'web' && Array.isArray(d.s)) { const sp = []; for (let i = 0; i + 1 < d.s.length && sp.length < 6; i += 2) sp.push(new THREE.Vector3(num(d.s[i], -400, 400), 0, num(d.s[i + 1], -400, 400)));
            launchWebs(new THREE.Vector3(R.pos.x, 2.6 + R.pos.y, R.pos.z), sp, WEB_R[L], true); }
          else if (d.k === 'mortar') fireMortar(new THREE.Vector3(num(d.x, -400, 400), 0, num(d.z, -400, 400)), L, new THREE.Vector3(R.pos.x, 2.5 + R.pos.y, R.pos.z), true);
          else if (d.k === 'nova') { const n = W_STATS.nova.n[L], ph = Math.random() * 6.283;
            for (let i = 0; i < n; i++) { const a = ph + i / n * 6.283, m = new THREE.Mesh(bulletGeo, novaMat); m.position.set(R.pos.x + Math.sin(a) * 1.6, 1 + R.pos.y, R.pos.z + Math.cos(a) * 1.6); m.rotation.y = a; scene.add(m);
              NET.shots.push({ m, v: new THREE.Vector3(Math.sin(a) * 42, 0, Math.cos(a) * 42), life: 0.55 }); } }
        } }
      else if (d.t === 'rock') { if (NET.client) rockGrow(obAt(d.i)); }
      else if (d.t === 'gate') { if (NET.client) openGate(); }
      else if (d.t === 'ph') { if (NET.client && Number.isInteger(d.i) && d.i >= 0 && d.i < PHASES.length && d.i !== PH.i) phEnter(d.i, num(d.b, 0, 60)); }
      else if (d.t === 'fd') { if (NET.client && (d.k === 'a' || d.k === 'r' || d.k === 'g') && Number.isInteger(d.i)) phFind(d.k, d.i); }
      else if (d.t === 'pk') { if (typeof d.id === 'string' && d.id.length < 40 && typeof d.ty === 'string' && ICONS[d.ty] && !pickups.some(p => p.id === d.id) && pickups.length < 40)
        spawnPickup(d.ty, new THREE.Vector3(num(d.x, -400, 400), 0, num(d.z, -400, 400)), d.id, true); }
      else if (d.t === 'pkx') { if (typeof d.id === 'string') pickupGone(d.id); }
      else if (d.t === 'bs') { if (NET.client) { if (d.s === 'e' && boss.state === 'idle') bossEmerge(); else if (d.s === 'i' && boss.state !== 'dead') resetBoss(); else if (d.s === 'f' && boss.state !== 'dead') bossFlee(); } }
      else if (d.t === 'bt') { const tn = tentacles[d.k]; if (NET.client && tn && boss.state === 'fight' && tn.state === 'idle') { tn.state = 'wind'; tn.t = 0; tn.tp = netPeerPos(d.p); SFX.play('tent_wind', tentRoot(tn)); } }
      else if (d.t === 'bq') { if (NET.client && boss.state === 'fight' && quakes.length < 12) bossQuake(num(d.x, -400, 400), num(d.z, -400, 400), num(d.r, 4, 40), num(d.d, 1, 40, 26)); }
      else if (d.t === 'bv') { if (NET.client && boss.state === 'fight' && lavas.length < 2) bossLava(num(d.x, -400, 400), num(d.z, -400, 400), num(d.r, 8, 60, BOSS2.lavaR), num(d.T, 1, 12, 5)); }
      else if (d.t === 'bgo') { if (NET.client && boss.ph === 2 && boss.state === 'fight' && typeof d.x === 'number' && typeof d.z === 'number') bossMove(num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA), num(d.v, 5, 60, BOSS2.dashV)); }
      else if (d.t === 'bf') { if (NET.client && boss.state === 'fight') bossFan(Math.round(num(d.n, 1, 24)), num(d.s, 0, 7), num(d.v, 1, 30), num(d.a, -9, 9)); }
      else if (d.t === 'bl') { const o = obAt(d.i); if (NET.client && o && o.crate && boss.state === 'fight') { releaseLift(); bossLift(o); } }
      else if (d.t === 'bh') { const o = obAt(d.i); if (NET.client && o && o.crate && Array.isArray(d.f) && Array.isArray(d.v) && Array.isArray(d.l)) {
        if (boss.lifting && boss.lifting.o !== o) releaseLift();
        bossHurl(o, new THREE.Vector3(num(d.f[0], -400, 400), num(d.f[1], 0, 40), num(d.f[2], -400, 400)), new THREE.Vector3(num(d.v[0], -80, 80), num(d.v[1], -80, 80), num(d.v[2], -80, 80)), new THREE.Vector3(num(d.l[0], -400, 400), 0, num(d.l[1], -400, 400))); } }
      else if (d.t === 'bd') { if (!NET.client && boss.state === 'fight') { boss.dealt += num(d.d, 0, 5000); boss.flash = 0.06; bossHealth(); } }
      else if (d.t === 'bhp') { if (NET.client && (!NET.hostPeer || String(from) === NET.hostPeer) && boss.state !== 'dead') { boss.hm = num(d.m, 1, 1e6, BOSS_HP);
        if (d.p === 2 && boss.ph !== 2 && (boss.state === 'fight' || boss.state === 'emerging')) bossFlee();
        boss.dealt = Math.min(num(d.d, 0, 1e7) + (NET.bdAcc || 0), boss.hm * (boss.ph === 2 ? 1.5 : 0.5)); bossBar(); } }
      else if (d.t === 'bk') { if (boss.state === 'fight' || boss.state === 'emerging' || boss.state === 'flee') { boss.state = 'fight'; killBoss(); } else if (boss.state !== 'dead') { boss.state = 'dead'; bossBarEl.style.display = 'none'; setDoor(false); flashAlert('PYRAMIDON IS DEAD'); angelStart(); } }
      else if (d.t === 'sw' || d.t === 'ch') netMirror(d, from);
      else if (d.t === 'en') { const quiet = !NET.enSeen; NET.enSeen = true; if (NET.client && Array.isArray(d.a)) for (const r of d.a.slice(0, 64)) {
        const e = Array.isArray(r) && enemies[r[0]]; if (!e || e.carried) continue;
        const fl = num(r[4], 0, 31), x = num(r[1], -ARENA, ARENA), z = num(r[2], -ARENA, ARENA);
        if (fl & 2) { if (!e.dead) { e.dead = true; e.root.visible = false; if (!quiet) enemyDieFx(e); if (GS.elapsed - (e.myHit || -9) < 1.5) { GS.enemyKills++; ekillsEl.textContent = GS.enemyKills; crewKill(e.elite); myKill(e.pos.x, e.pos.z, 3); } } continue; }
        if (e.dead || (e.awake && !(fl & 1))) {          // came back from the respawn queue: a sleeping crate again
          e.dead = false; e.root.visible = true; e.awake = false; e.awakeParts.forEach(q => q.visible = false); setEnemyLook(e, e.matDormant);
          e.pivot.rotation.x = 0; e.hop.position.y = 0; e.hop.scale.set(1, 1, 1); e.open = 0; e.pos.set(x, 0, z); e.yaw = num(r[3], -99, 99);
        }
        if ((fl & 1) && !e.awake) wakeEnemy(e);
        e.tx = x; e.tz = z; e.tyaw = num(r[3], -99, 99); e.hostCarry = !!(fl & 16);
        if (fl & 4 && e.flash <= 0) e.flash = 0.07; e.topen = fl & 8 ? 0.95 : 0.3;
      } }
      else if (d.t === 'eh') { const e = enemies[d.i]; if (!NET.client && e && !e.dead) hitEnemy(e, tmp2net.set(num(d.x, -1, 1), 0, num(d.z, -1, 1)), num(d.d, 0, 9999), num(d.p, 0, 20)); }
      else if (d.t === 'ehurt') { const e = enemies[d.i]; if (NET.client && e && !e.dead) hurtCar(num(d.d, 0, 40), new THREE.Vector3(num(d.x, -1, 1), 0, num(d.z, -1, 1))); }
      else if (d.t === 'es') { const e = enemies[d.i]; if (NET.client && e && !e.dead && Array.isArray(d.f) && Math.hypot(e.pos.x - car.pos.x, e.pos.z - car.pos.z) < 80) {
        e.charge = 0; enemyVolley(e, new THREE.Vector3(num(d.f[0], -400, 400), num(d.f[1], 0, 20), num(d.f[2], -400, 400)), num(d.a, -9, 9)); } }
      else if (d.t === 'eg') { const e = enemies[d.i]; if (!NET.client && e && !e.dead) {
        if (d.c === 1) { if (e.carried) releaseIfHeld(e); e.carried = true; e.root.visible = false; }
        else { e.carried = false; e.root.visible = true; e.pos.set(num(d.x, -ARENA, ARENA), 0, num(d.z, -ARENA, ARENA)); e.stun = 1.1; e.biteCd = 1.2; e.vel.set(0, 0, 0); e.root.rotation.set(0, e.yaw, 0); } } }
      else if (d.t === 'stun') { const m = swById.get(d.i); if (!NET.client && m && !m.dead) m.stun = Math.max(m.stun || 0, num(d.s, 0, 2)); }
      else if (d.t === 'hit') { const m = swById.get(d.i); if (!NET.client && m && !m.dead && !m.net) hitCritter(m, num(d.d, 0, 9999), tmp2net.set(num(d.x, -1, 1), 0, num(d.z, -1, 1)), num(d.p, 0, 20)); }
      else if (d.t === 'log') { if (typeof d.s === 'string') diagAdd(DG.nick(from), d.s.slice(0, 160)); }
      else if (d.t === 'st') { if (d.o && typeof d.o === 'object') DG.stats.set(String(from), { o: d.o, at: performance.now() }); }
      else if (d.t === 'hurt') { const m = swById.get(d.i); if (NET.client && !(m && !m.dead)) DG.ghost++; if (NET.client && m && !m.dead) hurtCar(num(d.d, 0, 30), new THREE.Vector3(num(d.x, -1, 1), 0, num(d.z, -1, 1))); }
      else if (d.t === 'lose') { if (NET.client && cart.riders.length && !safeKeeps()) { eatChub(cart.riders.pop()); cartNEl.textContent = cart.riders.length; cartKick(2); } }
      else if (d.t === 'drop') { if (!NET.client && chubs.length < 500) { const x = num(d.x, -ARENA, ARENA), z = num(d.z, -ARENA, ARENA), c = spawnChub(rockStub(x, z), false);
        c.pos.set(num(d.fx, -ARENA, ARENA), 0.8, num(d.fz, -ARENA, ARENA)); chubArc(c, tmp.set(x, 0, z), 0.7, 'dazed', 3); c.dazeT = 0.7; } }
      else if (d.t === 'aw') { const A = altars[d.k]; if (NET.client && A && !A.done) { A.awake = d.s === 1; if (d.n != null) A.spawnT = num(d.n, 0, 99); if (d.w === 1 || d.w === 2) altarWave(A, d.w); } }
      else if (d.t === 'guards') { const A = altars[d.k]; if (!NET.client && A && (A.netG || 0) < GS.elapsed) { A.netG = GS.elapsed + 5; NET.applying = false; altarGuards(A, Math.round(num(d.n, 1, 8))); } }
      else if (d.t === 'eat') { const x = num(d.x, -ARENA, ARENA), z = num(d.z, -ARENA, ARENA); if (NET.client && Math.hypot(x - car.pos.x, z - car.pos.z) < 50) { tmp.set(x, 0.6, z); spawnParticles(tmp, 0x4f9dff, 10, 7); SFX.play('chomp', tmp, { rate: 1.4, vol: 0.7 }); SFX.play('chub', tmp, { rate: 0.6 }); } }
      else if (d.t === 'ambush') { if (!NET.client) { NET.applying = false; ambush(num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA), d.b === 1); } }
      else if (d.t === 'bm') { if (NET.client && Array.isArray(d.b)) { const seen = new Set();
          for (const q of d.b) { if (!Array.isArray(q) || !Number.isInteger(q[0])) continue; seen.add(q[0]); let B = bombs.find(B => B.id === q[0]);
            if (!B) B = addBomb(q[0], num(q[1], -ARENA, ARENA), num(q[2], -ARENA, ARENA), q[3] === 2); if (B.leap || B.fly) continue; B.tx = num(q[1], -ARENA, ARENA); B.tz = num(q[2], -ARENA, ARENA); B.n = num(q[4], 0, 8); GS.bombId = Math.max(GS.bombId, q[0]); }
          for (const B of bombs.slice()) if (!B.leap && !seen.has(B.id)) dropBomb(B); } }
      else if (d.t === 'bmx') { if (NET.client) { const B = bombs.find(B => B.id === d.i), m = swById.get(d.m); if (B && !B.leap) { if (B.fly && m) { B.leap = { t: 0.62, sx: B.fly.x, sz: B.fly.z, tx: m.pos.x, tz: m.pos.z }; B.fly = null; } else bombBoom(B, m); } } }
      else if (d.t === 'loot') { if (NET.client && Array.isArray(d.a)) for (const q of d.a.slice(0, 120)) if (Array.isArray(q) && Number.isInteger(q[0]) && !loot.some(L => L.id === q[0])) { addLoot(q[0], q[1] === 1 ? 1 : 0, num(q[2], -ARENA - 80, ARENA + 80), num(q[3], -ARENA, ARENA), num(q[4], -12, 12), num(q[5], 0, 14), num(q[6], -12, 12)); GS.lootId = Math.max(GS.lootId, q[0]); } }
      else if (d.t === 'lootget') { if (!NET.client) { const i = loot.findIndex(L => L.id === d.i); if (i >= 0) { const L = loot[i]; scene.remove(L.m); loot.splice(i, 1); netEv({ t: 'lootx', i: L.id }); netEv({ t: 'lootok', gm: L.gem ? 1 : 0 }, from); } } }
      else if (d.t === 'lootok') { if (NET.client) lootGain(d.gm === 1); }
      else if (d.t === 'lootx') { const i = loot.findIndex(L => L.id === d.i); if (i >= 0) { scene.remove(loot[i].m); loot.splice(i, 1); } }
      else if (d.t === 'lootreq') { if (!NET.client && (d.k === 'crate' || d.k === 'enemy' || d.k === 'elite')) { NET.applying = false; lootFrom(d.k, num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA)); } }
      else if (d.t === 'righit') { if (NET.client) { const m = swById.get(d.m), n = num(d.n, 0, 3); if (m && m.rig) m.rig.hits = n; flashAlert(n >= 3 ? 'LOG MACHINE DOWN!' : 'HIT ' + n + '/3'); } }
      else if (d.t === 'bmt') { const B = bombs.find(B => B.id === d.i); if (B && !B.leap) { B.n = 0; B.fly = { x: num(d.x, -ARENA, ARENA), y: num(d.y, 0, 20), z: num(d.z, -ARENA, ARENA), vx: num(d.vx, -40, 40), vy: num(d.vy, 0, 40), vz: num(d.vz, -40, 40), own: false }; } }
      else if (d.t === 'bmhit') { if (!NET.client) { NET.applying = false; const B = bombs.find(B => B.id === d.i), m = swById.get(d.m);
          if (B && m && m.rig && !m.dead && Math.hypot(m.pos.x - (B.fly ? B.fly.x : B.x), m.pos.z - (B.fly ? B.fly.z : B.z)) < 25) { B.rigM = m; B.leap = { t: 0.62, sx: B.fly ? B.fly.x : B.x, sz: B.fly ? B.fly.z : B.z, tx: m.pos.x, tz: m.pos.z }; B.fly = null; for (const q of NET.remotes.values()) if (String(q.peer) === String(from)) B.by = [q.pos.x, q.pos.z]; netEv({ t: 'bmx', i: B.id, m: m.id }); } } }
      else if (d.t === 'bml') { if (!NET.client) { const B = bombs.find(B => B.id === d.i); if (B && !B.leap) { B.fly = null; B.x = num(d.x, -ARENA, ARENA); B.z = num(d.z, -ARENA, ARENA); } } }
      else if (d.t === 'armed') { let R = null; for (const q of NET.remotes.values()) if (String(q.peer) === String(from)) R = q; if (R && (W_GEAR.includes(d.k) || d.k === 'jump')) armedFx(R, d.k); }
      else if (d.t === 'bdrop') { if (NET.client) { GS.wbKilled++; bossDrop(num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA)); } }
      else if (d.t === 'decoy') { addDecoy(num(d.a, -ARENA, ARENA), num(d.b, -ARENA, ARENA), num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA)); }
      else if (d.t === 'cubes') { let R = null; for (const q of NET.remotes.values()) if (String(q.peer) === String(from)) R = q; if (R) spawnCubes(Math.round(num(d.n, 1, 5)), R, Math.round(num(d.l, 0, 2))); }
      else if (d.t === 'dome') { const x = num(d.x, -ARENA, ARENA), z = num(d.z, -ARENA, ARENA), r = num(d.r, 3, 14), T = num(d.T, 0.5, 6); addDome(x, z, r, T); if (!NET.client) { NET.applying = false; blastAt(x, z, r, 1, 26, true); } }
      else if (d.t === 'ult') { if ((d.k === 'hands' || d.k === 'sword')) castUlt(d.k, num(d.x, -ARENA * 2, ARENA * 2), num(d.z, -ARENA, ARENA), num(d.h, -7, 7), false); }
      else if (d.t === 'ultboom') { if (!NET.client) { NET.applying = false; ultKillAt(num(d.x, -ARENA * 2, ARENA * 2), num(d.z, -ARENA, ARENA), ULT.hands.R); } }
      else if (d.t === 'stomp') { if (!NET.client) { NET.applying = false; stompAt(num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA), Math.round(num(d.l, 1, 3))); } }
      else if (d.t === 'slow') { const m = swById.get(d.i); if (!NET.client && m && !m.dead) m.slow = Math.max(m.slow || 0, num(d.s, 0, 2)); }
      else if (d.t === 'jfx') { if (RIDE_KIT[d.k]) landFxRemote(d.k, Math.round(num(d.l, 1, 3)), num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA)); }
      else if (d.t === 'blast') { if (!NET.client) { NET.applying = false; blastAt(num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA), num(d.r, 1, 9), num(d.d, 0, 5), num(d.p, 0, 20), d.s === 1); } }
      else if (d.t === 'alert') { if (NET.client && typeof d.s === 'string') { flashAlert(d.s.slice(0, 24)); SFX.play('wave', null); } }
      else if (d.t === 'fx') { const m = swById.get(d.i); if (NET.client && m && !m.dead && Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z) < 70) {
        if (d.k === 'mb') miniStart(m, Math.min(MINI_SEQ.length - 1, Math.round(num(d.p, 0, 9))), num(d.a, -9, 9));
        else if (d.k === 'th') mobThrow(m, num(d.x, -1, 1), num(d.z, -1, 1), num(d.d, 1, 40), Math.round(num(d.p, 0, 2)));
        else if (d.k === 'sp') spit(m, null, null, new THREE.Vector3(num(d.x, -ARENA, ARENA), num(d.y, 0, 20), num(d.z, -ARENA, ARENA))); } }
      else if (d.t === 'sync?') { if (netAmHost()) netEv(netWorld(), from); }
      else if (d.t === 'sync') {
        if (Array.isArray(d.lt)) for (const q of d.lt.slice(0, 120)) if (Array.isArray(q) && Number.isInteger(q[0]) && !loot.some(L => L.id === q[0])) { addLoot(q[0], q[1] === 1 ? 1 : 0, num(q[2], -ARENA - 80, ARENA + 80), num(q[3], -ARENA, ARENA), 0, 0, 0); GS.lootId = Math.max(GS.lootId, q[0]); }
        for (const i of Array.isArray(d.sm) ? d.sm.slice(0, 400) : []) { const o = obAt(i); if (o && (o.pillar || o.rock) && o.mesh.visible) { o.mesh.visible = false; if (o.rock) rockSmashed(o); } }
        for (const c of Array.isArray(d.cr) ? d.cr.slice(0, 400) : []) { const o = obAt(c && c[0]); if (!o || !o.crate || o.room) continue;
          o.mesh.position.set(num(c[1], -ARENA, ARENA), o.h / 2, num(c[2], -ARENA, ARENA)); o.rc = num(c[4], 0, 1e6);
          if (!c[3] && o.mesh.visible) { o.mesh.visible = false; respawnQueue.push({ o, t: 4 }); } }
        boss.dealt = Math.max(boss.dealt, num(d.bd, 0, 1e6)); if (d.bk === 1 && boss.state === 'idle') { boss.state = 'dead'; setDoor(false); } else if (d.bst === 1 && boss.state === 'idle') bossFightNow(d.bn, d.bp);
        if (d.go === 1) NET.goPending = true;
        (Array.isArray(d.pk) ? d.pk : []).forEach(q => { if (Array.isArray(q) && typeof q[0] === 'string' && typeof q[1] === 'string' && ICONS[q[1]] && !pickups.some(p => p.id === q[0])) spawnPickup(q[1], new THREE.Vector3(num(q[2], -400, 400), 0, num(q[3], -400, 400)), q[0], true); });
        (Array.isArray(d.aw) ? d.aw : []).forEach((t, k) => { const A = altars[k]; if (A && typeof t === 'number' && t >= 0) { A.awake = true; A.spawnT = num(t, 0, 99); } });
        (Array.isArray(d.al) ? d.al : []).forEach((n, k) => { const A = altars[k]; if (A && Number.isInteger(n) && n > A.n) { A.n = Math.min(ALTAR_NEED, n); altarApply(A); } });
        if (NET.goPending) { NET.goPending = false; openGate(); }
        if (Array.isArray(d.ph) && Number.isInteger(d.ph[0]) && d.ph[0] >= 0 && d.ph[0] < PHASES.length) {
          if (d.ph[0] !== PH.i) phEnter(d.ph[0], num(d.ph[1], 0, 60)); else PH.brk = num(d.ph[1], 0, 60);
          PH.clr = num(d.ph[2], 0, 99) | 0; PH.wv = num(d.ph[3], 0, 99) | 0; PH.hellN = num(d.ph[4], 0, 99) | 0; PH.t = num(d.ph[5], 0, 9999);
          if (d.ph[6] === 1) PH.gate = true;
        }
        (Array.isArray(d.fa) ? d.fa : []).forEach((v, k) => { if (v === 1 && altars[k]) altars[k].found = true; });
        for (const i of Array.isArray(d.fr) ? d.fr.slice(0, 64) : []) { const o = obAt(i); if (o && o.rock) o.found = true; }
      }
    } finally { NET.applying = false; }
  }
  const tmp2net = new THREE.Vector3();
  // ---- shared diagnostics: every player reports what it sees every 2 s, and notable events go to a log everyone in the lobby shares ----
  const DG = { open: false, log: [], stats: new Map(), rx: 0, rxRate: 0, lastSw: 0, ghost: 0, ghostSent: 0, t0: performance.now(), frames: 0, fps: 0, sendT: 0, gap: false, logBudget: 6,
    nick: peer => { const p = NET.room && NET.room.peers().find(q => String(q.peer) === String(peer)); return (p && cleanNick((p.presence || {}).nick)) || String(peer).slice(0, 5); } };
  const diagEl = document.getElementById('diag'), diagT = document.getElementById('diagT'), diagL = document.getElementById('diagL');
  function diagAdd(who, s) { const d = new Date(); DG.log.push(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${who}: ${s}`); if (DG.log.length > 300) DG.log.shift(); DG.dirty = true; }
  function netLog(s) { diagAdd(NET.nick || 'me', s); if (DG.logBudget > 0) { DG.logBudget--; netEv({ t: 'log', s }); } }
  function diagToggle() { DG.open = !DG.open; diagEl.style.display = DG.open ? 'block' : 'none'; DG.dirty = true; }
  function diagMine() {                                  // what this player's copy of the world looks like right now
    let m = 0, ms = 0, c = 0, sm = 0;
    for (const x of swarm) if (!x.dead) { m++; ms = (ms + x.id * 31) % 9973; }
    for (const x of chubs) if (!x.dead && x.state !== 'cart') c++;
    for (const o of obstacles) if ((o.pillar || o.rock) && !o.mesh.visible) sm++;
    return { b: BUILD, r: !NET.game ? 'solo' : NET.client ? 'guest' : 'HOST', n: NET.nick, f: Math.round(DG.fps), m, ms, c, k: cart.riders.length, al: altars.map(A => A.n).join('/'), sm, hp: Math.round(car.hp),
      x: Math.round(car.pos.x), z: Math.round(car.pos.z), ride: GS.ride, pl: NET.remotes.size + 1, age: NET.client ? Math.round(performance.now() - DG.lastSw) : 0, rx: DG.rxRate, gh: DG.ghost, vis: document.hidden ? 0 : 1, md: car.mode, inp: COARSE ? 'touch' : 'keys', slip: DG.slip | 0 };
  }
  function diagRender() {
    DG.dirty = false; if (!DG.open) return;
    const rows = [['me', diagMine()]]; for (const [peer, v] of DG.stats) if (performance.now() - v.at < 8000) rows.push([DG.nick(peer), v.o]);
    const host = rows.map(r => r[1]).find(o => o.r === 'HOST'), bad = (o, key, tol) => host && o !== host && Math.abs((+o[key] || 0) - (+host[key] || 0)) > tol;
    const cols = [['who', (o, w) => w + (o.n && w === 'me' ? ' (' + o.n + ')' : '')], ['role', o => o.r], ['build', o => o.b, o => host && o.b !== host.b], ['fps', o => o.f, o => o.f < 25], ['players', o => o.pl, o => bad(o, 'pl', 0)],
      ['monsters', o => o.m, o => bad(o, 'm', 4)], ['chubziks', o => o.c, o => bad(o, 'c', 6)], ['cart', o => o.k], ['altars', o => o.al, o => host && o.al !== host.al], ['smashed', o => o.sm, o => bad(o, 'sm', 0)],
      ['hp', o => o.hp], ['pos', o => o.x + ',' + o.z], ['ride', o => o.ride], ['snap age ms', o => o.r === 'guest' ? o.age : '-', o => o.r === 'guest' && o.age > 1500], ['snap/s', o => o.r === 'guest' ? o.rx : '-'], ['ghost bites', o => o.gh, o => o.gh > 0], ['steer', o => (o.inp || '?') + '/' + (o.md || '?')], ['slip°', o => o.slip == null ? '?' : o.slip, o => o.ride !== 'halo' && o.ride !== 'spider' && o.slip > 50], ['tab', o => o.vis ? 'shown' : 'HIDDEN', o => !o.vis]];
    const esc = v => String(v == null ? '' : v).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    diagT.innerHTML = '<tr>' + cols.map(c => `<th style="text-align:left;padding:1px 6px 1px 0;color:#8fa0b8;font-weight:600">${c[0]}</th>`).join('') + '</tr>' +
      rows.map(([w, o]) => '<tr>' + cols.map(c => `<td style="padding:1px 6px 1px 0;${c[2] && c[2](o) ? 'color:#ff6a5a;font-weight:700' : ''}">${esc(c[1](o, w))}</td>`).join('') + '</tr>').join('');
    diagL.textContent = DG.log.slice(-60).join('\n') || 'No events yet. Red cells differ from the host.';
    DG.text = rows.map(([w, o]) => w + ' ' + JSON.stringify(o)).join('\n') + '\n' + DG.log.join('\n');
  }
  function updateDiag() {
    const now = performance.now(); DG.frames++;
    { const sp = Math.hypot(car.vel.x, car.vel.z);        // how far the ride's nose is from where it is actually going (worst over the last seconds)
      if (sp > 6 && car.alive) { const d = Math.atan2(car.vel.x, car.vel.z) - car.heading, a = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 57.3; DG.slip = Math.max(DG.slip || 0, a > 90 && car.speed < 0 ? 180 - a : a); }
      if ((DG.slipT = (DG.slipT || 0) + 1) > 240) { DG.slipT = 0; DG.slip = 0; } }
    if (now - DG.t0 >= 1000) { DG.fps = DG.frames * 1000 / (now - DG.t0); DG.frames = 0; DG.t0 = now; DG.rxRate = DG.rx; DG.rx = 0; DG.logBudget = Math.min(6, DG.logBudget + 2); DG.dirty = true;
      if (NET.on && NET.client) { const gap = now - DG.lastSw > 2500; if (gap !== DG.gap) { DG.gap = gap; netLog(gap ? 'no monster snapshots from the host for 2.5 s' : 'snapshots are back'); } }
      if (DG.ghost > DG.ghostSent) { netLog('ignored ' + (DG.ghost - DG.ghostSent) + ' bite(s) from monsters I cannot see'); DG.ghostSent = DG.ghost; }
      if (NET.on && NET.game && (DG.sendT = (DG.sendT + 1) % 2) === 0) netEv({ t: 'st', o: diagMine() });
    }
    if (DG.dirty) diagRender();
  }
  document.addEventListener('visibilitychange', () => { if (NET.on && NET.game) netLog(document.hidden ? 'tab went to the background (my game is paused' + (NET.client ? ')' : ' — and so are the monsters for everyone)') : 'tab is back'); });
  document.getElementById('diagClose').addEventListener('click', diagToggle);
  document.getElementById('diagCopy').addEventListener('click', () => { diagRender(); const t = DG.text || ''; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); }); document.getElementById('diagCopy').textContent = 'copied'; setTimeout(() => { document.getElementById('diagCopy').textContent = 'copy all'; }, 1200); });
  for (const ev of ['mousedown', 'touchstart', 'pointerdown', 'pointerup', 'click', 'wheel']) diagEl.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  function crateRemote(o) {                              // someone else broke it: same splinters, no score, no drop
    if (o.carried) { releaseIfHeld(o); o.carried = false; }
    o.mesh.visible = false; spawnParticles(o.mesh.position, 0xd2873c, 12, 8); SFX.play('crate_break', o.mesh.position, { vol: 0.6 });
    respawnQueue.push({ o, t: 4 });
  }
  function chubGift() {                                  // a chubzik ran to our cart in another player's world
    const stub = nearestRock(car.pos.x, car.pos.z) || { mesh: { position: car.pos.clone(), visible: true }, r: 3, h: 2.5, top: 2 };
    const c = spawnChub(stub, false); c.pos.set(cart.pos.x, 0, cart.pos.z); cartAdd(c);
  }
  function netCollide() {                                // rides are solid to each other: each player pushes their own ride out
    if (!car.alive || car.depth > 0.3) return;
    for (const R of NET.remotes.values()) {
      if (!R.up || Math.abs(R.pos.y - car.y) > 1.6) continue;
      const dx = car.pos.x - R.pos.x, dz = car.pos.z - R.pos.z, d = Math.hypot(dx, dz), minD = car.radius * 2;
      if (d >= minD) continue;
      const side = String(netMe()) < String(R.peer) ? -1 : 1;                  // stacked exactly on top of each other (same spawn point): split by peer id
      const nx = d > 0.05 ? dx / d : side, nz = d > 0.05 ? dz / d : 0, push = (minD - d) * 0.6;
      car.pos.x += nx * push; car.pos.z += nz * push;
      const vn = car.vel.x * nx + car.vel.z * nz;
      if (vn < 0) { car.vel.x -= nx * vn * 1.3; car.vel.z -= nz * vn * 1.3; car.speed *= 0.8; if (GS.ride === 'spider') { SPD.vel.x -= nx * vn * 1.3; SPD.vel.z -= nz * vn * 1.3; }
        if (-vn > 8 && (NET.bumpT || 0) < GS.elapsed) { NET.bumpT = GS.elapsed + 0.4; cartSpill(1); GS.shake = Math.max(GS.shake, 0.3); SFX.play('clang', car.pos, { vol: 0.5 }); spawnParticles(tmp.set(car.pos.x - nx * car.radius, 1, car.pos.z - nz * car.radius), 0xffd27a, 6, 6); } }
    }
  }
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  function netPose() {                                  // how the ride is posed right now: cart sway, how deep it is dug in, gallop phase, the spider's tilt and feet
    const o = { cp: r2(cart.phi), dp: r2(car.depth), ph: r2(GS.ridePhase % 1000) };
    if (GS.ride === 'spider' && rideG.spider && rideG.spider.feet) {
      const q = carGroup.quaternion; o.q = [r2(q.x), r2(q.y), r2(q.z), r2(q.w)];
      o.ft = []; for (const L of rideG.spider.feet) o.ft.push(r1(L.foot.x), r1(L.foot.y), r1(L.foot.z));
    }
    return o;
  }
  function netSend() {
    NET.room.presence({ game: NET.game, hostNick: NET.hostNick, nick: NET.nick, ride: GS.ride, x: r1(car.pos.x), z: r1(car.pos.z), y: r1(car.y), h: r2(car.heading), t: r2(car.heading + turret.rotation.y),
      cx: r1(cart.pos.x), cz: r1(cart.pos.z), ch: r2(GS.ride === 'spider' ? cart.vis : cart.heading), cn: cart.riders.length, cs: cart.shown ? 1 : 0,
      a: car.alive && car.depth < 0.5 ? 1 : 0, f: NET.fireSeq, hp: NET.isHost ? 1 : 0, v: VER, wo: weapons.orbit, tw: GS.myTow, pp: pedestals.filter(P => P.state !== 'gone').map(P => [P.x, P.z]), ak: gearDone() ? 1 : 0, ks: kit().every(t => abilities[t]) ? 1 : 0, gd: W_GEAR.every(k => weapons[k]) && abilities.jump ? 1 : 0, tl: GS.ride === 'unicorn' && abilities.trail ? abLv.trail + 1 : 0, vw: r1(camera.right / camera.zoom), vh: r1(camera.top / camera.zoom), ...netPose() }).catch(() => {});
  }
  // simple stand-in models for the other players
  function buildProxy(k) {
    const g = new THREE.Group(), tur = new THREE.Group(); g.add(tur);
    const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.3, flatShading: true });
    const P = (geo, mat, x, y, z, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    const dk = M(0x2a2630), gun = () => { P(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6), dk, 0, 0, 1.0, tur).rotation.x = Math.PI / 2; P(new THREE.BoxGeometry(0.5, 0.4, 0.6), dk, 0, 0, 0, tur); };
    if (k === 'spider') {
      P(new THREE.BoxGeometry(2.3, 0.36, 2.3), dk, 0, 0.95, 0);
      const pg = new THREE.CylinderGeometry(0.5, 1.15, 1.35, 4); pg.rotateY(Math.PI / 4); P(pg, new THREE.MeshStandardMaterial({ color: 0x3a9ab0, transparent: true, opacity: 0.5, flatShading: true }), 0, 1.95, 0);
      for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.6, o = new THREE.Vector3(sd * 1.1, 0.95, (i - 1.5) * 0.55), kn = new THREE.Vector3(sd * (1.1 + Math.cos(a)), 1.7, o.z + Math.sin(a)), ft = new THREE.Vector3(sd * (1.1 + 1.5 * Math.cos(a)), 0, o.z + 1.6 * Math.sin(a)); strut(o, kn, 0.15, dk, g); strut(kn, ft, 0.11, dk, g); }
      tur.position.set(0, 3, 0); P(new THREE.SphereGeometry(0.62, 12, 8), glow(new THREE.MeshBasicMaterial({ color: 0xff7a1a }), 1.4), 0, 0, 0, tur).scale.set(1.55, 0.78, 0.7);
    } else if (k === 'halo') {
      const gold = new THREE.MeshStandardMaterial({ color: 0xe8d28a, metalness: 0.9, roughness: 0.25, flatShading: true });
      P(new THREE.TorusGeometry(1.75, 0.2, 6, 20), gold, 0, 2, 0).rotation.y = 0.6; P(new THREE.TorusGeometry(1.32, 0.17, 6, 18), gold, 0, 2, 0).rotation.x = 1.1;
      P(new THREE.BoxGeometry(0.7, 1.2, 0.4), M(0xf4f1e8), 0, 1.9, 0); tur.position.set(0, 2, 0); P(new THREE.ConeGeometry(0.22, 1.5, 5), gold, 0, 0, 2.3, tur).rotation.x = Math.PI / 2;
    } else if (k === 'unicorn') {
      const wh = M(0xf2eef6);
      P(new THREE.BoxGeometry(1.5, 1.25, 2.7), wh, 0, 1.75, -0.1); P(new THREE.BoxGeometry(0.95, 0.95, 1.15), wh, 0, 3.0, 1.85); P(new THREE.ConeGeometry(0.16, 1.0, 5), M(0xf0b428), 0, 3.9, 2.1);
      for (const x of [-0.5, 0.5]) for (const z of [0.95, -1.15]) P(new THREE.BoxGeometry(0.4, 1.2, 0.4), wh, x, 0.6, z);
      tur.position.set(0, 2.95, -0.75); gun();
    } else {
      P(new THREE.BoxGeometry(2.1, 0.8, 4.3), M(0x3a3532), 0, 0.85, 0); P(new THREE.BoxGeometry(2.0, 0.5, 2.0), M(0x5e2c14), 0, 1.45, -0.4);
      for (const x of [-1.15, 1.15]) for (const z of [1.35, -1.35]) P(new THREE.CylinderGeometry(z < 0 ? 0.64 : 0.5, z < 0 ? 0.64 : 0.5, 0.44, 10), M(0x131417), x, z < 0 ? 0.64 : 0.5, z).rotation.z = Math.PI / 2;
      for (const x of [-0.92, 0.92]) for (const z of [0.6, -1.44]) P(new THREE.BoxGeometry(0.11, 0.86, 0.11), dk, x, 1.63, z);
      tur.position.set(0, 2.04, -0.5); gun();
    }
    return { g, tur };
  }
  function netLabel(R, text) {
    if (R.labelText === text) return; R.labelText = text;
    const cv = mkCanvas(256, 64), c = cv.getContext('2d'); c.font = '700 30px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = Math.min(250, c.measureText(text).width + 24); c.fillStyle = 'rgba(20,22,26,.78)'; c.beginPath(); c.rect(128 - w / 2, 10, w, 44); c.fill();
    c.fillStyle = '#ffe07a'; c.fillText(text, 128, 33, 240);
    if (R.label.material.map) R.label.material.map.dispose();
    R.label.material.map = srgbTex(cv); R.label.material.needsUpdate = true;
  }
  function netRemote(p, pr) {
    let R = NET.remotes.get(p.peer); const k = RIDES[pr.ride] ? pr.ride : 'buggy';
    if (R && R.ride !== k) { scene.remove(R.g, R.cart, R.label, ...(R.riders || []), ...(R.saws || [])); NET.remotes.delete(p.peer); R = null; }
    if (!R) {
      let m, cartM; try { m = rideClone(k); cartM = m.cart; } catch (e) { console.warn('rideClone', e); m = buildProxy(k); }
      if (!cartM) cartM = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 2.3), new THREE.MeshStandardMaterial({ color: k === 'spider' ? 0x2a2630 : 0x8a5a30, roughness: 0.85, flatShading: true }));
      cartM.castShadow = true; cartM.userData.y = m.cart ? 0 : 0.75; const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); label.scale.set(5, 1.25, 1); label.renderOrder = 25; label.material.color.setScalar(0.8);
      scene.add(m.g, cartM, label);
      R = { ride: k, g: m.g, tur: m.tur, cart: cartM, label, pos: new THREE.Vector3(num(pr.x, -400, 400), num(pr.y, 0, 60), num(pr.z, -400, 400)), h: num(pr.h, -99, 99), anim: m.anim || [], ph: 0, lastF: pr.f, cpos: new THREE.Vector3(num(pr.cx, -400, 400), 0, num(pr.cz, -400, 400)), vel: new THREE.Vector3(), cn: 0 };
      R.tc = { pos: R.pos, vel: R.vel, alive: false, depth: 0, y: 0, radius: car.radius, burrow: 'up', R };
      R.nick = cleanNick(pr.nick) || ''; NET.remotes.set(p.peer, R); netLog('sees ' + (cleanNick(pr.nick) || 'Driver') + ' (' + k + ')');
    }
    return R;
  }
  const ikV = new THREE.Vector3();
  function cloneIK(a, foot) {                           // same two-bone solve as the owner's spider, on the copy's hip/thigh/knee
    const hip = a.o, fem = a.fem, knee = fem && fem.children.find(c => c.isGroup), root = hip.parent; if (!knee || !root) return;
    ikV.copy(foot); root.worldToLocal(ikV); ikV.sub(hip.position);
    hip.rotation.y = Math.atan2(ikV.x, ikV.z);
    const h = Math.hypot(ikV.x, ikV.z), v = ikV.y, l1 = SPL.L1, l2 = SPL.L2;
    const d = THREE.MathUtils.clamp(Math.hypot(h, v), 0.3, l1 + l2 - 0.001);
    const an = Math.atan2(v, h), alpha = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const inner = Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
    fem.rotation.x = -(an + alpha); knee.rotation.x = Math.PI - inner;
  }
  function updateNet(dt) {
    if (!NET.on || !NET.room) { netEl.textContent = ''; return; }
    if ((NET.sendT -= dt) <= 0) { NET.sendT = 0.08; netSend(); }
    if (netMe() && (NET.roleT = (NET.roleT || 0) - dt) <= 0) { NET.roleT = 0.5; netRole(); }
    if (!NET.client && NET.remotes.size && (NET.snapT = (NET.snapT || 0) - dt) <= 0) { NET.snapT = 0.2; netSnap(); }
    if (NET.client && NET.hostPeer && NET.bdAcc > 0 && (NET.bdT = (NET.bdT || 0) - dt) <= 0) { NET.bdT = 0.25; netEv({ t: 'bd', d: r1(NET.bdAcc) }, NET.hostPeer); NET.bdAcc = 0; }
    if (!NET.client && NET.remotes.size && (boss.state === 'fight' || boss.state === 'flee') && (NET.bhT = (NET.bhT || 0) - dt) <= 0) { NET.bhT = 0.3; netEv({ t: 'bhp', d: r1(boss.dealt), m: Math.round(bossMax()), p: boss.ph }); }
    if (!NET.synced && netMe()) { NET.synced = true; if (!NET.isHost) netEv({ t: 'sync?' }); }      // ask the host what has already been broken and fed
    const seen = new Set(); let n = 1;
    for (const p of NET.room.peers()) {
      const pr = p.presence || {};
      if ((p.isMe && p.sameTab) || p.kind !== 'viewer' || pr.game !== NET.game || pr.v !== VER) continue;
      n++; seen.add(p.peer);
      const R = netRemote(p, pr), k = 1 - Math.exp(-12 * dt);
      tmp.set(num(pr.x, -400, 400), num(pr.y, 0, 60), num(pr.z, -400, 400));
      const ox = R.pos.x, oz = R.pos.z;
      if (R.pos.distanceTo(tmp) > 25) R.pos.copy(tmp); else { R.pos.lerp(tmp, k); R.vel.lerp(tmp.set((R.pos.x - ox) / Math.max(dt, 1e-3), 0, (R.pos.z - oz) / Math.max(dt, 1e-3)), 0.25); }
      const th = num(pr.h, -99, 99); R.h += Math.atan2(Math.sin(th - R.h), Math.cos(th - R.h)) * k;
      const up = pr.a === 1; R.up = up; R.peer = p.peer; R.tc.alive = up; R.tc.y = R.pos.y;
      R.vw = num(pr.vw, 8, 80) || 34; R.vh = num(pr.vh, 8, 80) || 22; R.ak = pr.ak === 1; R.tw = Number.isInteger(pr.tw) ? pr.tw : 0; R.pp = Array.isArray(pr.pp) ? pr.pp.slice(0, 4).filter(q => Array.isArray(q)).map(q => [num(q[0], -ARENA, ARENA), num(q[1], -ARENA, ARENA)]) : []; R.ks = pr.ks === 1; R.gd = pr.gd === 1; R.tl = Math.round(num(pr.tl, 0, 3));      // their screen size (waves stay off it) and whether their kit is complete
      if (pr !== R.posePr) { R.posePr = pr; if (typeof pr.ph === 'number') { const d = num(pr.ph, -1e4, 1e4) * 2.4 - R.ph; R.ph += Math.abs(d) > 6 ? d : d * 0.3; } }
      const feet = R.ride === 'spider' && Array.isArray(pr.ft) && pr.ft.length === 24 ? pr.ft : null;
      if (R.anim.length && !feet) { const spd = Math.hypot(R.vel.x, R.vel.z), kk = Math.min(1, spd / 5); R.ph += spd * dt * (R.ride === 'spider' ? 0.9 : 1.08) * (R.ride === 'unicorn' ? 2.4 * 0.45 / 1.08 : 1);
        for (const a of R.anim) {
          if (a.t === 'leg') { const q = R.ph + a.grp * Math.PI; a.o.rotation.y = a.by + Math.sin(q) * 0.32 * kk; if (a.fem) a.fem.rotation.x = a.bx - Math.max(0, Math.cos(q)) * 0.3 * kk; }
          else if (a.t === 'uleg') a.o.rotation.x = Math.sin(R.ph + a.grp * Math.PI) * 0.7 * kk;
          else if (a.k === 1) a.o.rotation.y += dt * (1.2 + spd * 0.12); else a.o.rotation.x += dt * (1.7 + spd * 0.15);
        } }
      R.g.visible = up; R.g.position.copy(R.pos); R.g.position.y -= num(pr.dp, 0, 1) * BURY_DEPTH;
      if (R.ride === 'spider' && Array.isArray(pr.q) && pr.q.length === 4) {          // stuck to a wall: the real tilt
        R.qT = R.qT || new THREE.Quaternion(); R.qT.set(num(pr.q[0], -1, 1), num(pr.q[1], -1, 1), num(pr.q[2], -1, 1), num(pr.q[3], -1, 1)).normalize();
        R.g.quaternion.slerp(R.qT, k);
      } else R.g.rotation.set(0, R.h, 0);
      R.tur.rotation.y = num(pr.t, -99, 99) - R.h;
      if (feet) {                                         // the spider's feet where the owner has them; the legs bend to reach them
        R.g.updateMatrixWorld(true);
        const legsA = R.anim.filter(a => a.t === 'leg'); R.ftS = R.ftS || legsA.map(() => new THREE.Vector3());
        legsA.forEach((a, i) => { const f = R.ftS[i]; tmp.set(num(feet[i * 3], -400, 400), num(feet[i * 3 + 1], -5, 60), num(feet[i * 3 + 2], -400, 400));
          if (f.distanceTo(tmp) > 8) f.copy(tmp); else f.lerp(tmp, k); cloneIK(a, f); });
      }
      { const body = R.cart.children && R.cart.children[0], phi = num(pr.cp, -1, 1); R.cphi = (R.cphi || 0) + (phi - (R.cphi || 0)) * k;
        if (body) { body.rotation.z = R.cphi; body.position.y = Math.abs(R.cphi) * 0.25; } }
      R.cpos.lerp(tmp.set(num(pr.cx, -400, 400), 0, num(pr.cz, -400, 400)), k);
      R.cart.visible = up && pr.cs === 1; R.cart.position.set(R.cpos.x, R.cart.userData.y, R.cpos.z); R.cart.rotation.y = num(pr.ch, -99, 99);
      R.label.visible = up; R.label.position.set(R.pos.x, R.pos.y + 5.2, R.pos.z);
      { const show = R.cart.visible ? Math.min(18, Math.round(num(pr.cn, 0, 999))) : 0, rs = R.riders || (R.riders = []), ch = R.cart.rotation.y, rx = Math.cos(ch), rz = -Math.sin(ch), fx = Math.sin(ch), fz = Math.cos(ch);
        while (rs.length < show) { const sp = new THREE.Sprite(chubMats[0][0]); sp.center.set(0.5, 0.04); sp.scale.set(CHUB_SIZE * 0.85, CHUB_SIZE * 0.85, 1); scene.add(sp); rs.push(sp); }
        rs.forEach((sp, i) => { sp.visible = i < show; if (i >= show) return;
          const lx = (i % 3 - 1) * 0.56, lz = (Math.floor(i / 3) % 3 - 1) * 0.66, ly = 0.2 + Math.floor(i / 9) * 0.5;
          sp.material = chubMats[0][Math.floor(GS.elapsed * 3 + i) % CHUB_FR];
          sp.position.set(R.cpos.x + rx * lx + fx * lz, 0.68 + ly + Math.abs(Math.sin(GS.elapsed * 9 + i)) * 0.06, R.cpos.z + rz * lx + fz * lz); }); }
      { const L = Math.round(num(pr.wo, 0, 5)) - 1, want = up && L >= 0 ? W_STATS.orbit.n[L] * (R.ride === 'halo' ? 2 : 1) : 0, sw = R.saws || (R.saws = []), uni = R.ride === 'unicorn';      // their saws / dodecahedra
        while (sw.length < want) { const m = new THREE.Mesh(uni ? dodecaGeo : sawGeo, uni ? dodecaMats[sw.length % dodecaMats.length] : sawMat); m.scale.setScalar(uni ? 1.1 : 1.4); scene.add(m); sw.push(m); }
        sw.forEach((m, i) => { m.visible = i < want; if (i >= want) return; const a = GS.elapsed * W_STATS.orbit.spd[L] * (R.ride === 'halo' ? 1.86 : 1) + i / want * 6.283, rr = W_STATS.orbit.r[L];
          m.position.set(R.pos.x + Math.sin(a) * rr, 1 + R.pos.y, R.pos.z + Math.cos(a) * rr); if (uni) { m.rotation.x += dt * 3; m.rotation.y += dt * 4; } else m.rotation.y += dt * 22; }); }
      const cn = Math.round(num(pr.cn, 0, 999)); if (pr !== R.lastPr) { R.lastPr = pr; R.cn = cn; } netLabel(R, (cleanNick(pr.nick) || 'Driver') + (cn ? ' · ' + cn : ''));
      if (pr.f !== R.lastF) {                            // they fired: a tracer for show, no damage
        R.lastF = pr.f;
        if (up && Math.hypot(R.pos.x - car.pos.x, R.pos.z - car.pos.z) < 70) {
          const yaw = num(pr.t, -99, 99), m = new THREE.Mesh(R.ride === 'spider' ? starGeo : bulletGeo, R.ride === 'spider' ? starMat : bulletMat);
          R.tur.getWorldPosition(m.position); m.rotation.y = yaw; scene.add(m);
          NET.shots.push({ m, v: new THREE.Vector3(Math.sin(yaw) * 60, -2.5, Math.cos(yaw) * 60), life: 0.45 });
        }
      }
    }
    netCollide();
    for (const [peer, R] of NET.remotes) if (!seen.has(peer)) { netLog('lost ' + (R.labelText || 'a player')); scene.remove(R.g, R.cart, R.label, ...(R.riders || []), ...(R.saws || [])); NET.remotes.delete(peer); }
    for (let i = NET.shots.length - 1; i >= 0; i--) { const s = NET.shots[i]; s.life -= dt; s.m.position.addScaledVector(s.v, dt); if (s.life <= 0 || s.m.position.y < 0.1) { scene.remove(s.m); NET.shots.splice(i, 1); } }
    if (n > 1) NET.had = true;
    const t = `Lobby: ${NET.hostNick}'s · ${n} player${n > 1 ? 's' : ''}` + (n === 1 && NET.had ? ' · others lost, waiting for them to reconnect' : ''); if (netEl.textContent !== t) netEl.textContent = t;
  }

  // ---- edge-of-screen pointers: chubzik rocks, unfed altars and the boss gate once you get near them ----
  const hints = [], hintV = new THREE.Vector3(); let hintT = 0, hintList = [];
  function hintEl(i) {
    while (hints.length <= i) { const d = document.createElement('div'); d.className = 'hint'; d.innerHTML = '<i></i><b></b><u></u>'; document.body.appendChild(d); hints.push({ d, arrow: d.firstChild, label: d.children[1], cap: d.lastChild, text: '', col: '', capT: '', side: '' }); }
    return hints[i];
  }
  // ---- phases: the run is a chain of phases, each a few waves with its own goals and a break before the next. The host runs it ----
  const NEST_GOAL = 4, FIND_R = 34;
  const PH = { i: 0, brk: PHASES[0].brk, wv: 0, clr: 0, t: 0, hellN: 0, gate: false, cardT: 0, shown: -1, lootT: 0, findT: 0 };
  function waveMul() {                                 // how thick a wave is: phase, fed altars, and +35% per friend in the lobby
    let o = 0; if (NET.on && NET.game) for (const R of NET.remotes.values()) if (R.up) o++;
    return PHASES[PH.i].mul * (PHASES[PH.i].key === 'save' ? 1 + 0.3 * GS.altarsDone : 1) * (1 + 0.35 * Math.min(3, o));
  }
  const hellTotal = () => { let o = 0; if (NET.on && NET.game) for (const R of NET.remotes.values()) if (R.up) o++; return 12 + 4 * Math.min(3, o); };      // 12 for one, +4 per friend
  const hellAlive = () => { let n = 0; for (const m of swarm) if (!m.dead && m.hell) n++; return n; };
  const foundN = () => ({ a: altars.filter(A => A.found).length, r: rocks.filter(R => R.found).length });
  function phDone() {
    const k = PHASES[PH.i].key, f = foundN();
    if (k === 'roll') return gearDone() && (!(NET.on && NET.game) || [...NET.remotes.values()].every(R => R.ak)) && GS.wbSpawned && GS.rigOwed === 0 && !swarm.some(m => m.rig && !m.dead);
    if (k === 'scout') return f.a >= altars.length && f.r >= Math.min(NEST_GOAL, rocks.length) && PH.gate;
    if (k === 'save') return GS.altarsDone >= 3;
    if (k === 'hell') return PH.hellN >= hellTotal() && hellAlive() === 0;
    return false;
  }
  function phEnter(i, brk) {                           // everybody: a new phase (or the break before it) begins
    PH.i = i; PH.brk = brk; PH.wv = 0; PH.clr = 0; PH.t = 0; PH.cardT = brk > 0 ? brk : 3.5; PH.shown = -1;
    waves.pending = false; waves.gap = 3;
    const k = PHASES[i].key;
    if (k === 'boss') openGate();
    SFX.play('wave', null, { rate: 0.8 });
  }
  function phAdvance() {                               // host: goals met, on to the next phase
    if (PH.i >= PHASES.length - 1) return;
    const i = PH.i + 1; phEnter(i, PHASES[i].brk);
    netEv({ t: 'ph', i, b: PH.brk });
    if (PHASES[i].key === 'boss') netEv({ t: 'gate' });
  }
  function phFind(kind, idx) {                         // something was spotted: mark it for everybody; the host pays out a little loot
    const o = kind === 'a' ? altars[idx] : kind === 'r' ? obstacles[idx] : null;
    if (kind === 'g') { if (PH.gate) return; PH.gate = true; } else { if (!o || o.found) return; o.found = true; }
    const at = kind === 'g' ? tmp.set(ROOM_X1 - 10, 0, 0) : kind === 'a' ? tmp.set(o.x, 0, o.z) : tmp.set(o.mesh.position.x, 0, o.mesh.position.z);
    const f = foundN();
    flashAlert(kind === 'a' ? `ALTAR FOUND ${f.a}/${altars.length}` : kind === 'g' ? 'BOSS GATE FOUND' : `NEST FOUND ${Math.min(f.r, NEST_GOAL)}/${NEST_GOAL}`);
    if (!NET.client) netEv({ t: 'fd', k: kind, i: idx });
  }
  function phScan() {                                  // anyone driving close enough discovers things (each machine checks, the host's word is final)
    const ps = []; if (car.alive) ps.push(car.pos); if (NET.on && NET.game) for (const R of NET.remotes.values()) if (R.up) ps.push(R.pos);
    const near = (x, z, r) => ps.some(p => Math.hypot(p.x - x, p.z - z) < r);
    if (GS.worldUp) altars.forEach((A, i) => { if (!A.found && near(A.x, A.z, FIND_R)) phFind('a', i); });
    for (const R of rocks) if (!R.found && R.mesh.visible && near(R.mesh.position.x, R.mesh.position.z, FIND_R - 8)) phFind('r', obstacles.indexOf(R));
    if (!PH.gate && near(ROOM_X1, 0, 50)) phFind('g', 0);
  }
  const phEl = document.getElementById('phcard'), phPn = phEl.querySelector('.pn'), phNm = phEl.querySelector('.nm'), phDs = phEl.querySelector('.ds'), phCd = phEl.querySelector('.cd');
  let phFitW = 0;
  function phFit() {                                     // shrink the card so it never runs under the objectives panel, the buttons or the minimap
    phFitW = innerWidth;
    const touch = document.body.classList.contains('touch'), side = Math.max(tasksEl.getBoundingClientRect().right, touch ? 150 : 120) + 12;
    const k = Math.max(0.42, Math.min(touch ? 0.62 : 1, (innerWidth / 2 - side) * 2 / Math.max(1, phEl.offsetWidth)));
    phEl.style.setProperty('--k', k.toFixed(3));
  }
  function updatePhases(dt) {
    if (startEl.isConnected) return;
    if (!GS.worldUp && PH.i >= 1) worldWake();
    if (rising.length) updateRising(dt);
    if ((PH.findT -= dt) <= 0) { PH.findT = 0.4; if (!NET.client) phScan(); }
    if (PH.brk > 0) PH.brk = Math.max(0, PH.brk - dt); else PH.t += dt;
    if (!NET.client) {
      if (PH.brk <= 0 && phDone()) phAdvance();
    }
    // the card: the next phase's name during a break with a countdown, a few seconds at the start of a phase
    PH.cardT -= dt; const on = PH.brk > 0 || PH.cardT > 0;
    phEl.classList.toggle('on', on);
    if (on) {
      const P = PHASES[PH.i];
      if (PH.shown !== PH.i) { PH.shown = PH.i; phPn.textContent = 'PHASE ' + (PH.i + 1) + ' / ' + PHASES.length; phNm.textContent = P.name; phDs.textContent = P.desc;
        phEl.classList.remove('slap'); void phEl.offsetWidth; phEl.classList.add('slap'); phFitW = 0; }
      if (phFitW !== innerWidth) phFit();
      const cd = PH.brk > 0 ? 'starts in ' + Math.ceil(PH.brk) : 'GO!'; if (phCd.textContent !== cd) { phCd.textContent = cd; phCd.classList.toggle('go', PH.brk <= 0); }
    }
  }
  const tkDone = new Set();                              // objectives already ticked, so the tick-and-strike plays once
  function phTasksHtml() {
    const tk = (txt, done, n) => { const just = done && !tkDone.has(txt); if (done) tkDone.add(txt); return `<div class="tk${done ? ' done' : ''}${just ? ' just' : ''}"><i></i><span>${txt}</span>${n != null && !done ? `<em>${n}</em>` : ''}</div>`; };
    const P = PHASES[PH.i], f = foundN(), nests = Math.min(NEST_GOAL, rocks.length);
    let t = '';
    if (P.key === 'roll') { const K = kit(), have = K.filter(t => abilities[t]).length, gw = W_GEAR.filter(k => weapons[k]).length;
      const fg = firstGun(), rest = W_GEAR.filter(k => k !== fg), rn = rest.filter(k => weapons[k] > 0).length;
      t = tk(fg === 'nova' ? 'Grab the nova' : 'Grab the spray gun', weapons[fg] > 0) + (pedestals.length >= 3 ? tk('Guns on your pedestals', rn >= 2, rn + '/2') : '');
      if (NET.on && NET.game && gw >= 3 && abilities.jump) { const rs = [...NET.remotes.values()].filter(R => R.up), n = rs.filter(R => R.gd).length + 1; t += tk('Everybody got their guns?', n >= rs.length + 1, n + '/' + (rs.length + 1)); }
      if (crewArmed()) { const KB = K.filter(t => t !== 'jump'), hb = KB.filter(t => abilities[t]).length; t += tk('Hunt the wandering bosses', hb >= KB.length, hb + '/' + KB.length + ' skills'); const lr = swarm.filter(m => m.rig && !m.dead).length; t += tk('Bomb the log machines (3 bombs each)', lr === 0, lr ? lr + ' left' : ''); }
      if (NET.on && NET.game) { const rs = [...NET.remotes.values()], n = rs.filter(R => R.ak).length + (gearDone() ? 1 : 0); t += tk('Whole crew geared up', n >= rs.length + 1, n + '/' + (rs.length + 1)); } }
    else if (P.key === 'scout') t = tk('Find the altars', f.a >= altars.length, f.a + '/' + altars.length) + tk('Find chubzik nests', f.r >= nests, Math.min(f.r, nests) + '/' + nests) + tk('Find the boss gate', PH.gate);
    else if (P.key === 'save') t = tk('Fill the altars', GS.altarsDone >= 3, GS.altarsDone + '/3');
    else if (P.key === 'hell') { const tot = hellTotal(), dead = Math.max(0, PH.hellN - hellAlive()); t = tk('Kill the mini-bosses', PH.hellN >= tot && dead >= tot, dead + '/' + tot); }
    else t = tk('Kill the Pyramidon', boss.state === 'dead');
    return `<div class="ph">${PH.brk > 0 ? 'NEXT: ' : ''}${P.name}</div><div class="sub${PH.brk > 0 ? '' : ' desc'}">${PH.brk > 0 ? 'break · ' + Math.ceil(PH.brk) + 's' : P.desc}</div>` + t;
  }
  // ---- minimap (bottom right, turned to match the iso camera) and the objectives panel ----
  const mmEl = document.getElementById('minimap'), mmX = mmEl.getContext('2d'), tasksEl = document.getElementById('tasks');
  let mmT = 0, tasksHtml = '';
  const MM_PTS = [[-ARENA, -ARENA], [ARENA, -ARENA], [ARENA, ARENA], [-ARENA, ARENA], [ROOM_X2, -ROOM_HZ], [ROOM_X2, ROOM_HZ]];
  function mmFit() {                                   // world (x, z) -> map pixels: screen right is (1,0,-1), screen down is (1,0,1)
    const W = mmEl.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (mmEl.width !== Math.round(W * dpr)) { mmEl.width = mmEl.height = Math.round(W * dpr); }
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, z] of MM_PTS) { const u = x - z, v = x + z; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const S = mmEl.width, k = (S - 10 * dpr) / Math.max(u1 - u0, v1 - v0), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    return { S, dpr, k, f: (x, z) => [S / 2 + ((x - z) - cu) * k, S / 2 + ((x + z) - cv) * k] };
  }
  function nestCount(R) { let n = 0; for (const c of chubs) if (!c.dead && c.state !== 'cart' && Math.hypot(c.pos.x - R.mesh.position.x, c.pos.z - R.mesh.position.z) < R.r + 9) n++; return n; }
  function updateMinimap(dt) {
    if ((mmT -= dt) > 0) return; mmT = 0.12;
    const show = !startEl.isConnected; mmEl.style.display = show ? 'block' : 'none'; if (!show) return;
    const { S, dpr, k, f } = mmFit(), x = mmX; x.clearRect(0, 0, S, S); x.lineJoin = 'round';
    const poly = (pts, fill, stroke, lw) => { x.beginPath(); pts.forEach(([a, b], i) => { const [px, py] = f(a, b); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw * dpr; x.stroke(); } };
    poly(MM_PTS.slice(0, 4), 'rgba(20,22,26,.55)', 'rgba(255,255,255,.35)', 1.5);
    poly([[ROOM_X1, -ROOM_HZ], [ROOM_X2, -ROOM_HZ], [ROOM_X2, ROOM_HZ], [ROOM_X1, ROOM_HZ]], 'rgba(60,20,30,.6)', 'rgba(255,120,120,.35)', 1.2);
    const dot = (wx, wz, r, col, ring) => { const [px, py] = f(wx, wz); x.beginPath(); x.arc(px, py, r * dpr, 0, 6.283); if (ring) { x.strokeStyle = col; x.lineWidth = 2 * dpr; x.stroke(); } else { x.fillStyle = col; x.fill(); } return [px, py]; };
    const label = (px, py, t, col, size) => { x.font = `800 ${size * dpr}px system-ui,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 3 * dpr; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(t, px, py); x.fillStyle = col; x.fillText(t, px, py); };
    if (PH.gate) { const [gx, gy] = f(ARENA, 0); label(gx, gy, boss.state === 'dead' ? '✔' : GS.gateOpen ? '☠' : '🔒', GS.gateOpen ? '#ffd27a' : '#c8c0b8', 11); }    // the boss gate
    if (boss.ph === 2 && boss.state !== 'dead' && boss.state !== 'idle') { const [bx, by] = dot(BOSS_POS.x, BOSS_POS.z, 6, '#ff7a1a'); label(bx, by, '☠', '#1a1014', 10); }      // the Pyramidon out in the field
    for (const R of rocks) { if (!R.mesh.visible || !R.found) continue; const n = PH.i >= 2 ? nestCount(R) : 0, [px, py] = dot(R.mesh.position.x, R.mesh.position.z, 3.2, '#9a7a62'); if (n) label(px, py - 8 * dpr, String(n), '#7fc0ff', 10); }   // chubzik nests and how many wait there
    for (const A of altars) { if (!A.found) continue; const [px, py] = dot(A.x, A.z, 5, A.done ? '#9cf59a' : '#ff7ad8', true);
      if (!A.done && A.n) { x.beginPath(); x.arc(px, py, 5 * dpr, -1.571, -1.571 + 6.283 * A.n / ALTAR_NEED); x.strokeStyle = '#5fd0ff'; x.lineWidth = 2 * dpr; x.stroke(); } }
    for (const P of pedestals) if (P.state !== 'gone') { const [px, py] = dot(P.x, P.z, 4.5, '#ffd23a'); label(px, py - 9 * dpr, '⚙', '#ffd23a', 11); }
    for (const m of swarm) if (m.wb && !m.dead) dot(m.pos.x, m.pos.z, m.wbLoot ? 4.2 : 2.6, m.wbLoot ? '#ffd23a' : '#ff5a5a');
    for (const B of bombs) if (!B.leap) { const [px, py] = dot(B.x, B.z, 4, '#ff6a3a'); label(px, py - 9 * dpr, '●', '#1a1a1a', 10); }
    for (const m of swarm) if (m.rig && !m.dead) { const [px, py] = f(m.pos.x, m.pos.z); label(px, py, '✱', '#d8a060', 13); }
    for (const R of NET.remotes.values()) if (R.up) dot(R.pos.x, R.pos.z, 3.4, '#9cf59a');
    if (car.alive) {                                   // me: an arrow along the heading
      const [px, py] = f(car.pos.x, car.pos.z), hx = Math.sin(car.heading), hz = Math.cos(car.heading), du = (hx - hz), dv = (hx + hz), L = Math.hypot(du, dv) || 1, ux = du / L, uy = dv / L, s = 6 * dpr;
      x.beginPath(); x.moveTo(px + ux * s, py + uy * s); x.lineTo(px - ux * s * 0.7 - uy * s * 0.6, py - uy * s * 0.7 + ux * s * 0.6); x.lineTo(px - ux * s * 0.7 + uy * s * 0.6, py - uy * s * 0.7 - ux * s * 0.6); x.closePath();
      x.fillStyle = '#ffd27a'; x.fill(); x.strokeStyle = '#1b1421'; x.lineWidth = 1.5 * dpr; x.stroke(); }
    const h = phTasksHtml();
    if (h !== tasksHtml) { tasksHtml = h; tasksEl.innerHTML = h; phFitW = 0; }
  }
  function updateHints(dt) {
    if ((hintT -= dt) <= 0) {                           // what is worth pointing at: refreshed a few times a second
      hintT = 0.3; hintList = [];
      if (!startEl.isConnected && car.alive && !angel.on && !inRoom(car.pos.x, car.pos.z)) {
        const rk = [];
        for (const R of rocks) { const d = Math.hypot(R.mesh.position.x - car.pos.x, R.mesh.position.z - car.pos.z); if (d > 50) continue;
          let n = 0; for (const c of chubs) if (!c.dead && c.state !== 'cart' && Math.hypot(c.pos.x - R.mesh.position.x, c.pos.z - R.mesh.position.z) < R.r + 9) n++;
          if (n) rk.push({ x: R.mesh.position.x, z: R.mesh.position.z, d, range: 50, col: '#7fc0ff', text: '☻' + n, cap: 'save chubziks' });
          else if (!R.found && PH.i <= 1) rk.push({ x: R.mesh.position.x, z: R.mesh.position.z, d, range: 50, col: '#7fc0ff', text: '?', cap: 'chubzik nest' }); }
        rk.sort((a, b) => a.d - b.d); hintList.push(...rk.slice(0, 2));
        for (const P of pedestals) if (P.state !== 'gone') hintList.push({ x: P.x, z: P.z, d: Math.hypot(P.x - car.pos.x, P.z - car.pos.z), range: 999, col: '#ffd23a', text: '⚙', cap: P.state === 'sealed' || P.state === 'rising' ? 'guards: ' + (P.guards || 0) : AB_INFO[pedIcon(P.k)].title });
        for (const m of swarm) if (m.wbLoot && !m.dead) hintList.push({ x: m.pos.x, z: m.pos.z, d: Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z), range: 999, col: '#ffd23a', text: '★', cap: wbGift() ? AB_INFO[wbGift()].title + ' boss' : 'skill boss', live: m, grp: 'wb' });      // only the bosses that carry a skill get a pointer; the rest of the crowd is on the minimap
        if (!GS.myTow) { let nb = null, nd = 1e9; for (const B of bombs) if (!B.leap) { const d = Math.hypot(B.x - car.pos.x, B.z - car.pos.z); if (d < nd) { nd = d; nb = B; } }
          if (nb && nd < 140) hintList.push({ x: nb.x, z: nb.z, d: nd, range: 999, col: '#ff6a3a', text: '●', cap: nb.drop && nb.drop.t < HAND.arrive ? 'bomb incoming' : 'bomb' }); }
        else { let nr = null, nd = 1e9; for (const m of swarm) if (m.rig && !m.dead) { const d = Math.hypot(m.pos.x - car.pos.x, m.pos.z - car.pos.z); if (d < nd) { nd = d; nr = m; } }
          if (nr) hintList.push({ x: nr.pos.x, z: nr.pos.z, d: nd, range: 999, col: '#ff6a3a', text: '✱', cap: 'log machine ' + (nr.rig.hits || 0) + '/3' }); }
        for (const p of pickups) if (p.own) hintList.push({ x: p.x, z: p.z, d: Math.hypot(p.x - car.pos.x, p.z - car.pos.z), range: 999, col: '#ffd23a', text: '★', cap: AB_INFO[p.type].title });      // your gear drop: always pointed at
        if (GS.worldUp) altars.forEach(A => { const d = Math.hypot(A.x - car.pos.x, A.z - car.pos.z); if (!A.done && d < 60) hintList.push({ x: A.x, z: A.z, d, range: 60, col: '#ff7ad8', text: PH.i < 2 ? '?' : A.n + '/' + ALTAR_NEED, cap: PH.i < 2 ? 'altar' : 'sacrifice!' }); });
        if (boss.ph === 2 && boss.state !== 'dead' && boss.state !== 'idle') hintList.push({ x: BOSS_POS.x, z: BOSS_POS.z, d: Math.hypot(BOSS_POS.x - car.pos.x, BOSS_POS.z - car.pos.z), range: 999, col: '#ff7a1a', text: 'BOSS', cap: 'kill boss' });
        else { const d = Math.hypot(ROOM_X1 - car.pos.x, car.pos.z), far = GS.gateOpen ? 150 : 70; if (d < far && boss.state !== 'dead') hintList.push({ x: ROOM_X1, z: 0, d, range: far, col: GS.gateOpen ? '#ffd27a' : '#9a8f86', text: GS.gateOpen ? 'BOSS' : '🔒', cap: GS.gateOpen ? 'kill boss' : 'boss gate' }); }
      }
    }
    if (hintT === 0.3 && !startEl.isConnected && NET.on && NET.game) for (const R of NET.remotes.values()) if (R.up)
      hintList.push({ x: R.pos.x, z: R.pos.z, d: 0, range: 1, col: '#8dff9a', text: '☺', cap: R.labelText || 'friend', live: R });
    for (const h of hintList) if (h.live) { h.x = h.live.pos.x; h.z = h.live.pos.z; }
    const W = innerWidth, H = innerHeight, x0 = 40, x1 = W - 40, y0 = 84, y1 = H - 100, cx = W / 2, cy = (y0 + y1) / 2;      // clear of the buttons on top and the bars below
    let i = 0; const placed = [], mmR = mmEl.style.display !== 'none' ? mmEl.getBoundingClientRect() : null;
    // where each pointer would sit on the screen edge; pointers of one kind that land close together become one with a count, and only the three nearest bunches of a kind are shown
    const draw = [], bunch = {};
    for (const h of hintList.slice().sort((a, b) => a.d - b.d)) {
      hintV.set(h.x, 1, h.z).project(camera);
      const on = Math.abs(hintV.x) < 0.95 && Math.abs(hintV.y) < 0.95;
      const dx = hintV.x * W / 2 + W / 2 - cx, dy = -hintV.y * H / 2 + H / 2 - cy;
      const k = Math.max(dx > 0 ? dx / (x1 - cx) : dx / (x0 - cx), dy > 0 ? dy / (y1 - cy) : dy / (y0 - cy), 1), px = cx + dx / k, py = cy + dy / k;
      const it = { h, on, dx, dy, px, py, n: 1 };
      if (h.grp) { if (on) continue; const B = bunch[h.grp] || (bunch[h.grp] = []), near = B.find(q => Math.hypot(q.px - px, q.py - py) < 260);
        if (near) { near.n++; continue; } if (B.length >= 3) continue; B.push(it); }
      draw.push(it);
    }
    for (const it of draw) {
      const h = it.h, on = it.on, dx = it.dx, dy = it.dy, px = it.px, py = it.py, e = hintEl(i++);
      const hText = it.n > 1 ? h.text + '×' + it.n : h.text, hCap = it.n > 1 ? h.cap.replace('boss', 'bosses') : h.cap;
      let qx = px, qy = py; if (!on) { for (let g = 0; g < 4 && placed.some(q => Math.abs(q[0] - qx) < 120 && Math.abs(q[1] - qy) < 62); g++) { if (qx <= x0 + 1 || qx >= x1 - 1) qy += qy > cy ? -64 : 64; else qx += qx > cx ? -124 : 124; } placed.push([qx, qy]); }      // two pointers in one spot: slide the second along the edge
      if (!on && mmR && qx > mmR.left - 70 && qy > mmR.top - 60 && qx < mmR.right + 40 && qy < mmR.bottom + 40) { if (qx >= x1 - 1) qy = mmR.top - 60; else qx = mmR.left - 70; }   // never under the minimap
      e.d.style.opacity = on ? 0 : Math.min(1, (1 - h.d / h.range) * 4 + 0.25);
      e.d.style.transform = `translate(${qx.toFixed(0)}px,${qy.toFixed(0)}px)`;
      e.arrow.style.transform = `rotate(${Math.atan2(dx, -dy).toFixed(2)}rad)`;
      if (e.text !== hText) e.label.textContent = e.text = hText;
      if (e.capT !== hCap) e.cap.textContent = e.capT = hCap;
      const side = (qx < 90 ? 'l' : qx > W - 90 ? 'r' : 'c') + (qy > H - 150 ? 'u' : 'd');           // keep the caption on screen and off the arrow
      if (e.side !== side) { e.side = side; const c = e.cap.style; c.left = side[0] === 'l' ? '0' : side[0] === 'c' ? '50%' : 'auto'; c.right = side[0] === 'r' ? '0' : 'auto'; c.transform = side[0] === 'c' ? 'translateX(-50%)' : 'none'; c.top = side[1] === 'u' ? '-20px' : '46px'; }
      if (e.col !== h.col) e.d.style.setProperty('--c', e.col = h.col);
    }
    for (; i < hints.length; i++) hints[i].d.style.opacity = 0;
  }
  (function prewarm() {
    try {
      if (HX && HX.noRender) return;      // tests in fast mode draw nothing, so there is nothing to compile
      const g = new THREE.Group(), mats = [];
      for (const k in SW_ART) for (const v of SW_ART[k]) mats.push(...v.walk, ...v.hit);
      for (const row of chubMats) mats.push(...row);
      for (const m of mats) { if (m.map) renderer.initTexture(m.map); }
      for (const m of [mats[0], chubMats[0][0]]) g.add(new THREE.Sprite(m));
      g.add(fxSprite(puffPool, false), fxSprite(flashPool, true));
      for (const m of [bulletMat, enemyFlash, crateHitMat, novaMat, new THREE.MeshStandardMaterial({ color: 0xffffff })]) g.add(new THREE.Mesh(partGeo, m));
      scene.add(g); renderer.compile(scene, camera); scene.remove(g);
      for (const c of [...g.children]) if (c.isSprite && c.material.map === softTex) { c.visible = false; scene.add(c); (c.material.blending === THREE.AdditiveBlending ? flashPool : puffPool).push(c); }
    } catch (e) { console.warn('prewarm', e); }
  })();
  // ---- the five things to do, on the lobby panel, illustrated with shots of the game itself ----
  (function howTo() {
    const box = document.getElementById('how'); if (!box) return;
    const cell = (label, n) => { const d = document.createElement('div'), cv = mkCanvas(160); d.appendChild(cv); const t = document.createElement('div'); t.style.display = 'block'; t.innerHTML = `<span>${n}.</span> ${label}`; d.appendChild(t); box.appendChild(d); return cv.getContext('2d'); };
    const sprites = (x, list) => { x.fillStyle = '#3b2f33'; x.fillRect(0, 0, 160, 160); for (const [img, dx, dy, sz] of list) x.drawImage(img, dx, dy, sz, sz); };
    const shot = (x, tx, ty, tz, half) => {              // a real render of that spot through the game's own post-processing
      try {
        if (!GS.composer || HX) throw 0;      // tests skip the how-to pictures: five full renders, 18 s of a headless start
        const cv = renderer.domElement, asp = cv.width / cv.height, cam = camera.clone(), rp = GS.composer.passes[0], keep = rp.camera;
        tmp.set(tx, ty, tz); cam.position.copy(tmp).add(ISO_OFFSET); cam.lookAt(tmp);
        cam.left = -half * asp; cam.right = half * asp; cam.top = half; cam.bottom = -half; cam.zoom = 1; cam.updateProjectionMatrix();
        sun.position.copy(tmp).add(SUN_OFFSET); sun.target.position.copy(tmp); sun.target.updateMatrixWorld(); renderer.shadowMap.needsUpdate = true;
        rp.camera = cam; GS.composer.render(); rp.camera = keep;
        const sq = Math.min(cv.width, cv.height); x.drawImage(cv, (cv.width - sq) / 2, (cv.height - sq) / 2, sq, sq, 0, 0, 160, 160);
      } catch (e) { x.fillStyle = '#3b2f33'; x.fillRect(0, 0, 160, 160); }
    };
    const img = (kind, v) => SW_ART[kind][v].walk[1].map.image;
    sprites(cell('Kill monsters', 1), [[img('grubber', 0), 52, 6, 112], [img('maw', 0), -6, 48, 96], [img('gremlin', 1), 62, 86, 72]]);
    const crate = obstacles.find(o => o.crate && !o.room); const c2 = cell('Smash crates', 2); if (crate) shot(c2, crate.mesh.position.x, 0.9, crate.mesh.position.z, 3.2);
    const ch = chubMats[0][0].map.image, ch2 = chubMats[1][1].map.image; sprites(cell('Save chubziks', 3), [[ch, 4, 40, 84], [ch2, 70, 14, 84], [ch, 52, 78, 78]]);
    const c4 = cell('Feed the altars', 4); if (altars[0]) shot(c4, altars[0].x, 2.6, altars[0].z, 5.5);
    shot(cell('Unlock the boss', 5), ROOM_X1 - 2, 2.2, 0, 8.5);
  })();
  // ---- ride cards: what each ride is and what it does, in view the moment the ride screen opens, each with a real render of the ride ----
  const RIDE_CARD = {
    buggy:   { name: 'BUGGY', emo: '🚙', tag: 'all-rounder · 100 HP', how: 'A car: steers, drifts and rams. The full fan gun.',
               rows: [['decoy', 'Decoy Chubz', 'RMB', 'a squeaky fake chubzik: monsters chase it, then boom'], ['drill', 'Drill', 'auto', 'spins up by itself and grinds a wide arc ahead'], ['jump', 'Stomp', 'Space', 'levelled up: the landing wave stuns, then kills the small fry']] },
    spider:  { name: 'SPIDER', emo: '🕷️', tag: 'fast and fragile · 50 HP', how: 'Runs straight where you point, no steering, and climbs walls.',
               rows: [['burrow', 'Mole', 'RMB', 'dig in and pop out, the biters scatter'], ['jump', 'Brood', 'Space', 'levelled up: spiderlings leap on monsters and slow them, later they blow up']] },
    halo:    { name: 'HALO', emo: '👁️', tag: 'hovers · 100 HP', how: 'Glides where you point and keeps drifting. A thinner fan gun, but its nova is a ring of swords: nothing hurts you while they are out.',
               rows: [['cubes', 'Wing Cubes', 'RMB', 'winged cubes dive-bomb the small fry'], ['doubleJump', 'Two Kangaroos', '2×Space', 'a second jump in mid-air'], ['jump', 'Light Spikes', 'Space', 'levelled up: spikes of light stand where you land']] },
    unicorn: { name: 'UNICORN', emo: '🦄', tag: 'gallops · 100 HP', how: 'Gores whatever it gallops into. Its saws stun instead of cutting.',
               rows: [['bomb', 'Dome Bomb', 'RMB', 'blasts the biters away, nobody gets into the dome'], ['trail', 'Rainbow Trail', 'passive', 'biters that step on it lose you'], ['jump', 'Starburst', 'Space', 'levelled up: a ring of stars on landing']] } };
  (function rideCards() {
    const keep = GS.ride, rp = GS.composer && !window.__noRender ? GS.composer.passes[0] : null, el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
    for (const b of document.querySelectorAll('#rides button')) { const k = b.dataset.ride, C = RIDE_CARD[k]; if (!C) continue;
      let pic = null;
      if (rp) try {                                        // the ride itself, through the game's camera and post-processing
        setRide(k); carGroup.updateMatrixWorld(true);
        const cv = renderer.domElement, asp = cv.width / cv.height, cam = camera.clone(), keepCam = rp.camera, half = 3.4;
        tmp.copy(carGroup.position).setY(1.5); cam.position.copy(tmp).add(ISO_OFFSET); cam.lookAt(tmp);
        cam.left = -half * asp; cam.right = half * asp; cam.top = half; cam.bottom = -half; cam.zoom = 1; cam.updateProjectionMatrix();
        sun.position.copy(tmp).add(SUN_OFFSET); sun.target.position.copy(tmp); sun.target.updateMatrixWorld(); renderer.shadowMap.needsUpdate = true;
        rp.camera = cam; GS.composer.render(); rp.camera = keepCam;
        pic = mkCanvas(320, 200); pic.className = 'rc-pic'; const sh = cv.height, sw = Math.min(cv.width, sh * 1.6); pic.getContext('2d').drawImage(cv, (cv.width - sw) / 2, 0, sw, sh, 0, 0, 320, 200);
      } catch (e) { pic = null; }
      b.textContent = ''; b.appendChild(pic || el('div', 'rc-pic', C.emo));
      const head = el('div', 'rc-head'); head.append(el('div', 'rc-name', C.name), el('div', 'rc-tag', C.tag)); b.append(head, el('div', 'rc-how', C.how));
      for (const [t, title, key, text] of C.rows) { const row = el('div', 'rc-row'), img = new Image(), d = el('div'), h = el('b', '', title); img.src = ICON_URLS[t]; img.alt = '';
        h.appendChild(el('kbd', 'rc-key', key)); d.append(h, el('span', '', text)); row.append(img, d); b.appendChild(row); } }
    if (rp) setRide(keep);
  })();
  GS.worldRnd = trueRandom;                                // world is built: back to real randomness for the simulation
  if (HX && HX.reseed) HX.reseed();                     // tests: the game's own randomness starts from the test's seed here, however many numbers Three.js took while loading
  for (const e of earlyErrors.splice(0)) try { netLog('error: ' + e); } catch (x) {}      // the log exists now
  { const a = Math.random() * 6.283; car.pos.set(Math.cos(a) * ARENA * 0.4, 0, Math.sin(a) * ARENA * 0.4); car.heading = Math.atan2(-car.pos.x, -car.pos.z); }      // start out on the plain, facing the centre pedestal
  camFocus.copy(car.pos);
  function musicLevel() {                               // how hard the band plays: by phase, one notch up when the crowd is on you
    if (startEl.isConnected) return 0; if (PH.brk > 0) return 1;
    const l = { roll: 1, scout: 2, save: 2, hell: 3, boss: 3 }[PHASES[PH.i].key] || 1;
    return Math.min(4, l + (waves.alive >= 14 || boss.state === 'fight' ? 1 : 0));
  }
  function frame() {
    MUSIC.level = MUSIC.force ?? musicLevel(); MUSIC.muffle = !startEl.isConnected && !car.alive; MUSIC.tick();
    clock.update(); const raw = clock.getDelta(), dt = HX ? HX.dt(raw) : Math.min(raw, 1 / 30);
    adaptQuality(raw);
    for (let k = 0, n = HX ? HX.sub : 1; k < n; k++) update(dt);      // tests in turbo run several game steps a frame
    if (++GS.shadowTick >= GS.shadowEvery) { GS.shadowTick = 0; renderer.shadowMap.needsUpdate = true; }
    if (HX && HX.skipRender()) { /* tests: nothing to draw */ } else if (GS.composer) {
      GS.gradePass.uniforms.time.value = GS.elapsed;
      GS.gradePass.uniforms.hurt.value = Math.max(0, GS.hurtFlash) / 0.18;
      GS.gradePass.uniforms.lowHp.value = car.alive ? Math.max(0, 1 - car.hp / (car.maxHp * 0.35)) : 0;
      GS.composer.render();
    } else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
})();
