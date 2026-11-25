// ---------- FX: soft sprites, additive flashes, pooled lights (light count never changes -> no shader recompiles) ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';

export function createEffects(GAME) {
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
    m.visible = true; if (!m.parent) GAME.scene.add(m); return m;
  }
  function puff(pos, color, size, life, vx, vy, vz, alpha = 0.45, grow = 1.6) {
    if (puffs.length > (GAME.COARSE ? 70 : 160)) return;
    const m = fxSprite(puffPool, false); m.material.color.set(color); m.material.opacity = alpha;
    m.position.copy(pos); m.scale.setScalar(size);
    puffs.push({ m, life, max: life, a: alpha, v: new THREE.Vector3(vx, vy, vz), grow });
  }
  function burst(pos, color, n, size, speed = 3, alpha = 0.4) {       // ring of dust/smoke
    if (GAME.COARSE) n = Math.ceil(n * 0.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8);
      puff(pos, color, size * (0.7 + Math.random() * 0.6), 0.6 + Math.random() * 0.5, Math.cos(a) * sp, 0.6 + Math.random() * 1.2, Math.sin(a) * sp, alpha, 1.8);
    }
  }
  const fxLights = (GAME.COARSE ? [0] : [0, 1]).map(() => { const L = new THREE.PointLight(0xffffff, 0, 30, 2); L.userData = { life: 0, max: 1, i: 0 }; GAME.scene.add(L); return L; });
  let fxNext = 0;
  const muzzleLight = new THREE.PointLight(0xffb060, 0, 20, 2); GAME.scene.add(muzzleLight);
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
      L.userData.life = L.userData.max = life * 1.8; L.userData.i = Math.min(1.3, size * 0.12) * GAME.LIGHT;
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


  return { softTex, puffs, flashes, puffPool, flashPool, fxSprite, puff, burst, muzzleLight, flash, updateFx };
}
